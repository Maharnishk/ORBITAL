"""Source-agnostic ingestion.

The service validates a Pydantic record, normalizes it, rejects future or
unknown-source records, and deduplicates by stable event ID, fingerprint, or
source reference. Existing records are never overwritten by a duplicate.
"""

from collections.abc import Callable, Mapping
from datetime import datetime, timedelta, timezone
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.normalization import compute_fingerprint
from app.models.event import ThreatEvent
from app.models.source import Source
from app.schemas.common import GeoLocation
from app.schemas.ingestion import EventIngest, IngestionResult, IngestionStatus

MAX_FUTURE_SKEW = timedelta(minutes=5)


class UnknownSourceError(ValueError):
    def __init__(self, source_id: str) -> None:
        super().__init__(
            f"Unknown source_id '{source_id}'. Register the source before ingesting events."
        )
        self.source_id = source_id


class FutureEventError(ValueError):
    """Raised when an event timestamp is unreasonably far in the future."""


def _location_fields(location: GeoLocation | None) -> dict[str, Any]:
    if location is None:
        return {
            "latitude": None,
            "longitude": None,
            "location_label": None,
            "location_country_code": None,
            "location_source": "unknown",
        }
    return {
        "latitude": location.latitude,
        "longitude": location.longitude,
        "location_label": location.label,
        "location_country_code": location.country_code,
        "location_source": location.location_source,
    }


def _src_location_fields(location: GeoLocation | None) -> dict[str, Any]:
    if location is None:
        return {
            "src_latitude": None,
            "src_longitude": None,
            "src_location_label": None,
            "src_country_code": None,
            "src_location_source": None,
        }
    return {
        "src_latitude": location.latitude,
        "src_longitude": location.longitude,
        "src_location_label": location.label,
        "src_country_code": location.country_code,
        "src_location_source": location.location_source,
    }


def _dst_location_fields(location: GeoLocation | None) -> dict[str, Any]:
    if location is None:
        return {
            "dst_latitude": None,
            "dst_longitude": None,
            "dst_location_label": None,
            "dst_country_code": None,
            "dst_location_source": None,
        }
    return {
        "dst_latitude": location.latitude,
        "dst_longitude": location.longitude,
        "dst_location_label": location.label,
        "dst_country_code": location.country_code,
        "dst_location_source": location.location_source,
    }


def build_event(
    record: EventIngest,
    event_id: str,
    fingerprint: str,
    ingested_at: datetime,
) -> ThreatEvent:
    """Map a validated ingestion record to ORM fields.

    Shared by the ingestion service and the explicit simulation seed command so
    normalization and provenance mapping cannot diverge.
    """
    return ThreatEvent(
        event_id=event_id,
        fingerprint=fingerprint,
        title=record.title,
        description=record.description,
        indicator=record.indicator,
        indicator_type=record.indicator_type,
        category=record.category,
        severity=record.severity,
        source_id=record.source_id,
        source_reference=record.source_reference,
        source_url=record.source_url,
        event_timestamp=record.event_timestamp,
        ingested_at=ingested_at,
        first_seen=record.first_seen,
        last_seen=record.last_seen,
        confidence=record.confidence,
        asn=record.asn,
        port=record.port,
        protocol=record.protocol,
        tags=record.tags,
        data_origin=record.data_origin,
        verification_status=record.verification_status,
        reporter=record.reporter,
        collection_method=record.collection_method,
        source_metadata=record.source_metadata,
        **_location_fields(record.location),
        **_src_location_fields(record.src_location),
        **_dst_location_fields(record.dst_location),
    )


class IngestionService:
    def __init__(
        self,
        db: Session,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.db = db
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def ingest(self, payload: EventIngest | Mapping[str, Any]) -> IngestionResult:
        # Re-validating even EventIngest instances keeps a single validation
        # path for adapters that pass dictionaries.
        record = EventIngest.model_validate(payload)
        now = self.clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("ingestion clock must return a UTC-aware datetime")
        now = now.astimezone(timezone.utc)

        if record.event_timestamp > now + MAX_FUTURE_SKEW:
            raise FutureEventError(
                "event_timestamp is more than 5 minutes in the future"
            )

        source = self.db.get(Source, record.source_id)
        if source is None:
            raise UnknownSourceError(record.source_id)

        fingerprint = compute_fingerprint(
            record.source_id,
            record.indicator_type,
            record.indicator,
            record.event_timestamp,
        )

        existing = self._find_duplicate(record, fingerprint)
        if existing is not None:
            return IngestionResult(
                status=IngestionStatus.duplicate,
                event_id=existing.event_id,
                fingerprint=existing.fingerprint,
                message="Event already ingested; the original record was preserved.",
            )

        event_id = record.event_id or f"EVT-{fingerprint[:16].upper()}"
        event = build_event(record, event_id, fingerprint, ingested_at=now)

        self.db.add(event)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            # A concurrent insert may have won the unique fingerprint race.
            existing = self._find_duplicate(record, fingerprint)
            if existing is None:
                raise
            return IngestionResult(
                status=IngestionStatus.duplicate,
                event_id=existing.event_id,
                fingerprint=existing.fingerprint,
                message="Event already ingested; the original record was preserved.",
            )

        return IngestionResult(
            status=IngestionStatus.created,
            event_id=event.event_id,
            fingerprint=fingerprint,
            message="Event validated and ingested.",
        )

    def _find_duplicate(
        self, record: EventIngest, fingerprint: str
    ) -> ThreatEvent | None:
        if record.event_id is not None:
            by_id = self.db.get(ThreatEvent, record.event_id)
            if by_id is not None:
                return by_id

        by_fingerprint = self.db.scalar(
            select(ThreatEvent).where(ThreatEvent.fingerprint == fingerprint)
        )
        if by_fingerprint is not None:
            return by_fingerprint

        if record.source_reference:
            by_reference = self.db.scalar(
                select(ThreatEvent).where(
                    ThreatEvent.source_id == record.source_id,
                    ThreatEvent.source_reference == record.source_reference,
                )
            )
            if by_reference is not None:
                return by_reference

        return None


__all__ = [
    "FutureEventError",
    "IngestionService",
    "UnknownSourceError",
    "ValidationError",
]

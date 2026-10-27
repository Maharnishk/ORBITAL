"""Ingestion service tests: normalization, provenance, and deduplication."""

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import DataOrigin, VerificationStatus
from app.models.event import ThreatEvent
from app.schemas.common import GeoLocation
from app.schemas.ingestion import EventIngest
from app.services.ingestion import (
    FutureEventError,
    IngestionService,
    UnknownSourceError,
)
from app.tests.helpers import SOURCE_A, add_source, event_payload

NOW = datetime(2026, 10, 19, 12, 0, tzinfo=timezone.utc)


@pytest.fixture()
def source(session: Session):
    return add_source(session, SOURCE_A)


def payload_for(now: datetime = NOW, **overrides) -> dict:
    payload = event_payload(
        event_id="EVT-INGEST-1",
        event_timestamp=now - timedelta(hours=1),
        **overrides,
    )
    return payload


def test_ingestion_preserves_and_normalizes_fields(
    session: Session, source
) -> None:
    geo = GeoLocation(
        latitude=40.41,
        longitude=-73.94,
        label="Sim sector N-ATL-01",
        country_code="XX",
        location_source="reported",
    )
    payload = payload_for(
        indicator="LOGIN-1.Example.COM.",
        indicator_type="domain",
        src_location=geo,
        dst_location=geo,
        location=geo,
    )
    payload["source_metadata"] = {"feed": "fixture", "sequence": 7}
    result = IngestionService(session, clock=lambda: NOW).ingest(payload)
    assert result.status.value == "created"
    assert result.event_id == "EVT-INGEST-1"

    event = session.get(ThreatEvent, result.event_id)
    assert event is not None
    assert event.indicator == "login-1.example.com"
    assert event.source_reference == "REF-EVT-INGEST-1"
    assert event.source_metadata == {"feed": "fixture", "sequence": 7}
    assert event.src_latitude == 40.41
    assert event.dst_longitude == -73.94
    assert event.ingested_at == NOW
    assert event.event_timestamp.tzinfo is not None
    assert event.data_origin is DataOrigin.observed
    assert event.verification_status is VerificationStatus.unverified


def test_duplicate_event_id_is_not_inserted_twice(
    session: Session, source
) -> None:
    service = IngestionService(session, clock=lambda: NOW)
    payload = payload_for()
    first = service.ingest(payload)
    second = service.ingest(payload)
    assert first.status.value == "created"
    assert second.status.value == "duplicate"
    assert second.event_id == first.event_id
    count = session.scalar(select(func.count(ThreatEvent.event_id)))
    assert count == 1


def test_duplicate_fingerprint_with_different_event_id_is_rejected(
    session: Session, source
) -> None:
    service = IngestionService(session, clock=lambda: NOW)
    payload = payload_for()
    first = service.ingest(payload)

    duplicate = payload_for()
    duplicate["event_id"] = "EVT-INGEST-OTHER"
    duplicate["source_reference"] = "REF-DIFFERENT"
    result = service.ingest(duplicate)
    assert result.status.value == "duplicate"
    assert result.event_id == first.event_id
    assert session.scalar(select(func.count(ThreatEvent.event_id))) == 1


def test_duplicate_source_reference_is_rejected_even_if_timestamp_moves(
    session: Session, source
) -> None:
    service = IngestionService(session, clock=lambda: NOW)
    first = service.ingest(payload_for())

    moved = payload_for()
    moved["event_id"] = "EVT-INGEST-MOVED"
    moved["event_timestamp"] = (NOW - timedelta(hours=3)).isoformat()
    moved["first_seen"] = moved["event_timestamp"]
    moved["last_seen"] = moved["event_timestamp"]
    result = service.ingest(moved)
    assert result.status.value == "duplicate"
    assert result.event_id == first.event_id


def test_generated_stable_id_is_used_when_omitted(
    session: Session, source
) -> None:
    service = IngestionService(session, clock=lambda: NOW)
    payload = payload_for()
    payload["event_id"] = None
    result = service.ingest(payload)
    assert result.event_id.startswith("EVT-")
    assert len(result.event_id) == 20
    assert session.get(ThreatEvent, result.event_id) is not None


def test_unknown_source_is_rejected(session: Session) -> None:
    payload = payload_for()
    payload["source_id"] = "unknown-source"
    with pytest.raises(UnknownSourceError, match="Register the source"):
        IngestionService(session, clock=lambda: NOW).ingest(payload)
    assert session.scalar(select(func.count(ThreatEvent.event_id))) == 0


def test_future_event_is_rejected(session: Session, source) -> None:
    payload = payload_for()
    payload["event_timestamp"] = (NOW + timedelta(hours=1)).isoformat()
    with pytest.raises(FutureEventError):
        IngestionService(session, clock=lambda: NOW).ingest(payload)


def test_malformed_payload_is_rejected_before_insert(
    session: Session, source
) -> None:
    payload = payload_for()
    payload.pop("severity")
    with pytest.raises(ValidationError):
        IngestionService(session, clock=lambda: NOW).ingest(payload)
    assert session.scalar(select(func.count(ThreatEvent.event_id))) == 0


def test_simulation_records_cannot_be_verified(session: Session, source) -> None:
    payload = payload_for()
    payload["data_origin"] = "simulation"
    payload["verification_status"] = "verified"
    with pytest.raises(ValidationError, match="simulation records"):
        IngestionService(session, clock=lambda: NOW).ingest(payload)

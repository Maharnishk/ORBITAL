"""Test data factories (kept out of conftest so tests can import them)."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.enums import (
    DataOrigin,
    EventCategory,
    Severity,
    SourceKind,
    VerificationStatus,
)
from app.models.source import Source
from app.schemas.common import GeoLocation

SOURCE_A = {
    "id": "meridian-honeynet",
    "name": "Meridian Honeynet",
    "kind": SourceKind.honeypot,
    "reliability": "A",
    "trust_score": 92,
}

SOURCE_B = {
    "id": "openphish-collective",
    "name": "OpenPhish Collective",
    "kind": SourceKind.osint,
    "reliability": "C",
    "trust_score": 71,
}


def add_source(db: Session, definition: dict) -> Source:
    source = Source(**definition)
    db.add(source)
    db.commit()
    return source


def event_payload(
    *,
    event_id: str,
    indicator: str = "192.0.2.10",
    indicator_type: str = "ipv4",
    category: EventCategory = EventCategory.scanning,
    severity: Severity = Severity.medium,
    source_id: str = SOURCE_A["id"],
    event_timestamp: datetime | None = None,
    data_origin: DataOrigin = DataOrigin.observed,
    source_reference: str | None = None,
    title: str = "Fixture event",
    src_location: GeoLocation | None = None,
    dst_location: GeoLocation | None = None,
    location: GeoLocation | None = None,
) -> dict:
    timestamp = event_timestamp or datetime.now(timezone.utc)
    return {
        "event_id": event_id,
        "title": title,
        "description": "Test fixture record.",
        "indicator": indicator,
        "indicator_type": indicator_type,
        "category": category.value,
        "severity": severity.value,
        "source_id": source_id,
        "source_reference": source_reference or f"REF-{event_id}",
        "source_url": f"https://example.com/reference/{event_id}",
        "event_timestamp": timestamp.isoformat(),
        "first_seen": timestamp.isoformat(),
        "last_seen": timestamp.isoformat(),
        "confidence": 80,
        "location": location.model_dump(mode="json") if location else None,
        "src_location": (
            src_location.model_dump(mode="json") if src_location else None
        ),
        "dst_location": (
            dst_location.model_dump(mode="json") if dst_location else None
        ),
        "asn": "AS64510" if indicator_type == "ipv4" else None,
        "port": 443,
        "protocol": "tcp/443",
        "tags": ["test", category.value],
        "data_origin": data_origin.value,
        "verification_status": VerificationStatus.unverified.value,
        "reporter": "Fixture reporter",
        "collection_method": "pytest",
        "source_metadata": {"fixture": True, "event": event_id},
    }

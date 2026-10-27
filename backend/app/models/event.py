"""Normalized threat event model.

Timestamps are stored as UTC-aware values. Location coordinates are optional;
when a latitude is present a longitude is required (and vice versa). The
`fingerprint` column is an ingestion dedupe key derived from source, indicator,
and event time, not a user-facing field.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import (
    DataOrigin,
    EventCategory,
    IndicatorType,
    LocationSource,
    Severity,
    VerificationStatus,
)
from app.models.source import Source, enum_column

JSON_TYPE = JSON().with_variant(JSONB, "postgresql")


class ThreatEvent(Base):
    __tablename__ = "threat_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)

    title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    indicator: Mapped[str] = mapped_column(String(2048), nullable=False)
    indicator_type: Mapped[IndicatorType] = mapped_column(
        enum_column(IndicatorType, "event_indicator_type", 16), nullable=False
    )
    category: Mapped[EventCategory] = mapped_column(
        enum_column(EventCategory, "event_category", 24), nullable=False
    )
    severity: Mapped[Severity] = mapped_column(
        enum_column(Severity, "event_severity", 16), nullable=False
    )

    source_id: Mapped[str] = mapped_column(
        ForeignKey("sources.id", ondelete="RESTRICT"), nullable=False
    )
    source_reference: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    event_timestamp: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False, server_default=func.now()
    )
    first_seen: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    last_seen: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    confidence: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    # Primary reported/observation location.
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_label: Mapped[str | None] = mapped_column(String(300), nullable=True)
    location_country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    location_source: Mapped[LocationSource] = mapped_column(
        enum_column(LocationSource, "event_location_source", 16),
        nullable=False,
        default=LocationSource.unknown,
    )

    # Explicit endpoint coordinates. Only populated when the source supplied
    # them; nothing is inferred from an IP address.
    src_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    src_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    src_location_label: Mapped[str | None] = mapped_column(String(300), nullable=True)
    src_country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    src_location_source: Mapped[LocationSource | None] = mapped_column(
        enum_column(LocationSource, "event_src_location_source", 16), nullable=True
    )

    dst_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    dst_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    dst_location_label: Mapped[str | None] = mapped_column(String(300), nullable=True)
    dst_country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    dst_location_source: Mapped[LocationSource | None] = mapped_column(
        enum_column(LocationSource, "event_dst_location_source", 16), nullable=True
    )

    asn: Mapped[str | None] = mapped_column(String(32), nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    protocol: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON_TYPE, nullable=False, default=list)

    data_origin: Mapped[DataOrigin] = mapped_column(
        enum_column(DataOrigin, "event_data_origin", 16), nullable=False
    )
    verification_status: Mapped[VerificationStatus] = mapped_column(
        enum_column(VerificationStatus, "event_verification_status", 24),
        nullable=False,
        default=VerificationStatus.unverified,
    )

    reporter: Mapped[str | None] = mapped_column(String(200), nullable=True)
    collection_method: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSON_TYPE, nullable=False, default=dict
    )

    source: Mapped[Source] = relationship(back_populates="events", lazy="joined")

    __table_args__ = (
        CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 100)",
            name="ck_threat_events_confidence_range",
        ),
        CheckConstraint(
            "port IS NULL OR (port >= 0 AND port <= 65535)",
            name="ck_threat_events_port_range",
        ),
        CheckConstraint(
            "(first_seen IS NULL OR last_seen IS NULL OR first_seen <= last_seen)",
            name="ck_threat_events_seen_order",
        ),
        CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR "
            "(latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_threat_events_primary_geo_pair",
        ),
        CheckConstraint(
            "(latitude IS NULL OR (latitude >= -90 AND latitude <= 90)) AND "
            "(longitude IS NULL OR (longitude >= -180 AND longitude <= 180))",
            name="ck_threat_events_primary_geo_range",
        ),
        CheckConstraint(
            "(src_latitude IS NULL AND src_longitude IS NULL) OR "
            "(src_latitude IS NOT NULL AND src_longitude IS NOT NULL)",
            name="ck_threat_events_src_geo_pair",
        ),
        CheckConstraint(
            "(src_latitude IS NULL OR (src_latitude >= -90 AND src_latitude <= 90)) AND "
            "(src_longitude IS NULL OR (src_longitude >= -180 AND src_longitude <= 180))",
            name="ck_threat_events_src_geo_range",
        ),
        CheckConstraint(
            "(dst_latitude IS NULL AND dst_longitude IS NULL) OR "
            "(dst_latitude IS NOT NULL AND dst_longitude IS NOT NULL)",
            name="ck_threat_events_dst_geo_pair",
        ),
        CheckConstraint(
            "(dst_latitude IS NULL OR (dst_latitude >= -90 AND dst_latitude <= 90)) AND "
            "(dst_longitude IS NULL OR (dst_longitude >= -180 AND dst_longitude <= 180))",
            name="ck_threat_events_dst_geo_range",
        ),
        CheckConstraint(
            "NOT (data_origin = 'simulation' AND verification_status = 'verified')",
            name="ck_threat_events_simulation_unverified",
        ),
        UniqueConstraint("fingerprint", name="uq_threat_events_fingerprint"),
        Index(
            "uq_threat_events_source_reference",
            "source_id",
            "source_reference",
            unique=True,
            postgresql_where=text("source_reference IS NOT NULL"),
            sqlite_where=text("source_reference IS NOT NULL"),
        ),
        Index("ix_threat_events_event_timestamp", "event_timestamp"),
        Index("ix_threat_events_severity_timestamp", "severity", "event_timestamp"),
        Index("ix_threat_events_category_timestamp", "category", "event_timestamp"),
        Index("ix_threat_events_source_timestamp", "source_id", "event_timestamp"),
        Index("ix_threat_events_origin_timestamp", "data_origin", "event_timestamp"),
        Index("ix_threat_events_indicator", "indicator_type", "indicator"),
    )

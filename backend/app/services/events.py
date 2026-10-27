"""Event querying and serialization."""

from dataclasses import dataclass
from datetime import datetime
from math import ceil
from typing import Any, Sequence

from sqlalchemy import String, and_, case, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models.enums import (
    DataOrigin,
    EventCategory,
    Severity,
    SortOrder,
)
from app.models.event import ThreatEvent
from app.models.source import Source
from app.schemas.common import GeoLocation
from app.schemas.event import EventOut, EventPage


@dataclass(frozen=True)
class EventFilters:
    severities: tuple[Severity, ...] = ()
    categories: tuple[EventCategory, ...] = ()
    source_ids: tuple[str, ...] = ()
    data_origins: tuple[DataOrigin, ...] = ()
    q: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None

    @property
    def is_active(self) -> bool:
        return any(
            (
                self.severities,
                self.categories,
                self.source_ids,
                self.data_origins,
                self.q,
                self.start_time,
                self.end_time,
            )
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "severity": [item.value for item in self.severities],
            "event_type": [item.value for item in self.categories],
            "source": list(self.source_ids),
            "data_origin": [item.value for item in self.data_origins],
            "q": self.q,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
        }


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def build_event_conditions(filters: EventFilters) -> list[Any]:
    """Return parameterized SQLAlchemy conditions for the supplied filters."""
    conditions: list[Any] = []
    if filters.severities:
        conditions.append(ThreatEvent.severity.in_(filters.severities))
    if filters.categories:
        conditions.append(ThreatEvent.category.in_(filters.categories))
    if filters.source_ids:
        conditions.append(ThreatEvent.source_id.in_(filters.source_ids))
    if filters.data_origins:
        conditions.append(ThreatEvent.data_origin.in_(filters.data_origins))
    if filters.start_time is not None:
        conditions.append(ThreatEvent.event_timestamp >= filters.start_time)
    if filters.end_time is not None:
        conditions.append(ThreatEvent.event_timestamp <= filters.end_time)
    if filters.q:
        pattern = f"%{_escape_like(filters.q)}%"
        conditions.append(
            or_(
                ThreatEvent.indicator.ilike(pattern, escape="\\"),
                ThreatEvent.event_id.ilike(pattern, escape="\\"),
                ThreatEvent.title.ilike(pattern, escape="\\"),
                ThreatEvent.description.ilike(pattern, escape="\\"),
                ThreatEvent.source_reference.ilike(pattern, escape="\\"),
                cast(ThreatEvent.category, String).ilike(pattern, escape="\\"),
                Source.name.ilike(pattern, escape="\\"),
                Source.id.ilike(pattern, escape="\\"),
            )
        )
    return conditions


def _severity_rank_expression():
    return case(
        (ThreatEvent.severity == Severity.critical, 4),
        (ThreatEvent.severity == Severity.high, 3),
        (ThreatEvent.severity == Severity.medium, 2),
        (ThreatEvent.severity == Severity.low, 1),
        else_=0,
    )


def order_by_clause(sort: SortOrder):
    if sort is SortOrder.oldest:
        return (ThreatEvent.event_timestamp.asc(), ThreatEvent.event_id.asc())
    if sort is SortOrder.severity:
        return (
            _severity_rank_expression().desc(),
            ThreatEvent.event_timestamp.desc(),
            ThreatEvent.event_id.asc(),
        )
    return (ThreatEvent.event_timestamp.desc(), ThreatEvent.event_id.asc())


def _geo(
    latitude: float | None,
    longitude: float | None,
    label: str | None,
    country_code: str | None,
    location_source: Any,
) -> GeoLocation | None:
    if latitude is None or longitude is None:
        return None
    return GeoLocation(
        latitude=latitude,
        longitude=longitude,
        label=label,
        country_code=country_code,
        location_source=location_source,
    )


def to_event_out(event: ThreatEvent) -> EventOut:
    return EventOut(
        event_id=event.event_id,
        title=event.title,
        description=event.description,
        indicator=event.indicator,
        indicator_type=event.indicator_type,
        category=event.category,
        severity=event.severity,
        source_id=event.source_id,
        source_name=event.source.name,
        source_reference=event.source_reference,
        source_url=event.source_url,
        event_timestamp=event.event_timestamp,
        ingested_at=event.ingested_at,
        first_seen=event.first_seen,
        last_seen=event.last_seen,
        confidence=event.confidence,
        location=_geo(
            event.latitude,
            event.longitude,
            event.location_label,
            event.location_country_code,
            event.location_source,
        ),
        src_location=_geo(
            event.src_latitude,
            event.src_longitude,
            event.src_location_label,
            event.src_country_code,
            event.src_location_source,
        ),
        dst_location=_geo(
            event.dst_latitude,
            event.dst_longitude,
            event.dst_location_label,
            event.dst_country_code,
            event.dst_location_source,
        ),
        asn=event.asn,
        port=event.port,
        protocol=event.protocol,
        tags=list(event.tags or []),
        data_origin=event.data_origin,
        verification_status=event.verification_status,
        reporter=event.reporter,
        collection_method=event.collection_method,
    )


def list_events(
    db: Session,
    filters: EventFilters,
    page: int,
    page_size: int,
    sort: SortOrder,
) -> EventPage:
    conditions = build_event_conditions(filters)

    count_stmt = (
        select(func.count(ThreatEvent.event_id))
        .select_from(ThreatEvent)
        .join(Source, ThreatEvent.source_id == Source.id)
        .where(*conditions)
    )
    total = int(db.scalar(count_stmt) or 0)
    pages = ceil(total / page_size) if total else 0

    stmt = (
        select(ThreatEvent)
        .join(Source, ThreatEvent.source_id == Source.id)
        .where(*conditions)
        .order_by(*order_by_clause(sort))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    events: Sequence[ThreatEvent] = db.scalars(stmt).unique().all()
    return EventPage(
        items=[to_event_out(event) for event in events],
        page=page,
        page_size=page_size,
        total=total,
        pages=pages,
        has_next=page < pages,
        sort=sort,
    )


def get_event(db: Session, event_id: str) -> EventOut | None:
    event = db.scalar(
        select(ThreatEvent)
        .join(Source, ThreatEvent.source_id == Source.id)
        .where(and_(ThreatEvent.event_id == event_id))
    )
    return to_event_out(event) if event is not None else None

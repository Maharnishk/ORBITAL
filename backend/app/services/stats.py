"""Data-derived statistics.

Every query below operates on the same filter conditions as the events list.
`scope` in the response states whether filters were supplied. No values are
estimated, sampled, or extrapolated.
"""

from datetime import datetime, timezone

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from app.models.enums import EventCategory, Severity
from app.models.event import ThreatEvent
from app.models.source import Source
from app.schemas.stats import SourceCount, StatsOut
from app.services.events import EventFilters, build_event_conditions


def _count_where(db: Session, conditions: list, *extra) -> int:
    stmt = (
        select(func.count(ThreatEvent.event_id))
        .select_from(ThreatEvent)
        .join(Source, ThreatEvent.source_id == Source.id)
        .where(*conditions, *extra)
    )
    return int(db.scalar(stmt) or 0)


def compute_stats(db: Session, filters: EventFilters) -> StatsOut:
    conditions = build_event_conditions(filters)

    total = _count_where(db, conditions)
    unique_indicators = int(
        db.scalar(
            select(func.count(func.distinct(ThreatEvent.indicator)))
            .select_from(ThreatEvent)
            .join(Source, ThreatEvent.source_id == Source.id)
            .where(*conditions)
        )
        or 0
    )

    severity_rows = db.execute(
        select(ThreatEvent.severity, func.count(ThreatEvent.event_id))
        .join(Source, ThreatEvent.source_id == Source.id)
        .where(*conditions)
        .group_by(ThreatEvent.severity)
    ).all()
    severity_counts = {
        (row[0].value if isinstance(row[0], Severity) else str(row[0])): int(row[1])
        for row in severity_rows
    }
    by_severity = {severity.value: severity_counts.get(severity.value, 0) for severity in Severity}

    category_rows = db.execute(
        select(ThreatEvent.category, func.count(ThreatEvent.event_id))
        .join(Source, ThreatEvent.source_id == Source.id)
        .where(*conditions)
        .group_by(ThreatEvent.category)
    ).all()
    category_counts = {
        (row[0].value if isinstance(row[0], EventCategory) else str(row[0])): int(row[1])
        for row in category_rows
    }
    by_category = {
        category.value: category_counts.get(category.value, 0)
        for category in EventCategory
    }

    source_rows = db.execute(
        select(
            ThreatEvent.source_id,
            Source.name,
            func.count(ThreatEvent.event_id).label("event_count"),
        )
        .join(Source, ThreatEvent.source_id == Source.id)
        .where(*conditions)
        .group_by(ThreatEvent.source_id, Source.name)
        .order_by(func.count(ThreatEvent.event_id).desc(), Source.name.asc())
    ).all()
    by_source = [
        SourceCount(source_id=row[0], source_name=row[1], count=int(row[2]))
        for row in source_rows
    ]

    has_src = and_(
        ThreatEvent.src_latitude.is_not(None),
        ThreatEvent.src_longitude.is_not(None),
    )
    has_dst = and_(
        ThreatEvent.dst_latitude.is_not(None),
        ThreatEvent.dst_longitude.is_not(None),
    )
    paired_locations, any_location = db.execute(
        select(
            func.coalesce(
                func.sum(case((and_(has_src, has_dst), 1), else_=0)), 0
            ),
            func.coalesce(
                func.sum(case((or_(has_src, has_dst), 1), else_=0)), 0
            ),
        )
        .select_from(ThreatEvent)
        .join(Source, ThreatEvent.source_id == Source.id)
        .where(*conditions)
    ).one()
    paired = int(paired_locations or 0)
    with_location = int(any_location or 0)

    earliest, latest = db.execute(
        select(
            func.min(ThreatEvent.event_timestamp),
            func.max(ThreatEvent.event_timestamp),
        )
        .select_from(ThreatEvent)
        .join(Source, ThreatEvent.source_id == Source.id)
        .where(*conditions)
    ).one()

    return StatsOut(
        scope="filtered" if filters.is_active else "all_events",
        filters=filters.as_dict(),
        total_events=total,
        unique_indicators=unique_indicators,
        by_severity=by_severity,
        by_category=by_category,
        by_source=by_source,
        high_critical=by_severity["high"] + by_severity["critical"],
        paired_locations=paired,
        single_point_locations=with_location - paired,
        no_location=total - with_location,
        earliest_event_at=earliest,
        latest_event_at=latest,
        generated_at=datetime.now(timezone.utc),
    )

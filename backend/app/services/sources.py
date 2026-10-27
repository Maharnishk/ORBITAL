"""Source queries."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import ThreatEvent
from app.models.source import Source
from app.schemas.source import SourceOut


def list_sources(db: Session) -> list[SourceOut]:
    rows = db.execute(
        select(Source, func.count(ThreatEvent.event_id).label("event_count"))
        .outerjoin(ThreatEvent, ThreatEvent.source_id == Source.id)
        .group_by(Source.id)
        .order_by(Source.name.asc(), Source.id.asc())
    ).all()
    return [
        SourceOut(
            id=source.id,
            name=source.name,
            kind=source.kind,
            reliability=source.reliability,
            trust_score=source.trust_score,
            url=source.url,
            event_count=int(event_count),
        )
        for source, event_count in rows
    ]

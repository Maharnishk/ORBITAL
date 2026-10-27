"""Source schemas."""

from app.models.enums import SourceKind
from app.schemas.common import StrictModel


class SourceOut(StrictModel):
    id: str
    name: str
    kind: SourceKind
    reliability: str | None
    trust_score: int | None
    url: str | None
    event_count: int


class SourceList(StrictModel):
    items: list[SourceOut]
    total: int

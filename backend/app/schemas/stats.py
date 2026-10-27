"""Statistics schemas. Counts always apply to the stated scope."""

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.schemas.common import StrictModel


class SourceCount(StrictModel):
    source_id: str
    source_name: str
    count: int = Field(ge=0)


class StatsOut(StrictModel):
    scope: Literal["all_events", "filtered"]
    filters: dict[str, Any]
    total_events: int = Field(ge=0)
    unique_indicators: int = Field(ge=0)
    by_severity: dict[str, int]
    by_category: dict[str, int]
    by_source: list[SourceCount]
    high_critical: int = Field(ge=0)
    paired_locations: int = Field(ge=0)
    single_point_locations: int = Field(ge=0)
    no_location: int = Field(ge=0)
    earliest_event_at: datetime | None
    latest_event_at: datetime | None
    generated_at: datetime

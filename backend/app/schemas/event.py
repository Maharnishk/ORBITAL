"""Public event schemas."""

from datetime import datetime

from pydantic import Field, model_validator

from app.models.enums import (
    DataOrigin,
    EventCategory,
    IndicatorType,
    Severity,
    SortOrder,
    VerificationStatus,
)
from app.schemas.common import GeoLocation, StrictModel


class EventOut(StrictModel):
    event_id: str
    title: str | None
    description: str | None

    indicator: str
    indicator_type: IndicatorType
    category: EventCategory
    severity: Severity

    source_id: str
    source_name: str
    source_reference: str | None
    source_url: str | None

    event_timestamp: datetime
    ingested_at: datetime
    first_seen: datetime | None
    last_seen: datetime | None
    confidence: int | None

    location: GeoLocation | None
    src_location: GeoLocation | None
    dst_location: GeoLocation | None

    asn: str | None
    port: int | None
    protocol: str | None
    tags: list[str]

    data_origin: DataOrigin
    verification_status: VerificationStatus
    reporter: str | None
    collection_method: str | None


class EventPage(StrictModel):
    items: list[EventOut]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    total: int = Field(ge=0)
    pages: int = Field(ge=0)
    has_next: bool
    sort: SortOrder

    @model_validator(mode="after")
    def _consistent_page(self) -> "EventPage":
        expected_pages = (self.total + self.page_size - 1) // self.page_size
        if self.pages != expected_pages:
            raise ValueError("pages does not match total and page_size")
        if self.has_next != (self.page < self.pages):
            raise ValueError("has_next does not match page and pages")
        return self

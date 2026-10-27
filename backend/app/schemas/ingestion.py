"""Ingestion input and result schemas."""

import json
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import Field, field_validator, model_validator

from app.core.normalization import (
    as_utc,
    normalize_http_url,
    normalize_indicator,
    normalize_tags,
)
from app.models.enums import (
    DataOrigin,
    EventCategory,
    IndicatorType,
    Severity,
    VerificationStatus,
)
from app.schemas.common import GeoLocation, StrictModel

_ASN_PATTERN = r"^AS[0-9]{1,10}$"
_EVENT_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$"
_SOURCE_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$"


class EventIngest(StrictModel):
    """Source-agnostic ingestion record.

    Unknown fields are rejected. Timestamps must carry an offset and are
    normalized to UTC. The service (not the schema) checks source existence,
    future timestamps, and deduplication.
    """

    event_id: str | None = Field(default=None, pattern=_EVENT_ID_PATTERN)

    title: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=10_000)

    indicator: str = Field(min_length=1, max_length=2048)
    indicator_type: IndicatorType
    category: EventCategory
    severity: Severity

    source_id: str = Field(min_length=1, max_length=64, pattern=_SOURCE_ID_PATTERN)
    source_reference: str | None = Field(default=None, max_length=512)
    source_url: str | None = Field(default=None, max_length=2048)

    event_timestamp: datetime
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    confidence: int | None = Field(default=None, ge=0, le=100)

    location: GeoLocation | None = None
    src_location: GeoLocation | None = None
    dst_location: GeoLocation | None = None

    asn: str | None = Field(default=None, pattern=_ASN_PATTERN)
    port: int | None = Field(default=None, ge=0, le=65535)
    protocol: str | None = Field(default=None, max_length=32)
    tags: list[str] = Field(default_factory=list, max_length=50)

    data_origin: DataOrigin
    verification_status: VerificationStatus = VerificationStatus.unverified
    reporter: str | None = Field(default=None, max_length=200)
    collection_method: str | None = Field(default=None, max_length=200)
    source_metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("event_timestamp", "first_seen", "last_seen")
    @classmethod
    def _timestamps_are_utc(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return as_utc(value)

    @field_validator("title", "description", "source_reference", "reporter", "collection_method")
    @classmethod
    def _clean_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("asn")
    @classmethod
    def _normalize_asn(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().upper()

    @field_validator("protocol")
    @classmethod
    def _clean_protocol(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().lower()
        return cleaned or None

    @field_validator("source_url")
    @classmethod
    def _normalize_source_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_http_url(value)

    @field_validator("tags")
    @classmethod
    def _normalize_tags(cls, value: list[str]) -> list[str]:
        return normalize_tags(value)

    @field_validator("source_metadata")
    @classmethod
    def _source_metadata_is_json(cls, value: dict[str, Any]) -> dict[str, Any]:
        try:
            json.dumps(value, allow_nan=False)
        except (TypeError, ValueError) as exc:
            raise ValueError("source_metadata must be JSON-serializable") from exc
        return value

    @model_validator(mode="after")
    def _cross_field_rules(self) -> "EventIngest":
        self.indicator = normalize_indicator(self.indicator_type, self.indicator)

        if (
            self.first_seen is not None
            and self.last_seen is not None
            and self.first_seen > self.last_seen
        ):
            raise ValueError("first_seen must not be later than last_seen")

        if (
            self.data_origin is DataOrigin.simulation
            and self.verification_status is VerificationStatus.verified
        ):
            raise ValueError("simulation records cannot be marked verified")

        return self


class IngestionStatus(str, Enum):
    created = "created"
    duplicate = "duplicate"


class IngestionResult(StrictModel):
    status: IngestionStatus
    event_id: str
    fingerprint: str
    message: str

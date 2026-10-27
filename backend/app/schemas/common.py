"""Shared Pydantic schema helpers."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.normalization import as_utc
from app.models.enums import LocationSource


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class GeoLocation(StrictModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    label: str | None = Field(default=None, max_length=300)
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    location_source: LocationSource = LocationSource.unknown

    @field_validator("label")
    @classmethod
    def _clean_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("country_code")
    @classmethod
    def _normalize_country(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().upper()
        if len(cleaned) != 2 or not cleaned.isalpha():
            raise ValueError("country_code must be two letters")
        return cleaned

    @model_validator(mode="after")
    def _coordinates_are_present(self) -> "GeoLocation":
        # Fields are required, so this validator mostly documents intent and
        # guards future changes.
        if self.latitude is None or self.longitude is None:
            raise ValueError("latitude and longitude are both required")
        return self


def utc_timestamp(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return as_utc(value)


def json_safe(value: Any) -> Any:
    return value

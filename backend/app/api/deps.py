"""Shared FastAPI dependencies."""

import re
from datetime import datetime, timezone
from typing import Annotated, Iterable, TypeVar

from fastapi import Query

from app.core.errors import api_error
from app.models.enums import DataOrigin, EventCategory, Severity
from app.services.events import EventFilters

T = TypeVar("T")

_SOURCE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")
MAX_FILTER_VALUES = 50


def _unique(values: Iterable[T] | None, field_name: str) -> tuple[T, ...]:
    if not values:
        return ()
    items = list(values)
    if len(items) > MAX_FILTER_VALUES:
        raise api_error(
            422,
            "too_many_filter_values",
            f"{field_name} accepts at most {MAX_FILTER_VALUES} values per request.",
        )
    seen: set[T] = set()
    ordered: list[T] = []
    for value in items:
        if value not in seen:
            seen.add(value)
            ordered.append(value)
    return tuple(ordered)


def _require_utc(value: datetime | None, name: str) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        raise api_error(
            422,
            "invalid_time_range",
            f"{name} must include a UTC offset (for example 2026-10-19T12:00:00Z).",
        )
    return value.astimezone(timezone.utc)


def get_event_filters(
    severity: Annotated[
        list[Severity] | None,
        Query(description="Repeat to match any of several severities."),
    ] = None,
    event_type: Annotated[
        list[EventCategory] | None,
        Query(description="Repeat to match any of several event categories."),
    ] = None,
    source: Annotated[
        list[str] | None,
        Query(description="Repeat to match any of several source IDs."),
    ] = None,
    data_origin: Annotated[
        list[DataOrigin] | None,
        Query(description="Repeat to match simulation, public-intel, or observed."),
    ] = None,
    q: Annotated[
        str | None,
        Query(
            min_length=1,
            max_length=200,
            description=(
                "Case-insensitive search over indicator, ID, title, category, "
                "source, and source reference."
            ),
        ),
    ] = None,
    start_time: Annotated[
        datetime | None,
        Query(description="Inclusive lower bound on event_timestamp (UTC)."),
    ] = None,
    end_time: Annotated[
        datetime | None,
        Query(description="Inclusive upper bound on event_timestamp (UTC)."),
    ] = None,
) -> EventFilters:
    source_ids = _unique(source, "source")
    for source_id in source_ids:
        if not _SOURCE_ID_PATTERN.fullmatch(source_id):
            raise api_error(
                422,
                "invalid_source_filter",
                "source must be 1-64 characters using letters, digits, dot, "
                "colon, underscore, or hyphen.",
            )

    query = q.strip() if q else None
    if query == "":
        query = None

    start = _require_utc(start_time, "start_time")
    end = _require_utc(end_time, "end_time")
    if start is not None and end is not None and start > end:
        raise api_error(
            422,
            "invalid_time_range",
            "start_time must not be later than end_time.",
        )

    return EventFilters(
        severities=_unique(severity, "severity"),
        categories=_unique(event_type, "event_type"),
        source_ids=source_ids,
        data_origins=_unique(data_origin, "data_origin"),
        q=query,
        start_time=start,
        end_time=end,
    )

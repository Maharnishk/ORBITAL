"""Event list and detail endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_event_filters
from app.core.errors import api_error
from app.db.session import get_db
from app.models.enums import SortOrder
from app.schemas.event import EventOut, EventPage
from app.services import events as events_service
from app.services.events import EventFilters

router = APIRouter(prefix="/events", tags=["events"])


@router.get(
    "",
    response_model=EventPage,
    summary="List threat events",
    description=(
        "Filterable, deterministically sorted event list. Filters use repeated "
        "query parameters (for example `severity=high&severity=critical`). "
        "`start_time`/`end_time` are inclusive UTC bounds on `event_timestamp`. "
        "Unknown filter values are rejected with a structured 422 response."
    ),
)
def list_events(
    db: Annotated[Session, Depends(get_db)],
    filters: Annotated[EventFilters, Depends(get_event_filters)],
    page: Annotated[
        int, Query(ge=1, le=100_000, description="1-based page number (max 100000).")
    ] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=100, description="Page size (1-100).")
    ] = 50,
    sort: Annotated[SortOrder, Query(description="Deterministic sort order.")] = (
        SortOrder.newest
    ),
) -> EventPage:
    return events_service.list_events(db, filters, page=page, page_size=page_size, sort=sort)


@router.get(
    "/{event_id}",
    response_model=EventOut,
    summary="Get one threat event",
    responses={404: {"description": "Event not found"}},
)
def get_event(
    event_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> EventOut:
    event = events_service.get_event(db, event_id)
    if event is None:
        raise api_error(404, "event_not_found", f"No event with id '{event_id}'.")
    return event

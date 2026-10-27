"""Statistics endpoint.

Counts are data-derived and always apply either to the full dataset
(`scope: all_events`) or to the supplied filter set (`scope: filtered`).
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_event_filters
from app.db.session import get_db
from app.schemas.stats import StatsOut
from app.services.events import EventFilters
from app.services.stats import compute_stats

router = APIRouter(tags=["statistics"])


@router.get(
    "/stats",
    response_model=StatsOut,
    summary="Aggregate statistics",
    description=(
        "Aggregates over the same filters as `GET /api/v1/events`. "
        "`scope` states whether filters were supplied: `all_events` means no "
        "filters were provided, `filtered` means the counts reflect exactly the "
        "provided filter set. `single_point_locations` counts events with only "
        "one endpoint location; `paired_locations` counts events with both. "
        "The primary `location` field is not counted as an endpoint."
    ),
)
def stats(
    db: Annotated[Session, Depends(get_db)],
    filters: Annotated[EventFilters, Depends(get_event_filters)],
) -> StatsOut:
    return compute_stats(db, filters)

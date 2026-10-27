"""Source registry endpoint."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.source import SourceList
from app.services.sources import list_sources

router = APIRouter(tags=["sources"])


@router.get(
    "/sources",
    response_model=SourceList,
    summary="List sources",
    description=(
        "Registered sources with lifetime event counts. Counts are for the "
        "full dataset, not a filtered view, and are sorted by source name."
    ),
)
def sources(db: Annotated[Session, Depends(get_db)]) -> SourceList:
    items = list_sources(db)
    return SourceList(items=items, total=len(items))

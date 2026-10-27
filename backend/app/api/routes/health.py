"""Health endpoint.

`GET /health` is liveness plus a `SELECT 1` database probe. It returns 503 with
`status: degraded` instead of raising, so probes get a useful body.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.schemas.health import HealthOut

logger = logging.getLogger(__name__)
router = APIRouter(tags=["system"])


@router.get(
    "/health",
    response_model=HealthOut,
    summary="Service and database health",
    responses={503: {"model": HealthOut, "description": "Database unavailable"}},
)
def health(response: Response, db: Annotated[Session, Depends(get_db)]) -> HealthOut:
    settings = get_settings()
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        # Do not log the exception text: driver messages can include DSNs.
        logger.warning(
            "Health check: database probe failed exc_type=%s", type(exc).__name__
        )
        response.status_code = 503
        return HealthOut(
            status="degraded",
            service=settings.app_name,
            version=settings.app_version,
            database="unavailable",
        )
    return HealthOut(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        database="ok",
    )

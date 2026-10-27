"""Health schema."""

from typing import Literal

from app.schemas.common import StrictModel


class HealthOut(StrictModel):
    status: Literal["ok", "degraded"]
    service: str
    version: str
    database: Literal["ok", "unavailable"]

"""ORBITAL FastAPI application.

Startup performs no migrations and no seeding. Databases must be migrated
explicitly (alembic) and simulation data must be loaded explicitly
(`python -m app.seed`).
"""

import logging
import re
import time
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import events, health, sources, stats
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging

logger = logging.getLogger("app.request")

# Client-supplied request IDs are echoed only when they are plausible opaque
# tokens. Anything else is replaced, so arbitrary header content can never be
# reflected or written into logs.
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}

DESCRIPTION = """
ORBITAL threat-intelligence API.

* `GET /health` — service and database health (no authentication).
* `GET /api/v1/events` — filterable, paginated event list.
* `GET /api/v1/events/{event_id}` — single event.
* `GET /api/v1/stats` — data-derived aggregates for the dataset or the supplied filters.
* `GET /api/v1/sources` — registered sources with lifetime counts.

Simulation records carry `data_origin: "simulation"` and are never marked
verified. Error responses always use the envelope
`{"error": {"code", "message", "details"?}}` and never expose stack traces.
"""


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=DESCRIPTION.strip(),
        docs_url="/docs",
        redoc_url=None,
        openapi_url="/openapi.json",
    )

    register_exception_handlers(app)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        incoming_id = request.headers.get("X-Request-ID")
        request_id = (
            incoming_id
            if incoming_id and _REQUEST_ID_PATTERN.fullmatch(incoming_id)
            else uuid4().hex
        )
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        for name, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if request.url.path.startswith(("/api/", "/health")):
            # Event data can change at any time; avoid stale intermediary copies.
            response.headers.setdefault("Cache-Control", "no-store")
        # Path only: query strings can contain search terms.
        logger.info(
            "%s %s -> %s in %.1f ms request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            request_id,
        )
        return response

    # CORS is added last so it wraps the other middleware and applies to error
    # responses. Only explicit development origins are allowed; no "*".
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["Accept", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    app.include_router(health.router)
    app.include_router(events.router, prefix=settings.api_v1_prefix)
    app.include_router(stats.router, prefix=settings.api_v1_prefix)
    app.include_router(sources.router, prefix=settings.api_v1_prefix)

    return app


app = create_app()

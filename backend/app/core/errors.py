"""Structured, non-leaking API errors."""

import logging
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.exc import TimeoutError as DatabaseTimeoutError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request

logger = logging.getLogger(__name__)

_STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    503: "service_unavailable",
}


def api_error(
    status_code: int,
    code: str,
    message: str,
    details: Any | None = None,
    headers: dict[str, str] | None = None,
) -> HTTPException:
    """Build an HTTPException carrying the public error envelope."""
    payload: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        payload["details"] = details
    return HTTPException(status_code=status_code, detail=payload, headers=headers)


def _error_payload(
    status_code: int, code: str, message: str, details: Any | None = None
) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return {"error": error}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def _http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, dict) and "code" in detail and "message" in detail:
            error = detail
        else:
            error = {
                "code": _STATUS_CODES.get(exc.status_code, "http_error"),
                "message": str(detail),
            }
        return JSONResponse(
            {"error": error}, status_code=exc.status_code, headers=exc.headers
        )

    async def _database_unavailable_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        # Log the class only: driver messages can contain DSNs or credentials.
        logger.error(
            "Database unavailable request_id=%s method=%s path=%s exc_type=%s",
            request_id or "-",
            request.method,
            request.url.path,
            type(exc).__name__,
        )
        headers = {"X-Request-ID": request_id} if request_id else None
        return JSONResponse(
            _error_payload(
                503,
                "database_unavailable",
                "The database is temporarily unavailable. Retry shortly; no data was changed.",
            ),
            status_code=503,
            headers=headers,
        )

    for db_error in (OperationalError, InterfaceError, DatabaseTimeoutError):
        app.add_exception_handler(db_error, _database_unavailable_handler)

    @app.exception_handler(RequestValidationError)
    async def _validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Never echo raw input values: they can include credentials or large
        # payloads. Locations and messages are enough to fix a request.
        details = [
            {
                "loc": list(error.get("loc", ())),
                "message": str(error.get("msg", "Invalid value")),
                "type": str(error.get("type", "value_error")),
            }
            for error in exc.errors()
        ]
        return JSONResponse(
            _error_payload(
                422, "validation_error", "Request validation failed.", details
            ),
            status_code=422,
        )

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        logger.exception(
            "Unhandled error request_id=%s method=%s path=%s",
            request_id or "-",
            request.method,
            request.url.path,
        )
        headers = {"X-Request-ID": request_id} if request_id else None
        return JSONResponse(
            _error_payload(
                500,
                "internal_error",
                "An unexpected error occurred. No internal details were exposed.",
            ),
            status_code=500,
            headers=headers,
        )

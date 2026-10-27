"""Sources, health, CORS, and public error-envelope tests."""

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.db.session import get_db
from app.main import app


def test_sources_endpoint_returns_lifetime_counts(client, seeded_data) -> None:
    response = client.get("/api/v1/sources")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert [item["name"] for item in body["items"]] == [
        "Meridian Honeynet",
        "OpenPhish Collective",
    ]
    assert [item["event_count"] for item in body["items"]] == [3, 2]
    assert body["items"][0]["trust_score"] == 92


def test_health_reports_database_ok(client) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database"] == "ok"


def test_health_degrades_without_exposing_details(client) -> None:
    class BrokenDB:
        def execute(self, *args, **kwargs):
            raise RuntimeError("password=hunter2 host=secret-db")

    def broken_db():
        return BrokenDB()

    previous = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = broken_db
    try:
        response = client.get("/health")
    finally:
        app.dependency_overrides[get_db] = previous

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert response.json()["database"] == "unavailable"
    assert "hunter2" not in response.text
    assert "secret-db" not in response.text


def test_cors_allows_configured_origin_only(client) -> None:
    allowed = client.get(
        "/health", headers={"Origin": "http://localhost:3000"}
    )
    assert allowed.headers.get("access-control-allow-origin") == (
        "http://localhost:3000"
    )

    denied = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in denied.headers


def test_unknown_route_uses_error_envelope(client) -> None:
    response = client.get("/api/v1/not-a-route")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert "traceback" not in response.text.lower()


def test_unhandled_error_is_generic_and_does_not_leak(client) -> None:
    def broken_db():
        raise RuntimeError("super-secret-database-password")
        yield  # pragma: no cover

    previous = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = broken_db
    try:
        response = client.get("/api/v1/sources")
    finally:
        app.dependency_overrides[get_db] = previous

    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "internal_error"
    assert "super-secret-database-password" not in response.text
    assert "Traceback" not in response.text
    assert "X-Request-ID" in response.headers


def test_request_id_is_returned_and_propagated(client) -> None:
    response = client.get("/health", headers={"X-Request-ID": "test-request-id"})
    assert response.headers["X-Request-ID"] == "test-request-id"

    generated = client.get("/health")
    assert generated.headers.get("X-Request-ID")


def test_untrusted_request_id_is_replaced_not_reflected(client) -> None:
    response = client.get(
        "/health", headers={"X-Request-ID": "bad<script> alert(1) </script>"}
    )
    assert response.status_code == 200
    echoed = response.headers["X-Request-ID"]
    assert echoed != "bad<script> alert(1) </script>"
    assert len(echoed) == 32
    assert all(character in "0123456789abcdef" for character in echoed)


def test_security_headers_and_no_store_on_api_responses(client) -> None:
    response = client.get("/health")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert response.headers["Cache-Control"] == "no-store"


def test_database_failure_returns_structured_503_without_leaking(client) -> None:
    class BrokenDB:
        def execute(self, *args, **kwargs):
            raise OperationalError(
                "SELECT 1", {}, Exception("password=hunter2 host=secret-db")
            )

    def broken_db():
        return BrokenDB()

    previous = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = broken_db
    try:
        response = client.get("/api/v1/sources")
    finally:
        app.dependency_overrides[get_db] = previous

    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "database_unavailable"
    assert error["message"]
    assert "hunter2" not in response.text
    assert "secret-db" not in response.text
    assert "X-Request-ID" in response.headers


def test_openapi_documents_required_endpoints(client) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    for path in (
        "/health",
        "/api/v1/events",
        "/api/v1/events/{event_id}",
        "/api/v1/stats",
        "/api/v1/sources",
    ):
        assert path in paths

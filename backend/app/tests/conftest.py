"""Shared pytest fixtures.

Tests run against SQLite in-memory via a dependency override. The production
schema uses PostgreSQL; the migration test additionally exercises Alembic.
"""

import os

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")

from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.enums import EventCategory, Severity
from app.schemas.common import GeoLocation
from app.schemas.ingestion import EventIngest
from app.services.ingestion import IngestionService
from app.tests.helpers import SOURCE_A, SOURCE_B, add_source, event_payload


@pytest.fixture()
def engine():
    test_engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(test_engine)
    yield test_engine
    Base.metadata.drop_all(test_engine)
    test_engine.dispose()


@pytest.fixture()
def session(engine) -> Generator[Session, None, None]:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = factory()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client(session: Session) -> Generator[TestClient, None, None]:
    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def seeded_data(session: Session):
    """Five deterministic events across two sources, severities, and geos."""
    fixed_now = datetime.now(timezone.utc)
    add_source(session, SOURCE_A)
    add_source(session, SOURCE_B)
    service = IngestionService(session, clock=lambda: fixed_now)

    src1 = GeoLocation(
        latitude=40.41,
        longitude=-73.94,
        label="Sim sector N-ATL-01",
        country_code="XX",
        location_source="reported",
    )
    dst1 = GeoLocation(
        latitude=52.31,
        longitude=4.72,
        label="Sim sector E-EUR-02",
        country_code="XX",
        location_source="reported",
    )
    dst2 = GeoLocation(
        latitude=35.42,
        longitude=139.51,
        label="Sim sector W-PAC-03",
        country_code="XX",
        location_source="inferred",
    )

    fixtures = [
        (
            dict(
                event_id="EVT-TEST-1",
                indicator="192.0.2.10",
                category=EventCategory.malware_c2,
                severity=Severity.critical,
                source_id=SOURCE_A["id"],
                event_timestamp=fixed_now - timedelta(minutes=30),
                title="C2 beacon fixture",
                location=dst1,
                src_location=src1,
                dst_location=dst1,
            ),
            10,
        ),
        (
            dict(
                event_id="EVT-TEST-2",
                indicator="login-1.example.com",
                indicator_type="domain",
                category=EventCategory.phishing,
                severity=Severity.low,
                source_id=SOURCE_B["id"],
                event_timestamp=fixed_now - timedelta(hours=2),
                title="Phishing fixture",
                location=dst2,
                dst_location=dst2,
            ),
            20,
        ),
        (
            dict(
                event_id="EVT-TEST-3",
                indicator="198.51.100.7",
                category=EventCategory.scanning,
                severity=Severity.high,
                source_id=SOURCE_A["id"],
                event_timestamp=fixed_now - timedelta(hours=26),
                title="Scanning fixture",
            ),
            30,
        ),
        (
            dict(
                event_id="EVT-TEST-4",
                indicator="203.0.113.5",
                indicator_type="ipv4",
                category=EventCategory.dns_tunneling,
                severity=Severity.medium,
                source_id=SOURCE_B["id"],
                event_timestamp=fixed_now - timedelta(days=3),
                title="DNS fixture",
                location=dst2,
                dst_location=dst2,
            ),
            40,
        ),
        (
            dict(
                event_id="EVT-TEST-5",
                indicator="192.0.2.44",
                category=EventCategory.brute_force,
                severity=Severity.critical,
                source_id=SOURCE_A["id"],
                event_timestamp=fixed_now - timedelta(days=6),
                title="Brute force fixture",
                location=dst1,
                src_location=src1,
                dst_location=dst1,
            ),
            50,
        ),
    ]

    for payload_args, port in fixtures:
        payload = event_payload(**payload_args)
        payload["port"] = port
        result = service.ingest(EventIngest.model_validate(payload))
        assert result.status.value == "created"

    return {
        "now": fixed_now,
        "sources": [SOURCE_A, SOURCE_B],
    }

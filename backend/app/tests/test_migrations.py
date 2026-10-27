"""Alembic migration smoke test (SQLite; PostgreSQL is not available locally)."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

BACKEND_DIR = Path(__file__).resolve().parents[2]


def test_migration_upgrade_and_downgrade(tmp_path, monkeypatch) -> None:
    database_path = tmp_path / "orbital_migration_test.db"
    database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", database_url)

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))

    command.upgrade(config, "head")

    engine = create_engine(database_url)
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        assert {"sources", "threat_events", "alembic_version"} <= tables

        columns = {
            column["name"]
            for column in inspector.get_columns("threat_events")
        }
        assert {
            "event_id",
            "indicator",
            "indicator_type",
            "category",
            "severity",
            "source_id",
            "source_reference",
            "event_timestamp",
            "ingested_at",
            "first_seen",
            "last_seen",
            "confidence",
            "latitude",
            "longitude",
            "location_source",
            "src_latitude",
            "dst_longitude",
            "data_origin",
            "verification_status",
            "source_metadata",
        } <= columns

        indexes = {
            index["name"] for index in inspector.get_indexes("threat_events")
        }
        assert {
            "ix_threat_events_event_timestamp",
            "ix_threat_events_severity_timestamp",
            "ix_threat_events_source_timestamp",
            "ix_threat_events_indicator",
            "uq_threat_events_source_reference",
        } <= indexes

        checks = {
            check["name"]
            for check in inspector.get_check_constraints("threat_events")
        }
        assert "ck_threat_events_confidence_range" in checks
        assert "ck_threat_events_primary_geo_pair" in checks
        assert "ck_threat_events_simulation_unverified" in checks
    finally:
        engine.dispose()

    command.downgrade(config, "base")

    engine = create_engine(database_url)
    try:
        remaining = set(inspect(engine).get_table_names())
        assert "threat_events" not in remaining
        assert "sources" not in remaining
    finally:
        engine.dispose()

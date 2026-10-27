"""Simulation seed determinism, safety, and idempotency."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

import app.seed as seed_module
from app.models.enums import DataOrigin, VerificationStatus
from app.models.event import ThreatEvent
from app.models.source import Source
from app.seed import build_simulated_records, upsert_events, upsert_sources

ANCHOR = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
NOW = ANCHOR + timedelta(minutes=15)


def test_seed_generation_is_deterministic() -> None:
    first = build_simulated_records(ANCHOR, count=20, seed=1234, now=NOW)
    second = build_simulated_records(ANCHOR, count=20, seed=1234, now=NOW)
    assert [item.record.model_dump() for item in first] == [
        item.record.model_dump() for item in second
    ]
    assert [item.ingested_at for item in first] == [
        item.ingested_at for item in second
    ]
    assert len({item.record.event_id for item in first}) == 20


def test_seed_records_are_explicitly_simulated_and_reserved() -> None:
    records = build_simulated_records(ANCHOR, count=72, seed=20261014, now=NOW)
    allowed_ip_blocks = ("192.0.2.", "198.51.100.", "203.0.113.")
    for item in records:
        record = item.record
        assert record.data_origin is DataOrigin.simulation
        assert record.verification_status is VerificationStatus.unverified
        assert record.source_metadata["simulation"] is True
        assert record.event_id.startswith("SIM-EVT-")
        if record.indicator_type.value == "ipv4":
            assert record.indicator.startswith(allowed_ip_blocks)
        else:
            assert record.indicator.endswith(".example.com")
        for geo in (record.location, record.src_location, record.dst_location):
            if geo is not None:
                assert geo.country_code == "XX"
                assert "Sim sector" in (geo.label or "")
        assert item.ingested_at <= NOW


def test_seed_upsert_is_idempotent(session: Session) -> None:
    records = build_simulated_records(ANCHOR, count=5, seed=99, now=NOW)
    upsert_sources(session)
    created, updated = upsert_events(session, records)
    session.commit()
    assert (created, updated) == (5, 0)
    assert session.scalar(select(func.count(ThreatEvent.event_id))) == 5
    assert session.scalar(select(func.count(Source.id))) == 5

    created, updated = upsert_events(session, records)
    session.commit()
    assert (created, updated) == (0, 5)
    assert session.scalar(select(func.count(ThreatEvent.event_id))) == 5


def test_seed_command_run_and_reset(engine, monkeypatch, capsys) -> None:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(seed_module, "SessionLocal", factory)
    anchor_arg = ANCHOR.isoformat()

    assert seed_module.main(["--count", "3", "--anchor", anchor_arg]) == 0
    with factory() as db:
        assert db.scalar(select(func.count(ThreatEvent.event_id))) == 3
        assert {
            event.data_origin for event in db.scalars(select(ThreatEvent))
        } == {DataOrigin.simulation}

    # Rerun must not duplicate.
    assert seed_module.main(["--count", "3", "--anchor", anchor_arg]) == 0
    with factory() as db:
        assert db.scalar(select(func.count(ThreatEvent.event_id))) == 3

    # --reset explicitly replaces simulation events.
    assert (
        seed_module.main(
            ["--count", "4", "--anchor", anchor_arg, "--reset"]
        )
        == 0
    )
    with factory() as db:
        assert db.scalar(select(func.count(ThreatEvent.event_id))) == 4
        assert db.scalar(select(func.count(Source.id))) == 5

    output = capsys.readouterr().out
    assert "Simulation seed complete" in output
    assert "data_origin=simulation" in output


def test_seed_refuses_production_without_force(monkeypatch, capsys) -> None:
    monkeypatch.setattr(
        seed_module,
        "get_settings",
        lambda: SimpleNamespace(environment="production"),
    )
    assert seed_module.main(["--dry-run"]) == 2
    assert "Refusing to seed" in capsys.readouterr().err

    assert seed_module.main(["--dry-run", "--force"]) == 0
    assert "Dry run" in capsys.readouterr().out

"""Explicit, deterministic simulation seed command.

Usage (from backend/):
    python -m app.seed
    python -m app.seed --count 120 --seed 20261014
    python -m app.seed --anchor 2026-10-19T12:00:00Z --reset

Safety:
* Never runs at application startup.
* Refuses production environments unless `--force` is passed.
* Only writes `data_origin="simulation"` records, which cannot be marked
  verified. Coordinates are fictional sectors and indicators use RFC 5737
  documentation ranges / example.* domains.
* Upserts by stable event_id, so rerunning is idempotent for the same anchor.
"""

import argparse
import random
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.normalization import compute_fingerprint
from app.db.session import SessionLocal
from app.models.enums import (
    DataOrigin,
    EventCategory,
    IndicatorType,
    LocationSource,
    Severity,
    SourceKind,
    VerificationStatus,
)
from app.models.event import ThreatEvent
from app.models.source import Source
from app.schemas.common import GeoLocation
from app.schemas.ingestion import EventIngest
from app.services.ingestion import build_event

DEFAULT_SEED = 20261014
DEFAULT_COUNT = 72
MAX_COUNT = 500


@dataclass(frozen=True)
class SimulatedRecord:
    record: EventIngest
    ingested_at: datetime


SOURCE_DEFS: tuple[dict, ...] = (
    {
        "id": "meridian-honeynet",
        "name": "Meridian Honeynet",
        "kind": SourceKind.honeypot,
        "reliability": "A",
        "trust_score": 92,
        "url": None,
    },
    {
        "id": "backbone-netflow",
        "name": "Backbone NetFlow Agg.",
        "kind": SourceKind.netflow,
        "reliability": "B",
        "trust_score": 84,
        "url": None,
    },
    {
        "id": "openphish-collective",
        "name": "OpenPhish Collective",
        "kind": SourceKind.osint,
        "reliability": "C",
        "trust_score": 71,
        "url": None,
    },
    {
        "id": "sandbox-queue",
        "name": "Sandbox Detonation Q.",
        "kind": SourceKind.sandbox,
        "reliability": "A",
        "trust_score": 95,
        "url": None,
    },
    {
        "id": "community-blocklist",
        "name": "Community Blocklist",
        "kind": SourceKind.community,
        "reliability": "D",
        "trust_score": 58,
        "url": None,
    },
)

# Fictional sensor/target sectors. Coordinates are intentionally offset from
# real cities and country code XX marks simulated geography.
SITES: tuple[dict, ...] = (
    {
        "label": "Sim sector N-ATL-01 · 40.4N 73.9W",
        "lat": 40.41,
        "lon": -73.94,
        "location_source": LocationSource.reported,
    },
    {
        "label": "Sim sector E-EUR-02 · 52.3N 4.7E",
        "lat": 52.31,
        "lon": 4.72,
        "location_source": LocationSource.reported,
    },
    {
        "label": "Sim sector W-PAC-03 · 35.4N 139.5E",
        "lat": 35.42,
        "lon": 139.51,
        "location_source": LocationSource.inferred,
    },
    {
        "label": "Sim sector S-ATL-04 · 23.7S 46.5W",
        "lat": -23.71,
        "lon": -46.52,
        "location_source": LocationSource.inferred,
    },
    {
        "label": "Sim sector C-AFR-05 · 6.4N 3.2E",
        "lat": 6.41,
        "lon": 3.22,
        "location_source": LocationSource.resolved,
    },
    {
        "label": "Sim sector GULF-06 · 25.1N 55.2E",
        "lat": 25.12,
        "lon": 55.21,
        "location_source": LocationSource.resolved,
    },
    {
        "label": "Sim sector S-PAC-07 · 33.8S 151.1E",
        "lat": -33.81,
        "lon": 151.12,
        "location_source": LocationSource.reported,
    },
    {
        "label": "Sim sector N-AME-08 · 37.5N 122.3W",
        "lat": 37.51,
        "lon": -122.31,
        "location_source": LocationSource.resolved,
    },
    {
        "label": "Sim sector N-EUR-09 · 59.9N 10.6E",
        "lat": 59.91,
        "lon": 10.62,
        "location_source": LocationSource.inferred,
    },
    {
        "label": "Sim sector S-ASI-10 · 1.29N 103.8E",
        "lat": 1.29,
        "lon": 103.81,
        "location_source": LocationSource.reported,
    },
    {
        "label": "Sim sector E-ASI-11 · 22.19N 114.16E",
        "lat": 22.19,
        "lon": 114.16,
        "location_source": LocationSource.unknown,
    },
    {
        "label": "Sim sector W-EUR-12 · 48.8N 2.3E",
        "lat": 48.81,
        "lon": 2.31,
        "location_source": LocationSource.resolved,
    },
)

TITLES: dict[EventCategory, tuple[str, ...]] = {
    EventCategory.malware_c2: (
        "Beaconing pattern matches known C2 cadence",
        "TLS fingerprint reuse across simulated hosts",
    ),
    EventCategory.phishing: (
        "Lookalike domain reported by collective feed",
        "Credential-harvest kit fingerprint observed",
    ),
    EventCategory.scanning: (
        "Horizontal sweep across simulated netblock",
        "Slowloris-style probe from reserved range",
    ),
    EventCategory.brute_force: (
        "Password-spray burst against SSH tarpit",
        "Credential-stuffing wave on auth honeypot",
    ),
    EventCategory.data_exfil: (
        "Anomalous egress volume to unrated host",
        "Chunked upload over HTTPS to sinkhole",
    ),
    EventCategory.dns_tunneling: (
        "High-entropy DNS labels suggest tunneling test",
        "TXT record polling above baseline",
    ),
    EventCategory.botnet: (
        "IRC rendezvous chatter in sandbox trace",
        "DGA-like domain burst in DNS logs",
    ),
    EventCategory.vulnerability: (
        "Mass probe for CVE-2024-XXXX pattern",
        "Exploit-kit probe blocked at edge sensor",
    ),
}

DESCRIPTIONS: dict[EventCategory, str] = {
    EventCategory.malware_c2: (
        "Simulated beacon with fixed jitter. Treat as exercise data only — "
        "no attribution implied."
    ),
    EventCategory.phishing: (
        "Simulated lure submitted by research feed. URLs use example.* domains "
        "and are inert."
    ),
    EventCategory.scanning: (
        "Simulated sweep recorded by honeynet tarpits. Source is a "
        "documentation-range address."
    ),
    EventCategory.brute_force: (
        "Simulated authentication pressure against a decoy service. No "
        "production system involved."
    ),
    EventCategory.data_exfil: (
        "Simulated egress shape replayed from a lab capture. Volumes are synthetic."
    ),
    EventCategory.dns_tunneling: (
        "Simulated DNS shape generated for detector tuning. Labels are random "
        "test strings."
    ),
    EventCategory.botnet: (
        "Simulated rendezvous pattern stitched from lab traces. No infected "
        "hosts implied."
    ),
    EventCategory.vulnerability: (
        "Simulated probe matching a research signature. Payloads are inert canaries."
    ),
}

COLLECTION_METHODS: dict[SourceKind, str] = {
    SourceKind.honeypot: "tarpit + pcap",
    SourceKind.netflow: "sampled flow v9",
    SourceKind.osint: "community submission",
    SourceKind.sandbox: "detonation trace",
    SourceKind.community: "blocklist mirror",
}

CATEGORY_KEYS = tuple(EventCategory)
SOURCE_BY_ID = {source["id"]: source for source in SOURCE_DEFS}


def _reserved_ip(rng: random.Random) -> str:
    blocks = ("192.0.2", "198.51.100", "203.0.113")
    block = blocks[rng.randrange(len(blocks))]
    return f"{block}.{rng.randrange(2, 252)}"


def _example_domain(rng: random.Random, index: int) -> str:
    subs = ("invoice", "secure", "login", "update", "cdn", "auth", "billing", "portal")
    return f"{subs[rng.randrange(len(subs))]}-{index}.example.com"


def _geo(site: dict) -> GeoLocation:
    return GeoLocation(
        latitude=site["lat"],
        longitude=site["lon"],
        label=site["label"],
        country_code="XX",
        location_source=site["location_source"],
    )


def build_simulated_records(
    anchor: datetime,
    count: int = DEFAULT_COUNT,
    seed: int = DEFAULT_SEED,
    now: datetime | None = None,
) -> list[SimulatedRecord]:
    """Pure deterministic generator for simulated event records."""
    if anchor.tzinfo is None or anchor.utcoffset() is None:
        raise ValueError("anchor must be UTC-aware")
    anchor = anchor.astimezone(timezone.utc)
    generated_now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if count < 1 or count > MAX_COUNT:
        raise ValueError(f"count must be between 1 and {MAX_COUNT}")
    if anchor > generated_now:
        raise ValueError("anchor must not be in the future")

    rng = random.Random(seed)
    output: list[SimulatedRecord] = []

    for index in range(count):
        category = CATEGORY_KEYS[rng.randrange(len(CATEGORY_KEYS))]
        source_def = SOURCE_DEFS[rng.randrange(len(SOURCE_DEFS))]
        skew = rng.random() ** 1.6
        age_hours = skew * 168
        event_timestamp = anchor - timedelta(hours=age_hours)

        severity_roll = rng.random()
        if severity_roll > 0.93:
            severity = Severity.critical
        elif severity_roll > 0.74:
            severity = Severity.high
        elif severity_roll > 0.5:
            severity = Severity.medium
        elif severity_roll > 0.28:
            severity = Severity.low
        else:
            severity = Severity.info

        is_ip = rng.random() > 0.38
        indicator = _reserved_ip(rng) if is_ip else _example_domain(rng, index)
        indicator_type = IndicatorType.ipv4 if is_ip else IndicatorType.domain

        src_site = SITES[rng.randrange(len(SITES))]
        geo_roll = rng.random()
        src_geo: GeoLocation | None = None
        dst_geo: GeoLocation | None = None
        if geo_roll > 0.45:
            dst_site = SITES[rng.randrange(len(SITES))]
            if dst_site is src_site:
                dst_site = SITES[(SITES.index(src_site) + 4) % len(SITES)]
            src_geo = _geo(src_site)
            dst_geo = _geo(dst_site)
        elif geo_roll > 0.18:
            dst_geo = _geo(src_site)

        titles = TITLES[category]
        title = titles[rng.randrange(len(titles))]
        confidence = round(52 + rng.random() * 46) if rng.random() > 0.14 else None

        port_roll = rng.random()
        if category in {EventCategory.scanning, EventCategory.brute_force}:
            port = (22, 23, 80, 443, 3389)[rng.randrange(5)]
        else:
            port = 443 if port_roll > 0.6 else None
        if port == 443:
            protocol = "tcp/443"
        elif port is not None:
            protocol = f"tcp/{port}"
        elif category is EventCategory.dns_tunneling:
            protocol = "udp/53"
        else:
            protocol = None

        ingestion_lag = timedelta(minutes=2 + rng.randrange(9))
        ingested_at = min(event_timestamp + ingestion_lag, generated_now)

        event_id = f"SIM-EVT-{1042 + index:04d}"
        source_id = source_def["id"]
        source_slug = source_id.upper().replace("-", "")[:4]
        first_seen = event_timestamp - timedelta(hours=rng.randrange(5))

        primary_site = src_geo if src_geo is not None else dst_geo

        record = EventIngest(
            event_id=event_id,
            title=title,
            description=DESCRIPTIONS[category],
            indicator=indicator,
            indicator_type=indicator_type,
            category=category,
            severity=severity,
            source_id=source_id,
            source_reference=f"SIM-{source_slug}-{event_id}",
            source_url=None,
            event_timestamp=event_timestamp,
            first_seen=first_seen,
            last_seen=event_timestamp,
            confidence=confidence,
            location=primary_site,
            src_location=src_geo,
            dst_location=dst_geo,
            asn=f"AS6451{rng.randrange(9)}" if is_ip else None,
            port=port,
            protocol=protocol,
            tags=[category.value, severity.value, source_def["kind"].value],
            data_origin=DataOrigin.simulation,
            verification_status=VerificationStatus.unverified,
            reporter=source_def["name"],
            collection_method=COLLECTION_METHODS[source_def["kind"]],
            source_metadata={
                "generator": "orbital-seed",
                "simulation": True,
                "seed": seed,
                "index": index,
                "coordinate_model": "fictional-sectors",
                "anchor": anchor.isoformat(),
            },
        )
        output.append(SimulatedRecord(record=record, ingested_at=ingested_at))

    return output


def upsert_sources(db: Session) -> None:
    for definition in SOURCE_DEFS:
        source = db.get(Source, definition["id"])
        if source is None:
            source = Source(id=definition["id"])
            db.add(source)
        source.name = definition["name"]
        source.kind = definition["kind"]
        source.reliability = definition["reliability"]
        source.trust_score = definition["trust_score"]
        source.url = definition["url"]
    db.flush()


def upsert_events(db: Session, records: list[SimulatedRecord]) -> tuple[int, int]:
    created = 0
    updated = 0
    for item in records:
        record = item.record
        fingerprint = compute_fingerprint(
            record.source_id,
            record.indicator_type,
            record.indicator,
            record.event_timestamp,
        )
        event_id = record.event_id
        assert event_id is not None  # seed always supplies stable IDs
        event = build_event(
            record,
            event_id=event_id,
            fingerprint=fingerprint,
            ingested_at=item.ingested_at,
        )
        existing = db.get(ThreatEvent, event_id)
        if existing is None:
            db.add(event)
            created += 1
        else:
            # Update in place so reruns do not duplicate rows.
            for column in ThreatEvent.__table__.columns:
                if column.key == "event_id":
                    continue
                setattr(existing, column.key, getattr(event, column.key))
            updated += 1
        db.flush()
    return created, updated


def _parse_anchor(value: str | None) -> datetime:
    if value is None:
        # Recent, but far enough in the past that simulated ingestion lags do
        # not create ingestion timestamps in the future.
        return datetime.now(timezone.utc) - timedelta(minutes=15)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "anchor must be ISO 8601, for example 2026-10-19T12:00:00Z"
        ) from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise argparse.ArgumentTypeError("anchor must include a UTC offset")
    return parsed.astimezone(timezone.utc)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Load deterministic simulation events into the ORBITAL database."
    )
    parser.add_argument("--count", type=int, default=DEFAULT_COUNT)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument(
        "--anchor",
        type=_parse_anchor,
        default=None,
        help="ISO 8601 UTC anchor for the newest event (default: now - 15 minutes).",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete ALL simulation-origin events before inserting.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate and validate records without touching the database.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow seeding when ENVIRONMENT=production (simulation data only).",
    )
    args = parser.parse_args(argv)

    if args.count < 1 or args.count > MAX_COUNT:
        parser.error(f"--count must be between 1 and {MAX_COUNT}")

    settings = get_settings()
    if settings.environment == "production" and not args.force:
        print(
            "Refusing to seed simulation data with ENVIRONMENT=production. "
            "Pass --force only for an intentional simulation deployment.",
            file=sys.stderr,
        )
        return 2

    anchor = args.anchor or _parse_anchor(None)
    try:
        records = build_simulated_records(
            anchor=anchor, count=args.count, seed=args.seed
        )
    except ValueError as exc:
        print(f"Seed generation failed: {exc}", file=sys.stderr)
        return 2

    if args.dry_run:
        print(
            f"Dry run: {len(records)} simulation records validated; "
            f"anchor={anchor.isoformat()}; no database changes."
        )
        return 0

    try:
        with SessionLocal() as db:
            upsert_sources(db)
            if args.reset:
                deleted = db.execute(
                    delete(ThreatEvent).where(
                        ThreatEvent.data_origin == DataOrigin.simulation
                    )
                ).rowcount
                db.flush()
                print(f"Deleted {deleted or 0} existing simulation event(s).")
            created, updated = upsert_events(db, records)
            db.commit()
            generated_ids = [item.record.event_id for item in records]
            stale = db.scalar(
                select(func.count(ThreatEvent.event_id)).where(
                    ThreatEvent.data_origin == DataOrigin.simulation,
                    ThreatEvent.event_id.not_in(generated_ids),
                )
            )
    except SQLAlchemyError as exc:
        print(
            "Database error while seeding. Check DATABASE_URL and run "
            "`alembic upgrade head` first.",
            file=sys.stderr,
        )
        print(f"  {exc.__class__.__name__}", file=sys.stderr)
        return 1

    print(
        f"Simulation seed complete: {created} created, {updated} updated, "
        f"{len(records)} total generated at anchor {anchor.isoformat()}."
    )
    if stale:
        print(
            f"Note: {stale} other simulation event(s) remain from a different "
            "seed/count. Use --reset to replace all simulation data."
        )
    print("All generated records carry data_origin=simulation and are unverified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

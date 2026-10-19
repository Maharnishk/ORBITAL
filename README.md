# ORBITAL — Map the signals. Understand the threat.

Threat-intelligence visualization platform: a Next.js/React Three Fiber dashboard
backed by a FastAPI service that serves normalized, provenance-preserving threat
events from PostgreSQL.

**Phase 04** adds the backend, normalized event model, deterministic simulation
seed, Docker Compose stack, and a typed frontend API client. The existing
dashboard, globe, event stream, inspector, filters, and timeline are preserved.

## Architecture

```
Browser
  Next.js 14 dashboard (app/, components/)
      │  lib/api.ts          typed fetch client, 12 s timeout, no synthetic fallback
      │  lib/useOrbitalData  loading / ready / error state for the whole page
      ▼
  FastAPI (backend/app/main.py)
      │  /health, /api/v1/events, /api/v1/stats, /api/v1/sources
      │  CORS allowlist, request IDs, structured error envelope
      ▼
  SQLAlchemy 2.x (sync, psycopg3) ── Alembic migrations
      ▼
  PostgreSQL 16 in Docker Compose (named volume)
      ▲
      └── python -m app.seed   explicit, deterministic simulation data
```

Data rules enforced by the model and services:

- Events are normalized at ingestion: stable `event_id`, indicator + type,
  category/severity, source + reference, event/ingestion timestamps, optional
  first/last seen, confidence, optional coordinates **with location provenance**,
  data origin, optional src/dst coordinates, and source metadata JSON. All
  timestamps are stored and served as UTC.
- Unknown filter values and malformed payloads are rejected. The API never
  derives indicators, coordinates, or routes: arcs render only when both source
  and destination coordinates were explicitly reported.
- Simulation records use RFC 5737 documentation IPs (`192.0.2.0/24`,
  `198.51.100.0/24`, `203.0.113.0/24`), `example.*` domains, and fictional
  sectors (country code `XX`). They carry `data_origin=simulation` and can never
  be marked `verified`.
- The browser never receives database credentials. Only
  `NEXT_PUBLIC_API_BASE_URL` is exposed.

## Repository layout

```
app/ components/ lib/          Next.js dashboard and typed API client
lib/api.ts                     typed API client + snake_case → camelCase mapping
lib/useOrbitalData.ts          page data hook (loading/ready/error, no fallback)
lib/api.test.ts                client mapping, errors, pagination, timeout tests
docker-compose.yml             PostgreSQL + API (+ optional frontend profile)
.env.example                   documented environment template

backend/
  app/main.py                  FastAPI app factory, CORS, request IDs
  app/api/routes/              health, events, stats, sources
  app/core/                    config, errors, logging, normalization
  app/db/                      engine/session, UTC type, declarative base
  app/models/                  Source, ThreatEvent, enums, constraints, indexes
  app/schemas/                 Pydantic v2 request/response/ingestion schemas
  app/services/                query/filter/stat/source/ingestion logic
  app/seed.py                  deterministic simulation seed CLI
  app/tests/                   63 backend tests
  alembic/versions/20261019_0001_initial.py
  Dockerfile, requirements.txt, pytest.ini
```

## Quick start — Docker Compose

Requires Docker Desktop / Docker Engine with Compose v2.

```powershell
copy .env.example .env
docker compose up -d --build db api
curl.exe http://localhost:8000/health
```

Expected health body:

```json
{"status":"ok","service":"ORBITAL API","version":"0.1.0","database":"ok"}
```

The Compose `api` service waits for a healthy PostgreSQL, then explicitly runs
`alembic upgrade head`, loads 72 deterministic simulation events (development
only), and starts uvicorn. Set `SEED_SIMULATION=0` in `.env` to start with an
empty database. The API image itself never migrates or seeds.

Start the dashboard on the host:

```powershell
npm install
npm run dev
# http://localhost:3000
```

Optional: run the dashboard in the Compose `frontend` profile instead (dev
server with hot reload, polling enabled for Windows bind mounts):

```powershell
docker compose --profile frontend up -d
```

Useful Compose commands:

```powershell
docker compose logs -f api
docker compose run --rm api alembic upgrade head
docker compose run --rm api alembic downgrade -1
docker compose run --rm api python -m app.seed --count 72 --reset
docker compose down          # keeps the orbital_pgdata volume
docker compose down -v       # deletes database data
```

`docker compose run` replaces the service startup command, so manual
migrations/seeds do not trigger the automatic migrate-and-seed path.

## Quick start — host processes (no Docker)

Requires Python 3.12+ and a reachable PostgreSQL 16 instance.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt

# The backend reads ../.env when run from backend/.
copy ..\.env.example ..\.env         # adjust DATABASE_URL if your Postgres differs

alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

Then, from the repository root:

```powershell
npm install
npm run dev
```

The frontend reads `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`).
No build-time fetch is required; the page fetches after mount and shows explicit
loading, empty, timeout, network, and server-error states.

## API

Base URL: `http://localhost:8000` (interactive docs at `/docs`).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness + `SELECT 1` database probe. Returns `503` with `status=degraded` when the database is unreachable. |
| GET | `/api/v1/events` | Filterable, paginated, deterministically sorted event list. |
| GET | `/api/v1/events/{event_id}` | One event; `404` with `event_not_found` when absent. |
| GET | `/api/v1/stats` | Aggregates for the full dataset or the supplied filters. |
| GET | `/api/v1/sources` | Registered sources with lifetime event counts. |

### Event list parameters

| Parameter | Default | Notes |
| --- | --- | --- |
| `severity` | none | Repeatable. `info`, `low`, `medium`, `high`, `critical`. |
| `event_type` | none | Repeatable. `malware-c2`, `phishing`, `scanning`, `brute-force`, `data-exfil`, `dns-tunneling`, `botnet`, `vulnerability`. |
| `source` | none | Repeatable source ID (1–64 chars: letters, digits, `.`, `:`, `_`, `-`). |
| `data_origin` | none | Repeatable. `simulation`, `public-intel`, `observed`. |
| `q` | none | Case-insensitive search over indicator, event ID, title, category, source name, and source reference (1–200 chars). |
| `start_time` | none | Inclusive lower bound on `event_timestamp`; must include a UTC offset (`Z` accepted). |
| `end_time` | none | Inclusive upper bound; must include a UTC offset. |
| `page` | `1` | 1-based page number. |
| `page_size` | `50` | 1–100. Values above 100 are rejected with `422`. |
| `sort` | `newest` | `newest`, `oldest`, or `severity` (critical first, then newest within a severity). |

Response shape (`EventPage`):

```json
{
  "items": [{"event_id": "...", "indicator": "...", "event_timestamp": "2026-10-19T03:28:10.914577Z"}],
  "page": 1,
  "page_size": 50,
  "total": 72,
  "pages": 2,
  "has_next": true,
  "sort": "newest"
}
```

`/api/v1/stats` accepts the same filters (no pagination/sort) and always states
its scope: `"scope": "all_events"` when no filters were supplied, or
`"scope": "filtered"` with the applied filter values in `filters`. Counts such
as `by_severity`, `by_category`, `by_source`, `high_critical`,
`paired_locations`, `single_point_locations`, and `no_location` describe exactly
that scope. Paired/single/absent location counts use only explicit src/dst
coordinates.

`/api/v1/sources` returns `{"items": [...], "total": n}`; each source includes
`kind`, `reliability`, `trust_score`, `url`, and lifetime `event_count`.

### Errors

Every error uses the same envelope and never includes a stack trace or secret:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": [{"loc": ["query", "page_size"], "message": "Input should be less than or equal to 100", "type": "less_than_equal"}]
  }
}
```

Stable codes include `validation_error`, `invalid_time_range`,
`invalid_source_filter`, `event_not_found`, `not_found`, `method_not_allowed`,
`service_unavailable`, and `internal_error`. Responses also carry
`X-Request-ID`; the 500 handler logs the exception server-side and returns only
a generic message.

## Simulation seed

```powershell
cd backend
python -m app.seed                                  # 72 events, default seed 20261014
python -m app.seed --count 120 --seed 20261014
python -m app.seed --anchor 2026-10-19T12:00:00Z
python -m app.seed --reset                          # replace all simulation rows
python -m app.seed --dry-run                        # validate without touching the DB
```

- Deterministic generator (Python `random.Random(seed)`), stable event IDs
  `SIM-EVT-1042...`, default anchor `now - 15 minutes`, max 500 events.
- Reruns upsert by `event_id`, so the same seed/anchor is idempotent. A stale row
  from a different count remains until `--reset`; the command prints a note.
- Refuses to run with `ENVIRONMENT=production` unless `--force` is passed.
- Never runs at application startup. Compose loads it only because the Compose
  file is explicitly a development stack.
- Only writes `data_origin=simulation` records with `verification_status=unverified`.

## Migrations

```powershell
cd backend
alembic upgrade head
alembic current
alembic downgrade -1
```

The current revision is `20261019_0001` (initial normalized schema). Alembic
resolves the URL from `DATABASE_URL`, then `alembic.ini`, then application
settings. No credentials are committed to `alembic.ini`.

## Configuration

Copy `.env.example` to `.env`. Compose interpolates it automatically; the host
backend reads it through pydantic-settings.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `development`, `test`, or `production`. The seed refuses production without `--force`. |
| `LOG_LEVEL` | `INFO` | `CRITICAL`…`DEBUG`. |
| `DATABASE_URL` | dev Postgres URL | SQLAlchemy URL for API, Alembic, and seed. Compose overrides host with `db` as the hostname. |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Exact browser origins, comma-separated. `*` is rejected. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `orbital` / dev-only | Compose database credentials. |
| `SEED_SIMULATION` | `1` (Compose only) | Compose startup toggle for the simulation seed. |
| `SEED_COUNT` | `72` (Compose only) | Compose seed size (1–500). |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Browser-visible API base URL. Never put secrets in `NEXT_PUBLIC_*`. |

Local credentials in this repository are development-only. Do not reuse them
outside a developer workstation.

## Tests and checks

```powershell
# Backend (63 tests)
cd backend
.\.venv\Scripts\python.exe -m pytest

# Frontend (32 tests: 12 API client + 20 utilities)
npm test
npm run typecheck
npm run lint
npm run build
```

Backend coverage includes schema/constraint validation, UTC normalization,
ingestion normalization and deduplication (stable ID, SHA-256 fingerprint, source
reference), filtering/pagination/sorting, stats scope, sources, health, CORS,
error envelopes, migration upgrade, and seed determinism/idempotence/production
guard.

Frontend coverage includes snake_case → camelCase mapping, query serialization,
timeout/abort/network/HTTP error mapping, pagination, the 1000-record safety cap,
and truncation reporting. The dashboard shows a `PARTIAL LOAD` banner if the
backend holds more records than the cap, and an explicit error screen (never
synthetic fallback) if a request fails.

## Verification status

Verified on this machine:

- Backend: `63 passed` (SQLite in-memory test database; migration `upgrade head`
  verified against SQLite).
- Frontend: `32 passed`, `npm run typecheck`, `npm run lint`, and
  `npm run build`.
- End-to-end smoke test with uvicorn + SQLite: migration, seed twice
  (`0 created / 48 updated` proves idempotence), health, pagination, severity
  filter, newest/oldest sort, search, detail, stats `all_events`/`filtered`,
  sources, `404`/`422` envelopes, CORS allow/deny, and `Z`-suffixed UTC
  timestamps in raw JSON.

**Not verified locally:** Docker and PostgreSQL are not installed on this
machine, so `docker build`, `docker compose up`, and the migration against a real
PostgreSQL 16 server were not executed. The Compose file was parsed and
structurally validated with PyYAML, and the backend uses portable
`VARCHAR + CHECK` enums plus a UTC `TypeDecorator` so the same code paths run on
both SQLite and PostgreSQL. Re-run `alembic upgrade head`, the seed, and the
pytest suite against PostgreSQL/CI before relying on the Compose stack.

## Not in scope (Phase 04)

- Live feed adapters or automatic ingestion from external sources.
- Authentication/authorization, write/ingest HTTP endpoints, rate limiting.
- Derived indicators, inferred coordinates, or routes computed from addresses.

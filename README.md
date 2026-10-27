# ORBITAL — Map the signals. Understand the threat.

ORBITAL is a threat-intelligence visualization dashboard. A Next.js / React Three
Fiber frontend renders normalized, provenance-preserving events on an interactive
globe, with a filterable event stream, inspector, timeline, and data-derived
metrics. A FastAPI + SQLAlchemy service serves the data from PostgreSQL.

The current revision is the **Phase 06 engineering and QA pass**: the interface
keeps its graphite-black / phosphor-green identity while removing generic
dashboard decoration, tightening data-integrity and security behavior, and
verifying the loading, empty, error, reduced-motion, mobile, and no-WebGL states.

> **What this is not:** ORBITAL does not claim that a feed entry proves an
> attack. It has no live public-feed adapters, no HTTP ingest endpoint, no
> authentication, and no automatic IP geolocation. The only bundled data is an
> explicit deterministic **simulation** seed. Public-intel and observed records
> are supported by the schema, but none are shipped in this repository.

## Architecture and data flow

```
Browser
  Next.js 15 dashboard (app/, components/)
      │  lib/api.ts             typed fetch client, 12 s timeout, no fallback
      │  lib/useOrbitalData.ts  loading / ready / error state for the page
      ▼
  FastAPI (backend/app/main.py)
      │  /health, /api/v1/events, /api/v1/stats, /api/v1/sources
      │  explicit CORS origins, request IDs, structured errors
      ▼
  SQLAlchemy 2.x (sync, psycopg3) ── Alembic migrations
      ▼
  PostgreSQL 16 (Docker Compose) or SQLite for local verification
      ▲
      └── python -m app.seed    explicit, deterministic simulation data
```

* The browser fetches pages of events and the source registry after mount.
  It never receives database credentials; only `NEXT_PUBLIC_API_BASE_URL` is
  public.
* Filters, sorting, search, pagination, metrics, timeline buckets, and globe
  plotting are applied to the fetched result set in the browser. The client
  fetches at most **1,000 records** (100 per request). If the API holds more, a
  `PARTIAL LOAD` banner states exactly what is shown; no sample or synthetic
  replacement is displayed.
* No generated trend, inferred route, confidence value, or coordinate is added
  when the source did not provide one. Arcs require valid explicit source and
  destination coordinates.
* All stored and displayed timestamps are UTC. Relative durations use the
  browser clock; time-window labels are anchored to the page's load time.

## Data-integrity rules

* Events are normalized with a stable `event_id`, indicator + indicator type,
  category, severity, source + source reference, event/ingestion timestamps,
  optional first/last-seen values, optional confidence, and optional primary,
  source, and destination locations. Geographic location source is stored
  separately (`reported`, `resolved`, `inferred`, `unknown`).
* Simulation records use RFC 5737 documentation IPs (`192.0.2.0/24`,
  `198.51.100.0/24`, `203.0.113.0/24`), `example.*` domains, and fictional
  sector names/country code `XX`. They carry `data_origin=simulation` and a
  database check constraint prevents marking them `verified`.
* Sources have a source-reported `trust_score` and `reliability`. The UI labels
  these as source-reported; they are not ORBITAL assessments.
* Ingestion is idempotent by stable event ID, SHA-256 fingerprint, and
  `(source_id, source_reference)`. A duplicate returns the original record
  instead of overwriting it. Migration `20261027_0002` adds the partial unique
  index enforcing one reference per source.
* `source_metadata` is retained for ingestion/internal use and is **not** part
  of the public event response.

## Interface and design

* **Globe first:** an R3F globe with a graticule, severity-colored markers,
  selection ring, camera reset, marker tooltip, and optional arcs. Controls
  state that arcs use reported endpoints only and do not imply attack traffic.
* **Readability over decoration:** panel borders, a restrained palette, no
  generic glow/gradient card treatment. Phosphor `#B7F397`, amber `#E6B566`,
  and coral `#E77C72` are reserved for state and emphasis. Graphite background
  is `#0A0C0B`.
* **Synchronized selection:** selecting in the stream, globe, timeline, or
  inspector pagination keeps the other views on the same event. The stream
  moves to the selected event's page and scrolls it into view.
* **Real controls only:** every visible control changes state. The “All” time
  range uses the real timestamp extent of the loaded events; a custom range is
  validated (start after end is called out). Search mirrors the API's searchable
  fields. A dedicated X clears only the search text; the reset button restores
  defaults.
* **Honest states:** loading (skeleton + explicit “no synthetic fallback”),
  API/network error (code, HTTP status, request ID, retry), empty dataset,
  empty filter result, invalid/missing geography, no-WebGL fallback, partial
  load, and latest-signal age are all distinct.
* **Responsive order:** at `<1024px`, the page stacks globe + timeline, then
  filters, then the event stream, then the inspector. Metrics switch from six
  columns to three and then two. Verified at 1280px, 768px, 390px, and 320px
  with no horizontal page overflow.
* **Reduced motion:** `prefers-reduced-motion` disables globe auto-rotation and
  arc animation, pauses the rotate control, and uses instant scrolling. The
  system CSS also suppresses animation and transition durations.
* **Keyboard and screen readers:** native buttons, visible focus rings,
  labeled groups, `aria-pressed` toggles, labeled inputs, live regions for
  result counts, copy confirmation, and a keyboard path to every event through
  the event stream. The globe is marked as an image with a text alternative;
  WebGL interaction is optional, not the only route.

## Stack

| Layer | Version |
| --- | --- |
| Node.js | `>=22.12.0` (development/Docker image `node:22-alpine`) |
| Next.js | `15.5.28` (App Router, production build verified) |
| React / React DOM | `19.3.1` |
| React Three Fiber / drei / three | `9.8.2` / `10.7.9` / `0.169.0` |
| TypeScript / Tailwind CSS / Vitest | `5.6.3` / `3.4.14` / `5.0.5` |
| Python (API image) | `3.12-slim` |
| FastAPI / SQLAlchemy / Alembic | `0.115.6` / `2.0.36` / `1.14.0` |
| Pydantic / psycopg | `2.10.3` / `3.2.3` |
| PostgreSQL | `16-alpine` |

## Repository layout

```
app/ components/ lib/             Next.js dashboard and shared client logic
lib/api.ts                        typed API client + snake_case → camelCase mapping
lib/api.test.ts                   client mapping, pagination, errors, timeout tests
lib/useOrbitalData.ts             page data hook (loading/ready/error, no fallback)
lib/utils.ts / utils.test.ts      filters, metrics, timeline, geo, URL safety
backend/app/main.py               FastAPI app factory, request IDs, security headers
backend/app/api/                  health, events, stats, sources routes; filter caps
backend/app/core/                 config, errors, logging, normalization
backend/app/db/                   engine/session, UTC type, declarative base
backend/app/models/               Source, ThreatEvent, enums, constraints, indexes
backend/app/schemas/              Pydantic v2 public and ingestion schemas
backend/app/services/             query/filter/stats/source/ingestion logic
backend/app/seed.py               deterministic simulation seed CLI
backend/app/tests/                68 backend tests
backend/alembic/versions/         20261019_0001 initial, 20261027_0002 unique reference
docker-compose.yml                PostgreSQL + API (+ optional frontend profile)
.env.example                      documented environment template
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

The Compose `api` service waits for a healthy PostgreSQL, runs
`alembic upgrade head`, loads 72 deterministic simulation events (development
only), then starts uvicorn. Set `SEED_SIMULATION=0` in `.env` to start empty.
The API image itself never migrates or seeds.

Start the dashboard on the host:

```powershell
npm ci
npm run dev
# http://localhost:3000
```

Optional frontend container (development server with polling for Windows bind
mounts):

```powershell
docker compose --profile frontend up -d
```

Useful commands:

```powershell
docker compose logs -f api
docker compose run --rm api alembic upgrade head
docker compose run --rm api alembic downgrade -1
docker compose run --rm api python -m app.seed --count 72 --reset
docker compose down          # keeps the orbital_pgdata volume
docker compose down -v       # deletes database data
```

`docker compose run` replaces the service command, so manual migrations/seeds
do not trigger the automatic migrate-and-seed path.

## Quick start — host processes

### PostgreSQL (project default)

Requires Python 3.12+ and a reachable PostgreSQL 16 instance.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt

copy ..\.env.example ..\.env         # adjust DATABASE_URL if needed
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --port 8000 --no-access-log
```

### SQLite (local demo / verification only)

The migrations and test suite also run on SQLite. This is convenient for a
single-machine demo; PostgreSQL remains the production target.

```powershell
cd backend
$env:DATABASE_URL = "sqlite+pysqlite:///./orbital_dev.db"
alembic upgrade head
python -m app.seed
uvicorn app.main:app --port 8000 --no-access-log
```

From the repository root:

```powershell
npm ci
npm run dev
```

The frontend reads `NEXT_PUBLIC_API_BASE_URL` (default
`http://localhost:8000`). It is baked into the production build, so rebuild
after changing it. The page shows explicit loading, empty, timeout, network,
and server-error states; it never substitutes synthetic data.

## API

Base URL: `http://localhost:8000`. Interactive docs: `/docs`; OpenAPI:
`/openapi.json`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness + `SELECT 1`. Returns `503` with `status=degraded`, `database=unavailable` when the DB is down. |
| GET | `/api/v1/events` | Filterable, paginated, deterministically sorted event list. |
| GET | `/api/v1/events/{event_id}` | One event; `404 event_not_found` when absent. |
| GET | `/api/v1/stats` | Data-derived aggregates for the full dataset or the supplied filters. |
| GET | `/api/v1/sources` | Registered sources with lifetime event counts (not filtered). |

### Event list parameters

| Parameter | Default | Notes |
| --- | --- | --- |
| `severity` | none | Repeatable (`info`, `low`, `medium`, `high`, `critical`). Max 50 supplied values (duplicates removed). |
| `event_type` | none | Repeatable (`malware-c2`, `phishing`, `scanning`, `brute-force`, `data-exfil`, `dns-tunneling`, `botnet`, `vulnerability`). Max 50. |
| `source` | none | Repeatable source ID (1–64 chars: letters, digits, `.`, `:`, `_`, `-`). Max 50. |
| `data_origin` | none | Repeatable (`simulation`, `public-intel`, `observed`). Max 50. |
| `q` | none | Case-insensitive search over indicator, event ID, title, description, category, source name/id, and source reference (1–200 chars). `%` and `_` are escaped. |
| `start_time` | none | Inclusive lower bound on `event_timestamp`; must include a UTC offset (`Z` accepted). |
| `end_time` | none | Inclusive upper bound; must include a UTC offset. |
| `page` | `1` | 1-based; capped at `100000`. |
| `page_size` | `50` | `1`–`100`. |
| `sort` | `newest` | `newest`, `oldest`, or `severity` (critical first, then newest, then event ID for stable ordering). |

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

`/api/v1/stats` accepts the same filters (without pagination/sort). It always
states its scope: `"scope": "all_events"` when no filters were supplied, or
`"scope": "filtered"` with the applied filter values. `by_severity`,
`by_category`, `by_source`, `high_critical`, `paired_locations`,
`single_point_locations`, `no_location`, and the event timestamps describe
exactly that scope. Paired/single/absent counts use only explicit source and
destination coordinates; the primary `location` is not treated as an endpoint.

### Error handling

Every error uses the same envelope and never includes a stack trace, raw input
value, DSN, or secret:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": [{"loc": ["query", "page_size"], "message": "Input should be less than or equal to 100", "type": "less_than_equal"}]
  }
}
```

Stable codes include `validation_error`, `too_many_filter_values`,
`invalid_source_filter`, `invalid_time_range`, `event_not_found`, `not_found`,
`method_not_allowed`, `database_unavailable`, `service_unavailable`, and
`internal_error`. Database driver errors are mapped to `503
database_unavailable` with a class-only server log. The `500` handler logs the
exception server-side and exposes only a generic message. Responses carry a
sanitized `X-Request-ID` (client values are echoed only when they match
`[A-Za-z0-9._:-]{1,64}`). `/api/*` and `/health` responses send
`Cache-Control: no-store`; all API responses send `nosniff`, `DENY` framing,
and `no-referrer`.

## Simulation seed

```powershell
cd backend
python -m app.seed                                  # 72 events, deterministic defaults
python -m app.seed --count 120 --seed 20261014
python -m app.seed --anchor 2026-10-19T12:00:00Z
python -m app.seed --reset                          # replace all simulation rows
python -m app.seed --dry-run                        # validate without touching the DB
```

* Deterministic generator (`random.Random(seed)`), stable IDs `SIM-EVT-…`,
  default anchor `now - 15 minutes`, count 1–500.
* Reruns upsert by `event_id`, so the same seed/anchor is idempotent. A stale
  row from a different count remains until `--reset`; the command reports this.
* Refuses `ENVIRONMENT=production` without `--force`.
* Never runs at application startup.
* Writes only `data_origin=simulation`, `verification_status=unverified` rows.

## Migrations

```powershell
cd backend
alembic upgrade head
alembic current
alembic downgrade -1
```

Current head: `20261027_0002` (partial unique index on
`threat_events(source_id, source_reference)`), following the initial normalized
schema `20261019_0001`. The migration checks for existing duplicate references
and aborts with a clear message if any exist. Alembic resolves the URL from
`DATABASE_URL`, then `alembic.ini`, then application settings; no credentials
are committed to `alembic.ini`.

## Configuration

Copy `.env.example` to `.env`. Compose interpolates it; the host backend reads
it through pydantic-settings.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `development`, `test`, or `production`. The seed refuses production without `--force`. |
| `LOG_LEVEL` | `INFO` | `CRITICAL`…`DEBUG`. |
| `DATABASE_URL` | dev PostgreSQL URL | SQLAlchemy URL for API, Alembic, and seed. Compose overrides the host with `db`. |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Exact browser origins. Wildcards are rejected. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `orbital` / dev-only | Compose database credentials. |
| `SEED_SIMULATION` | `1` (Compose only) | Compose startup toggle for the seed. |
| `SEED_COUNT` | `72` (Compose only) | Compose seed size (1–500). |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Browser-visible API URL. Never put secrets in `NEXT_PUBLIC_*`. |

Repository credentials are development-only. Do not reuse them outside a
developer workstation.

## Security controls

* Explicit CORS allowlist with credentials disabled and only `GET`/`OPTIONS`;
  `*` is rejected at configuration load.
* Parameterized SQLAlchemy queries; `LIKE` terms escape `%`, `_`, and `\`.
* Pydantic `extra="forbid"` schemas, enum validation, timezone-required
  timestamps, bounded strings, coordinates, confidence, and port ranges;
  database check constraints mirror the important rules.
* Filter cardinality caps (50 values per facet), query length cap (200), page
  size cap (100), and page-number cap (100,000) to limit resource use.
* Sanitized request IDs, path-only structured logs (query strings and search
  terms are not logged; uvicorn access logs are disabled), no response stack
  traces, and class-only database error logs.
* Public responses exclude `source_metadata`; source URLs are rejected for
  rendering unless they are absolute `http(s)` URLs.
* Next.js sends `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, and `Cross-Origin-Opener-Policy`;
  the `X-Powered-By` header is disabled.
* API container runs as an unprivileged UID and does not migrate/seed itself.

## Tests and checks

```powershell
# Backend (68 tests, SQLite in-memory)
cd backend
.\.venv\Scripts\python.exe -m pytest

# Frontend (40 tests: 14 API client + 26 utilities)
npm test
npm run typecheck
npm run lint
npm run build
npm audit
```

Backend coverage includes schema/constraint validation, UTC normalization,
ingestion normalization and deduplication (stable ID, fingerprint, source
reference), filtering/pagination/sorting, filter cardinality, stats scope,
sources, health, CORS, request-ID sanitization, security headers, database
failure mapping, error envelopes, migration up/down including the partial
unique index, and seed determinism/idempotence/production guard.

Frontend coverage includes snake_case → camelCase mapping, query serialization,
timeout/abort/network/HTTP error mapping, malformed pagination, the 1,000-record
safety cap, truncation reporting, filter/search behavior, geo validity,
paired-location metrics, timeline windows and buckets, relative time, and
external URL safety.

## Verification status (2026-10-27)

Verified locally:

* Backend: **68 passed** against SQLite in-memory; Alembic upgrade/downgrade
  including `20261027_0002` verified against SQLite.
* Frontend: **40 passed**, `npm run typecheck`, `npm run lint`, and
  `npm run build` all pass. `npm audit` reports **0 vulnerabilities**.
* Production build served with `next start` + uvicorn: desktop (1280px),
  tablet (768px), mobile (390px), and small mobile (320px) layouts checked with
  no horizontal page overflow; no console exceptions in the captured runs.
* Interaction checks: empty search state, search clear, stream/globe/inspector
  selection synchronization, real “All” timeline extent, and event pagination.
* Emulated reduced-motion and blocked-WebGL states: auto-rotation/arc animation
  disable correctly; the no-WebGL fallback leaves the stream, inspector,
  filters, and timeline usable.
* API smoke tests: health, pagination, severity filter, newest/oldest sort,
  search, detail, stats `all_events`/`filtered`, sources, `404`/`422` envelopes,
  CORS allow/deny, and `Z`-suffixed UTC timestamps.

**Not verified locally:**

* Docker is not installed on this machine, so `docker build`, `docker compose
  up`, and migrations against a real PostgreSQL 16 server were not executed.
  The Compose file was parsed and structurally validated; re-run the migration,
  seed, and pytest suite against PostgreSQL/CI before relying on the Compose
  stack.
* Automated accessibility testing (axe/Pa11y) is not installed. Accessibility
  was checked by code review plus keyboard/focus and responsive inspection.
* Real-GPU rendering, WebGL context-loss recovery, frame rate, and memory
  cleanup were not profiled; headless captures use SwiftShader. GPU resources
  are disposed explicitly in component cleanups, but this is not a substitute
  for profiling on target hardware.
* Physical mobile/touch devices and real screen readers were not tested.

## Limitations and not in scope

* No live public-feed adapters, polling workers, or HTTP ingestion endpoint.
  `public-intel` and `observed` are supported data origins, not shipped feeds.
* No authentication/authorization, rate limiting, or multi-tenant access.
* No automatic IP-to-geolocation or inferred routes. A missing coordinate stays
  missing; the UI says so.
* No real-time push (WebSocket/SSE) and no server-side pagination in the
  dashboard; the client fetches up to 1,000 records and states when that is
  partial.
* No source liveness/staleness feed poller. Source-level trust and provenance
  are displayed as reported, not independently validated.
* No CI configuration is included; the commands above are the expected gate.

## Manual verification checklist

1. `docker compose up -d --build db api` (or the host commands above) and check
   `/health` returns `database: ok`.
2. `npm ci && npm run build && npm start`; open `http://localhost:3000`.
3. Confirm the banner says **SIMULATION MODE** and the inspector repeats the
   simulated-record warning.
4. Filter by severity/type/source, search for an indicator, and clear the
   search with the X. Result counts, metrics, timeline, globe, and stream must
   agree.
5. Select events from the stream, a globe marker, and a timeline bar; confirm
   the inspector and `SELECTED` overlay stay in sync. Use Prev/Next.
6. Switch to **All** and confirm the timeline spans the real data extent.
7. Page through the stream and sort by oldest/severity.
8. Toggle arcs/rotation, drag and zoom the globe, and use **Reset view**.
9. Resize to 768px, 390px, and 320px; confirm there is no horizontal page
   scroll and the mobile order is globe/timeline → filters → stream → inspector.
10. Enable OS reduced motion; reload and confirm “Rotate paused” and the
    reduced-motion note. Block WebGL (or use a browser without it) and confirm
    the fallback remains usable.
11. Stop the API and reload; confirm the error screen shows code/status/request
    ID and **Retry connection** only. Do not expect synthetic data.

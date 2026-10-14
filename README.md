# ORBITAL — Map the signals. Understand the threat.

Premium network threat-intelligence visualization platform. **Milestone 1: interactive frontend on deterministic synthetic data.**

## Simulation mode

All events are generated deterministically (`lib/data.ts`, seed `20261014`):

- Indicators use **reserved example addresses only**: `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` (RFC 5737), `example.*` domains.
- Coordinates are **fictional simulated sectors** (`XX`), never real victim locations.
- Arcs render **only when both `srcGeo` and `dstGeo` are explicitly present** — never inferred from IPs.
- Nothing here is a real attack. The UI says so in the nav pill, the banner, the globe header, and the inspector.

## Stack

Next.js 14 App Router · React 18 · TypeScript · Tailwind CSS · React Three Fiber 8 + Three.js · Lucide React.

## Run

```powershell
npm install
npm run dev
# open http://localhost:3000
```

## Checks

```powershell
npm run typecheck
npm run lint
npm run build
```

## Structure

```
app/layout.tsx, app/page.tsx, app/globals.css
lib/types.ts      — shared model (globe, stream, metrics, timeline)
lib/data.ts       — seeded synthetic events + sources
lib/utils.ts      — filtering, geo math, formatting
components/       — TopNav, MetricsStrip, FilterPanel, Globe, EventStream, EventInspector, Timeline
```

## Later backend (not in M1)

Python FastAPI + PostgreSQL + Docker Compose. The `ThreatEvent` type in `lib/types.ts` is the contract the API will eventually serve.

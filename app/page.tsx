'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import EventInspector from '@/components/EventInspector';
import EventStream from '@/components/EventStream';
import FilterPanel, { DEFAULT_FILTERS } from '@/components/FilterPanel';
import MetricsStrip from '@/components/MetricsStrip';
import Timeline from '@/components/Timeline';
import TopNav, { type ConnectionStatus } from '@/components/TopNav';
import { ORBITAL_API_BASE_URL } from '@/lib/api';
import type { FilterState, ThreatEvent, ThreatSource } from '@/lib/types';
import { useOrbitalData } from '@/lib/useOrbitalData';
import { applyFilters, timeWindowLabel } from '@/lib/utils';

const GlobePanel = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-border bg-panel h-[420px] lg:h-[560px] grid place-items-center text-[12px] font-mono text-secondary">
      Loading globe…
    </div>
  ),
});

type BannerTone = 'loading' | 'error' | 'simulation' | 'mixed' | 'live' | 'empty';

const BANNER_CLASSES: Record<BannerTone, string> = {
  loading: 'border-border bg-elevated/40 text-secondary',
  error: 'border-coral/40 bg-coral/[0.08] text-coral',
  simulation: 'border-amber/25 bg-amber/[0.05] text-amber/90',
  mixed: 'border-amber/40 bg-amber/[0.08] text-amber/95',
  live: 'border-phosphor/30 bg-phosphor/[0.05] text-phosphor/90',
  empty: 'border-border bg-elevated/40 text-secondary',
};

function DataBanner({
  tone,
  label,
  children,
}: {
  tone: BannerTone;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`border-b ${BANNER_CLASSES[tone]}`}>
      <p className="mx-auto max-w-[1440px] px-4 py-1.5 text-[11px] leading-relaxed">
        <span className="font-mono font-semibold tracking-[0.12em]">{label} </span>
        {children}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-void text-primary">
      <TopNav eventCount={0} sourceCount={0} origins={[]} status={'loading' as ConnectionStatus} />
      <DataBanner tone="loading" label="CONNECTING TO ORBITAL API —">
        Requesting events and sources from <span className="font-mono">{ORBITAL_API_BASE_URL}</span>.
        No synthetic fallback will be substituted if the request fails.
      </DataBanner>
      <main className="mx-auto max-w-[1440px] px-4 py-4 space-y-4">
        <div className="grid gap-4 lg:grid-cols-[272px_minmax(0,1fr)_320px] items-start">
          <div className="space-y-4 order-2 lg:order-1">
            <div className="h-[540px] rounded-lg border border-border bg-panel animate-pulse" />
          </div>
          <div className="space-y-4 order-1 lg:order-2 min-w-0">
            <div className="h-[420px] lg:h-[560px] rounded-lg border border-border bg-panel animate-pulse" />
            <div className="h-24 rounded-lg border border-border bg-panel animate-pulse" />
          </div>
          <div className="order-3">
            <div className="h-[520px] rounded-lg border border-border bg-panel animate-pulse" />
          </div>
        </div>
        <p className="flex items-center gap-2 text-[11px] font-mono text-secondary">
          <Loader2 size={13} className="animate-spin" /> Loading live dataset state…
        </p>
      </main>
    </div>
  );
}

function ErrorState({ message, code, status, requestId, onRetry }: {
  message: string;
  code: string;
  status: number | null;
  requestId: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="min-h-screen bg-void text-primary">
      <TopNav eventCount={0} sourceCount={0} origins={[]} status={'error' as ConnectionStatus} />
      <DataBanner tone="error" label="API UNAVAILABLE —">
        The dashboard could not load data from <span className="font-mono">{ORBITAL_API_BASE_URL}</span>.
        No synthetic data is substituted; every number shown would otherwise be unverifiable.
      </DataBanner>
      <main className="mx-auto max-w-[1440px] px-4 py-8">
        <section className="mx-auto max-w-xl rounded-lg border border-coral/30 bg-panel p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle size={17} className="text-coral" />
            <h1 className="text-[15px] font-semibold">Could not reach the ORBITAL API</h1>
          </div>
          <p className="mt-2 text-[12.5px] text-secondary leading-relaxed">{message}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-mono">
            <dt className="text-secondary">error code</dt>
            <dd>{code}</dd>
            <dt className="text-secondary">http status</dt>
            <dd>{status ?? 'no response'}</dd>
            <dt className="text-secondary">request id</dt>
            <dd className="break-all">{requestId ?? '—'}</dd>
          </dl>
          <button
            onClick={onRetry}
            className="focus-ring mt-5 inline-flex items-center gap-1.5 rounded border border-phosphor/50 bg-phosphor/10 px-3 py-1.5 text-[12px] font-mono text-phosphor"
          >
            <RefreshCw size={13} /> Retry connection
          </button>
          <p className="mt-4 text-[11.5px] text-secondary leading-relaxed">
            Start the backend (for example <span className="font-mono">uvicorn app.main:app --port 8000 --no-access-log</span> from{' '}
            <span className="font-mono">backend/</span>) and confirm <span className="font-mono">NEXT_PUBLIC_API_BASE_URL</span> plus CORS origins.
          </p>
        </section>
      </main>
    </div>
  );
}

function Dashboard({
  events,
  sources,
  total,
  truncated,
  loadedAt,
}: {
  events: ThreatEvent[];
  sources: ThreatSource[];
  total: number;
  truncated: boolean;
  loadedAt: number;
}) {
  const [filters, setFilters] = useState<FilterState>(() => DEFAULT_FILTERS(sources));
  const [selectedId, setSelectedId] = useState<string | null>(events[0]?.id ?? null);

  const anchor = useMemo(() => loadedAt, [loadedAt]);
  const filtered = useMemo(
    () => applyFilters(events, filters, anchor, sources),
    [events, filters, anchor, sources]
  );
  const timeLabel = useMemo(() => timeWindowLabel(filters, anchor), [filters, anchor]);

  const selected = useMemo(
    () => filtered.find((e) => e.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );
  const selIndex = selected ? filtered.findIndex((e) => e.id === selected.id) : -1;
  const selectedSource = useMemo(
    () => (selected ? sources.find((s) => s.id === selected.sourceId) ?? null : null),
    [selected, sources]
  );

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!filtered.some((e) => e.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const step = (dir: 1 | -1) => {
    if (!filtered.length) return;
    const next = selIndex < 0 ? 0 : (selIndex + dir + filtered.length) % filtered.length;
    setSelectedId(filtered[next].id);
  };

  const origins = useMemo(
    () => Array.from(new Set(events.map((e) => e.dataOrigin))),
    [events]
  );
  const tone: BannerTone =
    events.length === 0
      ? 'empty'
      : origins.length === 1 && origins[0] === 'simulation'
        ? 'simulation'
        : origins.includes('simulation')
          ? 'mixed'
          : 'live';
  const bannerLabel =
    tone === 'empty'
      ? 'API CONNECTED · NO EVENTS —'
      : tone === 'simulation'
        ? 'SIMULATION MODE —'
        : tone === 'mixed'
          ? 'MIXED DATA ORIGINS —'
          : 'REPORTED DATA —';
  const bannerText =
    tone === 'empty'
      ? 'the database is reachable but contains no event records. Simulation data is loaded only by the explicit seed command; nothing is generated automatically.'
      : tone === 'simulation'
        ? 'deterministic simulation records served by the API (reserved example IPs, example.* domains, fictional coordinates, data_origin=simulation). Reported indicators only — not confirmed attacks; no routes inferred from addresses alone.'
        : tone === 'mixed'
          ? 'this result set mixes simulation records with public intelligence or observed telemetry. Check each record’s data origin in the inspector before drawing conclusions.'
          : 'records come from public intelligence or observed telemetry. Indicators are reported, not confirmed attacks. Verify with the original source before acting.';

  return (
    <div className="min-h-screen bg-void text-primary">
      <TopNav
        eventCount={filtered.length}
        sourceCount={sources.length}
        origins={origins}
        status={'ready' as ConnectionStatus}
      />
      <DataBanner tone={tone} label={bannerLabel}>
        {bannerText}
      </DataBanner>
      {truncated && (
        <div className="border-b border-amber/30 bg-amber/[0.06]">
          <p className="mx-auto max-w-[1440px] px-4 py-1.5 text-[11px] leading-relaxed text-amber/90">
            <span className="font-mono font-semibold tracking-[0.12em]">PARTIAL LOAD — </span>
            showing the first {events.length} of {total} records from the API. Metrics, timeline, globe, and stream
            describe this loaded subset only. Refine the query at the API level or raise the documented client cap.
          </p>
        </div>
      )}
      <MetricsStrip events={filtered} timeLabel={timeLabel} />

      <main className="mx-auto max-w-[1440px] px-4 py-4 space-y-4">
        {events.length === 0 && (
          <section className="rounded-lg border border-border bg-panel px-4 py-3">
            <h2 className="text-[12px] font-semibold">No events to display</h2>
            <p className="mt-1 text-[12px] text-secondary">
              The API responded successfully with an empty dataset. Load simulation data explicitly with{' '}
              <span className="font-mono text-primary/90">python -m app.seed</span> from{' '}
              <span className="font-mono text-primary/90">backend/</span>, then retry.
            </p>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-[272px_minmax(0,1fr)_320px] items-start">
          <div className="space-y-4 order-2 lg:order-1 min-w-0">
            <FilterPanel
              filters={filters}
              onChange={setFilters}
              resultCount={filtered.length}
              anchor={anchor}
              sources={sources}
            />
            <div className="hidden lg:block">
              <EventStream events={filtered} sources={sources} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            </div>
          </div>

          <div className="space-y-4 order-1 lg:order-2 min-w-0">
            <GlobePanel events={filtered} sources={sources} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            <Timeline events={filtered} filters={filters} anchor={anchor} onPick={setSelectedId} />
          </div>

          <div className="order-3 lg:hidden min-w-0">
            <EventStream events={filtered} sources={sources} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          </div>

          <div className="order-4 lg:order-3 min-w-0">
            <EventInspector
              event={selected}
              source={selectedSource}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              position={selIndex >= 0 ? `${selIndex + 1} / ${filtered.length}` : '0 / 0'}
            />
          </div>
        </div>

        <footer className="flex flex-wrap gap-x-4 gap-y-1 justify-between text-[10.5px] font-mono text-secondary pt-1 pb-6">
          <span>
            ORBITAL · Next.js + R3F · API <span className="text-primary/80">{ORBITAL_API_BASE_URL}</span> ·{' '}
            {events.length} loaded / {total} total · anchored {new Date(anchor).toISOString()}
          </span>
          <span>
            Origins in view: {origins.length ? origins.join(', ') : 'none'} · no external feed adapters enabled ·
            simulation records are never verified.
          </span>
        </footer>
      </main>
    </div>
  );
}

export default function Home() {
  const { status, events, sources, error, total, truncated, loadedAt, retry } = useOrbitalData();

  if (status === 'loading') return <LoadingState />;
  if (status === 'error') {
    return (
      <ErrorState
        message={
          error?.message ??
          'The ORBITAL API could not be reached and no fallback data is shown.'
        }
        code={error?.code ?? 'client_error'}
        status={error?.status ?? null}
        requestId={error?.requestId ?? null}
        onRetry={retry}
      />
    );
  }

  return (
    <Dashboard
      events={events}
      sources={sources}
      total={total}
      truncated={truncated}
      loadedAt={loadedAt ?? Date.now()}
    />
  );
}

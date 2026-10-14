'use client';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import EventInspector from '@/components/EventInspector';
import EventStream from '@/components/EventStream';
import FilterPanel from '@/components/FilterPanel';
import MetricsStrip from '@/components/MetricsStrip';
import Timeline from '@/components/Timeline';
import TopNav from '@/components/TopNav';
import { DATA_ANCHOR, EVENTS, SOURCES } from '@/lib/data';
import type { FilterState } from '@/lib/types';
import { EVENT_TYPES, SEVERITIES, TIME_RANGES } from '@/lib/types';
import { applyFilters } from '@/lib/utils';

const GlobePanel = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-border bg-panel h-[420px] lg:h-[560px] grid place-items-center text-[12px] font-mono text-secondary">
      Loading globe…
    </div>
  ),
});

const initialFilters: FilterState = {
  severities: new Set(SEVERITIES),
  types: new Set(EVENT_TYPES.map((t) => t.key)),
  sources: new Set(SOURCES.map((s) => s.id)),
  timeRange: '7d',
  query: '',
};

export default function Home() {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [selectedId, setSelectedId] = useState<string | null>(EVENTS[0]?.id ?? null);

  const filtered = useMemo(() => applyFilters(EVENTS, filters, DATA_ANCHOR), [filters]);

  const selected = useMemo(
    () => filtered.find((e) => e.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );
  const selIndex = selected ? filtered.findIndex((e) => e.id === selected.id) : -1;

  const step = (dir: 1 | -1) => {
    if (!filtered.length) return;
    const next = selIndex < 0 ? 0 : (selIndex + dir + filtered.length) % filtered.length;
    setSelectedId(filtered[next].id);
  };

  const hours = useMemo(() => {
    const r = TIME_RANGES.find((t) => t.key === filters.timeRange);
    return r?.hours ?? 168;
  }, [filters.timeRange]);

  return (
    <div className="min-h-screen bg-void text-primary">
      <TopNav eventCount={filtered.length} sourceCount={SOURCES.length} />
      <MetricsStrip events={filtered} />

      <div className="border-b border-amber/25 bg-amber/[0.05]">
        <p className="mx-auto max-w-[1440px] px-4 py-1.5 text-[11px] leading-relaxed text-amber/90">
          <span className="font-mono font-semibold tracking-[0.12em]">SIMULATION MODE — </span>
          deterministic synthetic data (reserved example IPs, example.* domains, fictional coordinates). Not real attacks; no routes inferred from addresses alone.
        </p>
      </div>

      <main className="mx-auto max-w-[1440px] px-4 py-4 space-y-4">
        <div className="grid gap-4 lg:grid-cols-[272px_minmax(0,1fr)_320px] items-start">
          <div className="space-y-4 order-2 lg:order-1">
            <FilterPanel filters={filters} onChange={setFilters} resultCount={filtered.length} />
            <div className="hidden lg:block">
              <EventStream events={filtered} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            </div>
          </div>

          <div className="space-y-4 order-1 lg:order-2 min-w-0">
            <GlobePanel events={filtered} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            <Timeline events={filtered} hours={hours} anchor={DATA_ANCHOR} onPick={setSelectedId} />
            <div className="lg:hidden">
              <EventStream events={filtered} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            </div>
          </div>

          <div className="order-3">
            <EventInspector
              event={selected}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              position={selIndex >= 0 ? `${selIndex + 1} / ${filtered.length}` : '0 / 0'}
            />
          </div>
        </div>

        <footer className="flex flex-wrap gap-x-4 gap-y-1 justify-between text-[10.5px] font-mono text-secondary pt-1 pb-6">
          <span>ORBITAL M1 · Next.js + R3F · deterministic seed 20261014 · anchor {new Date(DATA_ANCHOR).toISOString()}</span>
          <span>All indicators reserved for documentation (RFC 5737 / RFC 1918). No external calls.</span>
        </footer>
      </main>
    </div>
  );
}

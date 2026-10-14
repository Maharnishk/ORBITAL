'use client';
import { SOURCES } from '@/lib/data';
import type { EventType, FilterState, Severity } from '@/lib/types';
import { EVENT_TYPES, SEVERITIES, TIME_RANGES } from '@/lib/types';
import { RotateCcw, Search } from 'lucide-react';

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  resultCount: number;
}

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const n = new Set(set);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
}

export default function FilterPanel({ filters, onChange, resultCount }: Props) {
  const set = (p: Partial<FilterState>) => onChange({ ...filters, ...p });
  const allSev = filters.severities.size === SEVERITIES.length;

  return (
    <section aria-label="Event filters" className="rounded-lg border border-border bg-panel">
      <div className="px-3.5 pt-3 pb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-mono tracking-[0.18em] text-secondary">FILTERS</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-secondary tabular-nums" aria-live="polite">{resultCount} match</span>
          <button
            onClick={() =>
              onChange({
                severities: new Set(SEVERITIES),
                types: new Set(EVENT_TYPES.map((t) => t.key)),
                sources: new Set(SOURCES.map((s) => s.id)),
                timeRange: '7d',
                query: '',
              })
            }
            className="focus-ring inline-flex items-center gap-1 text-[11px] font-mono text-secondary hover:text-primary border border-border rounded px-1.5 py-1"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      <div className="px-3.5 pb-3">
        <label className="relative block">
          <span className="sr-only">Search indicators, titles, IDs</span>
          <Search size={13} className="absolute left-2.5 top-2.5 text-secondary" />
          <input
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder="Search indicator, ID, title…"
            className="focus-ring w-full bg-elevated border border-border rounded-md pl-8 pr-2 py-2 text-[12.5px] placeholder:text-secondary/70"
          />
        </label>
      </div>

      <div className="px-3.5 pb-3">
        <div className="text-[10px] font-mono tracking-[0.14em] text-secondary mb-1.5">TIME RANGE</div>
        <div role="group" aria-label="Time range" className="grid grid-cols-5 gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => set({ timeRange: r.key })}
              aria-pressed={filters.timeRange === r.key}
              className={`focus-ring rounded border px-1 py-1.5 text-[11px] font-mono ${
                filters.timeRange === r.key
                  ? 'border-phosphor/60 bg-phosphor/10 text-phosphor'
                  : 'border-border bg-elevated text-secondary hover:text-primary'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3.5 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-mono tracking-[0.14em] text-secondary">SEVERITY</div>
          <button
            onClick={() => set({ severities: allSev ? new Set<Severity>() : new Set(SEVERITIES) })}
            className="focus-ring text-[10px] font-mono text-secondary hover:text-primary"
          >
            {allSev ? 'Clear' : 'All'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Severity">
          {SEVERITIES.map((s) => {
            const on = filters.severities.has(s);
            return (
              <button
                key={s}
                onClick={() => set({ severities: toggle(filters.severities, s) })}
                aria-pressed={on}
                className={`focus-ring rounded-full border px-2.5 py-1 text-[11px] font-mono ${
                  on ? 'border-phosphor/50 bg-phosphor/10 text-primary' : 'border-border bg-elevated text-secondary'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3.5 pb-3">
        <div className="text-[10px] font-mono tracking-[0.14em] text-secondary mb-1.5">EVENT TYPE</div>
        <div className="grid grid-cols-2 gap-1" role="group" aria-label="Event type">
          {EVENT_TYPES.map((t) => {
            const on = filters.types.has(t.key);
            return (
              <button
                key={t.key}
                onClick={() => set({ types: toggle(filters.types, t.key as EventType) })}
                aria-pressed={on}
                className={`focus-ring rounded border px-2 py-1.5 text-left text-[11.5px] ${
                  on ? 'border-phosphor/50 bg-phosphor/[0.07] text-primary' : 'border-border bg-elevated text-secondary'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3.5 pb-3.5">
        <div className="text-[10px] font-mono tracking-[0.14em] text-secondary mb-1.5">SOURCE</div>
        <div className="space-y-1" role="group" aria-label="Source">
          {SOURCES.map((s) => {
            const on = filters.sources.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => set({ sources: toggle(filters.sources, s.id) })}
                aria-pressed={on}
                className={`focus-ring w-full flex items-center gap-2 rounded border px-2 py-1.5 text-left text-[11.5px] ${
                  on ? 'border-border bg-elevated text-primary' : 'border-border/60 bg-transparent text-secondary opacity-60'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${on ? 'bg-phosphor' : 'bg-border'}`}
                  aria-hidden
                />
                <span className="truncate">{s.name}</span>
                <span className="ml-auto font-mono text-[10px] text-secondary">{s.trustScore}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

'use client';
import { SOURCES } from '@/lib/data';
import type { EventType, FilterState, Severity, TimeRangeKey } from '@/lib/types';
import { EVENT_TYPES, SEVERITIES, SEVERITY_LABELS, TIME_RANGES } from '@/lib/types';
import { activeFilterCount } from '@/lib/utils';
import { RotateCcw, Search, X } from 'lucide-react';

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  resultCount: number;
  anchor: number;
}

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const n = new Set(set);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}:00Z`);
  return Number.isNaN(+d) ? null : d.toISOString();
}

export const DEFAULT_FILTERS = (): FilterState => ({
  severities: new Set(SEVERITIES),
  types: new Set(EVENT_TYPES.map((t) => t.key)),
  sources: new Set(SOURCES.map((s) => s.id)),
  timeRange: '7d',
  customStart: null,
  customEnd: null,
  query: '',
});

export const EMPTY_FILTERS = (): FilterState => ({
  severities: new Set<Severity>(),
  types: new Set<EventType>(),
  sources: new Set<string>(),
  timeRange: '7d' as TimeRangeKey,
  customStart: null,
  customEnd: null,
  query: '',
});

export default function FilterPanel({ filters, onChange, resultCount, anchor }: Props) {
  const set = (p: Partial<FilterState>) => onChange({ ...filters, ...p });
  const allSev = filters.severities.size === SEVERITIES.length;
  const active = activeFilterCount(filters, {
    severities: SEVERITIES.length,
    types: EVENT_TYPES.length,
    sources: SOURCES.length,
  });
  const customError =
    filters.timeRange === 'custom' &&
    filters.customStart &&
    filters.customEnd &&
    +new Date(filters.customStart) > +new Date(filters.customEnd)
      ? 'Start is after end — no events can match.'
      : null;

  return (
    <section aria-label="Event filters" className="rounded-lg border border-border bg-panel">
      <div className="px-3.5 pt-3 pb-2 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-mono tracking-[0.18em] text-secondary">
          FILTERS{active > 0 ? <span className="text-phosphor"> · {active} active</span> : ''}
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-secondary tabular-nums" aria-live="polite">
            {resultCount} match
          </span>
          <button
            onClick={() => onChange(EMPTY_FILTERS())}
            title="Clear every facet and the search query (shows empty result set)"
            className="focus-ring inline-flex items-center gap-1 text-[11px] font-mono text-secondary hover:text-primary border border-border rounded px-1.5 py-1"
          >
            <X size={12} /> Clear
          </button>
          <button
            onClick={() => onChange(DEFAULT_FILTERS())}
            title="Reset to default view (all severities, types, sources; last 7 days)"
            className="focus-ring inline-flex items-center gap-1 text-[11px] font-mono text-secondary hover:text-primary border border-border rounded px-1.5 py-1"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      <div className="px-3.5 pb-3">
        <label className="relative block">
          <span className="sr-only">Search indicators, event types, sources, titles, IDs</span>
          <Search size={13} className="absolute left-2.5 top-2.5 text-secondary" />
          <input
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder="Search indicator, type, source…"
            className="focus-ring w-full bg-elevated border border-border rounded-md pl-8 pr-2 py-2 text-[12.5px] placeholder:text-secondary/70"
          />
        </label>
        <p className="mt-1 text-[10.5px] font-mono text-secondary/80">Matches indicator · type · source · title · ID</p>
      </div>

      <div className="px-3.5 pb-3">
        <div className="text-[10px] font-mono tracking-[0.14em] text-secondary mb-1.5">TIME RANGE (UTC)</div>
        <div role="group" aria-label="Time range" className="grid grid-cols-6 gap-1">
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
        {filters.timeRange === 'custom' && (
          <div className="mt-2 space-y-1.5 rounded border border-border bg-elevated/60 p-2">
            <label className="block text-[11px]">
              <span className="font-mono text-[10px] text-secondary">FROM (UTC)</span>
              <input
                type="datetime-local"
                value={toLocalInput(filters.customStart)}
                max={toLocalInput(new Date(anchor).toISOString())}
                onChange={(e) => set({ customStart: fromLocalInput(e.target.value) })}
                className="focus-ring mt-0.5 w-full rounded border border-border bg-panel px-1.5 py-1 font-mono text-[11.5px]"
              />
            </label>
            <label className="block text-[11px]">
              <span className="font-mono text-[10px] text-secondary">TO (UTC)</span>
              <input
                type="datetime-local"
                value={toLocalInput(filters.customEnd)}
                max={toLocalInput(new Date(anchor).toISOString())}
                onChange={(e) => set({ customEnd: fromLocalInput(e.target.value) })}
                className="focus-ring mt-0.5 w-full rounded border border-border bg-panel px-1.5 py-1 font-mono text-[11.5px]"
              />
            </label>
            {customError ? (
              <p role="alert" className="text-[11px] text-coral">{customError}</p>
            ) : (
              <p className="text-[10.5px] font-mono text-secondary/80">Leave a bound empty for open-ended.</p>
            )}
          </div>
        )}
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
                title={SEVERITY_LABELS[s]}
                className={`focus-ring rounded-full border px-2.5 py-1 text-[11px] font-mono ${
                  on ? 'border-phosphor/50 bg-phosphor/10 text-primary' : 'border-border bg-elevated text-secondary'
                }`}
              >
                {SEVERITY_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3.5 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-mono tracking-[0.14em] text-secondary">EVENT TYPE</div>
          <button
            onClick={() =>
              set({
                types:
                  filters.types.size === EVENT_TYPES.length
                    ? new Set<EventType>()
                    : new Set(EVENT_TYPES.map((t) => t.key)),
              })
            }
            className="focus-ring text-[10px] font-mono text-secondary hover:text-primary"
          >
            {filters.types.size === EVENT_TYPES.length ? 'Clear' : 'All'}
          </button>
        </div>
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
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-mono tracking-[0.14em] text-secondary">SOURCE</div>
          <button
            onClick={() =>
              set({
                sources: filters.sources.size === SOURCES.length ? new Set<string>() : new Set(SOURCES.map((s) => s.id)),
              })
            }
            className="focus-ring text-[10px] font-mono text-secondary hover:text-primary"
          >
            {filters.sources.size === SOURCES.length ? 'Clear' : 'All'}
          </button>
        </div>
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

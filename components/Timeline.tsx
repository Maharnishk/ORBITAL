'use client';
import type { FilterState, ThreatEvent } from '@/lib/types';
import { bucketTimeline, timelineWindow } from '@/lib/utils';
import { useMemo } from 'react';

interface Props {
  events: ThreatEvent[];
  filters: FilterState;
  anchor: number;
  onPick: (id: string) => void;
}

/** Compact histogram derived from real event timestamps (UTC). Clicking a bar selects its newest event. */
export default function Timeline({ events, filters, anchor, onPick }: Props) {
  const { start, end } = useMemo(() => timelineWindow(filters, anchor), [filters, anchor]);

  const buckets = useMemo(() => {
    const spanHours = Math.max(1, (end - start) / 3600_000);
    const n = Math.min(48, Math.max(12, Math.round(spanHours / 3.5)));
    return bucketTimeline(events, start, end, n);
  }, [events, start, end]);

  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((a, b) => a + b.count, 0);

  return (
    <section aria-label="Activity timeline" className="rounded-lg border border-border bg-panel px-4 pt-3 pb-2.5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-[11px] font-mono tracking-[0.18em] text-secondary">ACTIVITY TIMELINE</h2>
        <span className="text-[10px] font-mono text-secondary tabular-nums" aria-live="polite">
          {total === 0 ? 'no events in window' : `${total} events · derived from timestamps · UTC · click a bar to inspect`}
        </span>
      </div>
      {total === 0 ? (
        <p className="mt-3 mb-1 rounded border border-border/70 bg-elevated/50 px-3 py-4 text-center text-[12px] text-secondary">
          No events fall in this time window. Widen the range or clear filters — no trend is shown when there is no data.
        </p>
      ) : (
        <div className="mt-2 flex items-end gap-[3px] h-20" role="group" aria-label="Event volume histogram">
          {buckets.map((b, i) => (
            <button
              key={`${b.start}-${i}`}
              disabled={b.count === 0}
              onClick={() => b.latestId && onPick(b.latestId)}
              title={`${new Date(b.start).toISOString().slice(0, 16).replace('T', ' ')} UTC → ${new Date(b.end).toISOString().slice(0, 16).replace('T', ' ')} UTC — ${b.count} events (${b.crit} high/critical)`}
              aria-label={`Bucket ${i + 1}: ${b.count} events`}
              className="focus-ring flex-1 rounded-sm min-w-[3px] transition-opacity disabled:opacity-30"
              style={{
                height: `${Math.max(6, (b.count / max) * 100)}%`,
                background: b.crit > 0 ? '#E6B566' : '#3a423b',
                opacity: b.count ? 0.9 : 0.25,
              }}
            />
          ))}
        </div>
      )}
      <div className="mt-1.5 flex justify-between text-[10px] font-mono text-secondary tabular-nums">
        <span>{new Date(start).toISOString().slice(5, 16).replace('T', ' ')} UTC</span>
        <span>{new Date(end).toISOString().slice(5, 16).replace('T', ' ')} UTC</span>
      </div>
    </section>
  );
}

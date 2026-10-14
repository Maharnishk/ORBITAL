'use client';
import type { ThreatEvent } from '@/lib/types';
import { useMemo } from 'react';

interface Props {
  events: ThreatEvent[];
  hours: number;
  anchor: number;
  onPick: (id: string) => void;
}

/** Hourly histogram derived from event timestamps. Clicking a bar selects its most recent event. */
export default function Timeline({ events, hours, anchor, onPick }: Props) {
  const buckets = useMemo(() => {
    const n = Math.min(48, Math.max(12, Math.round(hours / 3.5)));
    const span = hours * 3600_000;
    const arr: { start: number; count: number; latestId: string | null; crit: number }[] = Array.from(
      { length: n }, (_, i) => ({ start: anchor - span + (span / n) * i, count: 0, latestId: null, crit: 0 })
    );
    const sorted = [...events].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
    for (const e of sorted) {
      const t = +new Date(e.timestamp);
      const idx = Math.min(n - 1, Math.max(0, Math.floor(((t - (anchor - span)) / span) * n)));
      arr[idx].count += 1;
      arr[idx].latestId = e.id;
      if (e.severity === 'critical' || e.severity === 'high') arr[idx].crit += 1;
    }
    return arr;
  }, [events, hours, anchor]);

  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <section aria-label="Activity timeline" className="rounded-lg border border-border bg-panel px-4 pt-3 pb-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-mono tracking-[0.18em] text-secondary">ACTIVITY TIMELINE</h2>
        <span className="text-[10px] font-mono text-secondary">derived from event timestamps · click a bar to inspect</span>
      </div>
      <div className="mt-2 flex items-end gap-[3px] h-20" role="group" aria-label="Event volume histogram">
        {buckets.map((b, i) => (
          <button
            key={i}
            disabled={b.count === 0}
            onClick={() => b.latestId && onPick(b.latestId)}
            title={`${new Date(b.start).toISOString().slice(0, 16).replace('T', ' ')} UTC — ${b.count} events (${b.crit} high/critical)`}
            aria-label={`Bucket ${i + 1}: ${b.count} events`}
            className="focus-ring flex-1 rounded-sm min-w-[3px] transition-opacity disabled:opacity-30"
            style={{
              height: `${Math.max(6, (b.count / max) * 100)}%`,
              background: b.crit > 0 ? 'linear-gradient(to top, #E77C72 0%, #E6B566 60%, #B7F397 100%)' : '#3a423b',
              opacity: b.count ? 0.9 : 0.25,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-mono text-secondary tabular-nums">
        <span>{new Date(anchor - hours * 3600_000).toISOString().slice(5, 16).replace('T', ' ')}</span>
        <span>{new Date(anchor).toISOString().slice(5, 16).replace('T', ' ')} UTC</span>
      </div>
    </section>
  );
}

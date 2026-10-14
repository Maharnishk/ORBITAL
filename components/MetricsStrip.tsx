'use client';
import type { ThreatEvent } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

const SEV_COLOR: Record<string, string> = {
  info: '#929A91',
  low: '#B7F397',
  medium: '#E6B566',
  high: '#E8934A',
  critical: '#E77C72',
};

export default function MetricsStrip({ events }: { events: ThreatEvent[] }) {
  const crit = events.filter((e) => e.severity === 'critical' || e.severity === 'high').length;
  const withGeo = events.filter((e) => e.srcGeo && e.dstGeo).length;
  const single = events.filter((e) => (e.srcGeo || e.dstGeo) && !(e.srcGeo && e.dstGeo)).length;
  const latest = events.length ? timeAgo(events[0].timestamp) : '—';
  const items: [string, string][] = [
    ['EVENTS IN VIEW', String(events.length)],
    ['HIGH / CRITICAL', String(crit)],
    ['PAIRED FLOWS', String(withGeo)],
    ['SINGLE-POINT OBS.', String(single)],
    ['LATEST SIGNAL', latest],
  ];
  return (
    <div
      aria-label="Summary metrics derived from the current filter selection"
      className="flex items-stretch divide-x divide-border border-y border-border bg-panel overflow-x-auto"
    >
      {items.map(([k, v]) => (
        <div key={k} className="flex-1 min-w-[140px] px-4 py-2.5">
          <div className="text-[10px] font-mono tracking-[0.16em] text-secondary">{k}</div>
          <div className="text-[15px] font-semibold tabular-nums mt-0.5">{v}</div>
        </div>
      ))}
      <div className="hidden xl:flex items-center px-4 gap-2 text-[10px] font-mono text-secondary whitespace-nowrap">
        {Object.entries(SEV_COLOR).map(([s, c]) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{s}
          </span>
        ))}
      </div>
    </div>
  );
}

'use client';
import type { ThreatEvent } from '@/lib/types';
import { computeMetrics, timeAgo } from '@/lib/utils';
import { useMemo } from 'react';

interface Props {
  events: ThreatEvent[];
  timeLabel: string;
}

export default function MetricsStrip({ events, timeLabel }: Props) {
  const m = useMemo(() => computeMetrics(events), [events]);
  const latest = m.latestAt ? timeAgo(m.latestAt) : '—';
  const sourcesInView = Object.keys(m.bySource).length;

  const items: [string, string, string?][] = [
    ['EVENT RECORDS', String(m.totalRecords), 'records in current filter'],
    ['UNIQUE INDICATORS', String(m.uniqueIndicators), 'distinct indicator values'],
    ['HIGH / CRITICAL', String(m.highCritical), `crit ${m.bySeverity.critical} · high ${m.bySeverity.high}`],
    ['SOURCES IN VIEW', String(sourcesInView), Object.entries(m.bySource).map(([k, v]) => `${k}:${v}`).join(' · ') || 'none'],
    ['PAIRED FLOWS', String(m.pairedFlows), `${m.singlePoint} single-point · ${m.noGeo} no geo`],
    ['LATEST SIGNAL', latest, m.latestAt ?? 'no events'],
  ];

  return (
    <div aria-label="Summary metrics derived from the current filter selection" className="border-y border-border bg-panel">
      <div className="flex items-stretch divide-x divide-border overflow-x-auto">
        {items.map(([k, v, title]) => (
          <div key={k} className="flex-1 min-w-[140px] px-4 py-2.5" title={title}>
            <div className="text-[10px] font-mono tracking-[0.16em] text-secondary">{k}</div>
            <div className="text-[15px] font-semibold tabular-nums mt-0.5">{v}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60 px-4 py-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-secondary">
        <span aria-live="polite">
          Window: <span className="text-primary/90">{timeLabel}</span>
        </span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">
          sev — info {m.bySeverity.info} · low {m.bySeverity.low} · med {m.bySeverity.medium} · high {m.bySeverity.high} · crit {m.bySeverity.critical}
        </span>
        <span aria-hidden>·</span>
        <span>Counts reflect the filtered set only; no sampling or extrapolation.</span>
      </div>
    </div>
  );
}

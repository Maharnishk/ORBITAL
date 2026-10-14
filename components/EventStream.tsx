'use client';
import { sourceById } from '@/lib/data';
import type { ThreatEvent } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { Inbox } from 'lucide-react';

const DOT: Record<string, string> = {
  info: '#929A91',
  low: '#B7F397',
  medium: '#E6B566',
  high: '#E8934A',
  critical: '#E77C72',
};

interface Props {
  events: ThreatEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function EventStream({ events, selectedId, onSelect }: Props) {
  return (
    <section aria-label="Event stream" className="rounded-lg border border-border bg-panel flex flex-col min-h-0">
      <div className="px-3.5 pt-3 pb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-mono tracking-[0.18em] text-secondary">EVENT STREAM</h2>
        <span className="text-[10px] font-mono text-secondary">newest first · UTC</span>
      </div>
      {events.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <Inbox size={20} className="mx-auto text-secondary" />
          <p className="mt-2 text-[13px] font-medium">No events match these filters</p>
          <p className="mt-1 text-[12px] text-secondary">Widen the time range or re-enable a severity, type, or source.</p>
        </div>
      ) : (
        <ol className="overflow-y-auto divide-y divide-border/70 max-h-[560px] lg:max-h-[640px]" tabIndex={0} aria-label="Scrollable event list">
          {events.map((e) => {
            const sel = e.id === selectedId;
            return (
              <li key={e.id}>
                <button
                  onClick={() => onSelect(e.id)}
                  aria-current={sel}
                  className={`focus-ring w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition-colors ${
                    sel ? 'bg-phosphor/[0.07] border-l-2 border-l-phosphor' : 'border-l-2 border-l-transparent hover:bg-elevated/70'
                  }`}
                >
                  <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: DOT[e.severity] }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-[12px] text-primary truncate">{e.indicator}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10.5px] text-secondary tabular-nums">{timeAgo(e.timestamp)}</span>
                    </span>
                    <span className="block text-[12px] text-secondary truncate mt-0.5">{e.title}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-[10px] font-mono text-secondary">
                      <span className="uppercase tracking-wider" style={{ color: DOT[e.severity] }}>{e.severity}</span>
                      <span aria-hidden>·</span><span>{e.type}</span>
                      <span aria-hidden>·</span><span className="truncate">{sourceById(e.sourceId).name}</span>
                      <span aria-hidden>·</span><span>{e.id}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

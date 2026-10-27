'use client';
import type { ThreatEvent, ThreatSource } from '@/lib/types';
import { SEVERITY_LABELS } from '@/lib/types';
import { formatUtc, timeAgo } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const DOT: Record<string, string> = {
  info: '#929A91',
  low: '#B7F397',
  medium: '#E6B566',
  high: '#E8934A',
  critical: '#E77C72',
};

const SEV_RANK: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

type SortKey = 'newest' | 'oldest' | 'severity';

const PAGE_SIZE = 25;

interface Props {
  events: ThreatEvent[];
  sources: ThreatSource[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function EventStream({ events, sources, selectedId, onSelect }: Props) {
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(0);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const sourceNames = useMemo(
    () => new Map(sources.map((s) => [s.id, s.name])),
    [sources]
  );

  const sorted = useMemo(() => {
    const arr = [...events];
    if (sort === 'newest') arr.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
    else if (sort === 'oldest') arr.sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
    else arr.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || +new Date(b.timestamp) - +new Date(a.timestamp));
    return arr;
  }, [events, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Reset to first page whenever the result set or sort changes.
  useEffect(() => {
    setPage(0);
  }, [events, sort]);

  // Keep the list on the page that contains the selected event. This is what
  // makes globe-marker / timeline selection visibly synchronize with the list.
  useEffect(() => {
    if (!selectedId) return;
    const index = sorted.findIndex((e) => e.id === selectedId);
    if (index < 0) return;
    const targetPage = Math.floor(index / PAGE_SIZE);
    setPage((current) => (current === targetPage ? current : targetPage));
  }, [selectedId, sorted]);

  // Scroll the selected event into view (covers globe-marker → list selection).
  useEffect(() => {
    if (!selectedId) return;
    const node = itemRefs.current.get(selectedId);
    if (!node) return;
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selectedId, safePage, sort]);

  return (
    <section aria-label="Event stream" className="rounded-lg border border-border bg-panel flex flex-col min-h-0 overflow-hidden [contain:paint]">
      <div className="px-3.5 pt-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-[11px] font-mono tracking-[0.18em] text-secondary">EVENT STREAM</h2>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-mono text-secondary">
            Sort{' '}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort events"
              className="focus-ring ml-1 rounded border border-border bg-elevated px-1.5 py-1 font-mono text-[11px] text-primary"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="severity">Severity</option>
            </select>
          </label>
          <span className="text-[10px] font-mono text-secondary tabular-nums" aria-live="polite">
            {sorted.length === 0 ? '0 events' : `${safePage * PAGE_SIZE + 1}–${safePage * PAGE_SIZE + visible.length} of ${sorted.length}`}
          </span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <Inbox size={20} className="mx-auto text-secondary" />
          <p className="mt-2 text-[13px] font-medium">No events match these filters</p>
          <p className="mt-1 text-[12px] text-secondary">Widen the time range or re-enable a severity, type, or source. Nothing is hidden — the list only shows records that match.</p>
        </div>
      ) : (
        <>
          <ol className="overflow-y-auto divide-y divide-border/70 max-h-[560px] lg:max-h-[640px]" tabIndex={0} aria-label="Scrollable event list">
            {visible.map((e) => {
              const sel = e.id === selectedId;
              return (
                <li
                  key={e.id}
                  ref={(n) => {
                    if (n) itemRefs.current.set(e.id, n);
                    else itemRefs.current.delete(e.id);
                  }}
                >
                  <button
                    onClick={() => onSelect(e.id)}
                    aria-current={sel}
                    title={`${e.indicator} · ${formatUtc(e.timestamp)}`}
                    className={`focus-ring w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition-colors ${
                      sel ? 'bg-phosphor/[0.07] border-l-2 border-l-phosphor' : 'border-l-2 border-l-transparent hover:bg-elevated/70'
                    }`}
                  >
                    <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: DOT[e.severity] }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 font-mono text-[12px] text-primary truncate">{e.indicator}</span>
                        <span className="ml-auto shrink-0 whitespace-nowrap font-mono text-[10.5px] text-secondary tabular-nums">{timeAgo(e.timestamp)}</span>
                      </span>
                      <span className="block text-[12px] text-secondary truncate mt-0.5">{e.title}</span>
                      <span className="mt-1 grid grid-cols-[auto_1fr_auto] items-center gap-x-1.5 gap-y-0.5 text-[10px] font-mono text-secondary">
                        <span className="uppercase tracking-wider" style={{ color: DOT[e.severity] }}>
                          {SEVERITY_LABELS[e.severity] ?? e.severity}
                        </span>
                        <span className="min-w-0 truncate">
                          <span aria-hidden>· </span>
                          {e.type}
                          <span aria-hidden> · </span>
                          <span className="truncate">{sourceNames.get(e.sourceId) ?? e.sourceId}</span>
                        </span>
                        <span className="tabular-nums text-right">{e.id}</span>
                      </span>
                      <span className="sr-only">{formatUtc(e.timestamp)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-border/70 px-3.5 py-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="focus-ring inline-flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-[11px] text-secondary hover:text-primary disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft size={13} /> Prev
              </button>
              <span className="font-mono text-[10.5px] text-secondary tabular-nums" aria-live="polite">
                Page {safePage + 1} / {pageCount}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="focus-ring inline-flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-[11px] text-secondary hover:text-primary disabled:opacity-40"
                aria-label="Next page"
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

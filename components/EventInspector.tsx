'use client';
import { sourceById } from '@/lib/data';
import type { ThreatEvent } from '@/lib/types';
import { formatUtc } from '@/lib/utils';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, MapPin } from 'lucide-react';
import { useState } from 'react';

const BADGE: Record<string, string> = {
  info: 'border-secondary/40 text-secondary',
  low: 'border-phosphor/40 text-phosphor',
  medium: 'border-amber/40 text-amber',
  high: 'border-[#E8934A]/50 text-[#E8934A]',
  critical: 'border-coral/50 text-coral',
};

interface Props {
  event: ThreatEvent | null;
  onPrev: () => void;
  onNext: () => void;
  position: string;
}

export default function EventInspector({ event, onPrev, onNext, position }: Props) {
  const [copied, setCopied] = useState(false);
  if (!event) {
    return (
      <section aria-label="Event inspector" className="rounded-lg border border-border bg-panel p-4">
        <h2 className="text-[11px] font-mono tracking-[0.18em] text-secondary">INSPECTOR</h2>
        <p className="mt-3 text-[13px] text-secondary">Select an event from the stream or the globe to inspect provenance and metadata.</p>
      </section>
    );
  }
  const src = sourceById(event.sourceId);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(event.indicator);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <section aria-label="Event inspector" className="rounded-lg border border-border bg-panel">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border/70">
        <h2 className="text-[11px] font-mono tracking-[0.18em] text-secondary">INSPECTOR</h2>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-secondary mr-1 tabular-nums">{position}</span>
          <button onClick={onPrev} aria-label="Previous event" className="focus-ring p-1.5 rounded border border-border text-secondary hover:text-primary"><ChevronLeft size={14} /></button>
          <button onClick={onNext} aria-label="Next event" className="focus-ring p-1.5 rounded border border-border text-secondary hover:text-primary"><ChevronRight size={14} /></button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] ${BADGE[event.severity]}`}>{event.severity}</span>
            <span className="text-[10px] font-mono text-secondary">{event.type} · {event.id}</span>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold leading-snug">{event.title}</h3>
          <p className="mt-1 text-[12.5px] text-secondary leading-relaxed">{event.description}</p>
        </div>

        <div className="rounded-md border border-border bg-elevated px-3 py-2.5 flex items-center gap-2">
          <code className="font-mono text-[13px] text-phosphor truncate flex-1">{event.indicator}</code>
          <span className="text-[10px] font-mono text-secondary uppercase">{event.indicatorType}</span>
          <button onClick={copy} aria-label="Copy indicator" className="focus-ring p-1.5 rounded border border-border text-secondary hover:text-primary">
            {copied ? <Check size={13} className="text-phosphor" /> : <Copy size={13} />}
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
          <div><dt className="font-mono text-[10px] tracking-[0.12em] text-secondary">OBSERVED</dt><dd className="font-mono text-[11.5px] mt-0.5">{formatUtc(event.timestamp)}</dd></div>
          <div>
            <dt className="font-mono text-[10px] tracking-[0.12em] text-secondary">CONFIDENCE</dt>
            <dd className="mt-1">
              {event.confidence == null ? (
                <span className="text-secondary text-[11.5px]">Not reported by source</span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 rounded bg-border overflow-hidden" role="img" aria-label={`Confidence ${event.confidence} of 100`}>
                    <span className="block h-full bg-phosphor" style={{ width: `${event.confidence}%` }} />
                  </span>
                  <span className="font-mono text-[11.5px] tabular-nums">{event.confidence}</span>
                </span>
              )}
            </dd>
          </div>
          <div><dt className="font-mono text-[10px] tracking-[0.12em] text-secondary">ASN</dt><dd className="font-mono text-[11.5px] mt-0.5">{event.asn ?? '—'}</dd></div>
          <div><dt className="font-mono text-[10px] tracking-[0.12em] text-secondary">PORT / PROTO</dt><dd className="font-mono text-[11.5px] mt-0.5">{event.port ? `${event.port} · ${event.protocol}` : (event.protocol ?? '—')}</dd></div>
        </dl>

        <div className="space-y-1.5">
          <div className="font-mono text-[10px] tracking-[0.12em] text-secondary">GEOGRAPHY (SIMULATED)</div>
          {[
            ['SRC', event.srcGeo],
            ['DST', event.dstGeo],
          ].map(([k, g]: any) => (
            <div key={k} className="flex items-start gap-2 rounded border border-border/80 bg-elevated/60 px-2.5 py-2 text-[12px]">
              <MapPin size={13} className="mt-0.5 text-secondary shrink-0" />
              {g ? (
                <span>
                  <span className="font-mono text-[10px] text-secondary mr-1.5">{k}</span>
                  {g.label}
                  <span className="ml-2 rounded border border-border px-1 py-px font-mono text-[10px] text-secondary">loc: {g.locationSource}</span>
                </span>
              ) : (
                <span className="text-secondary"><span className="font-mono text-[10px] mr-1.5">{k}</span>Not reported — no arc inferred</span>
              )}
            </div>
          ))}
        </div>

        <div>
          <div className="font-mono text-[10px] tracking-[0.12em] text-secondary mb-1.5">PROVENANCE</div>
          <dl className="rounded border border-border divide-y divide-border/60 text-[12px]">
            {[
              ['Reporter', event.provenance.reporter],
              ['Method', event.provenance.collectionMethod],
              ['First seen', formatUtc(event.provenance.firstSeen)],
              ['Last seen', formatUtc(event.provenance.lastSeen)],
              ['Reference', event.provenance.reference],
              ['Source trust', `${src.name} · rel ${src.reliability} · ${src.trustScore}/100`],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2 px-2.5 py-1.5">
                <dt className="w-24 shrink-0 text-secondary">{k}</dt>
                <dd className="font-mono text-[11px] break-all">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {event.tags.map((t) => (
            <span key={t} className="rounded border border-border bg-elevated px-1.5 py-0.5 font-mono text-[10.5px] text-secondary">{t}</span>
          ))}
        </div>

        <p className="flex gap-1.5 items-start rounded border border-amber/30 bg-amber/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-amber/90">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          Simulated exercise record. Not a real attack, and no route is inferred from addresses alone.
        </p>
      </div>
    </section>
  );
}

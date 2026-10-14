import type { FilterState, ThreatEvent } from './types';
import { TIME_RANGES } from './types';

export function applyFilters(events: ThreatEvent[], f: FilterState, now = Date.now()): ThreatEvent[] {
  const range = TIME_RANGES.find((r) => r.key === f.timeRange);
  const cutoff = range?.hours != null ? now - range.hours * 3600_000 : null;
  const q = f.query.trim().toLowerCase();
  return events.filter((e) => {
    if (!f.severities.has(e.severity)) return false;
    if (!f.types.has(e.type)) return false;
    if (!f.sources.has(e.sourceId)) return false;
    if (cutoff != null && +new Date(e.timestamp) < cutoff) return false;
    if (q && !`${e.indicator} ${e.id} ${e.title}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function latLonToVec3(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z];
}

export function formatUtc(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(1, Math.floor((now - +new Date(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

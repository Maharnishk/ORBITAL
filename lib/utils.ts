import type { FilterState, GeoPoint, Severity, ThreatEvent } from './types';
import { EVENT_TYPES, TIME_RANGES } from './types';
import { SOURCES, sourceById } from './data';

/** Resolve event timestamp cutoff (ms) for the active time filter. Null = unbounded. */
export function filterCutoff(f: FilterState, now = Date.now()): { start: number | null; end: number | null } {
  if (f.timeRange === 'custom') {
    const s = f.customStart ? +new Date(f.customStart) : null;
    const e = f.customEnd ? +new Date(f.customEnd) : null;
    return {
      start: s != null && Number.isFinite(s) ? s : null,
      end: e != null && Number.isFinite(e) ? e : null,
    };
  }
  const range = TIME_RANGES.find((r) => r.key === f.timeRange);
  if (range?.hours != null) return { start: now - range.hours * 3600_000, end: null };
  return { start: null, end: null };
}

export function applyFilters(events: ThreatEvent[], f: FilterState, now = Date.now()): ThreatEvent[] {
  const { start, end } = filterCutoff(f, now);
  const q = f.query.trim().toLowerCase();
  return events.filter((e) => {
    if (!f.severities.has(e.severity)) return false;
    if (!f.types.has(e.type)) return false;
    if (!f.sources.has(e.sourceId)) return false;
    const t = +new Date(e.timestamp);
    if (start != null && t < start) return false;
    if (end != null && t > end) return false;
    if (q) {
      const typeLabel = EVENT_TYPES.find((x) => x.key === e.type)?.label.toLowerCase() ?? e.type;
      let sourceName = '';
      try {
        sourceName = sourceById(e.sourceId).name.toLowerCase();
      } catch {
        sourceName = e.sourceId.toLowerCase();
      }
      const hay = `${e.indicator} ${e.id} ${e.title} ${e.type} ${typeLabel} ${sourceName} ${e.sourceId}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Human-readable label for the active time window, always with UTC reference. */
export function timeWindowLabel(f: FilterState, anchor = Date.now()): string {
  if (f.timeRange === 'custom') {
    const s = f.customStart ? formatUtc(f.customStart) : 'start';
    const e = f.customEnd ? formatUtc(f.customEnd) : 'now';
    return `${s} → ${e}`;
  }
  const range = TIME_RANGES.find((r) => r.key === f.timeRange);
  if (!range) return 'Unknown window';
  if (range.hours == null) return 'All available data (UTC)';
  if (f.timeRange === 'all') return 'All available data (UTC)';
  return `Last ${range.label} to ${new Date(anchor).toISOString().slice(11, 16)} UTC`;
}

export interface DashboardMetrics {
  totalRecords: number;
  uniqueIndicators: number;
  bySeverity: Record<Severity, number>;
  bySource: Record<string, number>;
  highCritical: number;
  pairedFlows: number;
  singlePoint: number;
  noGeo: number;
  latestAt: string | null;
}

/** Pure metric calculation over the already-filtered result set. No invented values. */
export function computeMetrics(events: ThreatEvent[]): DashboardMetrics {
  const bySeverity: Record<Severity, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  const bySource: Record<string, number> = {};
  const indicators = new Set<string>();
  let pairedFlows = 0;
  let singlePoint = 0;
  let noGeo = 0;
  let latestAt: string | null = null;
  let latestMs = -Infinity;

  for (const e of events) {
    bySeverity[e.severity] += 1;
    bySource[e.sourceId] = (bySource[e.sourceId] ?? 0) + 1;
    indicators.add(e.indicator);
    const hasSrc = e.srcGeo != null && isValidGeo(e.srcGeo);
    const hasDst = e.dstGeo != null && isValidGeo(e.dstGeo);
    if (hasSrc && hasDst) pairedFlows += 1;
    else if (hasSrc || hasDst) singlePoint += 1;
    else noGeo += 1;
    const t = +new Date(e.timestamp);
    if (Number.isFinite(t) && t > latestMs) {
      latestMs = t;
      latestAt = e.timestamp;
    }
  }

  return {
    totalRecords: events.length,
    uniqueIndicators: indicators.size,
    bySeverity,
    bySource,
    highCritical: bySeverity.high + bySeverity.critical,
    pairedFlows,
    singlePoint,
    noGeo,
    latestAt,
  };
}

/** Active filter count (facets + query + non-default time range) for "N filters active" display. */
export function activeFilterCount(
  f: FilterState,
  totals: { severities: number; types: number; sources: number }
): number {
  let n = 0;
  if (f.severities.size !== totals.severities) n += 1;
  if (f.types.size !== totals.types) n += 1;
  if (f.sources.size !== totals.sources) n += 1;
  if (f.timeRange !== '7d') n += 1;
  if (f.query.trim()) n += 1;
  return n;
}

export function isValidGeo(g: GeoPoint | null | undefined): g is GeoPoint {
  if (!g) return false;
  if (!Number.isFinite(g.lat) || !Number.isFinite(g.lon)) return false;
  return g.lat >= -90 && g.lat <= 90 && g.lon >= -180 && g.lon <= 180;
}

/** Preferred plot point: dstGeo first, then srcGeo. Null when no valid coords. */
export function plottableGeo(e: ThreatEvent): GeoPoint | null {
  if (isValidGeo(e.dstGeo)) return e.dstGeo;
  if (isValidGeo(e.srcGeo)) return e.srcGeo;
  return null;
}

export interface TimelineBucket {
  start: number;
  end: number;
  count: number;
  crit: number;
  latestId: string | null;
}

/**
 * Bucket events by timestamp (UTC ms). Pure and deterministic.
 * - spanMs <= 0 or bucketCount <= 0 returns [].
 * - Events outside [windowStart, windowEnd] are ignored (not clamped into edge buckets).
 * - Invalid timestamps are ignored.
 */
export function bucketTimeline(
  events: ThreatEvent[],
  windowStart: number,
  windowEnd: number,
  bucketCount: number
): TimelineBucket[] {
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) return [];
  if (!Number.isInteger(bucketCount) || bucketCount <= 0) return [];
  const span = windowEnd - windowStart;
  const width = span / bucketCount;
  const buckets: TimelineBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    start: windowStart + width * i,
    end: windowStart + width * (i + 1),
    count: 0,
    crit: 0,
    latestId: null,
  }));
  // Track latest timestamp per bucket so latestId is the newest event in that bucket.
  const latestTs = new Array<number>(bucketCount).fill(-Infinity);
  for (const e of events) {
    const t = +new Date(e.timestamp);
    if (!Number.isFinite(t)) continue;
    if (t < windowStart || t > windowEnd) continue;
    const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(((t - windowStart) / span) * bucketCount)));
    buckets[idx].count += 1;
    if (e.severity === 'critical' || e.severity === 'high') buckets[idx].crit += 1;
    if (t >= latestTs[idx]) {
      latestTs[idx] = t;
      buckets[idx].latestId = e.id;
    }
  }
  return buckets;
}

/** Resolve timeline window [start, end] in ms for the active filter + anchor. */
export function timelineWindow(f: FilterState, anchor: number, fallbackSpanHours = 168): { start: number; end: number } {
  const { start, end } = filterCutoff(f, anchor);
  if (f.timeRange === 'custom') {
    const s = start ?? anchor - fallbackSpanHours * 3600_000;
    const e = end ?? anchor;
    if (e <= s) return { start: anchor - fallbackSpanHours * 3600_000, end: anchor };
    return { start: s, end: e };
  }
  if (start != null) return { start, end: anchor };
  // 'all': use data extent when available, else fallback span.
  return { start: anchor - fallbackSpanHours * 3600_000, end: anchor };
}

export function allSourceIds(): string[] {
  return SOURCES.map((s) => s.id);
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
  if (Number.isNaN(+d)) return 'Unknown time';
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(1, Math.floor((now - +new Date(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

import { describe, expect, it } from 'vitest';
import type { FilterState, ThreatEvent } from './types';
import { EVENT_TYPES, SEVERITIES } from './types';
import { SOURCES } from './data';
import {
  applyFilters,
  bucketTimeline,
  computeMetrics,
  isValidGeo,
  plottableGeo,
  timelineWindow,
} from './utils';

const NOW = new Date('2026-10-14T12:00:00Z').getTime();

function evt(partial: Partial<ThreatEvent> & { id: string; timestamp: string }): ThreatEvent {
  return {
    title: 'Test record',
    description: 'fixture',
    indicator: '192.0.2.1',
    indicatorType: 'ipv4',
    severity: 'medium',
    type: 'scanning',
    sourceId: SOURCES[0].id,
    sourceUrl: null,
    ingestedAt: partial.timestamp,
    confidence: null,
    srcGeo: null,
    dstGeo: null,
    asn: null,
    port: null,
    protocol: null,
    tags: [],
    provenance: {
      reporter: 'fixture',
      collectionMethod: 'test',
      firstSeen: partial.timestamp,
      lastSeen: partial.timestamp,
      reference: `FIX-${partial.id}`,
    },
    dataOrigin: 'simulation',
    verificationStatus: 'unverified',
    ...partial,
  } as ThreatEvent;
}

function baseFilters(): FilterState {
  return {
    severities: new Set(SEVERITIES),
    types: new Set(EVENT_TYPES.map((t) => t.key)),
    sources: new Set(SOURCES.map((s) => s.id)),
    timeRange: 'all',
    customStart: null,
    customEnd: null,
    query: '',
  };
}

const FIXTURES: ThreatEvent[] = [
  evt({
    id: 'EVT-0001',
    timestamp: new Date(NOW - 30 * 60_000).toISOString(),
    severity: 'critical',
    type: 'malware-c2',
    indicator: '192.0.2.10',
    sourceId: SOURCES[0].id,
    dstGeo: { lat: 40.41, lon: -73.94, label: 'sector', countryCode: 'XX', locationSource: 'reported' },
    srcGeo: { lat: 52.31, lon: 4.72, label: 'sector', countryCode: 'XX', locationSource: 'reported' },
  }),
  evt({
    id: 'EVT-0002',
    timestamp: new Date(NOW - 2 * 3600_000).toISOString(),
    severity: 'low',
    type: 'phishing',
    indicator: 'login-1.example.com',
    indicatorType: 'domain',
    sourceId: SOURCES[2].id,
    dstGeo: { lat: 35.42, lon: 139.51, label: 'sector', countryCode: 'XX', locationSource: 'inferred' },
  }),
  evt({
    id: 'EVT-0003',
    timestamp: new Date(NOW - 26 * 3600_000).toISOString(),
    severity: 'high',
    type: 'scanning',
    indicator: '192.0.2.10', // duplicate indicator
    sourceId: SOURCES[0].id,
    // no geo at all
  }),
];

describe('applyFilters', () => {
  it('severity multi-select keeps only chosen severities', () => {
    const f = { ...baseFilters(), severities: new Set(['critical'] as const) };
    expect(applyFilters(FIXTURES, f, NOW).map((e) => e.id)).toEqual(['EVT-0001']);
  });

  it('event type filter narrows the shared result set', () => {
    const f = { ...baseFilters(), types: new Set(['phishing'] as const) };
    expect(applyFilters(FIXTURES, f, NOW).map((e) => e.id)).toEqual(['EVT-0002']);
  });

  it('source filter narrows the shared result set', () => {
    const f = { ...baseFilters(), sources: new Set([SOURCES[2].id]) };
    expect(applyFilters(FIXTURES, f, NOW).map((e) => e.id)).toEqual(['EVT-0002']);
  });

  it('time-range preset excludes older records', () => {
    const f = { ...baseFilters(), timeRange: '1h' as const };
    expect(applyFilters(FIXTURES, f, NOW).map((e) => e.id)).toEqual(['EVT-0001']);
  });

  it('custom range bounds both sides; inverted range matches nothing', () => {
    const ok: FilterState = {
      ...baseFilters(),
      timeRange: 'custom',
      customStart: new Date(NOW - 3 * 3600_000).toISOString(),
      customEnd: new Date(NOW).toISOString(),
    };
    expect(applyFilters(FIXTURES, ok, NOW).map((e) => e.id).sort()).toEqual(['EVT-0001', 'EVT-0002']);

    const inverted: FilterState = {
      ...baseFilters(),
      timeRange: 'custom',
      customStart: new Date(NOW).toISOString(),
      customEnd: new Date(NOW - 3 * 3600_000).toISOString(),
    };
    expect(applyFilters(FIXTURES, inverted, NOW)).toEqual([]);
  });

  it('search matches indicator, event type, and source name', () => {
    const byIndicator = { ...baseFilters(), query: 'login-1' };
    expect(applyFilters(FIXTURES, byIndicator, NOW).map((e) => e.id)).toEqual(['EVT-0002']);

    const byType = { ...baseFilters(), query: 'phishing' };
    expect(applyFilters(FIXTURES, byType, NOW).map((e) => e.id)).toEqual(['EVT-0002']);

    const bySource = { ...baseFilters(), query: SOURCES[0].name.slice(0, 8) };
    expect(applyFilters(FIXTURES, bySource, NOW).map((e) => e.id).sort()).toEqual(['EVT-0001', 'EVT-0003']);
  });

  it('clear-all (empty facets) yields an empty result set', () => {
    const cleared: FilterState = {
      ...baseFilters(),
      severities: new Set(),
      types: new Set(),
      sources: new Set(),
    };
    expect(applyFilters(FIXTURES, cleared, NOW)).toEqual([]);
  });

  it('impossible query yields a useful empty result', () => {
    const f = { ...baseFilters(), query: 'no-such-indicator-zzz' };
    expect(applyFilters(FIXTURES, f, NOW)).toEqual([]);
  });
});

describe('computeMetrics', () => {
  it('distinguishes records from unique indicators and counts consistently', () => {
    const m = computeMetrics(FIXTURES);
    expect(m.totalRecords).toBe(3);
    expect(m.uniqueIndicators).toBe(2); // EVT-0001 and EVT-0003 share an indicator
    expect(m.bySeverity.critical).toBe(1);
    expect(m.bySeverity.high).toBe(1);
    expect(m.bySeverity.low).toBe(1);
    expect(m.highCritical).toBe(2);
    expect(m.bySource[SOURCES[0].id]).toBe(2);
    expect(m.latestAt).toBe(FIXTURES[0].timestamp);
  });

  it('empty input produces zeroed metrics, not invented values', () => {
    const m = computeMetrics([]);
    expect(m.totalRecords).toBe(0);
    expect(m.uniqueIndicators).toBe(0);
    expect(m.highCritical).toBe(0);
    expect(m.latestAt).toBeNull();
  });

  it('geo accounting separates paired, single-point, and missing', () => {
    const m = computeMetrics(FIXTURES);
    expect(m.pairedFlows).toBe(1);
    expect(m.singlePoint).toBe(1);
    expect(m.noGeo).toBe(1);
  });
});

describe('event selection consistency', () => {
  it('stable IDs let globe/stream/inspector resolve the same record', () => {
    const filtered = applyFilters(FIXTURES, baseFilters(), NOW);
    const selectedId = 'EVT-0002';
    const selected = filtered.find((e) => e.id === selectedId) ?? null;
    expect(selected?.indicator).toBe('login-1.example.com');
    // A filtered-out id must not resolve — caller falls back to first visible.
    const missing = filtered.find((e) => e.id === 'EVT-9999') ?? filtered[0] ?? null;
    expect(missing?.id).toBe(filtered[0].id);
  });
});

describe('missing coordinates', () => {
  it('rejects invalid, NaN, and out-of-range geo', () => {
    expect(isValidGeo(null)).toBe(false);
    expect(isValidGeo(undefined)).toBe(false);
    expect(isValidGeo({ lat: NaN, lon: 0, label: 'x', countryCode: 'XX', locationSource: 'unknown' })).toBe(false);
    expect(isValidGeo({ lat: 91, lon: 0, label: 'x', countryCode: 'XX', locationSource: 'unknown' })).toBe(false);
    expect(isValidGeo({ lat: 0, lon: 181, label: 'x', countryCode: 'XX', locationSource: 'unknown' })).toBe(false);
    expect(isValidGeo({ lat: 0, lon: 0, label: 'x', countryCode: 'XX', locationSource: 'reported' })).toBe(true);
  });

  it('plottableGeo prefers dst, falls back to src, else null (never invents)', () => {
    const [both] = FIXTURES;
    expect(plottableGeo(both)).toEqual(both.dstGeo);
    expect(plottableGeo(FIXTURES[1])).toEqual(FIXTURES[1].dstGeo);
    expect(plottableGeo(FIXTURES[2])).toBeNull();
    const bad = evt({
      id: 'EVT-BAD',
      timestamp: new Date(NOW).toISOString(),
      dstGeo: { lat: 999, lon: 999, label: 'bad', countryCode: 'XX', locationSource: 'unknown' },
    });
    expect(plottableGeo(bad)).toBeNull();
  });
});

describe('bucketTimeline', () => {
  const start = NOW - 4 * 3600_000;
  const end = NOW;

  it('buckets sum to input and ignore out-of-window records', () => {
    const buckets = bucketTimeline(FIXTURES, start, end, 4);
    const inWindow = 2; // EVT-0003 is 26h old
    expect(buckets.reduce((a, b) => a + b.count, 0)).toBe(inWindow);
    expect(buckets.length).toBe(4);
  });

  it('counts high/critical separately and tracks newest id per bucket', () => {
    const buckets = bucketTimeline(FIXTURES, start, end, 4);
    expect(buckets.reduce((a, b) => a + b.crit, 0)).toBe(1);
    const nonEmpty = buckets.filter((b) => b.count > 0);
    for (const b of nonEmpty) expect(b.latestId).toBeTruthy();
  });

  it('empty input yields zeroed buckets; bad windows yield []', () => {
    const buckets = bucketTimeline([], start, end, 4);
    expect(buckets.length).toBe(4);
    expect(buckets.every((b) => b.count === 0 && b.latestId === null)).toBe(true);
    expect(bucketTimeline(FIXTURES, end, start, 4)).toEqual([]);
    expect(bucketTimeline(FIXTURES, start, end, 0)).toEqual([]);
  });

  it('ignores invalid timestamps without fabricating volume', () => {
    const bad = evt({ id: 'EVT-BAD-TS', timestamp: 'not-a-date' });
    const buckets = bucketTimeline([bad], start, end, 4);
    expect(buckets.reduce((a, b) => a + b.count, 0)).toBe(0);
  });

  it('timezone boundaries use exact UTC ms (no local-day bucketing)', () => {
    // Event exactly at window end is included; one ms after is not.
    const atEnd = evt({ id: 'EVT-END', timestamp: new Date(end).toISOString() });
    const afterEnd = evt({ id: 'EVT-AFTER', timestamp: new Date(end + 1).toISOString() });
    const buckets = bucketTimeline([atEnd, afterEnd], start, end, 2);
    expect(buckets.reduce((a, b) => a + b.count, 0)).toBe(1);
    expect(buckets[1].latestId).toBe('EVT-END');
  });
});

describe('timelineWindow', () => {
  it('custom window respects explicit bounds', () => {
    const wStart = NOW - 4 * 3600_000;
    const wEnd = NOW;
    const f: FilterState = {
      ...baseFilters(),
      timeRange: 'custom',
      customStart: new Date(wStart).toISOString(),
      customEnd: new Date(wEnd).toISOString(),
    };
    expect(timelineWindow(f, NOW)).toEqual({ start: wStart, end: wEnd });
  });
});

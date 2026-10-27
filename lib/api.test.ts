import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  fetchAllEvents,
  fetchEvents,
  fetchSources,
  ORBITAL_API_BASE_URL,
  toThreatEvent,
  toThreatSource,
  type ApiEvent,
} from './api';

const apiEvent: ApiEvent = {
  event_id: 'SIM-EVT-1042',
  title: 'Beaconing pattern matches known C2 cadence',
  description: 'Simulated beacon.',
  indicator: '192.0.2.10',
  indicator_type: 'ipv4',
  category: 'malware-c2',
  severity: 'high',
  source_id: 'meridian-honeynet',
  source_name: 'Meridian Honeynet',
  source_reference: 'SIM-MERI-SIM-EVT-1042',
  source_url: null,
  event_timestamp: '2026-10-19T12:00:00+00:00',
  ingested_at: '2026-10-19T12:05:00+00:00',
  first_seen: null,
  last_seen: null,
  confidence: null,
  location: {
    latitude: 40.41,
    longitude: -73.94,
    label: null,
    country_code: 'XX',
    location_source: 'reported',
  },
  src_location: {
    latitude: 40.41,
    longitude: -73.94,
    label: 'Sim sector N-ATL-01',
    country_code: 'XX',
    location_source: 'reported',
  },
  dst_location: {
    latitude: 999,
    longitude: 999,
    label: 'invalid fixture',
    country_code: 'XX',
    location_source: 'unknown',
  },
  asn: 'AS64510',
  port: 443,
  protocol: 'tcp/443',
  tags: ['malware-c2', 'high'],
  data_origin: 'simulation',
  verification_status: 'unverified',
  reporter: 'Meridian Honeynet',
  collection_method: null,
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('toThreatEvent', () => {
  it('maps API fields to the dashboard contract', () => {
    const event = toThreatEvent(apiEvent);
    expect(event.id).toBe('SIM-EVT-1042');
    expect(event.type).toBe('malware-c2');
    expect(event.timestamp).toBe('2026-10-19T12:00:00+00:00');
    expect(event.provenance.firstSeen).toBeNull();
    expect(event.provenance.reference).toBe('SIM-MERI-SIM-EVT-1042');
    expect(event.srcGeo?.label).toBe('Sim sector N-ATL-01');
    expect(event.dataOrigin).toBe('simulation');
    expect(event.verificationStatus).toBe('unverified');
  });

  it('never invents geography from invalid coordinates', () => {
    const event = toThreatEvent(apiEvent);
    expect(event.dstGeo).toBeNull();
  });

  it('derives a coordinate label only from reported coordinates', () => {
    const event = toThreatEvent({
      ...apiEvent,
      src_location: { ...apiEvent.src_location!, label: null },
    });
    expect(event.srcGeo?.label).toBe('40.41, -73.94');
    expect(event.dstGeo).toBeNull();
  });
});

describe('toThreatSource', () => {
  it('carries nullable trust fields without inventing values', () => {
    const source = toThreatSource({
      id: 's-1',
      name: 'Source One',
      kind: 'osint',
      reliability: null,
      trust_score: null,
      url: null,
      event_count: 4,
    });
    expect(source.trustScore).toBeNull();
    expect(source.reliability).toBeNull();
    expect(source.eventCount).toBe(4);
  });
});

describe('fetchEvents', () => {
  const emptyPage = {
    items: [],
    page: 1,
    page_size: 100,
    total: 0,
    pages: 0,
    has_next: false,
    sort: 'newest',
  };

  it('sends validated, repeated query parameters', async () => {
    let requestedUrl = '';
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return jsonResponse(emptyPage);
    });
    vi.stubGlobal('fetch', mock);

    await fetchEvents({
      severity: ['high', 'critical'],
      eventType: ['scanning'],
      source: ['meridian-honeynet'],
      dataOrigin: ['simulation'],
      q: '  beacon  ',
      startTime: '2026-10-19T00:00:00Z',
      endTime: '2026-10-20T00:00:00Z',
      page: 2,
      pageSize: 25,
      sort: 'oldest',
    });

    const url = new URL(requestedUrl);
    expect(url.origin + url.pathname).toBe(`${ORBITAL_API_BASE_URL}/api/v1/events`);
    expect(url.searchParams.getAll('severity')).toEqual(['high', 'critical']);
    expect(url.searchParams.getAll('event_type')).toEqual(['scanning']);
    expect(url.searchParams.get('source')).toBe('meridian-honeynet');
    expect(url.searchParams.get('data_origin')).toBe('simulation');
    expect(url.searchParams.get('q')).toBe('beacon');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('page_size')).toBe('25');
    expect(url.searchParams.get('sort')).toBe('oldest');
  });

  it('surfaces backend error envelopes as ApiError', async () => {
    const mock = vi.fn(async () =>
      jsonResponse(
        { error: { code: 'validation_error', message: 'Request validation failed.' } },
        422,
        { 'X-Request-ID': 'req-123' }
      )
    );
    vi.stubGlobal('fetch', mock);

    const error = await fetchEvents({ page: 0 }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('validation_error');
    expect(error.status).toBe(422);
    expect(error.requestId).toBe('req-123');
  });

  it('reports network failures with a stable code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const error = await fetchEvents().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('network_error');
    expect(error.status).toBeNull();
  });

  it('times out instead of hanging forever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      )
    );
    const error = await fetchEvents({}, { timeoutMs: 20 }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('timeout');
  });

  it('propagates caller aborts as aborted, not network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            if (init?.signal?.aborted) {
              reject(new DOMException('Aborted', 'AbortError'));
              return;
            }
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      )
    );
    const controller = new AbortController();
    controller.abort();
    const error = await fetchEvents({}, { signal: controller.signal }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('aborted');
  });
});

describe('fetchAllEvents', () => {
  it('pages through results and reports truncation honestly', async () => {
    const pageOne = {
      items: [apiEvent],
      page: 1,
      page_size: 1,
      total: 2,
      pages: 2,
      has_next: true,
      sort: 'newest',
    };
    const pageTwo = {
      items: [{ ...apiEvent, event_id: 'SIM-EVT-1043' }],
      page: 2,
      page_size: 1,
      total: 2,
      pages: 2,
      has_next: false,
      sort: 'newest',
    };
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return jsonResponse(url.searchParams.get('page') === '1' ? pageOne : pageTwo);
    });
    vi.stubGlobal('fetch', mock);

    const result = await fetchAllEvents({ pageSize: 1 });
    expect(result.items.map((item) => item.event_id)).toEqual([
      'SIM-EVT-1042',
      'SIM-EVT-1043',
    ]);
    expect(result.total).toBe(2);
    expect(result.truncated).toBe(false);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('stops at the safety cap and marks the result truncated', async () => {
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return jsonResponse({
        items: [apiEvent],
        page: Number(url.searchParams.get('page')),
        page_size: 1,
        total: 5,
        pages: 5,
        has_next: true,
        sort: 'newest',
      });
    });
    vi.stubGlobal('fetch', mock);

    const result = await fetchAllEvents({ pageSize: 1, maxRecords: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('fails instead of looping forever on an empty page that claims a next page', async () => {
    const mock = vi.fn(async () =>
      jsonResponse({
        items: [],
        page: 1,
        page_size: 100,
        total: 10,
        pages: 2,
        has_next: true,
        sort: 'newest',
      })
    );
    vi.stubGlobal('fetch', mock);

    const error = await fetchAllEvents().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('invalid_response');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed event page payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: null, total: 'ten' })));
    const error = await fetchAllEvents().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('invalid_response');
  });
});

describe('fetchSources', () => {
  it('requests the sources endpoint', async () => {
    let requestedUrl = '';
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return jsonResponse({ items: [], total: 0 });
    });
    vi.stubGlobal('fetch', mock);
    await fetchSources();
    const url = new URL(requestedUrl);
    expect(url.origin + url.pathname).toBe(`${ORBITAL_API_BASE_URL}/api/v1/sources`);
  });
});

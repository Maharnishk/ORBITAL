/**
 * Typed ORBITAL API client.
 *
 * - Base URL comes from NEXT_PUBLIC_API_BASE_URL (browser-safe only; never put
 *   database credentials or server secrets in NEXT_PUBLIC_* variables).
 * - Requests time out instead of hanging forever.
 * - Failures raise ApiError with a stable code; callers must NOT silently fall
 *   back to synthetic data.
 */

import type {
  DataOrigin,
  EventType,
  GeoPoint,
  IndicatorType,
  LocationSource,
  Provenance,
  Severity,
  ThreatEvent,
  ThreatSource,
  VerificationStatus,
} from './types';

export const ORBITAL_API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000'
).replace(/\/+$/, '');

export const DEFAULT_API_TIMEOUT_MS = 12_000;
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_MAX_RECORDS = 1000;

export interface ApiGeoLocation {
  latitude: number;
  longitude: number;
  label: string | null;
  country_code: string | null;
  location_source: LocationSource;
}

export interface ApiEvent {
  event_id: string;
  title: string | null;
  description: string | null;
  indicator: string;
  indicator_type: IndicatorType;
  category: EventType;
  severity: Severity;
  source_id: string;
  source_name: string;
  source_reference: string | null;
  source_url: string | null;
  event_timestamp: string;
  ingested_at: string;
  first_seen: string | null;
  last_seen: string | null;
  confidence: number | null;
  location: ApiGeoLocation | null;
  src_location: ApiGeoLocation | null;
  dst_location: ApiGeoLocation | null;
  asn: string | null;
  port: number | null;
  protocol: string | null;
  tags: string[];
  data_origin: DataOrigin;
  verification_status: VerificationStatus;
  reporter: string | null;
  collection_method: string | null;
}

export interface ApiEventPage {
  items: ApiEvent[];
  page: number;
  page_size: number;
  total: number;
  pages: number;
  has_next: boolean;
  sort: 'newest' | 'oldest' | 'severity';
}

export type ApiSourceKind =
  | 'honeypot'
  | 'netflow'
  | 'osint'
  | 'sandbox'
  | 'community';

export interface ApiSource {
  id: string;
  name: string;
  kind: ApiSourceKind;
  reliability: string | null;
  trust_score: number | null;
  url: string | null;
  event_count: number;
}

export interface ApiSourceList {
  items: ApiSource[];
  total: number;
}

export interface ApiStats {
  scope: 'all_events' | 'filtered';
  filters: Record<string, unknown>;
  total_events: number;
  unique_indicators: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  by_source: { source_id: string; source_name: string; count: number }[];
  high_critical: number;
  paired_locations: number;
  single_point_locations: number;
  no_location: number;
  earliest_event_at: string | null;
  latest_event_at: string | null;
  generated_at: string;
}

export interface EventQuery {
  severity?: Severity[];
  eventType?: EventType[];
  source?: string[];
  dataOrigin?: DataOrigin[];
  q?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  pageSize?: number;
  sort?: 'newest' | 'oldest' | 'severity';
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface FetchAllEventsResult {
  items: ApiEvent[];
  total: number;
  /** True when the backend holds more records than the client safety cap. */
  truncated: boolean;
}

interface ApiErrorOptions {
  code: string;
  status: number | null;
  details?: unknown;
  requestId?: string | null;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details: unknown;
  readonly requestId: string | null;

  constructor(message: string, options: ApiErrorOptions) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    this.details = options.details ?? null;
    this.requestId = options.requestId ?? null;
  }
}

function appendParams(url: URL, params: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== '') {
          url.searchParams.append(key, String(item));
        }
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

function eventQueryParams(query: EventQuery = {}): Record<string, unknown> {
  return {
    severity: query.severity,
    event_type: query.eventType,
    source: query.source,
    data_origin: query.dataOrigin,
    q: query.q?.trim() || undefined,
    start_time: query.startTime,
    end_time: query.endTime,
    page: query.page,
    page_size: query.pageSize,
    sort: query.sort,
  };
}

async function httpError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get('X-Request-ID');
  let code = 'http_error';
  let message = `The ORBITAL API returned status ${response.status}.`;
  let details: unknown;
  try {
    const body = (await response.json()) as {
      error?: { code?: unknown; message?: unknown; details?: unknown };
    };
    const envelope = body?.error;
    if (
      envelope &&
      typeof envelope.code === 'string' &&
      typeof envelope.message === 'string'
    ) {
      code = envelope.code;
      message = envelope.message;
      details = envelope.details;
    }
  } catch {
    // Non-JSON error body: keep the generic status message.
  }
  return new ApiError(message, { code, status: response.status, details, requestId });
}

async function request<T>(
  path: string,
  params: Record<string, unknown> = {},
  options: RequestOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  let url: URL;
  try {
    url = new URL(`${ORBITAL_API_BASE_URL}${path}`);
  } catch {
    throw new ApiError(
      'NEXT_PUBLIC_API_BASE_URL is not a valid absolute URL. Set it to the API origin, for example http://localhost:8000.',
      { code: 'invalid_config', status: null }
    );
  }
  appendParams(url, params);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const externalSignal = options.signal;
  const forwardAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', forwardAbort);
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw await httpError(response);
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError('The ORBITAL API returned an invalid JSON response.', {
        code: 'invalid_response',
        status: response.status,
        requestId: response.headers.get('X-Request-ID'),
      });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (externalSignal?.aborted) {
      throw new ApiError('Request cancelled.', { code: 'aborted', status: null });
    }
    if (timedOut) {
      throw new ApiError(
        `The ORBITAL API did not respond within ${Math.round(timeoutMs / 1000)}s.`,
        { code: 'timeout', status: null }
      );
    }
    throw new ApiError(
      `Could not reach the ORBITAL API at ${ORBITAL_API_BASE_URL}. Check that the backend is running and that CORS allows this origin.`,
      { code: 'network_error', status: null }
    );
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
}

export async function fetchEvents(
  query: EventQuery = {},
  options: RequestOptions = {}
): Promise<ApiEventPage> {
  return request<ApiEventPage>('/api/v1/events', eventQueryParams(query), options);
}

export async function fetchEvent(
  eventId: string,
  options: RequestOptions = {}
): Promise<ApiEvent> {
  return request<ApiEvent>(
    `/api/v1/events/${encodeURIComponent(eventId)}`,
    {},
    options
  );
}

export async function fetchStats(
  query: Omit<EventQuery, 'page' | 'pageSize' | 'sort'> = {},
  options: RequestOptions = {}
): Promise<ApiStats> {
  return request<ApiStats>('/api/v1/stats', eventQueryParams(query), options);
}

export async function fetchSources(options: RequestOptions = {}): Promise<ApiSourceList> {
  return request<ApiSourceList>('/api/v1/sources', {}, options);
}

export interface FetchAllEventsOptions extends RequestOptions {
  query?: Omit<EventQuery, 'page' | 'pageSize'>;
  pageSize?: number;
  maxRecords?: number;
}

/**
 * Page through the event endpoint up to a safety cap.
 * `truncated` is true when the backend holds more records than were fetched,
 * so the UI can say so instead of quietly filtering a partial dataset.
 */
export async function fetchAllEvents(
  options: FetchAllEventsOptions = {}
): Promise<FetchAllEventsResult> {
  const pageSize = Math.min(
    100,
    Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE)
  );
  const maxRecords = Math.max(pageSize, options.maxRecords ?? DEFAULT_MAX_RECORDS);

  const items: ApiEvent[] = [];
  let total = 0;
  let page = 1;

  for (;;) {
    const result = await fetchEvents(
      { ...options.query, page, pageSize },
      { signal: options.signal, timeoutMs: options.timeoutMs }
    );
    if (
      !Array.isArray(result.items) ||
      !Number.isFinite(result.total) ||
      typeof result.has_next !== 'boolean'
    ) {
      throw new ApiError('The ORBITAL API returned an invalid event page.', {
        code: 'invalid_response',
        status: null,
      });
    }
    total = result.total;
    items.push(...result.items);
    if (!result.has_next) {
      return { items, total, truncated: false };
    }
    if (items.length >= maxRecords) {
      return { items, total, truncated: total > items.length };
    }
    // A broken upstream that reports has_next without returning a row would
    // otherwise keep this loop fetching forever.
    if (result.items.length === 0) {
      throw new ApiError('The ORBITAL API reported more pages but returned no records.', {
        code: 'invalid_response',
        status: null,
      });
    }
    page += 1;
  }
}

const LOCATION_SOURCES: readonly LocationSource[] = [
  'resolved',
  'reported',
  'inferred',
  'unknown',
];

function toLocationSource(value: string): LocationSource {
  return (LOCATION_SOURCES as readonly string[]).includes(value)
    ? (value as LocationSource)
    : 'unknown';
}

function toGeo(location: ApiGeoLocation | null): GeoPoint | null {
  if (!location) return null;
  const { latitude: lat, longitude: lon } = location;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {
    lat,
    lon,
    // Label fallback is derived from the reported coordinates, never invented.
    label: location.label ?? `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    countryCode: location.country_code ?? '--',
    locationSource: toLocationSource(location.location_source),
  };
}

export function toThreatEvent(api: ApiEvent): ThreatEvent {
  const provenance: Provenance = {
    reporter: api.reporter,
    collectionMethod: api.collection_method,
    firstSeen: api.first_seen,
    lastSeen: api.last_seen,
    reference: api.source_reference,
  };
  return {
    id: api.event_id,
    title: api.title ?? 'Untitled event',
    description: api.description ?? '',
    indicator: api.indicator,
    indicatorType: api.indicator_type,
    severity: api.severity,
    type: api.category,
    sourceId: api.source_id,
    sourceUrl: api.source_url,
    timestamp: api.event_timestamp,
    ingestedAt: api.ingested_at,
    confidence: api.confidence,
    srcGeo: toGeo(api.src_location),
    dstGeo: toGeo(api.dst_location),
    asn: api.asn,
    port: api.port,
    protocol: api.protocol,
    tags: api.tags ?? [],
    provenance,
    dataOrigin: api.data_origin,
    verificationStatus: api.verification_status,
  };
}

export function toThreatSource(api: ApiSource): ThreatSource {
  return {
    id: api.id,
    name: api.name,
    kind: api.kind,
    reliability: api.reliability,
    trustScore: api.trust_score,
    url: api.url,
    eventCount: api.event_count,
  };
}

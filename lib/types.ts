export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type EventType =
  | 'malware-c2'
  | 'phishing'
  | 'scanning'
  | 'brute-force'
  | 'data-exfil'
  | 'dns-tunneling'
  | 'botnet'
  | 'vulnerability';

export type IndicatorType = 'ipv4' | 'domain' | 'url' | 'hash' | 'asn';

export type LocationSource = 'resolved' | 'reported' | 'inferred' | 'unknown';

export type DataOrigin = 'simulation' | 'public-intel' | 'observed';

export type VerificationStatus = 'unverified' | 'under-review' | 'verified' | 'false-positive';

export interface GeoPoint {
  lat: number;
  lon: number;
  label: string;
  countryCode: string;
  locationSource: LocationSource;
}

export interface ThreatSource {
  id: string;
  name: string;
  kind: 'honeypot' | 'netflow' | 'osint' | 'sandbox' | 'community';
  reliability: string;
  trustScore: number;
  url: string | null;
  eventCount?: number;
}

export interface Provenance {
  reporter: string;
  collectionMethod: string;
  firstSeen: string;
  lastSeen: string;
  reference: string;
}

export interface ThreatEvent {
  id: string;
  title: string;
  description: string;
  indicator: string;
  indicatorType: IndicatorType;
  severity: Severity;
  /** Event category (e.g. phishing, scanning). Displayed as "event type" in filters. */
  type: EventType;
  sourceId: string;
  /** Original source reference URL when provided by the source; null when unavailable. */
  sourceUrl: string | null;
  /** When the source reports the activity occurred. ISO 8601 UTC. */
  timestamp: string;
  /** When ORBITAL ingested the record. ISO 8601 UTC. */
  ingestedAt: string;
  confidence: number | null; // 0-100 or null when unavailable
  srcGeo: GeoPoint | null;
  dstGeo: GeoPoint | null;
  asn: string | null;
  port: number | null;
  protocol: string | null;
  tags: string[];
  provenance: Provenance;
  /** Where this record came from. All seeded records are 'simulation'. */
  dataOrigin: DataOrigin;
  /** Verification state. Simulated records are never verified. */
  verificationStatus: VerificationStatus;
}

export type TimeRangeKey = '1h' | '6h' | '24h' | '7d' | 'all' | 'custom';

export interface FilterState {
  severities: Set<Severity>;
  types: Set<EventType>;
  sources: Set<string>;
  timeRange: TimeRangeKey;
  /** ISO strings; only applied when timeRange === 'custom'. Null = unbounded. */
  customStart: string | null;
  customEnd: string | null;
  query: string;
}

export const SEVERITIES: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Informational',
};

export const DATA_ORIGIN_LABELS: Record<DataOrigin, string> = {
  simulation: 'Simulation (synthetic exercise data)',
  'public-intel': 'Public threat intelligence',
  observed: 'Observed telemetry',
};

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  unverified: 'Unverified — reported indicator, not a confirmed attack',
  'under-review': 'Under review',
  verified: 'Verified',
  'false-positive': 'False positive',
};

export const EVENT_TYPES: { key: EventType; label: string }[] = [
  { key: 'malware-c2', label: 'Malware C2' },
  { key: 'phishing', label: 'Phishing' },
  { key: 'scanning', label: 'Scanning' },
  { key: 'brute-force', label: 'Brute force' },
  { key: 'data-exfil', label: 'Data exfil' },
  { key: 'dns-tunneling', label: 'DNS tunneling' },
  { key: 'botnet', label: 'Botnet' },
  { key: 'vulnerability', label: 'Vulnerability' },
];

export const TIME_RANGES: { key: TimeRangeKey; label: string; hours: number | null }[] = [
  { key: '1h', label: '1H', hours: 1 },
  { key: '6h', label: '6H', hours: 6 },
  { key: '24h', label: '24H', hours: 24 },
  { key: '7d', label: '7D', hours: 168 },
  { key: 'all', label: 'All', hours: null },
  { key: 'custom', label: 'Custom', hours: null },
];

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
  type: EventType;
  sourceId: string;
  timestamp: string; // ISO
  confidence: number | null; // 0-100 or null when unavailable
  srcGeo: GeoPoint | null;
  dstGeo: GeoPoint | null;
  asn: string | null;
  port: number | null;
  protocol: string | null;
  tags: string[];
  provenance: Provenance;
}

export type TimeRangeKey = '1h' | '6h' | '24h' | '7d' | 'all';

export interface FilterState {
  severities: Set<Severity>;
  types: Set<EventType>;
  sources: Set<string>;
  timeRange: TimeRangeKey;
  query: string;
}

export const SEVERITIES: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

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
];

import type { EventType, GeoPoint, Severity, ThreatEvent, ThreatSource } from './types';

/**
 * Deterministic synthetic dataset for Milestone 1.
 * - Uses a seeded PRNG (mulberry32) so builds are reproducible.
 * - Uses only RESERVED example addresses (RFC 5737 / RFC 1918) and
 *   example domains. Never real victim infrastructure.
 * - Coordinates are fictional / jittered and marked SIMULATED in the UI.
 * - No attack routes are inferred from IPs alone; arcs only render when
 *   both srcGeo and dstGeo are explicitly present on the event.
 */

// Fixed "now" anchor derived at module load, quantized to the hour so
// server/client renders stay consistent within a session.
export const DATA_ANCHOR = (() => {
  const n = new Date();
  n.setMinutes(0, 0, 0);
  return n.getTime();
})();

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SOURCES: ThreatSource[] = [
  { id: 'meridian-honeynet', name: 'Meridian Honeynet', kind: 'honeypot', reliability: 'A', trustScore: 92, url: null },
  { id: 'backbone-netflow', name: 'Backbone NetFlow Agg.', kind: 'netflow', reliability: 'B', trustScore: 84, url: null },
  { id: 'openphish-collective', name: 'OpenPhish Collective', kind: 'osint', reliability: 'C', trustScore: 71, url: null },
  { id: 'sandbox-queue', name: 'Sandbox Detonation Q.', kind: 'sandbox', reliability: 'A', trustScore: 95, url: null },
  { id: 'community-blocklist', name: 'Community Blocklist', kind: 'community', reliability: 'D', trustScore: 58, url: null },
];

// Fictional sensor / target sites. Coordinates are intentionally offset
// from real cities and labelled as simulated sectors.
const SITES: (GeoPoint & { sector: string })[] = [
  { sector: 'N-ATL-01', label: 'Sim sector N-ATL-01 · 40.4N 73.9W', lat: 40.41, lon: -73.94, countryCode: 'XX', locationSource: 'reported' },
  { sector: 'E-EUR-02', label: 'Sim sector E-EUR-02 · 52.3N 4.7E', lat: 52.31, lon: 4.72, countryCode: 'XX', locationSource: 'reported' },
  { sector: 'W-PAC-03', label: 'Sim sector W-PAC-03 · 35.4N 139.5E', lat: 35.42, lon: 139.51, countryCode: 'XX', locationSource: 'inferred' },
  { sector: 'S-ATL-04', label: 'Sim sector S-ATL-04 · 23.7S 46.5W', lat: -23.71, lon: -46.52, countryCode: 'XX', locationSource: 'inferred' },
  { sector: 'C-AFR-05', label: 'Sim sector C-AFR-05 · 6.4N 3.2E', lat: 6.41, lon: 3.22, countryCode: 'XX', locationSource: 'resolved' },
  { sector: 'GULF-06', label: 'Sim sector GULF-06 · 25.1N 55.2E', lat: 25.12, lon: 55.21, countryCode: 'XX', locationSource: 'resolved' },
  { sector: 'S-PAC-07', label: 'Sim sector S-PAC-07 · 33.8S 151.1E', lat: -33.81, lon: 151.12, countryCode: 'XX', locationSource: 'reported' },
  { sector: 'N-AME-08', label: 'Sim sector N-AME-08 · 37.5N 122.3W', lat: 37.51, lon: -122.31, countryCode: 'XX', locationSource: 'resolved' },
  { sector: 'N-EUR-09', label: 'Sim sector N-EUR-09 · 59.9N 10.6E', lat: 59.91, lon: 10.62, countryCode: 'XX', locationSource: 'inferred' },
  { sector: 'S-ASI-10', label: 'Sim sector S-ASI-10 · 1.29N 103.8E', lat: 1.29, lon: 103.81, countryCode: 'XX', locationSource: 'reported' },
  { sector: 'E-ASI-11', label: 'Sim sector E-ASI-11 · 22.19N 114.16E', lat: 22.19, lon: 114.16, countryCode: 'XX', locationSource: 'unknown' },
  { sector: 'W-EUR-12', label: 'Sim sector W-EUR-12 · 48.8N 2.3E', lat: 48.81, lon: 2.31, countryCode: 'XX', locationSource: 'resolved' },
];

const TITLES: Record<EventType, string[]> = {
  'malware-c2': ['Beaconing pattern matches known C2 cadence', 'TLS fingerprint reuse across simulated hosts'],
  'phishing': ['Lookalike domain reported by collective feed', 'Credential-harvest kit fingerprint observed'],
  'scanning': ['Horizontal sweep across simulated netblock', 'Slowloris-style probe from reserved range'],
  'brute-force': ['Password-spray burst against SSH tarpit', 'Credential-stuffing wave on auth honeypot'],
  'data-exfil': ['Anomalous egress volume to unrated host', 'Chunked upload over HTTPS to sinkhole'],
  'dns-tunneling': ['High-entropy DNS labels suggest tunneling test', 'TXT record polling above baseline'],
  'botnet': ['IRC rendezvous chatter in sandbox trace', 'DGA-like domain burst in DNS logs'],
  'vulnerability': ['Mass probe for CVE-2024-XXXX pattern', 'Exploit-kit probe blocked at edge sensor'],
};

const DESCRIPTIONS: Record<EventType, string> = {
  'malware-c2': 'Simulated beacon with fixed jitter. Treat as exercise data only — no attribution implied.',
  'phishing': 'Simulated lure submitted by research feed. URLs use example.* domains and are inert.',
  'scanning': 'Simulated sweep recorded by honeynet tarpits. Source is a documentation-range address.',
  'brute-force': 'Simulated authentication pressure against a decoy service. No production system involved.',
  'data-exfil': 'Simulated egress shape replayed from a lab capture. Volumes are synthetic.',
  'dns-tunneling': 'Simulated DNS shape generated for detector tuning. Labels are random test strings.',
  'botnet': 'Simulated rendezvous pattern stitched from lab traces. No infected hosts implied.',
  'vulnerability': 'Simulated probe matching a research signature. Payloads are inert canaries.',
};

const EVENT_TYPE_KEYS: EventType[] = [
  'malware-c2', 'phishing', 'scanning', 'brute-force',
  'data-exfil', 'dns-tunneling', 'botnet', 'vulnerability',
];

function reservedIp(rand: () => number): string {
  const blocks = ['192.0.2', '198.51.100', '203.0.113'];
  const b = blocks[Math.floor(rand() * blocks.length)];
  return `${b}.${Math.floor(rand() * 250) + 2}`;
}

function exampleDomain(rand: () => number, i: number): string {
  const subs = ['invoice', 'secure', 'login', 'update', 'cdn', 'auth', 'billing', 'portal'];
  return `${subs[Math.floor(rand() * subs.length)]}-${i}.example.com`;
}

export function buildEvents(): ThreatEvent[] {
  const rand = mulberry32(20261014);
  const events: ThreatEvent[] = [];
  const N = 72;

  for (let i = 0; i < N; i++) {
    const type = EVENT_TYPE_KEYS[Math.floor(rand() * EVENT_TYPE_KEYS.length)];
    const source = SOURCES[Math.floor(rand() * SOURCES.length)];
    // Recency-weighted: more events in last 24h
    const skew = Math.pow(rand(), 1.6);
    const ageHours = skew * 168; // 0..7d
    const ts = new Date(DATA_ANCHOR - ageHours * 3600_000);

    const sevRoll = rand();
    const severity: Severity =
      sevRoll > 0.93 ? 'critical' : sevRoll > 0.74 ? 'high' : sevRoll > 0.5 ? 'medium' : sevRoll > 0.28 ? 'low' : 'info';

    const isIp = rand() > 0.38;
    const indicator = isIp ? reservedIp(rand) : exampleDomain(rand, i);
    const indicatorType = isIp ? 'ipv4' : 'domain';

    const srcSite = SITES[Math.floor(rand() * SITES.length)];
    // ~55% of events carry both endpoints -> arcs render. Remainder are
    // single-point observations (dst-only) or unknown geography.
    const geoRoll = rand();
    let srcGeo: GeoPoint | null = null;
    let dstGeo: GeoPoint | null = null;
    if (geoRoll > 0.45) {
      let dstSite = SITES[Math.floor(rand() * SITES.length)];
      if (dstSite.sector === srcSite.sector) dstSite = SITES[(SITES.indexOf(srcSite) + 4) % SITES.length];
      srcGeo = { ...srcSite };
      dstGeo = { ...dstSite };
    } else if (geoRoll > 0.18) {
      dstGeo = { ...srcSite };
    }

    const titles = TITLES[type];
    const title = titles[Math.floor(rand() * titles.length)];
    const confidence = rand() > 0.14 ? Math.round(52 + rand() * 46) : null;
    const portRoll = rand();
    const port = type === 'scanning' || type === 'brute-force' ? [22, 23, 80, 443, 3389][Math.floor(rand() * 5)] : portRoll > 0.6 ? 443 : null;

    const id = `EVT-${String(1042 + i).padStart(4, '0')}`;
    // Ingestion lags observation by a few minutes (simulated pipeline delay).
    const ingestedAt = new Date(ts.getTime() + (2 + Math.floor(rand() * 9)) * 60_000).toISOString();
    events.push({
      id,
      title,
      description: DESCRIPTIONS[type],
      indicator,
      indicatorType,
      severity,
      type,
      sourceId: source.id,
      // No upstream reference URL is provided by the synthetic generators;
      // represent as null rather than inventing one.
      sourceUrl: null,
      timestamp: ts.toISOString(),
      ingestedAt,
      confidence,
      srcGeo,
      dstGeo,
      asn: isIp ? `AS6451${Math.floor(rand() * 9)}` : null,
      port,
      protocol: port === 443 ? 'tcp/443' : port ? `tcp/${port}` : type === 'dns-tunneling' ? 'udp/53' : null,
      tags: [type, severity, source.kind],
      provenance: {
        reporter: source.name,
        collectionMethod: { honeypot: 'tarpit + pcap', netflow: 'sampled flow v9', osint: 'community submission', sandbox: 'detonation trace', community: 'blocklist mirror' }[source.kind],
        firstSeen: new Date(ts.getTime() - Math.floor(rand() * 5) * 3600_000).toISOString(),
        lastSeen: ts.toISOString(),
        reference: `SIM-${source.id.toUpperCase().slice(0, 4)}-${id}`,
      },
      dataOrigin: 'simulation',
      verificationStatus: 'unverified',
    });
  }

  return events.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
}

export const EVENTS: ThreatEvent[] = buildEvents();

export function sourceById(id: string): ThreatSource {
  return SOURCES.find((s) => s.id === id) ?? SOURCES[0];
}

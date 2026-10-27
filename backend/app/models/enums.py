"""Canonical enum values shared by models, schemas, and services."""

from enum import Enum


class Severity(str, Enum):
    info = "info"
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


SEVERITY_ORDER: dict[Severity, int] = {
    Severity.info: 0,
    Severity.low: 1,
    Severity.medium: 2,
    Severity.high: 3,
    Severity.critical: 4,
}


class EventCategory(str, Enum):
    malware_c2 = "malware-c2"
    phishing = "phishing"
    scanning = "scanning"
    brute_force = "brute-force"
    data_exfil = "data-exfil"
    dns_tunneling = "dns-tunneling"
    botnet = "botnet"
    vulnerability = "vulnerability"


class IndicatorType(str, Enum):
    ipv4 = "ipv4"
    domain = "domain"
    url = "url"
    hash = "hash"
    asn = "asn"


class LocationSource(str, Enum):
    resolved = "resolved"
    reported = "reported"
    inferred = "inferred"
    unknown = "unknown"


class DataOrigin(str, Enum):
    simulation = "simulation"
    public_intel = "public-intel"
    observed = "observed"


class VerificationStatus(str, Enum):
    unverified = "unverified"
    under_review = "under-review"
    verified = "verified"
    false_positive = "false-positive"


class SourceKind(str, Enum):
    honeypot = "honeypot"
    netflow = "netflow"
    osint = "osint"
    sandbox = "sandbox"
    community = "community"


class SortOrder(str, Enum):
    newest = "newest"
    oldest = "oldest"
    severity = "severity"

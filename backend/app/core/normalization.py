"""Input normalization and dedupe-key helpers.

These functions are deliberately pure so ingestion rules can be tested without
a database. They never invent data: invalid indicators raise ValueError.
"""

import hashlib
import ipaddress
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

from app.models.enums import IndicatorType

_ASN_RE = re.compile(r"^AS[0-9]{1,10}$", re.IGNORECASE)
_DOMAIN_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_HEX_RE = re.compile(r"^[0-9a-f]+$")
_HASH_LENGTHS = frozenset({32, 40, 64})


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamp must include a UTC offset")
    return value.astimezone(timezone.utc)


def normalize_indicator(indicator_type: IndicatorType, value: str) -> str:
    raw = value.strip()
    if not raw:
        raise ValueError("indicator must not be empty")

    if indicator_type is IndicatorType.ipv4:
        try:
            return str(ipaddress.IPv4Address(raw))
        except ipaddress.AddressValueError as exc:
            raise ValueError("indicator is not a valid IPv4 address") from exc

    if indicator_type is IndicatorType.domain:
        host = raw.rstrip(".").lower()
        if not host:
            raise ValueError("domain must not be empty")
        try:
            host = host.encode("idna").decode("ascii")
        except UnicodeError as exc:
            raise ValueError("domain is not valid IDNA") from exc
        if len(host) > 253:
            raise ValueError("domain exceeds 253 characters")
        labels = host.split(".")
        if len(labels) < 2:
            raise ValueError("domain must contain at least two labels")
        for label in labels:
            if not label or not _DOMAIN_LABEL_RE.fullmatch(label):
                raise ValueError("domain contains an invalid label")
        return host

    if indicator_type is IndicatorType.url:
        parts = urlsplit(raw)
        scheme = parts.scheme.lower()
        if scheme not in {"http", "https"}:
            raise ValueError("URL indicator must use http or https")
        if not parts.hostname:
            raise ValueError("URL indicator must include a host")
        if parts.username or parts.password:
            raise ValueError("URL indicators must not embed credentials")
        host = parts.hostname.lower()
        netloc = host
        if parts.port is not None:
            netloc = f"{host}:{parts.port}"
        return urlunsplit((scheme, netloc, parts.path, parts.query, parts.fragment))

    if indicator_type is IndicatorType.hash:
        digest = raw.lower()
        if len(digest) not in _HASH_LENGTHS or not _HEX_RE.fullmatch(digest):
            raise ValueError("hash must be a hex MD5, SHA-1, or SHA-256 digest")
        return digest

    if indicator_type is IndicatorType.asn:
        asn = raw.upper()
        if not _ASN_RE.fullmatch(asn):
            raise ValueError("ASN indicator must look like AS12345")
        return asn

    raise ValueError("unsupported indicator type")


def normalize_http_url(value: str) -> str:
    raw = value.strip()
    parts = urlsplit(raw)
    scheme = parts.scheme.lower()
    if scheme not in {"http", "https"}:
        raise ValueError("source_url must use http or https")
    if not parts.hostname:
        raise ValueError("source_url must include a host")
    if parts.username or parts.password:
        raise ValueError("source_url must not embed credentials")
    host = parts.hostname.lower()
    netloc = host
    if parts.port is not None:
        netloc = f"{host}:{parts.port}"
    return urlunsplit((scheme, netloc, parts.path, parts.query, parts.fragment))


def normalize_tags(tags: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        clean = tag.strip()
        if not clean:
            continue
        if len(clean) > 64:
            raise ValueError("each tag must be 64 characters or fewer")
        key = clean.lower()
        if key not in seen:
            seen.add(key)
            normalized.append(clean)
    if len(normalized) > 50:
        raise ValueError("at most 50 tags are allowed")
    return normalized


def compute_fingerprint(
    source_id: str,
    indicator_type: IndicatorType,
    indicator: str,
    event_timestamp: datetime,
) -> str:
    timestamp = as_utc(event_timestamp).isoformat()
    material = "|".join(
        [source_id, indicator_type.value, indicator.lower(), timestamp]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()

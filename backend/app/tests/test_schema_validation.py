"""Pydantic ingestion validation and normalization tests."""

from datetime import timezone

import pytest
from pydantic import ValidationError

from app.schemas.ingestion import EventIngest
from app.tests.helpers import event_payload


def valid_payload() -> dict:
    return event_payload(event_id="EVT-SCHEMA-1")


def test_domain_is_lowercased_and_trimmed() -> None:
    payload = valid_payload()
    payload["indicator_type"] = "domain"
    payload["indicator"] = "  LOGIN-1.Example.COM.  "
    record = EventIngest.model_validate(payload)
    assert record.indicator == "login-1.example.com"


def test_url_host_and_scheme_are_normalized() -> None:
    payload = valid_payload()
    payload["indicator_type"] = "url"
    payload["indicator"] = "HTTPS://Example.COM/Path?A=1"
    record = EventIngest.model_validate(payload)
    assert record.indicator == "https://example.com/Path?A=1"


def test_hash_and_asn_normalization() -> None:
    payload = valid_payload()
    payload["indicator_type"] = "hash"
    payload["indicator"] = "A" * 64
    assert EventIngest.model_validate(payload).indicator == "a" * 64

    payload = valid_payload()
    payload["indicator_type"] = "asn"
    payload["indicator"] = "as64512"
    assert EventIngest.model_validate(payload).indicator == "AS64512"


def test_timestamps_are_converted_to_utc() -> None:
    payload = valid_payload()
    payload["event_timestamp"] = "2026-10-19T14:00:00+02:00"
    record = EventIngest.model_validate(payload)
    assert record.event_timestamp.tzinfo is not None
    assert record.event_timestamp.astimezone(timezone.utc).hour == 12
    assert record.event_timestamp.utcoffset().total_seconds() == 0


def test_naive_timestamp_is_rejected() -> None:
    payload = valid_payload()
    payload["event_timestamp"] = "2026-10-19T12:00:00"
    with pytest.raises(ValidationError, match="UTC offset"):
        EventIngest.model_validate(payload)


def test_invalid_ipv4_is_rejected() -> None:
    payload = valid_payload()
    payload["indicator"] = "192.0.2.999"
    with pytest.raises(ValidationError, match="valid IPv4"):
        EventIngest.model_validate(payload)


def test_invalid_domain_is_rejected() -> None:
    payload = valid_payload()
    payload["indicator_type"] = "domain"
    payload["indicator"] = "bad_label.example.com"
    with pytest.raises(ValidationError, match="invalid label"):
        EventIngest.model_validate(payload)


def test_confidence_and_geo_ranges_are_enforced() -> None:
    payload = valid_payload()
    payload["confidence"] = 101
    with pytest.raises(ValidationError):
        EventIngest.model_validate(payload)

    payload = valid_payload()
    payload["location"] = {
        "latitude": 91,
        "longitude": 0,
        "label": "bad",
        "country_code": "XX",
        "location_source": "unknown",
    }
    with pytest.raises(ValidationError):
        EventIngest.model_validate(payload)


def test_first_seen_must_not_follow_last_seen() -> None:
    payload = valid_payload()
    payload["first_seen"] = "2026-10-19T12:00:00Z"
    payload["last_seen"] = "2026-10-19T10:00:00Z"
    with pytest.raises(ValidationError, match="first_seen"):
        EventIngest.model_validate(payload)


def test_simulation_cannot_be_verified() -> None:
    payload = valid_payload()
    payload["data_origin"] = "simulation"
    payload["verification_status"] = "verified"
    with pytest.raises(ValidationError, match="simulation records"):
        EventIngest.model_validate(payload)


def test_unknown_fields_and_bad_schemas_are_rejected() -> None:
    payload = valid_payload()
    payload["unexpected"] = "value"
    with pytest.raises(ValidationError, match="Extra inputs"):
        EventIngest.model_validate(payload)

    payload = valid_payload()
    payload["severity"] = "catastrophic"
    with pytest.raises(ValidationError):
        EventIngest.model_validate(payload)


def test_source_url_credentials_are_rejected() -> None:
    payload = valid_payload()
    payload["source_url"] = "https://user:password@example.com/report"
    with pytest.raises(ValidationError, match="must not embed credentials"):
        EventIngest.model_validate(payload)


def test_tags_are_trimmed_and_deduplicated() -> None:
    payload = valid_payload()
    payload["tags"] = [" alpha ", "ALPHA", "", "beta"]
    record = EventIngest.model_validate(payload)
    assert record.tags == ["alpha", "beta"]


def test_source_metadata_must_be_json_serializable() -> None:
    payload = valid_payload()
    payload["source_metadata"] = {"bad": object()}
    with pytest.raises(ValidationError, match="JSON-serializable"):
        EventIngest.model_validate(payload)

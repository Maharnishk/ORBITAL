"""Event list/detail API behavior."""

from datetime import timedelta

import pytest


def ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["event_id"] for item in response.json()["items"]]


def test_list_returns_deterministic_newest_first(client, seeded_data) -> None:
    response = client.get("/api/v1/events")
    assert ids(response) == [
        "EVT-TEST-1",
        "EVT-TEST-2",
        "EVT-TEST-3",
        "EVT-TEST-4",
        "EVT-TEST-5",
    ]
    page = response.json()
    assert page["page"] == 1
    assert page["page_size"] == 50
    assert page["total"] == 5
    assert page["pages"] == 1
    assert page["has_next"] is False
    first = page["items"][0]
    assert first["source_name"] == "Meridian Honeynet"
    assert first["category"] == "malware-c2"
    assert first["severity"] == "critical"
    assert first["src_location"]["latitude"] == 40.41
    assert first["dst_location"]["country_code"] == "XX"
    # Private ingestion metadata is not part of the public event contract.
    assert "source_metadata" not in first


def test_severity_filter_accepts_repeated_values(client, seeded_data) -> None:
    response = client.get(
        "/api/v1/events",
        params=[("severity", "critical"), ("severity", "high")],
    )
    assert ids(response) == ["EVT-TEST-1", "EVT-TEST-3", "EVT-TEST-5"]


def test_event_type_and_source_filters(client, seeded_data) -> None:
    by_type = client.get("/api/v1/events", params={"event_type": "phishing"})
    assert ids(by_type) == ["EVT-TEST-2"]

    by_source = client.get(
        "/api/v1/events", params={"source": "openphish-collective"}
    )
    assert ids(by_source) == ["EVT-TEST-2", "EVT-TEST-4"]

    combined = client.get(
        "/api/v1/events",
        params={
            "source": "meridian-honeynet",
            "severity": "critical",
        },
    )
    assert ids(combined) == ["EVT-TEST-1", "EVT-TEST-5"]


def test_data_origin_filter(client, seeded_data) -> None:
    observed = client.get("/api/v1/events", params={"data_origin": "observed"})
    assert observed.json()["total"] == 5

    simulation = client.get(
        "/api/v1/events", params={"data_origin": "simulation"}
    )
    assert simulation.json()["total"] == 0


@pytest.mark.parametrize(
    "query, expected",
    [
        ("example.com", ["EVT-TEST-2"]),
        ("meridian", ["EVT-TEST-1", "EVT-TEST-3", "EVT-TEST-5"]),
        ("scanning", ["EVT-TEST-3"]),
        ("EVT-TEST-4", ["EVT-TEST-4"]),
        ("no-such-record", []),
        ("%", []),
    ],
)
def test_search_matches_expected_fields(client, seeded_data, query, expected) -> None:
    response = client.get("/api/v1/events", params={"q": query})
    assert ids(response) == expected


def test_time_range_bounds_are_inclusive(client, seeded_data) -> None:
    now = seeded_data["now"]
    start = (now - timedelta(hours=4)).isoformat()
    end = now.isoformat()
    response = client.get(
        "/api/v1/events", params={"start_time": start, "end_time": end}
    )
    assert ids(response) == ["EVT-TEST-1", "EVT-TEST-2"]

    boundary = (now - timedelta(hours=2)).isoformat()
    response = client.get(
        "/api/v1/events", params={"start_time": boundary, "end_time": boundary}
    )
    assert ids(response) == ["EVT-TEST-2"]


def test_pagination_is_stable_and_bounded(client, seeded_data) -> None:
    page1 = client.get("/api/v1/events", params={"page_size": 2, "page": 1})
    assert ids(page1) == ["EVT-TEST-1", "EVT-TEST-2"]
    assert page1.json()["pages"] == 3
    assert page1.json()["has_next"] is True

    page3 = client.get("/api/v1/events", params={"page_size": 2, "page": 3})
    assert ids(page3) == ["EVT-TEST-5"]
    assert page3.json()["has_next"] is False

    beyond = client.get("/api/v1/events", params={"page_size": 2, "page": 99})
    assert beyond.status_code == 200
    assert beyond.json()["items"] == []
    assert beyond.json()["total"] == 5


def test_sort_orders(client, seeded_data) -> None:
    oldest = client.get("/api/v1/events", params={"sort": "oldest"})
    assert ids(oldest)[0] == "EVT-TEST-5"

    severity = client.get("/api/v1/events", params={"sort": "severity"})
    assert ids(severity) == [
        "EVT-TEST-1",
        "EVT-TEST-5",
        "EVT-TEST-3",
        "EVT-TEST-4",
        "EVT-TEST-2",
    ]


def test_detail_and_not_found(client, seeded_data) -> None:
    response = client.get("/api/v1/events/EVT-TEST-2")
    assert response.status_code == 200
    body = response.json()
    assert body["indicator"] == "login-1.example.com"
    assert body["source_reference"] == "REF-EVT-TEST-2"
    assert body["source_url"].endswith("/EVT-TEST-2")
    assert body["location"]["latitude"] == 35.42
    assert body["src_location"] is None

    missing = client.get("/api/v1/events/EVT-DOES-NOT-EXIST")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "event_not_found"
    assert "EVT-DOES-NOT-EXIST" in missing.json()["error"]["message"]


@pytest.mark.parametrize(
    "params, expected_code",
    [
        ({"page": 0}, "validation_error"),
        ({"page": 100001}, "validation_error"),
        ({"page_size": 0}, "validation_error"),
        ({"page_size": 101}, "validation_error"),
        ({"severity": "catastrophic"}, "validation_error"),
        ({"event_type": "not-a-type"}, "validation_error"),
        ({"sort": "sideways"}, "validation_error"),
        ({"start_time": "2026-10-19T12:00:00"}, "invalid_time_range"),
        (
            {
                "start_time": "2026-10-20T12:00:00Z",
                "end_time": "2026-10-19T12:00:00Z",
            },
            "invalid_time_range",
        ),
    ],
)
def test_invalid_queries_return_structured_errors(
    client, seeded_data, params, expected_code
) -> None:
    response = client.get("/api/v1/events", params=params)
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == expected_code
    assert error["message"]
    # Raw inputs are never echoed back.
    assert "input" not in error
    if "details" in error:
        for detail in error["details"]:
            assert "input" not in detail


def test_repeated_filter_values_are_capped(client, seeded_data) -> None:
    response = client.get(
        "/api/v1/events", params=[("severity", "high")] * 51
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "too_many_filter_values"

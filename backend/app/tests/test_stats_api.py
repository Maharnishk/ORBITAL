"""Statistics endpoint tests. Each count is asserted against known fixtures."""

from datetime import timedelta


def test_stats_cover_full_dataset_without_filters(client, seeded_data) -> None:
    response = client.get("/api/v1/stats")
    assert response.status_code == 200, response.text
    stats = response.json()

    assert stats["scope"] == "all_events"
    assert stats["total_events"] == 5
    assert stats["unique_indicators"] == 5
    assert stats["by_severity"] == {
        "info": 0,
        "low": 1,
        "medium": 1,
        "high": 1,
        "critical": 2,
    }
    assert stats["by_category"]["malware-c2"] == 1
    assert stats["by_category"]["phishing"] == 1
    assert stats["by_category"]["scanning"] == 1
    assert stats["by_category"]["dns-tunneling"] == 1
    assert stats["by_category"]["brute-force"] == 1
    assert stats["by_category"]["botnet"] == 0
    assert stats["high_critical"] == 3
    assert stats["paired_locations"] == 2
    assert stats["single_point_locations"] == 2
    assert stats["no_location"] == 1
    assert stats["by_source"] == [
        {
            "source_id": "meridian-honeynet",
            "source_name": "Meridian Honeynet",
            "count": 3,
        },
        {
            "source_id": "openphish-collective",
            "source_name": "OpenPhish Collective",
            "count": 2,
        },
    ]
    assert stats["earliest_event_at"] is not None
    assert stats["latest_event_at"] is not None
    assert stats["filters"]["severity"] == []


def test_stats_respect_filters_and_report_scope(client, seeded_data) -> None:
    response = client.get("/api/v1/stats", params={"severity": "critical"})
    stats = response.json()
    assert stats["scope"] == "filtered"
    assert stats["filters"]["severity"] == ["critical"]
    assert stats["total_events"] == 2
    assert stats["unique_indicators"] == 2
    assert stats["by_severity"]["critical"] == 2
    assert stats["by_severity"]["high"] == 0
    assert stats["high_critical"] == 2
    assert stats["paired_locations"] == 2
    assert stats["single_point_locations"] == 0
    assert stats["no_location"] == 0
    assert stats["by_source"][0]["count"] == 2


def test_stats_respect_search_and_time_range(client, seeded_data) -> None:
    search = client.get("/api/v1/stats", params={"q": "example.com"})
    assert search.json()["total_events"] == 1
    assert search.json()["scope"] == "filtered"

    now = seeded_data["now"]
    response = client.get(
        "/api/v1/stats",
        params={
            "start_time": (now - timedelta(hours=4)).isoformat(),
            "end_time": now.isoformat(),
        },
    )
    assert response.json()["total_events"] == 2


def test_empty_filtered_stats_are_zero_not_invented(client, seeded_data) -> None:
    response = client.get("/api/v1/stats", params={"q": "nothing-matches-this"})
    stats = response.json()
    assert stats["scope"] == "filtered"
    assert stats["total_events"] == 0
    assert stats["unique_indicators"] == 0
    assert stats["high_critical"] == 0
    assert stats["earliest_event_at"] is None
    assert stats["latest_event_at"] is None
    assert stats["by_source"] == []
    assert all(value == 0 for value in stats["by_severity"].values())
    assert all(value == 0 for value in stats["by_category"].values())

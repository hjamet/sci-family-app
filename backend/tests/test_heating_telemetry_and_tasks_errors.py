from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.security import rate_limiter
from app.services.vicare_service import calculate_fuel_telemetry
from app.services import heating_telemetry_service as hts

client = TestClient(app, raise_server_exceptions=False)


def live_payload(**overrides):
    data = {
        "room_temperature": 19.3,
        "outside_temperature": 11.2,
        "boiler_temperature": 68.5,
        "dhw_temperature": 51.8,
        "target_temperature": 21.0,
        "is_heating_active": True,
        "is_dhw_active": True,
        "burner_active": True,
        "burner_starts": 25283,
        "burner_hours": 4571,
        "mode": "dhwAndHeating",
        "active_mode": "dhwAndHeating",
    }
    data.update(overrides)
    return data


def gateway_offline():
    raise HTTPException(status_code=502, detail={"error": "Device communication error. Reason: GATEWAY_OFFLINE", "type": "PyViCareDeviceCommunicationError"})


# --- /api/tasks ---------------------------------------------------------------

def test_list_tasks_returns_created_task():
    created = client.post("/api/tasks", json={"title": "Purger les radiateurs", "description": "Presbytère", "created_by": "Henri Jamet"})
    assert created.status_code == 201, created.text
    resp = client.get("/api/tasks")
    assert resp.status_code == 200
    assert [t["title"] for t in resp.json()] == ["Purger les radiateurs"]


def test_unhandled_error_exposes_real_cause_in_detail():
    client.post("/api/tasks", json={"title": "Tâche", "description": "x", "created_by": "Henri Jamet"})
    with patch("app.main.format_task_response", side_effect=RuntimeError("colonne inattendue")):
        resp = client.get("/api/tasks")
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert "RuntimeError" in detail and "colonne inattendue" in detail and "/api/tasks" in detail


def test_rate_limit_returns_429_not_500(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_GENERAL_PER_MINUTE", "2")
    rate_limiter.general_requests.clear()
    try:
        codes = [client.get("/api/tasks").status_code for _ in range(3)]
    finally:
        rate_limiter.general_requests.clear()
    assert codes == [200, 200, 429]


# --- ViCare : persistance, déduplication, repli dernier relevé réel -----------

def test_live_reading_is_persisted_then_deduplicated():
    with patch("app.services.vicare_service.fetch_live_telemetry", return_value=live_payload()) as fetch:
        first = client.get("/api/heating/status")
        second = client.get("/api/heating/status")
    assert first.status_code == 200 and second.status_code == 200
    assert fetch.call_count == 1
    assert first.json()["is_cached_last_known"] is False
    assert second.json()["room_temperature"] == 19.3

    history = client.get("/api/heating/telemetry-history?days=1").json()["points"]
    assert len(history) == 1
    assert history[0]["outside_temperature"] == 11.2 and history[0]["burner_active"] is True


def test_gateway_offline_serves_last_known_reading():
    with patch("app.services.vicare_service.fetch_live_telemetry", return_value=live_payload()):
        client.get("/api/heating/status")
    with patch("app.services.vicare_service.fetch_live_telemetry", side_effect=gateway_offline):
        resp = client.get("/api/heating/status?refresh=true")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_cached_last_known"] is True
    assert "GATEWAY_OFFLINE" in data["live_error"]
    assert data["room_temperature"] == 19.3 and data["last_seen_at"].endswith("Z")


def test_gateway_offline_without_any_reading_fails_fast():
    with patch("app.services.vicare_service.fetch_live_telemetry", side_effect=gateway_offline):
        resp = client.get("/api/heating/status")
    assert resp.status_code == 502


def test_history_appends_on_state_change_or_after_ten_minutes():
    now = datetime(2026, 10, 23, 12, 0, 0)
    first = live_payload(burner_active=False)
    assert hts.should_append_history(None, first, now)

    class Last:
        recorded_at = now
        is_heating_active = True
        burner_active = False
        mode = "dhwAndHeating"

    assert not hts.should_append_history(Last, first, now + timedelta(minutes=5))
    assert hts.should_append_history(Last, live_payload(burner_active=True), now + timedelta(minutes=5))
    assert hts.should_append_history(Last, first, now + timedelta(minutes=10))


def test_fuel_gauge_unknown_without_real_burner_counters():
    fuel = calculate_fuel_telemetry(burner_hours=None, burner_starts=None)
    assert fuel["fuel_liters_remaining"] is None
    assert fuel["fuel_level_percent"] is None
    assert fuel["fuel_height_cm"] is None

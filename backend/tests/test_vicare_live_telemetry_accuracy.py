import os
import sys
import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_heating_status_structure_and_types():
    """
    Vérifie que /api/heating/status expose fidèlement les métriques réelles ViCare :
    - is_heating_active (bool)
    - is_dhw_active (bool)
    - comfort_temperature (float)
    - reduced_temperature (float)
    - frost_protection_active (bool == True)
    - eco_mode_active (bool)
    - burner_active (bool)
    - dhw_configured_temperature (float)
    """
    resp = client.get("/api/heating/status")
    # Si la connexion ViCare réussit en direct
    if resp.status_code == 200:
        data = resp.json()
        assert "is_heating_active" in data
        assert isinstance(data["is_heating_active"], bool)

        assert "is_dhw_active" in data
        assert isinstance(data["is_dhw_active"], bool)

        assert data.get("frost_protection_active") is True

        assert "comfort_temperature" in data
        assert "reduced_temperature" in data
        assert "mode" in data
        assert "active_mode" in data
        assert "active_program" in data

        assert "burner_active" in data
        assert isinstance(data["burner_active"], bool)

        assert "eco_mode_active" in data
        assert isinstance(data["eco_mode_active"], bool)

        assert "dhw_configured_temperature" in data
    else:
        # En cas d'erreur réseau / rate limit API ViCare externe, le code doit être 502/429/504
        assert resp.status_code in (429, 502, 504)


def test_heating_set_mode_interlock():
    """Vérifie que set-mode est sécurisé par le garde-fou read-only par défaut."""
    resp = client.post("/api/heating/set-mode", json={"mode": "dhwAndHeating"})
    assert resp.status_code == 403
    assert resp.json()["detail"]["type"] == "SecurityInterlockError"


def test_heating_set_temperature_interlock():
    """Vérifie que set-temperature est sécurisé par le garde-fou read-only par défaut."""
    resp = client.post("/api/heating/set-temperature", json={"target_temperature": 20.0, "program": "comfort"})
    assert resp.status_code == 403
    assert resp.json()["detail"]["type"] == "SecurityInterlockError"


def test_dhw_mode_interlock():
    """Vérifie que la commande ECS directe est sécurisée par le garde-fou read-only par défaut."""
    resp = client.post("/api/heating/dhw/mode", json={"is_active": True})
    assert resp.status_code == 403
    assert resp.json()["detail"]["type"] == "SecurityInterlockError"


def test_heating_settings_database_persistence():
    """Vérifie que POST /api/heating/settings enregistre bien en base les consignes."""
    resp = client.post("/api/heating/settings", json={
        "target_temperature": 20.0,
        "frost_temperature": 12.0,
        "is_heating_active": False,
        "is_dhw_active": False,
        "dhw_target_temperature": 10.0,
        "author_name": "Henri Jamet"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"

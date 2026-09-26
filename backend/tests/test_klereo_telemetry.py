import os
import sys
import pytest
from unittest.mock import patch, MagicMock

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient
from app.main import app
from app.services.klereo_service import KlereoService, decode_alert

client = TestClient(app)


def test_decode_alert_unit():
    """Vérifie le décodage dynamique unitaire des codes Klereo."""
    # 1. Alerte réelle Bidon pH (code 7, param 6)
    res_ph = decode_alert({"code": 7, "param": 6})
    assert res_ph is not None
    assert "Niveau bas / Minimum" in res_ph
    assert "Bidon pH" in res_ph

    # 2. Alerte nulle ou inactive (code 0 = 'Pas d'alerte!')
    assert decode_alert({"code": 0, "param": 0}) is None
    assert decode_alert({}) is None
    assert decode_alert(None) is None

    # 3. Autre alerte (Capteur HS sur Eau)
    res_capteur = decode_alert({"code": 1, "param": 2})
    assert res_capteur is not None
    assert "Capteur HS" in res_capteur
    assert "Eau Multicapteur" in res_capteur


@patch.object(KlereoService, "_authenticate", return_value="fake_jwt_token")
@patch("requests.get")
@patch("requests.post")
def test_pool_status_dynamic_alerts_present(mock_post, mock_get, mock_auth):
    """
    Vérifie que /api/pool/status extrait dynamiquement les alertes depuis le JSON Klereo.
    """
    # Mock GetIndex
    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "status": "ok",
            "response": [{
                "idSystem": 91360,
                "poolNickname": "Piscine Rosing",
                "Now": 1790446860,
                "lastPing": 25,
                "alerts": [{"code": 7, "param": 6}]
            }]
        }
    )

    # Mock GetPoolDetails avec sondes spécifiques (pH 7.82, Redox 745.0, Eau 29.5) et alerte Bidon pH
    mock_post.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "status": "ok",
            "response": [{
                "idSystem": 91360,
                "podinfo": {"pingFail": 0, "pingSent": 100, "pongRx": 100},
                "alerts": [{"code": 7, "param": 6}],
                "probes": [
                    {"type": 1, "filteredValue": 21.5},   # Air
                    {"type": 5, "filteredValue": 29.5},   # Eau
                    {"type": 3, "filteredValue": 7.82},   # pH
                    {"type": 4, "filteredValue": 745.0},  # Redox
                ],
                "outs": [
                    {"index": 1, "realStatus": 1},  # Filtration ON
                    {"index": 4, "realStatus": 0},  # PAC OFF
                ],
                "params": {
                    "PoolMode": 2,
                    "ConsigneEau": 12.0,
                    "RegulDuree": 18.0,
                    "Filtration_TodayTime": 36000
                }
            }]
        }
    )

    # Force bypass cache
    KlereoService.clear_cache()

    resp = client.get("/api/pool/status")
    assert resp.status_code == 200
    data = resp.json()

    # Vérification extraction dynamique
    assert data["water_temperature"] == 29.5
    assert data["air_temperature"] == 21.5
    assert data["ph_value"] == 7.82
    assert data["redox_value"] == 745.0
    assert data["frost_protection_target"] == 12.0
    assert data["radio_link_ok"] is True
    assert data["radio_error"] is False
    assert data["radio_alert"] is None  # Aucun souci radio

    # Alertes dynamiques
    assert len(data["alerts"]) == 1
    assert "Bidon pH" in data["alerts"][0]
    assert "Niveau bas / Minimum" in data["alerts"][0]


@patch.object(KlereoService, "_authenticate", return_value="fake_jwt_token")
@patch("requests.get")
@patch("requests.post")
def test_pool_status_zero_alerts_when_none_in_payload(mock_post, mock_get, mock_auth):
    """
    RÈGLE ZERO-TRUST HENRI :
    Si l'API Klereo ne renvoie aucune alerte, data['alerts'] DOIT être strictement [].
    Aucun texte simulé ou hardcodé ne doit subsister !
    """
    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "status": "ok",
            "response": [{
                "idSystem": 91360,
                "poolNickname": "Piscine Rosing",
                "Now": 1790446860,
                "lastPing": 15,
                "alerts": []  # Aucune alerte
            }]
        }
    )

    mock_post.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "status": "ok",
            "response": [{
                "idSystem": 91360,
                "podinfo": {"pingFail": 0, "pingSent": 50, "pongRx": 50},
                "alerts": [],  # Aucune alerte
                "probes": [
                    {"type": 1, "filteredValue": 18.0},
                    {"type": 5, "filteredValue": 25.0},
                    {"type": 3, "filteredValue": 7.4},
                    {"type": 4, "filteredValue": 710.0},
                ],
                "outs": [{"index": 1, "realStatus": 0}],
                "params": {"PoolMode": 2, "ConsigneEau": 10.0}
            }]
        }
    )

    KlereoService.clear_cache()

    resp = client.get("/api/pool/status")
    assert resp.status_code == 200
    data = resp.json()

    # Doit être strictement vide
    assert data["alerts"] == []
    assert data["radio_alert"] is None
    assert data["radio_error"] is False


@patch.object(KlereoService, "_authenticate", return_value="fake_jwt_token")
@patch("requests.get")
@patch("requests.post")
def test_pool_status_radio_degradation_detected(mock_post, mock_get, mock_auth):
    """
    Vérifie la détection dynamique d'une dégradation de la liaison radio 868 MHz.
    """
    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "status": "ok",
            "response": [{
                "idSystem": 91360,
                "poolNickname": "Piscine Rosing",
                "Now": 1790446860,
                "lastPing": 450,  # > 300s = dégradé
                "alerts": []
            }]
        }
    )

    mock_post.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "status": "ok",
            "response": [{
                "idSystem": 91360,
                "podinfo": {"pingFail": 5, "pingSent": 50, "pongRx": 45},  # échecs > 0
                "alerts": [],
                "probes": [],
                "outs": [],
                "params": {}
            }]
        }
    )

    KlereoService.clear_cache()

    resp = client.get("/api/pool/status")
    assert resp.status_code == 200
    data = resp.json()

    assert data["radio_link_ok"] is False
    assert data["radio_error"] is True
    assert data["radio_alert"] is not None
    assert "Liaison radio K-Link interrompue" in data["radio_alert"]


def test_pool_control_interlock_forbidden():
    """Vérifie le verrou logiciel inviolable Henri #1 (HTTP 403 Forbidden)."""
    resp_mode = client.post("/api/pool/mode")
    assert resp_mode.status_code == 403
    assert resp_mode.json()["detail"]["type"] == "SecurityInterlockError"

    resp_temp = client.post("/api/pool/temperature")
    assert resp_temp.status_code == 403
    assert resp_temp.json()["detail"]["type"] == "SecurityInterlockError"


def test_pool_status_live_real_api():
    """
    Test en direct sur l'API Klereo Connect officielle avec identifiants réels.
    Zero-Trust : valide que la télémétrie reçue est 100% vivante et sans simulation.
    """
    username = os.getenv("KLEREO_USERNAME")
    password = os.getenv("KLEREO_PASSWORD")
    if not username or not password:
        pytest.skip("Identifiants Klereo non configurés dans l'environnement")

    KlereoService.clear_cache()
    resp = client.get("/api/pool/status")
    assert resp.status_code == 200
    data = resp.json()

    # Valide les données réelles du bassin d'Henri
    assert data["system_id"] == 91360
    assert data["water_temperature"] is not None
    assert data["air_temperature"] is not None
    assert data["ph_value"] is not None
    assert data["redox_value"] is not None
    assert isinstance(data["alerts"], list)
    assert data["radio_link_ok"] is True
    assert data["radio_error"] is False
    assert data["radio_alert"] is None
    print(f"\n[LIVE TEST KLEREO] Eau: {data['water_temperature']}°C, pH: {data['ph_value']}, Redox: {data['redox_value']} mV, Alertes: {data['alerts']}")


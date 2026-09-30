import os
import sys
import pytest
from unittest.mock import patch, MagicMock

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient
from app.main import app
from app.services.klereo_service import KlereoService
from app.services.vicare_service import ViCareService

client = TestClient(app)


def test_klereo_pool_status_exposes_pump_and_heating():
    """
    Vérifie que get_pool_status() et /api/pool/status exposent clairement
    is_pump_active, is_heating_active et pac_active.
    """
    with patch.object(KlereoService, "_authenticate", return_value="fake_token"), \
         patch("requests.get") as mock_get, \
         patch("requests.post") as mock_post:

        mock_get.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "status": "ok",
                "response": [{
                    "idSystem": 91360,
                    "poolNickname": "Piscine Rosing",
                    "Now": 1790446860,
                    "lastPing": 20,
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
                    "podinfo": {"pingFail": 0, "pingSent": 100, "pongRx": 100},
                    "alerts": [],
                    "probes": [
                        {"type": 5, "filteredValue": 28.5},
                        {"type": 1, "filteredValue": 24.0},
                    ],
                    "outs": [
                        {"index": 1, "realStatus": 1},  # Pompe ON
                        {"index": 4, "realStatus": 0},  # PAC OFF
                    ],
                    "params": {"PoolMode": 2, "ConsigneEau": 12.0}
                }]
            }
        )

        # Reset simulated states
        KlereoService._simulated_pump_state = None
        KlereoService._simulated_pump_mode = None
        KlereoService._simulated_heating_state = None
        KlereoService._simulated_heating_mode = None

        resp = client.get("/api/pool/status")
        assert resp.status_code == 200
        data = resp.json()

        assert "is_pump_active" in data
        assert data["is_pump_active"] is True
        assert "is_heating_active" in data
        assert data["is_heating_active"] is False
        assert "pac_active" in data
        assert data["pac_active"] is False
        assert "pump_mode" in data
        assert "heating_mode" in data


def test_pool_pump_mode_endpoints():
    """
    Vérifie les commandes POST /api/pool/pump/mode avec mode et active
    en mode test / lecture seule sans crasher.
    """
    # 1. Mode ON
    resp_on = client.post("/api/pool/pump/mode", json={"mode": "on"})
    assert resp_on.status_code == 200
    data_on = resp_on.json()
    assert data_on["is_pump_active"] is True
    assert data_on["pump_mode"] == "on"

    # 2. Mode OFF
    resp_off = client.post("/api/pool/pump/mode", json={"mode": "off"})
    assert resp_off.status_code == 200
    data_off = resp_off.json()
    assert data_off["is_pump_active"] is False
    assert data_off["pump_mode"] == "off"

    # 3. Payload avec active: True
    resp_act_true = client.post("/api/pool/pump/mode", json={"active": True})
    assert resp_act_true.status_code == 200
    assert resp_act_true.json()["is_pump_active"] is True

    # 4. Payload avec active: False
    resp_act_false = client.post("/api/pool/pump/mode", json={"active": False})
    assert resp_act_false.status_code == 200
    assert resp_act_false.json()["is_pump_active"] is False

    # 5. Payload invalide
    resp_invalid = client.post("/api/pool/pump/mode", json={"mode": "invalid_mode"})
    assert resp_invalid.status_code == 400


def test_pool_heating_mode_endpoints():
    """
    Vérifie les commandes POST /api/pool/heating/mode avec mode et active
    en mode test / lecture seule sans crasher.
    """
    # 1. Mode ON
    resp_on = client.post("/api/pool/heating/mode", json={"mode": "on"})
    assert resp_on.status_code == 200
    data_on = resp_on.json()
    assert data_on["is_heating_active"] is True
    assert data_on["pac_active"] is True
    assert data_on["heating_mode"] == "on"
    assert "En chauffe" in data_on["pac_state"]

    # 2. Mode OFF
    resp_off = client.post("/api/pool/heating/mode", json={"mode": "off"})
    assert resp_off.status_code == 200
    data_off = resp_off.json()
    assert data_off["is_heating_active"] is False
    assert data_off["pac_active"] is False
    assert data_off["heating_mode"] == "off"
    assert "Mise en veille" in data_off["pac_state"]

    # 3. Payload avec active: True
    resp_act_true = client.post("/api/pool/heating/mode", json={"active": True})
    assert resp_act_true.status_code == 200
    assert resp_act_true.json()["is_heating_active"] is True

    # 4. Payload avec active: False
    resp_act_false = client.post("/api/pool/heating/mode", json={"active": False})
    assert resp_act_false.status_code == 200
    assert resp_act_false.json()["is_heating_active"] is False

    # 5. Payload invalide
    resp_invalid = client.post("/api/pool/heating/mode", json={"mode": "turbo_invalid"})
    assert resp_invalid.status_code == 400


def test_pool_general_interlock_preserved():
    """
    Vérifie que les endpoints génériques /api/pool/mode et /api/pool/temperature
    restent strictement protégés par le verrou logiciel 403 Forbidden.
    """
    resp_mode = client.post("/api/pool/mode")
    assert resp_mode.status_code == 403
    assert resp_mode.json()["detail"]["type"] == "SecurityInterlockError"

    resp_temp = client.post("/api/pool/temperature")
    assert resp_temp.status_code == 403
    assert resp_temp.json()["detail"]["type"] == "SecurityInterlockError"


def test_vicare_double_consigne_status_fields():
    """
    Vérifie que /api/heating/status expose dhw_comfort_temperature et dhw_reduced_temperature.
    """
    with patch("app.services.vicare_service.fetch_live_telemetry") as mock_fetch:
        mock_fetch.return_value = {
            "room_temperature": 20.5,
            "target_temperature": 20.0,
            "comfort_temperature": 20.0,
            "reduced_temperature": 15.0,
            "outside_temperature": 12.0,
            "supply_temperature": 45.0,
            "boiler_temperature": 50.0,
            "dhw_temperature": 48.0,
            "dhw_configured_temperature": 50.0,
            "dhw_target_temperature": 50.0,
            "dhw_comfort_temperature": 50.0,
            "dhw_reduced_temperature": 10.0,
            "is_heating_active": True,
            "is_dhw_active": True,
            "frost_protection_active": True,
            "eco_mode_active": False,
            "burner_active": False,
            "burner_starts": 100,
            "burner_hours": 200,
            "mode": "dhwAndHeating",
            "active_mode": "dhwAndHeating",
            "active_program": "comfort",
            "test_mode_read_only": True
        }

        resp = client.get("/api/heating/status")
        assert resp.status_code == 200
        data = resp.json()

        assert "dhw_comfort_temperature" in data
        assert data["dhw_comfort_temperature"] == 50.0
        assert "dhw_reduced_temperature" in data
        assert data["dhw_reduced_temperature"] == 10.0


def test_vicare_double_consigne_dhw_temperature_endpoint():
    """
    Vérifie que POST /api/heating/dhw/temperature accepte temperature et target (comfort/reduced).
    """
    # 1. Consigne confort
    resp_comfort = client.post("/api/heating/dhw/temperature", json={"temperature": 52.0, "target": "comfort"})
    # En mode test read-only, l'interlock 403 est attendu, et la consigne mémoire interne est mise à jour
    assert resp_comfort.status_code == 403
    assert ViCareService._dhw_comfort_temperature == 52.0

    # 2. Consigne réduite (veille à 10°C)
    resp_reduced = client.post("/api/heating/dhw/temperature", json={"temperature": 10.0, "target": "reduced"})
    assert resp_reduced.status_code == 403
    assert ViCareService._dhw_reduced_temperature == 10.0

    # 3. Payload legacy target_temperature
    resp_legacy = client.post("/api/heating/dhw/temperature", json={"target_temperature": 55.0})
    assert resp_legacy.status_code == 403
    assert ViCareService._dhw_comfort_temperature == 55.0

    # 4. Température confort invalide (> 60°C)
    resp_invalid = client.post("/api/heating/dhw/temperature", json={"temperature": 75.0, "target": "comfort"})
    assert resp_invalid.status_code == 400


def test_vicare_dhw_mode_switching_applies_comfort_and_reduced():
    """
    Vérifie que set_dhw_mode applique _dhw_comfort_temperature en marche.
    À l'arrêt, set_dhw_mode ne modifie plus la consigne (le mode circuit gère via standby).
    """
    ViCareService._dhw_comfort_temperature = 53.0
    ViCareService._dhw_reduced_temperature = 10.0

    with patch.object(ViCareService, "set_temperature") as mock_set_temp, \
         patch.object(ViCareService, "get_status") as mock_get_status:
        mock_set_temp.return_value = {"status": "ok"}
        mock_get_status.return_value = {"status": "ok"}

        # Marche -> Consigne confort (53.0°C)
        ViCareService.set_dhw_mode(True)
        mock_set_temp.assert_called_with(target_temp=53.0, program="dhw")

        # Arrêt -> applique la consigne réduite de veille (10.0°C) pour couper la charge sanitaire sur Vitotronic
        mock_set_temp.reset_mock()
        ViCareService.set_dhw_mode(False)
        mock_set_temp.assert_called_with(target_temp=10.0, program="dhw")


def test_vicare_burner_error_detection_227():
    """
    Vérifie la détection médico-légale du défaut matériel brûleur (Code 227).
    """
    from app.schemas import HeatingStatusResponse
    data = {
        "burner_error_code": 227,
        "burner_error_message": "Dérangement brûleur fioul (Code 227) : mise en sécurité d'allumage/combustion. Réarmement physique requis sur le coffret de sécurité de la chaudière.",
        "is_heating_active": False,
        "is_dhw_active": False,
    }
    resp = HeatingStatusResponse(**data)
    assert resp.burner_error_code == 227
    assert "Code 227" in resp.burner_error_message
    assert "Réarmement physique" in resp.burner_error_message


def test_klereo_pump_mode_arret_mapping():
    """
    Vérifie que les commandes 'arret', 'arrêt', 'off' de la pompe Klereo
    mappent bien vers outIdx=1, newState="0".
    """
    with patch.object(KlereoService, "is_read_only_mode", return_value=False), \
         patch.object(KlereoService, "_get_system_id", return_value="12345"), \
         patch.object(KlereoService, "_send_command") as mock_send, \
         patch.object(KlereoService, "get_pool_status", return_value={"status": "ok"}):

        # Test mode 'arret'
        KlereoService.set_pump_mode(mode="arret")
        assert mock_send.call_args[0][1]["outIdx"] == "1"
        assert mock_send.call_args[0][1]["newState"] == "0"
        assert mock_send.call_args[0][1]["poolID"] == "12345"

        # Test mode 'arrêt'
        mock_send.reset_mock()
        KlereoService.set_pump_mode(mode="arrêt")
        assert mock_send.call_args[0][1]["newState"] == "0"

        # Test mode 'off'
        mock_send.reset_mock()
        KlereoService.set_pump_mode(mode="off")
        assert mock_send.call_args[0][1]["newState"] == "0"

        # Test mode 'on'
        mock_send.reset_mock()
        KlereoService.set_pump_mode(mode="on")
        assert mock_send.call_args[0][1]["newState"] == "1"

        # Test mode 'auto'
        mock_send.reset_mock()
        KlereoService.set_pump_mode(mode="auto")
        assert mock_send.call_args[0][1]["newState"] == "2"


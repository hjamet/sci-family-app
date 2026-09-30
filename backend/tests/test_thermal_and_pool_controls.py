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
    Vérifie que set_dhw_mode applique _dhw_comfort_temperature en marche et bascule en standby à l'arrêt.
    """
    ViCareService._dhw_comfort_temperature = 53.0
    ViCareService._dhw_reduced_temperature = 10.0

    with patch.object(ViCareService, "set_temperature") as mock_set_temp, \
         patch.object(ViCareService, "set_mode") as mock_set_mode, \
         patch.object(ViCareService, "get_status") as mock_get_status:
        mock_set_temp.return_value = {"status": "ok"}
        mock_set_mode.return_value = {"status": "ok"}
        mock_get_status.return_value = {"status": "ok"}

        # Marche -> Consigne confort (53.0°C) et mode dhw
        ViCareService.set_dhw_mode(True)
        mock_set_mode.assert_called_with("dhw")
        mock_set_temp.assert_called_with(target_temp=53.0, program="dhw")

        # Arrêt -> mode standby
        mock_set_mode.reset_mock()
        ViCareService.set_dhw_mode(False)
        mock_set_mode.assert_called_with("standby")


def test_klereo_pump_mode_arret_mapping():
    """
    Vérifie que les commandes 'arret', 'arrêt', 'off' de la pompe Klereo
    mappent bien vers outIdx=1, newState="0", newMode="0", et auto vers newMode="3".
    """
    with patch.object(KlereoService, "is_read_only_mode", return_value=False), \
         patch.object(KlereoService, "_get_system_id", return_value="12345"), \
         patch.object(KlereoService, "_send_command") as mock_send, \
         patch.object(KlereoService, "get_pool_status", return_value={"status": "ok"}):

        # Test mode 'arret'
        KlereoService.set_pump_mode(mode="arret")
        assert mock_send.call_args[0][1]["outIdx"] == "1"
        assert mock_send.call_args[0][1]["newState"] == "0"
        assert mock_send.call_args[0][1]["newMode"] == "0"
        assert mock_send.call_args[0][1]["poolID"] == "12345"

        # Test mode 'arrêt'
        mock_send.reset_mock()
        KlereoService.set_pump_mode(mode="arrêt")
        assert mock_send.call_args[0][1]["newState"] == "0"
        assert mock_send.call_args[0][1]["newMode"] == "0"

        # Test mode 'off'
        mock_send.reset_mock()
        KlereoService.set_pump_mode(mode="off")
        assert mock_send.call_args[0][1]["newState"] == "0"
        assert mock_send.call_args[0][1]["newMode"] == "0"

        # Test mode 'on'
        mock_send.reset_mock()
        KlereoService.set_pump_mode(mode="on")
        assert mock_send.call_args[0][1]["newState"] == "1"
        assert mock_send.call_args[0][1]["newMode"] == "0"

        # Test mode 'auto'
        mock_send.reset_mock()
        KlereoService.set_pump_mode(mode="auto")
        assert mock_send.call_args[0][1]["newState"] == "2"
        assert mock_send.call_args[0][1]["newMode"] == "3"


def test_klereo_pac_heating_mode_newmode_mapping():
    """
    Vérifie que la PAC piscine Klereo envoie bien newMode='3' à l'activation et newMode='0' à l'arrêt.
    """
    with patch.object(KlereoService, "is_read_only_mode", return_value=False), \
         patch.object(KlereoService, "_get_system_id", return_value="12345"), \
         patch.object(KlereoService, "_send_command") as mock_send, \
         patch.object(KlereoService, "get_pool_status", return_value={"status": "ok"}):

        # Activation PAC
        KlereoService.set_heating_mode(active=True)
        set_out_call = mock_send.call_args_list[0][0][1]
        assert set_out_call["outIdx"] == "4"
        assert set_out_call["newState"] == "1"
        assert set_out_call["newMode"] == "3"

        # Arrêt PAC
        mock_send.reset_mock()
        KlereoService.set_heating_mode(active=False)
        set_out_call_off = mock_send.call_args_list[0][0][1]
        assert set_out_call_off["outIdx"] == "4"
        assert set_out_call_off["newState"] == "0"
        assert set_out_call_off["newMode"] == "0"


def test_vicare_heating_priority_over_dhw_standby():
    """
    Vérifie que l'activation du chauffage (is_heating_active=True) bascule la chaudière
    en dhwAndHeating même si l'ECS est éteinte (is_dhw_active=False).
    """
    with patch.object(ViCareService, "set_mode") as mock_set_mode, \
         patch.object(ViCareService, "set_temperature") as mock_set_temp:
        mock_set_mode.return_value = {"status": "ok"}
        mock_set_temp.return_value = {"status": "ok"}

        # 1. Chauffage actif, ECS inactive -> doit activer dhwAndHeating
        resp = client.post("/api/heating/settings", json={
            "target_temperature": 21.0,
            "is_heating_active": True,
            "is_dhw_active": False,
            "author_name": "Henri Jamet"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "dhwAndHeating"
        assert data["is_heating_active"] is True
        mock_set_mode.assert_called_with("dhwAndHeating")

        # 2. Chauffage inactif, ECS active -> doit basculer en dhw
        mock_set_mode.reset_mock()
        resp2 = client.post("/api/heating/settings", json={
            "target_temperature": 19.0,
            "is_heating_active": False,
            "is_dhw_active": True,
            "author_name": "Henri Jamet"
        })
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["mode"] == "dhw"
        assert data2["is_heating_active"] is False
        assert data2["is_dhw_active"] is True
        mock_set_mode.assert_called_with("dhw")

        # 3. Chauffage inactif, ECS inactive -> doit basculer en standby
        mock_set_mode.reset_mock()
        resp3 = client.post("/api/heating/settings", json={
            "target_temperature": 19.0,
            "is_heating_active": False,
            "is_dhw_active": False,
            "author_name": "Henri Jamet"
        })
        assert resp3.status_code == 200
        data3 = resp3.json()
        assert data3["mode"] == "standby"
        assert data3["is_heating_active"] is False
        assert data3["is_dhw_active"] is False
        mock_set_mode.assert_called_with("standby")


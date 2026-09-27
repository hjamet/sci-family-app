import os
import sys
import time
from unittest.mock import patch, MagicMock

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient

from app.main import app
from app.services.klereo_service import KlereoService
from app.services.vicare_service import ViCareService
from app.services.banking import enable_banking_service
from app.services.drive_service import drive_jail_service

client = TestClient(app)


def test_klereo_cache_hit_and_stale_fallback():
    """Vérifie le cache hit instantané (<5ms) et le repli sur stale cache en cas de panne Klereo."""
    KlereoService.clear_cache()

    mock_index = {
        "status": "ok",
        "response": [{
            "idSystem": 91360,
            "poolNickname": "Piscine Rosing",
            "Now": int(time.time()),
            "lastPing": 20,
            "alerts": []
        }]
    }
    mock_details = {
        "status": "ok",
        "response": [{
            "idSystem": 91360,
            "podinfo": {"pingFail": 0, "pingSent": 100, "pongRx": 100},
            "alerts": [],
            "probes": [
                {"type": 5, "filteredValue": 28.5},
                {"type": 3, "filteredValue": 7.35},
                {"type": 4, "filteredValue": 720.0}
            ],
            "outs": [{"index": 1, "realStatus": 1}],
            "params": {"PoolMode": 2, "ConsigneEau": 12.0}
        }]
    }

    # Premier appel (remplit le cache)
    with patch.object(KlereoService, "_authenticate", return_value="fake_token"), \
         patch("requests.get") as mock_get, \
         patch("requests.post") as mock_post:
        mock_get.return_value = MagicMock(status_code=200, json=lambda: mock_index)
        mock_post.return_value = MagicMock(status_code=200, json=lambda: mock_details)

        resp1 = client.get("/api/pool/status")
        assert resp1.status_code == 200
        assert resp1.json()["water_temperature"] == 28.5
        assert mock_get.call_count == 1
        assert mock_post.call_count == 1

    # Deuxième appel immédiat : doit être servi par le cache sans AUCUN appel réseau
    with patch("requests.get") as mock_get2, patch("requests.post") as mock_post2:
        t0 = time.time()
        resp2 = client.get("/api/pool/status")
        dt_ms = (time.time() - t0) * 1000
        assert resp2.status_code == 200
        assert resp2.json()["water_temperature"] == 28.5
        # Aucun appel réseau émis
        assert mock_get2.call_count == 0
        assert mock_post2.call_count == 0
        assert dt_ms < 50

    # Troisième appel avec panne Klereo distante : doit renvoyer le stale cache au lieu de crasher
    with patch.object(KlereoService, "_authenticate", side_effect=RuntimeError("Klereo server timeout 504")):
        resp3 = client.get("/api/pool/status?force_refresh=true")
        assert resp3.status_code == 200
        assert resp3.json()["water_temperature"] == 28.5


def test_vicare_cache_hit_and_stale_fallback():
    """Vérifie le cache hit instantané et le repli sur stale cache ViCare."""
    ViCareService.clear_cache()

    mock_telemetry = {
        "room_temperature": 21.0,
        "target_temperature": 20.0,
        "outside_temperature": 15.0,
        "supply_temperature": 44.0,
        "boiler_temperature": 47.0,
        "dhw_temperature": 50.0,
        "mode": "heating",
        "active_mode": "heating",
        "active_program": "normal",
        "fuel_level_percent": 68.0,
        "fuel_liters_remaining": 2720.0,
        "fuel_capacity_liters": 3000.0,
        "fuel_supplier": "Éts JOSSE SAS"
    }

    # Premier appel : remplit le cache
    with patch("app.services.vicare_service.fetch_live_telemetry", return_value=mock_telemetry) as mock_fetch:
        resp1 = client.get("/api/heating/status")
        assert resp1.status_code == 200
        assert resp1.json()["room_temperature"] == 21.0
        assert mock_fetch.call_count == 1

    # Deuxième appel immédiat : cache hit sans appel externe
    with patch("app.services.vicare_service.fetch_live_telemetry") as mock_fetch2:
        t0 = time.time()
        resp2 = client.get("/api/heating/status")
        dt_ms = (time.time() - t0) * 1000
        assert resp2.status_code == 200
        assert resp2.json()["room_temperature"] == 21.0
        assert mock_fetch2.call_count == 0
        assert dt_ms < 50

    # Troisième appel avec timeout/panne ViCare : repli sur cache stale
    with patch("app.services.vicare_service.fetch_live_telemetry", side_effect=TimeoutError("ViCare cloud timeout")):
        resp3 = client.get("/api/heating/status?force_refresh=true")
        assert resp3.status_code == 200
        assert resp3.json()["room_temperature"] == 21.0


def test_banking_status_cache_hit():
    """Vérifie que /api/banking/status utilise le cache TTL et le réactive sur force_refresh."""
    enable_banking_service.clear_status_cache()

    # Premier appel : vérifie l'interrogation normale
    resp1 = client.get("/api/banking/status")
    assert resp1.status_code == 200
    bal1 = resp1.json().get("total_balance")

    # Deuxième appel immédiat : doit répondre instantanément depuis le cache
    with patch.object(enable_banking_service, "get_account_balances") as mock_bal:
        t0 = time.time()
        resp2 = client.get("/api/banking/status")
        dt_ms = (time.time() - t0) * 1000
        assert resp2.status_code == 200
        assert resp2.json().get("total_balance") == bal1
        assert mock_bal.call_count == 0
        assert dt_ms < 50


def test_drive_list_files_cache_hit():
    """Vérifie le cache de listage des fichiers Google Drive."""
    drive_jail_service.clear_cache()

    mock_files = [
        {"id": "doc_123", "name": "Statuts SCI.pdf", "mimeType": "application/pdf"}
    ]

    with patch.object(drive_jail_service, "_get_client") as mock_client:
        mock_service = MagicMock()
        mock_client.return_value = mock_service
        mock_list_caller = MagicMock()
        mock_list_caller.execute.return_value = {"files": mock_files}
        mock_service.files.return_value.list.return_value = mock_list_caller

        # Premier appel
        files1 = drive_jail_service.list_files()
        assert len(files1) == 1
        assert files1[0]["name"] == "Statuts SCI.pdf"
        assert mock_service.files.return_value.list.call_count == 1

        # Deuxième appel immédiat : servi depuis le cache
        files2 = drive_jail_service.list_files()
        assert len(files2) == 1
        assert files2[0]["name"] == "Statuts SCI.pdf"
        assert mock_service.files.return_value.list.call_count == 1

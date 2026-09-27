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
    """Vérifie l'interrogation 100% direct-live et le Fail-Fast strict (zéro stale data, HTTP 502 en cas de panne)."""
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

    # Premier appel direct-live
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

    # Deuxième appel : interroge à nouveau en direct sans aucun cache stale
    with patch.object(KlereoService, "_authenticate", return_value="fake_token"), \
         patch("requests.get") as mock_get2, \
         patch("requests.post") as mock_post2:
        mock_get2.return_value = MagicMock(status_code=200, json=lambda: mock_index)
        mock_post2.return_value = MagicMock(status_code=200, json=lambda: mock_details)

        resp2 = client.get("/api/pool/status")
        assert resp2.status_code == 200
        assert resp2.json()["water_temperature"] == 28.5
        assert mock_get2.call_count == 1
        assert mock_post2.call_count == 1

    # Troisième appel avec panne Klereo distante : Fail-Fast strict Zero-Trust (502 Bad Gateway obligatoire)
    with patch.object(KlereoService, "_authenticate", side_effect=RuntimeError("Klereo server timeout 504")):
        resp3 = client.get("/api/pool/status")
        assert resp3.status_code == 502
        assert "Erreur de communication avec Klereo Connect" in resp3.json()["detail"]["error"]


def test_vicare_cache_hit_and_stale_fallback():
    """Vérifie l'interrogation 100% direct-live et le Fail-Fast strict ViCare (zéro faux repli par défaut)."""
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

    # Premier appel direct-live
    with patch("app.services.vicare_service.fetch_live_telemetry", return_value=mock_telemetry) as mock_fetch:
        resp1 = client.get("/api/heating/status")
        assert resp1.status_code == 200
        assert resp1.json()["room_temperature"] == 21.0
        assert mock_fetch.call_count == 1

    # Deuxième appel : interroge à nouveau en direct sans aucun cache
    with patch("app.services.vicare_service.fetch_live_telemetry", return_value=mock_telemetry) as mock_fetch2:
        resp2 = client.get("/api/heating/status")
        assert resp2.status_code == 200
        assert resp2.json()["room_temperature"] == 21.0
        assert mock_fetch2.call_count == 1

    # Troisième appel avec timeout ViCare : Fail-Fast strict 504/502 (aucun camouflage factice)
    with patch("app.services.vicare_service.fetch_live_telemetry", side_effect=TimeoutError("ViCare cloud timeout")):
        resp3 = client.get("/api/heating/status")
        assert resp3.status_code in (502, 504)
        assert "chaudière ViCare" in resp3.json()["detail"]["error"]


def test_banking_status_cache_hit():
    """Vérifie que /api/banking/status interroge en direct-live sans cache périmé."""
    from app.database import SessionLocal
    from app.models import BankAccount
    import datetime
    db = SessionLocal()
    acc = db.query(BankAccount).first()
    created_acc = False
    if not acc:
        acc = BankAccount(account_id="acc_test_live", name="Test Account", balance=100.0, last_synced_at=datetime.datetime.now())
        db.add(acc)
        db.commit()
        created_acc = True
    elif not acc.last_synced_at:
        acc.last_synced_at = datetime.datetime.now()
        db.commit()

    try:
        # Premier appel
        with patch.object(enable_banking_service, "get_account_balances") as mock_bal:
            resp1 = client.get("/api/banking/status")
            assert resp1.status_code == 200
            assert mock_bal.call_count == 1

        # Deuxième appel immédiat : ré-interroge en direct (zéro cache)
        with patch.object(enable_banking_service, "get_account_balances") as mock_bal2:
            resp2 = client.get("/api/banking/status")
            assert resp2.status_code == 200
            assert mock_bal2.call_count == 1
    finally:
        if created_acc:
            db.delete(acc)
            db.commit()
        db.close()


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

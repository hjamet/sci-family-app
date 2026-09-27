import os
import sys
import pytest
from unittest.mock import patch, MagicMock

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient
from app.main import app
from app.services.klereo_service import KlereoService

client = TestClient(app)


@patch.object(KlereoService, "_authenticate", return_value="fake_jwt_token")
@patch("requests.get")
@patch("requests.post")
def test_klereo_radio_resilience_recent_ping_with_historical_fails(mock_post, mock_get, mock_auth):
    """
    Validation Annotation 7 :
    Quand le dernier ping radio est récent (ex: 6s ou 18s < 120s) malgré un compteur
    historique cumulé pingFail > 0 (ex: 110 échecs passés résolus physiquement),
    la liaison radio est déclarée active (radio_link_ok = True, radio_error = False,
    radio_alert = None) et status.alerts ne contient aucune alerte de rupture radio.
    """
    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "status": "ok",
            "response": [{
                "idSystem": 91360,
                "poolNickname": "Piscine Rosing",
                "Now": 1790446860,
                "lastPing": 6,  # Dernier ping reçu il y a 6 secondes (preuve de liaison active)
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
                "podinfo": {
                    "pingFail": 110,  # 110 échecs historiques cumulés
                    "pingSent": 1043,
                    "pongRx": 814
                },
                "alerts": [],
                "probes": [
                    {"type": 1, "filteredValue": 22.0},
                    {"type": 5, "filteredValue": 28.5},
                    {"type": 3, "filteredValue": 7.35},
                    {"type": 4, "filteredValue": 720.0},
                ],
                "outs": [{"index": 1, "realStatus": 1}],
                "params": {"PoolMode": 2, "ConsigneEau": 12.0}
            }]
        }
    )

    KlereoService.clear_cache()

    resp = client.get("/api/pool/status")
    assert resp.status_code == 200
    data = resp.json()

    # Invariants Zero-Trust : liaison radio rétablie et fonctionnelle
    assert data["radio_link_ok"] is True
    assert data["radio_error"] is False
    assert data["radio_alert"] is None
    assert "active" in data["radio_status"]
    assert "ping 6s" in data["radio_status"]
    
    # Aucune alerte de rupture radio dans alerts
    assert data["alerts"] == []
    for alert in data["alerts"]:
        assert "radio" not in alert.lower()
        assert "k-link" not in alert.lower()


@patch.object(KlereoService, "_authenticate", return_value="fake_jwt_token")
@patch("requests.get")
@patch("requests.post")
def test_klereo_radio_interruption_when_ping_stale(mock_post, mock_get, mock_auth):
    """
    Vérifie qu'en cas de non-réception prolongée (lastPing >= 120s),
    l'alerte de rupture de liaison est correctement levée.
    """
    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "status": "ok",
            "response": [{
                "idSystem": 91360,
                "poolNickname": "Piscine Rosing",
                "Now": 1790446860,
                "lastPing": 240,  # 4 minutes sans ping (> 120s)
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
                "podinfo": {
                    "pingFail": 115,
                    "pingSent": 1050,
                    "pongRx": 814
                },
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

    # Détection de liaison interrompue
    assert data["radio_link_ok"] is False
    assert data["radio_error"] is True
    assert data["radio_alert"] is not None
    assert "Liaison radio K-Link interrompue" in data["radio_alert"]
    assert "115 échec(s)" in data["radio_alert"]
    assert "240s" in data["radio_alert"]

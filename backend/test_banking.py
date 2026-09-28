import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.services.banking import enable_banking_service, EnableBankingAPIError

client = TestClient(app)

def test_banking_status_nominal():
    """Vérifie que l'endpoint retourne un statut 200 avec les nouveaux champs diagnostiques."""
    response = client.get("/api/banking/status")
    assert response.status_code == 200
    data = response.json()
    
    # Vérification des champs obligatoires requis par la directive
    assert "status" in data
    assert "is_connected" in data
    assert "needs_reauth" in data
    assert "raw_error" in data
    assert "error_code" in data
    assert "error_details" in data
    assert "last_sync_attempt" in data
    assert "application_id" in data
    assert "aspsp_name" in data


def test_banking_status_on_api_error_zero_crash_500():
    """Vérifie que lors d'un échec Enable Banking, l'endpoint ne crashe JAMAIS en 500 et expose l'erreur brute."""
    mock_error_detail = {"code": 401, "message": "Consent expired or revoked by PSU"}
    mock_exception = EnableBankingAPIError(
        message="Erreur Enable Banking (401) : Consent expired or revoked by PSU",
        status_code=401,
        details=mock_error_detail,
        raw_body='{"code": 401, "message": "Consent expired or revoked by PSU"}'
    )

    with patch.object(enable_banking_service, "check_connection_status") as mock_check:
        mock_check.return_value = {
            "status": "interrupted",
            "is_connected": False,
            "needs_reauth": True,
            "days_left": None,
            "valid_until": None,
            "message": "Liaison bancaire interrompue : La ré-authentification DSP2 de sécurité est requise.",
            "reauth_url": "https://tilisy.enablebanking.com/ais/start?sessionid=test",
            "active_accounts_count": 1,
            "total_balance": 0.0,
            "last_synced_at": None,
            "last_successful_sync": None,
            "raw_error": '{"code": 401, "message": "Consent expired or revoked by PSU"}',
            "error_code": "HTTP 401",
            "error_details": mock_error_detail,
            "last_sync_attempt": "2026-09-27T23:30:00.000000"
        }

        response = client.get("/api/banking/status")
        assert response.status_code == 200  # Zéro HTTP 500 !
        data = response.json()
        assert data["is_connected"] is False
        assert data["status"] == "interrupted"
        assert data["needs_reauth"] is True
        assert data["error_code"] == "HTTP 401"
        assert data["raw_error"] == '{"code": 401, "message": "Consent expired or revoked by PSU"}'
        assert data["error_details"] == mock_error_detail
        assert data["last_sync_attempt"] == "2026-09-27T23:30:00.000000"


def test_banking_status_on_unexpected_exception_failsafe():
    """Vérifie le filet de sécurité Fail-Safe en cas d'exception non gérée."""
    with patch.object(enable_banking_service, "check_connection_status", side_effect=ConnectionResetError("Socket reset by peer")):
        response = client.get("/api/banking/status")
        assert response.status_code == 200  # Toujours 200, jamais 500
        data = response.json()
        assert data["is_connected"] is False
        assert data["status"] == "interrupted"
        assert data["needs_reauth"] is True
        assert "Socket reset by peer" in data["raw_error"]
        assert data["error_code"] == "INTERNAL_CHECK_ERROR"
        assert data["last_sync_attempt"] is not None


def test_banking_status_on_network_timeout_never_forces_reauth():
    """Vérifie qu'un timeout réseau temporaire (504 ou read timeout) ne passe JAMAIS needs_reauth à True."""
    with patch.object(enable_banking_service, "check_connection_status") as mock_check:
        mock_check.return_value = {
            "status": "degraded",
            "is_connected": True,
            "needs_reauth": False,
            "days_left": 179,
            "valid_until": "2027-03-26T21:16:33.495468",
            "message": "Le serveur de la banque a mis trop de temps à répondre (timeout réseau temporaire). Votre liaison reste active.",
            "reauth_url": None,
            "active_accounts_count": 1,
            "total_balance": 15000.0,
            "last_synced_at": "2026-09-28T17:45:00.000000",
            "last_successful_sync": "2026-09-28T17:45:00.000000",
            "raw_error": "The read operation timed out",
            "error_code": "TIMEOUT",
            "error_details": {"error": "The read operation timed out"},
            "last_sync_attempt": "2026-09-28T19:46:00.000000"
        }

        response = client.get("/api/banking/status")
        assert response.status_code == 200
        data = response.json()
        assert data["is_connected"] is True
        assert data["status"] == "degraded"
        assert data["needs_reauth"] is False  # Zero faux positif !
        assert data["error_code"] == "TIMEOUT"
        assert "timed out" in data["raw_error"]


def test_banking_status_on_rate_limit_preserves_connected_state():
    """Vérifie qu'un dépassement de quota journalier DSP2 Swan (429) conserve la liaison active et needs_reauth à False."""
    with patch.object(enable_banking_service, "check_connection_status") as mock_check:
        mock_check.return_value = {
            "status": "ok",
            "is_connected": True,
            "needs_reauth": False,
            "days_left": 179,
            "valid_until": "2027-03-26T21:16:33.495468",
            "message": "Quota journalier d'interrogation bancaire en arrière-plan atteint (limite réglementaire DSP2 de Swan).",
            "reauth_url": None,
            "active_accounts_count": 1,
            "total_balance": 15000.0,
            "last_synced_at": "2026-09-28T17:45:00.000000",
            "last_successful_sync": "2026-09-28T17:45:00.000000",
            "raw_error": '{"code":429,"message":"Maximum daily access exceeded"}',
            "error_code": "ASPSP_RATE_LIMIT",
            "error_details": {"code": 429},
            "last_sync_attempt": "2026-09-28T19:46:00.000000"
        }

        response = client.get("/api/banking/status")
        assert response.status_code == 200
        data = response.json()
        assert data["is_connected"] is True
        assert data["status"] == "ok"
        assert data["needs_reauth"] is False  # Zero faux positif !
        assert data["error_code"] == "ASPSP_RATE_LIMIT"


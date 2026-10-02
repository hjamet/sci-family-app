import os
import sys
import pytest
from unittest.mock import patch, MagicMock

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

import app.services.email_service as email_mod
from app.services.email_service import (
    send_email,
    send_task_assigned_email,
    send_vote_required_email,
    send_vote_closed_email,
    send_stay_booked_email,
    send_thermal_change_email,
    send_password_reset_email,
    send_notification_email,
    send_welcome_email,
    send_reservation_confirmation,
    notify_all_members_project_vote,
    ALLOWED_RECIPIENTS,
    DEFAULT_MEMBER_EMAILS,
    DISABLE_ALL_EMAILS
)

@pytest.fixture(autouse=True)
def hermetic_resend_mock():
    """
    STRICT HERMETIC MOCK:
    Intercepte tout appel sortant vers Resend API.
    Garantit 0 requête réseau et 0 crédit Resend consommé.
    """
    import httpx
    real_post = httpx.Client.post
    mock_post = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"id": "mock_firewall_resend_msg_2026"}
    mock_resp.text = '{"id": "mock_firewall_resend_msg_2026"}'
    mock_post.return_value = mock_resp

    def selective_post(self, url, *args, **kwargs):
        if "resend" in str(url):
            return mock_post(url, *args, **kwargs)
        return real_post(self, url, *args, **kwargs)

    with patch.object(httpx.Client, "post", selective_post):
        yield mock_post


# ==============================================================================
# NIVEAU 1 : COUPE-CIRCUIT TOTAL ET ABSOLU D'URGENCE (DISABLE_ALL_EMAILS = True)
# ==============================================================================

def test_circuit_breaker_active_in_test_env():
    """Vérifie que le coupe-circuit est activé (is_email_disabled() is True) dans l'environnement de test isolé."""
    assert email_mod.is_email_disabled() is True

def test_circuit_breaker_blocks_henri(hermetic_resend_mock):
    """Vérifie que même l'adresse d'Henri est STRICTEMENT bloquée par le coupe-circuit."""
    res = send_email(
        to_email="hellenvillierssci@gmail.com",
        subject="Test coupe-circuit Henri",
        html_content="<p>Test</p>"
    )
    assert res == {"status": "disabled", "id": "mock_emergency_off"}
    assert hermetic_resend_mock.call_count == 0

def test_circuit_breaker_blocks_all_send_functions(hermetic_resend_mock):
    """Vérifie que CHAQUE fonction d'envoi est bloquée par le coupe-circuit avec 0 appel API."""
    functions_to_test = [
        lambda: send_task_assigned_email("hellenvillierssci@gmail.com", "Tâche", "Domaine", "Lieu", "Haute", "1"),
        lambda: send_vote_required_email("hellenvillierssci@gmail.com", "Vote"),
        lambda: send_vote_closed_email("hellenvillierssci@gmail.com", "Vote", "ADOPTÉ", {}),
        lambda: send_stay_booked_email("hellenvillierssci@gmail.com", "Henri", "2026-10-01", "2026-10-05", "Presbytère"),
        lambda: send_password_reset_email("hellenvillierssci@gmail.com", "Henri", "temp_pw"),
        lambda: send_thermal_change_email("hellenvillierssci@gmail.com", "Henri", "Chauffage", "Consigne 20°C"),
        lambda: send_notification_email("hellenvillierssci@gmail.com", "Sujet", "<p>Corps</p>"),
        lambda: send_welcome_email("hellenvillierssci@gmail.com", "Henri"),
        lambda: send_reservation_confirmation("hellenvillierssci@gmail.com", "Henri", "2026-10-01", "2026-10-05", "Presbytère"),
        lambda: notify_all_members_project_vote("Projet", "Henri", "Desc")
    ]
    for fn in functions_to_test:
        res = fn()
        assert res.get("status") == "disabled"
        assert res.get("id") == "mock_emergency_off"
        assert hermetic_resend_mock.call_count == 0


# ==============================================================================
# NIVEAU 2 : PARE-FEU DE SECOURS (Si le coupe-circuit venait à être débloqué)
# ==============================================================================

@pytest.fixture
def disabled_circuit_breaker(monkeypatch):
    """Désactive temporairement le coupe-circuit pour tester la logique de filtrage whitelist."""
    monkeypatch.setattr(email_mod, "DISABLE_ALL_EMAILS", False)
    monkeypatch.setenv("DISABLE_ALL_EMAILS", "false")
    monkeypatch.setenv("EMAIL_TEST_MODE", "false")
    monkeypatch.setenv("EMAIL_FORCE_REAL_MODE", "true")
    monkeypatch.setenv("EMAIL_TEST_REDIRECT_TO", "hellenvillierssci@gmail.com")
    assert email_mod.is_email_disabled() is False

def test_whitelist_contains_official_members():
    """Vérifie que le pare-feu autorise les 7 adresses officielles des associés de la SCI."""
    expected = {
        "hellenvillierssci@gmail.com",
        "hortense_jamet@yahoo.fr",
        "marguerite.jamet@orange.fr",
        "eugenie_jamet@yahoo.fr",
        "josephine_jamet@yahoo.fr",
        "elisabeth.jamet@yahoo.fr",
        "frederic_jamet@orange.fr",
    }
    assert ALLOWED_RECIPIENTS == expected

def test_blocked_unauthorized_recipient_when_enabled(disabled_circuit_breaker, hermetic_resend_mock):
    """Vérifie qu'un envoi vers une adresse non autorisée est bloqué par la whitelist quand les emails sont actifs."""
    result = send_email(
        to_email="inconnu@tiers.fr",
        subject="Test blocage tiers",
        html_content="<p>Test</p>"
    )
    assert result == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert hermetic_resend_mock.call_count == 0

def test_blocked_old_obsolete_email_when_enabled(disabled_circuit_breaker, hermetic_resend_mock):
    """Vérifie qu'un envoi vers une ancienne adresse erronée (ex: frdjamet@gmail.com) est bloqué."""
    result = send_email(
        to_email="frdjamet@gmail.com",
        subject="Test blocage ancienne adresse",
        html_content="<p>Test</p>"
    )
    assert result == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert hermetic_resend_mock.call_count == 0

def test_all_official_members_allowed_when_enabled(disabled_circuit_breaker, hermetic_resend_mock):
    """Vérifie que chacun des 7 membres officiels de la famille peut recevoir des emails."""
    official_emails = [
        "hellenvillierssci@gmail.com",
        "hortense_jamet@yahoo.fr",
        "marguerite.jamet@orange.fr",
        "eugenie_jamet@yahoo.fr",
        "josephine_jamet@yahoo.fr",
        "elisabeth.jamet@yahoo.fr",
        "frederic_jamet@orange.fr"
    ]
    for email in official_emails:
        res = send_email(to_email=email, subject=f"Test {email}", html_content="<p>Test</p>")
        assert res.get("status") == "sent" or res.get("id") == "mock_firewall_resend_msg_2026"

def test_mixed_recipients_list_filters_unauthorized_when_enabled(disabled_circuit_breaker, hermetic_resend_mock):
    """Vérifie qu'une liste mixte ne conserve QUE les associés officiels et bloque les adresses non autorisées."""
    recipients = ["hellenvillierssci@gmail.com", "hortense_jamet@yahoo.fr", "inconnu@tiers.com"]
    result = send_email(
        to_email=recipients,
        subject="Test mixte",
        html_content="<p>Test mixte</p>"
    )
    assert result.get("id") == "mock_firewall_resend_msg_2026"
    assert hermetic_resend_mock.call_count > 0
    call_payload = hermetic_resend_mock.call_args[1]["json"]
    assert set(call_payload["to"]) == {"hellenvillierssci@gmail.com", "hortense_jamet@yahoo.fr"}


def test_old_personal_email_henri_jamet_ch_is_strictly_blocked(disabled_circuit_breaker, hermetic_resend_mock):
    """Vérifie formellement que l'ancienne adresse personnelle henri.jamet.ch@gmail.com est STRICTEMENT BLOQUÉE."""
    result = send_email(
        to_email="henri.jamet.ch@gmail.com",
        subject="Test blocage ancienne boîte perso Henri",
        html_content="<p>Test</p>"
    )
    assert result == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert hermetic_resend_mock.call_count == 0


def test_email_test_mode_never_calls_resend(monkeypatch, hermetic_resend_mock):
    """Vérifie que lorsque EMAIL_TEST_MODE=True, AUCUN appel réseau n'est effectué vers Resend."""
    monkeypatch.setattr(email_mod, "DISABLE_ALL_EMAILS", False)
    monkeypatch.setenv("DISABLE_ALL_EMAILS", "false")
    monkeypatch.setenv("EMAIL_TEST_MODE", "true")

    result = send_email(
        to_email="hellenvillierssci@gmail.com",
        subject="Test simulation pure en mode test",
        html_content="<p>Simulation test</p>"
    )
    assert result.get("status") == "simulated"
    assert result.get("simulated") is True
    assert hermetic_resend_mock.call_count == 0

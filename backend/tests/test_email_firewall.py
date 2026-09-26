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

def test_circuit_breaker_active_by_default():
    """Vérifie que le coupe-circuit DISABLE_ALL_EMAILS est activé à True par défaut."""
    assert email_mod.DISABLE_ALL_EMAILS is True
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
        assert res == {"status": "disabled", "id": "mock_emergency_off"}
        assert hermetic_resend_mock.call_count == 0


# ==============================================================================
# NIVEAU 2 : PARE-FEU DE SECOURS (Si le coupe-circuit venait à être débloqué)
# ==============================================================================

@pytest.fixture
def disabled_circuit_breaker(monkeypatch):
    """Désactive temporairement le coupe-circuit pour tester la logique de filtrage whitelist."""
    monkeypatch.setattr(email_mod, "DISABLE_ALL_EMAILS", False)
    monkeypatch.setenv("DISABLE_ALL_EMAILS", "false")
    assert email_mod.is_email_disabled() is False

def test_whitelist_contains_only_henri():
    """Vérifie que le pare-feu n'autorise STRICTEMENT QUE hellenvillierssci@gmail.com."""
    assert ALLOWED_RECIPIENTS == {"hellenvillierssci@gmail.com"}

def test_blocked_recipient_hortense_when_enabled(disabled_circuit_breaker, hermetic_resend_mock):
    """Vérifie qu'un envoi vers hortense_jamet@yahoo.fr est bloqué par la whitelist quand les emails sont actifs."""
    result = send_email(
        to_email="hortense_jamet@yahoo.fr",
        subject="Test blocage Hortense",
        html_content="<p>Test</p>"
    )
    assert result == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert hermetic_resend_mock.call_count == 0

def test_blocked_recipient_frederic_when_enabled(disabled_circuit_breaker, hermetic_resend_mock):
    """Vérifie qu'un envoi vers frdjamet@gmail.com est bloqué par la whitelist quand les emails sont actifs."""
    result = send_email(
        to_email="frdjamet@gmail.com",
        subject="Test blocage Frédéric",
        html_content="<p>Test</p>"
    )
    assert result == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert hermetic_resend_mock.call_count == 0

def test_all_family_members_blocked_individually_when_enabled(disabled_circuit_breaker, hermetic_resend_mock):
    """Vérifie que chacun des membres de la famille est bloqué individuellement."""
    family_emails = [
        "hortense_jamet@yahoo.fr",
        "marguerite_jamet@yahoo.fr",
        "eugenie_jamet@yahoo.fr",
        "josephine_jamet@yahoo.fr",
        "frdjamet@gmail.com",
        "elizabeth_jamet@yahoo.fr"
    ]
    for email in family_emails:
        res = send_email(to_email=email, subject=f"Test {email}", html_content="<p>Test</p>")
        assert res == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}, f"L'adresse {email} n'a pas été bloquée!"
        assert hermetic_resend_mock.call_count == 0

def test_allowed_recipient_henri_passes_when_enabled(disabled_circuit_breaker, hermetic_resend_mock):
    """Vérifie qu'un envoi vers hellenvillierssci@gmail.com passe vers le mock quand les emails sont actifs."""
    result = send_email(
        to_email="hellenvillierssci@gmail.com",
        subject="Test autorisé Henri",
        html_content="<p>Test pour Henri</p>"
    )
    assert result.get("id") == "mock_firewall_resend_msg_2026"
    assert hermetic_resend_mock.call_count == 1
    call_payload = hermetic_resend_mock.call_args[1]["json"]
    assert call_payload["to"] == ["hellenvillierssci@gmail.com"]

def test_mixed_recipients_list_filters_unauthorized_when_enabled(disabled_circuit_breaker, hermetic_resend_mock):
    """Vérifie qu'une liste mixte ne conserve QUE Henri et bloque les autres sans crash."""
    recipients = ["hellenvillierssci@gmail.com", "hortense_jamet@yahoo.fr", "frdjamet@gmail.com"]
    result = send_email(
        to_email=recipients,
        subject="Test mixte",
        html_content="<p>Test mixte</p>"
    )
    assert result.get("id") == "mock_firewall_resend_msg_2026"
    assert hermetic_resend_mock.call_count == 1
    call_payload = hermetic_resend_mock.call_args[1]["json"]
    assert call_payload["to"] == ["hellenvillierssci@gmail.com"]

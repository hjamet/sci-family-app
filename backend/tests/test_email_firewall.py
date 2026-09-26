import os
import sys
import pytest
from unittest.mock import patch, MagicMock

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from app.services.email_service import (
    send_email,
    send_task_assigned_email,
    send_vote_required_email,
    send_vote_closed_email,
    send_stay_booked_email,
    send_password_reset_email,
    notify_all_members_project_vote,
    ALLOWED_RECIPIENTS,
    DEFAULT_MEMBER_EMAILS
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

def test_whitelist_contains_only_henri():
    """Vérifie que le pare-feu n'autorise STRICTEMENT QUE hellenvillierssci@gmail.com."""
    assert ALLOWED_RECIPIENTS == {"hellenvillierssci@gmail.com"}, (
        f"ALLOWED_RECIPIENTS doit contenir exclusivement 'hellenvillierssci@gmail.com', trouvé: {ALLOWED_RECIPIENTS}"
    )

def test_blocked_recipient_hortense(hermetic_resend_mock, caplog):
    """Vérifie qu'un envoi vers hortense_jamet@yahoo.fr est immédiatement bloqué sans appel API."""
    result = send_email(
        to_email="hortense_jamet@yahoo.fr",
        subject="Test blocage Hortense",
        html_content="<p>Test</p>"
    )
    assert result == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert hermetic_resend_mock.call_count == 0, "Aucun appel réseau Resend ne doit être émis pour Hortense"

def test_blocked_recipient_frederic(hermetic_resend_mock):
    """Vérifie qu'un envoi vers frdjamet@gmail.com est immédiatement bloqué sans appel API."""
    result = send_email(
        to_email="frdjamet@gmail.com",
        subject="Test blocage Frédéric",
        html_content="<p>Test</p>"
    )
    assert result == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert hermetic_resend_mock.call_count == 0, "Aucun appel réseau Resend ne doit être émis pour Frédéric"

def test_all_family_members_blocked_individually(hermetic_resend_mock):
    """Vérifie que chacun des 6 membres de la famille est bloqué individuellement."""
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

def test_allowed_recipient_henri_passes(hermetic_resend_mock):
    """Vérifie qu'un envoi vers hellenvillierssci@gmail.com passe le filtre et consomme 0 crédit réel via le mock."""
    result = send_email(
        to_email="hellenvillierssci@gmail.com",
        subject="Test autorisé Henri",
        html_content="<p>Test pour Henri</p>"
    )
    assert result.get("id") == "mock_firewall_resend_msg_2026"
    assert hermetic_resend_mock.call_count == 1
    call_payload = hermetic_resend_mock.call_args[1]["json"]
    assert call_payload["to"] == ["hellenvillierssci@gmail.com"]

def test_mixed_recipients_list_filters_unauthorized(hermetic_resend_mock):
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

def test_template_task_assigned_blocked(hermetic_resend_mock):
    """Vérifie que send_task_assigned_email bloque les destinataires non autorisés."""
    res = send_task_assigned_email(
        to_email="hortense_jamet@yahoo.fr",
        task_title="Jardin Rosing",
        domain="Espaces Verts",
        location="Rosing",
        priority="Haute",
        charge="2"
    )
    assert res == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert hermetic_resend_mock.call_count == 0

def test_template_vote_required_blocked(hermetic_resend_mock):
    """Vérifie que send_vote_required_email bloque les destinataires non autorisés."""
    res = send_vote_required_email(
        to_email="marguerite_jamet@yahoo.fr",
        vote_title="Achat Frigo Schtroudel"
    )
    assert res == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert hermetic_resend_mock.call_count == 0

def test_template_vote_closed_blocked(hermetic_resend_mock):
    """Vérifie que send_vote_closed_email bloque les destinataires non autorisés."""
    res = send_vote_closed_email(
        to_email="frdjamet@gmail.com",
        vote_title="Achat Frigo Schtroudel",
        decision="ADOPTÉ",
        votes_summary={"pour": 7}
    )
    assert res == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert hermetic_resend_mock.call_count == 0

def test_template_stay_booked_blocked(hermetic_resend_mock):
    """Vérifie que send_stay_booked_email bloque les destinataires non autorisés."""
    res = send_stay_booked_email(
        to_email="eugenie_jamet@yahoo.fr",
        member_name="Eugénie",
        start_date="2026-08-01",
        end_date="2026-08-07",
        property_name="Presbytère"
    )
    assert res == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert hermetic_resend_mock.call_count == 0

def test_template_password_reset_blocked(hermetic_resend_mock):
    """Vérifie que send_password_reset_email bloque les destinataires non autorisés."""
    res = send_password_reset_email(
        to_email="josephine_jamet@yahoo.fr",
        member_name="Joséphine",
        new_temporary_password="temp_pass_test"
    )
    assert res == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert hermetic_resend_mock.call_count == 0

def test_default_member_emails_list_filtering(hermetic_resend_mock):
    """Vérifie que l'envoi à DEFAULT_MEMBER_EMAILS filtre tout le monde sauf Henri."""
    res = notify_all_members_project_vote(
        project_title="Toiture Presbytère",
        submitted_by="Henri",
        description="Réfection",
        member_emails=DEFAULT_MEMBER_EMAILS
    )
    assert res.get("id") == "mock_firewall_resend_msg_2026"
    assert hermetic_resend_mock.call_count == 1
    call_payload = hermetic_resend_mock.call_args[1]["json"]
    assert call_payload["to"] == ["hellenvillierssci@gmail.com"]

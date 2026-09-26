import os
import sys
import pytest
from unittest.mock import patch, MagicMock

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db, SessionLocal
from app.models import Member, ThermalSettings
from app.security import create_access_token
from app.services.email_service import (
    send_thermal_change_email,
    ALLOWED_RECIPIENTS
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def hermetic_resend_mock():
    """
    Pare-feu hermétique de test :
    Intercepte tout appel HTTP sortant vers Resend API.
    Empêche toute fuite d'e-mail réelle et garantit 0 appel réseau.
    """
    import httpx
    real_post = httpx.Client.post
    mock_post = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"id": "mock_firewall_msg_2026"}
    mock_resp.text = '{"id": "mock_firewall_msg_2026"}'
    mock_post.return_value = mock_resp

    def selective_post(self, url, *args, **kwargs):
        if "resend" in str(url):
            return mock_post(url, *args, **kwargs)
        return real_post(self, url, *args, **kwargs)

    with patch.object(httpx.Client, "post", selective_post):
        yield mock_post


def test_database_members_notif_thermal_changes_values():
    """Vérifie que notif_thermal_changes est bien configuré (Henri & Joséphine = True, autres = False)."""
    db = SessionLocal()
    try:
        members = db.query(Member).all()
        assert len(members) >= 7, "Il doit y avoir au moins les 7 associés dans la base."

        member_prefs = {m.prenom: m.notif_thermal_changes for m in members}
        print("Préférences actuelles notif_thermal_changes :", member_prefs)

        assert member_prefs.get("Henri") is True, "Henri doit avoir notif_thermal_changes = True par défaut."
        # Joséphine ou la coordinatrice adjointe
        assert member_prefs.get("Joséphine") is True or member_prefs.get("Josephine") is True, (
            "La coordinatrice adjointe (Joséphine) doit avoir notif_thermal_changes = True par défaut."
        )

        # Les autres associés doivent être False
        for prenom in ["Hortense", "Marguerite", "Eugénie", "Eugenie", "Maman", "Frédéric", "Frederic"]:
            if prenom in member_prefs:
                assert member_prefs[prenom] is False, f"{prenom} doit avoir notif_thermal_changes = False par défaut."
    finally:
        db.close()


def test_thermal_change_email_firewall(hermetic_resend_mock):
    """Vérifie que le pare-feu Resend bloque strictement tout destinataire hors whitelist."""
    # 1. Envoi vers un associé non whitelisté -> Interception immédiate
    blocked_res = send_thermal_change_email(
        target_emails=["josephine_jamet@yahoo.fr", "hortense_jamet@yahoo.fr"],
        author_name="Henri Jamet",
        equipment_type="Chauffage ViCare (Presbytère)",
        details="Consigne modifiée à 20.0°C"
    )
    assert blocked_res == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert hermetic_resend_mock.call_count == 0, "Zéro requête Resend ne doit être effectuée pour des e-mails bloqués."

    # 2. Envoi vers l'adresse autorisée hellenvillierssci@gmail.com
    allowed_res = send_thermal_change_email(
        target_emails=["hellenvillierssci@gmail.com"],
        author_name="Henri Jamet",
        equipment_type="Chauffage ViCare (Presbytère)",
        details="Consigne modifiée à 20.0°C"
    )
    assert allowed_res.get("id") == "mock_firewall_msg_2026"
    assert hermetic_resend_mock.call_count == 1
    payload = hermetic_resend_mock.call_args[1]["json"]
    assert payload["to"] == ["hellenvillierssci@gmail.com"]
    assert "Modification des consignes thermiques — Chauffage ViCare (Presbytère)" in payload["subject"]
    assert "/sejour" in payload["html"]


def test_api_heating_settings_get_and_post(hermetic_resend_mock):
    """Vérifie GET et POST /api/heating/settings et le déclencheur d'e-mail."""
    # 1. GET
    res_get = client.get("/api/heating/settings")
    assert res_get.status_code == 200
    data_get = res_get.json()
    assert "target_temperature" in data_get
    assert "mode" in data_get

    # 2. POST avec jeton auth Henri
    token = create_access_token({"sub": "Henri", "user_id": 1})
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "target_temperature": 20.5,
        "mode": "dhwAndHeating",
        "author_name": "Henri Jamet"
    }
    res_post = client.post("/api/heating/settings", headers=headers, json=payload)
    assert res_post.status_code == 200
    data_post = res_post.json()
    assert data_post["status"] == "ok"
    assert data_post["target_temperature"] == 20.5
    assert data_post["mode"] == "dhwAndHeating"

    # Vérification de l'appel d'e-mail
    assert hermetic_resend_mock.call_count >= 1
    call_payload = hermetic_resend_mock.call_args[1]["json"]
    assert "hellenvillierssci@gmail.com" in call_payload["to"]
    assert "Chauffage ViCare" in call_payload["subject"]


def test_api_pool_settings_get_and_post(hermetic_resend_mock):
    """Vérifie GET et POST /api/pool/settings et le déclencheur d'e-mail."""
    # 1. GET
    res_get = client.get("/api/pool/settings")
    assert res_get.status_code == 200
    data_get = res_get.json()
    assert "filtration_mode" in data_get

    # 2. POST avec consigne et mode marche forcée
    token = create_access_token({"sub": "Henri", "user_id": 1})
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "target_temperature": 15.0,
        "filtration_mode": "marche_forcee",
        "mode": "boost",
        "author_name": "Henri Jamet"
    }
    res_post = client.post("/api/pool/settings", headers=headers, json=payload)
    assert res_post.status_code == 200
    data_post = res_post.json()
    assert data_post["status"] == "ok"
    assert data_post["filtration_mode"] == "marche_forcee"
    assert data_post["target_temperature"] == 15.0

    # Vérification de l'appel d'e-mail
    assert hermetic_resend_mock.call_count >= 1
    call_payload = hermetic_resend_mock.call_args[1]["json"]
    assert "hellenvillierssci@gmail.com" in call_payload["to"]
    assert "Piscine Klereo" in call_payload["subject"]


def test_api_auth_profile_and_settings_toggle():
    """Vérifie que notif_thermal_changes est lu et mis à jour via /api/auth/profile et /api/auth/settings."""
    token = create_access_token({"sub": "Henri", "user_id": 1})
    headers = {"Authorization": f"Bearer {token}"}

    # Profile GET
    p_get = client.get("/api/auth/profile", headers=headers)
    assert p_get.status_code == 200
    assert "notif_thermal_changes" in p_get.json()

    # Profile PUT -> Toggle à False
    p_put1 = client.put("/api/auth/profile", headers=headers, json={"notif_thermal_changes": False})
    assert p_put1.status_code == 200
    assert p_put1.json()["notif_thermal_changes"] is False

    # Settings GET -> vérifie synchronisation
    s_get = client.get("/api/auth/settings", headers=headers)
    assert s_get.status_code == 200
    assert s_get.json()["notif_thermal_changes"] is False

    # Settings PUT -> Toggle à True
    s_put = client.put("/api/auth/settings", headers=headers, json={"notif_thermal_changes": True})
    assert s_put.status_code == 200
    assert s_put.json()["notif_thermal_changes"] is True

    # Profile GET -> vérifie restauration
    p_get2 = client.get("/api/auth/profile", headers=headers)
    assert p_get2.status_code == 200
    assert p_get2.json()["notif_thermal_changes"] is True

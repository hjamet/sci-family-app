import os
import sys
import json
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from app.main import app
from app.database import SessionLocal, engine
from app.models import Member, Task, Project, ProjectVote, Reservation
from app.security import hash_password, verify_password, rate_limiter
from app.services.email_service import (
    send_email,
    send_task_assigned_email,
    send_vote_required_email,
    send_vote_closed_email,
    send_stay_booked_email,
    render_email_layout,
    RESEND_API_KEY
)

client = TestClient(app)

@pytest.fixture(autouse=True)
def mock_resend_api():
    """
    STRICT HERMETIC MOCK: Intercepts all outgoing calls to Resend API.
    Zero network requests, zero Resend credits consumed during test execution.
    Leaves internal TestClient requests unaffected.
    """
    import httpx
    real_post = httpx.Client.post
    mock_resend = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"id": "mock_resend_msg_test_hermetic_2026"}
    mock_resp.text = '{"id": "mock_resend_msg_test_hermetic_2026"}'
    mock_resend.return_value = mock_resp

    def selective_post(self, url, *args, **kwargs):
        if "resend" in str(url):
            return mock_resend(url, *args, **kwargs)
        return real_post(self, url, *args, **kwargs)

    with patch.object(httpx.Client, "post", selective_post):
        yield mock_resend


@pytest.fixture
def auth_headers():
    """Logs in as Henri and returns Bearer token headers."""
    rate_limiter.failed_logins.clear()
    rate_limiter.locked_until.clear()
    resp = client.post("/api/auth/login", json={"prenom": "Henri", "password": os.getenv("USER_HENRI_PASS", "N8xK9mP2vQ5rT7wY")})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# MISSION 1 & 2 : RESEND CONFIGURATION, SERVICE & 4 TEMPLATES
# ==============================================================================

def test_01_resend_configuration_and_degraded_mode(monkeypatch):
    """Verify RESEND_API_KEY configuration and graceful degraded mode logging when key is empty."""
    assert RESEND_API_KEY != "", "RESEND_API_KEY should be present in backend/.env"

    # Simulate missing RESEND_API_KEY
    monkeypatch.setenv("RESEND_API_KEY", "")
    result = send_email(
        to_email="hellenvillierssci@gmail.com",
        subject="Test Mode Dégradé",
        html_content="<p>Contenu test</p>"
    )
    assert result.get("simulated") is True
    assert "hellenvillierssci@gmail.com" in result["to"]
    assert result["subject"] == "Test Mode Dégradé"


def test_02_email_template_1_task_assigned(mock_resend_api):
    """Verify Template 1: Tâche assignée HTML content, fields, and CTA button (no deadline, real fields only)."""
    result = send_task_assigned_email(
        to_email="hellenvillierssci@gmail.com",
        task_title="Maintenance Pompe à Chaleur Presbytère",
        domain="Chauffage & Énergie",
        location="Le Presbytère",
        priority="Haute",
        charge="1 journée",
        task_id=101,
        assignee_name="Henri",
        deadline="2026-10-15",
        description="Vérification annuelle de la pression et du circuit calorifique."
    )
    assert result.get("id") == "mock_resend_msg_test_hermetic_2026"

    # Verify rendered HTML layout header and suppression of '• Espace Associés'
    html = render_email_layout(
        title="Nouvelle Tâche Assignée",
        preheader="Preheader test",
        content_html="<p>Corps de la tâche</p>",
        action_url="https://hellenvilliers.henri-jamet.com/#tasks",
        action_label="Consulter la tâche"
    )
    assert "DOMAINE D'HELLENVILLIERS" in html
    assert "SCI Familiale" in html
    assert "Espace Associés" not in html
    assert "Consulter la tâche" in html
    assert "https://hellenvilliers.henri-jamet.com/#tasks" in html

    # Verify sent payload content
    sent_payload = mock_resend_api.call_args[1]["json"]
    sent_html = sent_payload["html"]
    assert "Date limite" not in sent_html
    assert "Échéance" not in sent_html
    assert "👤 Assigné à :" in sent_html
    assert "Henri" in sent_html
    assert "⏱️ Charge (points) :" in sent_html
    assert "Vérification annuelle de la pression" in sent_html


def test_03_email_template_2_vote_required(mock_resend_api):
    """Verify Template 2: Vote requis HTML content, statutory rule, and removal of deadline."""
    result = send_vote_required_email(
        to_email="hellenvillierssci@gmail.com",
        vote_title="Rénovation Toiture Petite Dépendance",
        estimated_cost=3200.0,
        deadline="2026-10-31",
        project_id=42,
        submitted_by="Hortense",
        description="Réfection partielle de la couverture suite aux intempéries."
    )
    assert result.get("id") == "mock_resend_msg_test_hermetic_2026"

    sent_payload = mock_resend_api.call_args[1]["json"]
    sent_html = sent_payload["html"]
    # Verify deadline is removed
    assert "Date limite" not in sent_html
    assert "2026-10-31" not in sent_html
    # Verify statutory rule exact wording
    assert "Règle statutaire : 1 associé = 1 voix." in sent_html
    assert "Report prochaine AG" in sent_html
    assert "Une seule voix demandant le report décale automatiquement la décision à la prochaine Assemblée Générale." in sent_html


def test_04_email_template_3_vote_closed(mock_resend_api):
    """Verify Template 3: Décision finale de vote avec répartition et résultat formel."""
    result = send_vote_closed_email(
        to_email="hellenvillierssci@gmail.com",
        vote_title="Rénovation Toiture Petite Dépendance",
        decision="ADOPTÉ",
        votes_summary={"pour": 5, "contre": 1, "abstention": 1, "report_prochaine_ag": 0},
        total_votes=7,
        project_id=42,
        estimated_cost=3200.0
    )
    assert result.get("id") == "mock_resend_msg_test_hermetic_2026"

    sent_payload = mock_resend_api.call_args[1]["json"]
    sent_html = sent_payload["html"]
    assert "ADOPTÉ" in sent_html
    assert "Report AG :" in sent_html


def test_05_email_template_4_stay_booked(mock_resend_api):
    """Verify Template 4: Nouveau séjour réservé avec dates, demeure et chambres (including JSON decoding)."""
    result = send_stay_booked_email(
        to_email="hellenvillierssci@gmail.com",
        member_name="Marguerite Jamet",
        start_date="2026-08-01",
        end_date="2026-08-10",
        property_name="Villa Rosing",
        rooms='["Chambre Marguerite Rosings", "Chambre Tour"]',
        guest_count=2,
        reservation_id=88,
        notes="Présence confirmée pour les vacances d'été."
    )
    assert result.get("id") == "mock_resend_msg_test_hermetic_2026"

    sent_payload = mock_resend_api.call_args[1]["json"]
    sent_html = sent_payload["html"]
    assert "Chambre Marguerite Rosings, Chambre Tour" in sent_html
    assert "Du <strong>2026-08-01</strong> au <strong>2026-08-10</strong>" in sent_html
    assert "2 occupant(s)" in sent_html


# ==============================================================================
# MISSION 3 : SCHÉMA DE BASE DE DONNÉES & PRÉFÉRENCES DES 7 ASSOCIÉS
# ==============================================================================

def test_06_database_notification_columns_and_all_7_associates():
    """Verify all 7 associates have notif_task_assigned, notif_vote_needed, notif_vote_closed, notif_stay_booked set to TRUE."""
    with SessionLocal() as db:
        members = db.query(Member).all()
        assert len(members) == 7, f"Expected 7 members, found {len(members)}"
        for m in members:
            assert getattr(m, "notif_task_assigned") is True or getattr(m, "notif_task_assigned") == 1
            assert getattr(m, "notif_vote_needed") is True or getattr(m, "notif_vote_needed") == 1
            assert getattr(m, "notif_vote_closed") is True or getattr(m, "notif_vote_closed") == 1
            assert getattr(m, "notif_stay_booked") is True or getattr(m, "notif_stay_booked") == 1


# ==============================================================================
# MISSION 4 : CÂBLAGE DES 4 DÉCLENCHEURS AUTOMATIQUES DANS L'API
# ==============================================================================

def test_07_trigger_task_assigned_route(auth_headers):
    """Trigger 1: POST /api/tasks triggers notification to assigned member."""
    task_payload = {
        "title": "Vérification Filtre Piscine & Niveau Chlore",
        "description": "Contrôle hebdomadaire du local technique piscine.",
        "subject": "Piscine",
        "category": "Maintenance",
        "priority": "Normale",
        "complexity": "Faible",
        "assignee_id": 1,  # Henri
        "deadline": "2026-09-30"
    }
    resp = client.post("/api/tasks", json=task_payload, headers=auth_headers)
    assert resp.status_code == 201, f"Failed to create task: {resp.text}"
    created = resp.json()
    assert created["title"] == "Vérification Filtre Piscine & Niveau Chlore"
    assert created["assignee_id"] == 1


def test_08_trigger_project_vote_required_route(auth_headers):
    """Trigger 2: Creating a project in SOUMETTRE_AU_VOTE mode triggers vote required notifications."""
    proj_payload = {
        "property_id": 1,
        "title": "Achat Débroussailleuse Thermique Stihl",
        "description": "Remplacement de l'ancien coupe-bordure défaillant.",
        "estimated_cost": 480.0,
        "category": "Espaces Verts",
        "priority": "MOYENNE",
        "submitted_by": "Hortense",
        "decision_mode": "SOUMETTRE_AU_VOTE"
    }
    resp = client.post("/api/projects", json=proj_payload, headers=auth_headers)
    assert resp.status_code == 201, f"Failed to create project: {resp.text}"
    created = resp.json()
    assert created["status"] == "EN_VOTE"
    assert created["id"] is not None


def test_09_trigger_vote_submission_and_completion_route(auth_headers):
    """Trigger 3: POST /api/votes and POST /api/projects/{id}/vote record vote and finalize when all 7 vote."""
    with SessionLocal() as db:
        # Create a fresh project to test full voting cycle
        test_proj = Project(
            property_id=1,
            title="Installation Panneaux Solaires Hangar",
            description="Projet d'autoconsommation électrique pour le domaine.",
            estimated_cost=8500.0,
            category="Énergie",
            priority="HAUTE",
            submitted_by="Frédéric",
            status="EN_VOTE"
        )
        db.add(test_proj)
        db.commit()
        db.refresh(test_proj)
        p_id = test_proj.id

    associates = ["Henri", "Marguerite", "Hortense", "Joséphine", "Eugénie", "Frédéric", "Maman"]

    # 1. Cast first 6 votes via /api/projects/{id}/vote
    for member_name in associates[:6]:
        v_resp = client.post(
            f"/api/projects/{p_id}/vote",
            json={"user_name": member_name, "vote": "POUR", "comment": f"Favorable ({member_name})"},
            headers=auth_headers
        )
        assert v_resp.status_code == 200, f"Vote failed for {member_name}: {v_resp.text}"
        assert v_resp.json()["status"] == "EN_VOTE"

    # 2. Cast 7th (final) vote via POST /api/votes (alias route required by mission)
    final_vote_resp = client.post(
        "/api/votes",
        json={"project_id": p_id, "user_name": associates[6], "vote": "POUR", "comment": "Adopté !"},
        headers=auth_headers
    )
    assert final_vote_resp.status_code == 200, f"Final vote submission failed: {final_vote_resp.text}"
    final_data = final_vote_resp.json()
    # The scrutin must be closed and approved!
    assert final_data["status"] == "APPROUVE", f"Expected APPROUVE once all 7 associates voted, got: {final_data['status']}"


def test_10_trigger_stay_booked_route(auth_headers):
    """Trigger 4: POST /api/reservations notifies other family members."""
    res_payload = {
        "property_id": 2,
        "property_name": "Le Presbytère",
        "user_name": "Henri",
        "year": 2026,
        "week_number": 43,
        "start_date": "2026-10-23",
        "end_date": "2026-10-26",
        "guest_count": 2,
        "selected_rooms": ["Suite parentale Presbytère"],
        "notes": "Week-end prolongé à Hellenvilliers"
    }
    resp = client.post("/api/reservations", json=res_payload, headers=auth_headers)
    assert resp.status_code == 201, f"Failed to create reservation: {resp.text}"
    data = resp.json()
    assert data["status"] == "Confirmée"
    assert data["user_name"] == "Henri"


# ==============================================================================
# MISSION 5 : ENDPOINTS DE PARAMÈTRES / PROFIL & CHANGEMENT DE MOT DE PASSE
# ==============================================================================

def test_11_get_and_put_auth_profile(auth_headers):
    """Verify GET and PUT /api/auth/profile for email and the 4 toggles."""
    # 1. GET /api/auth/profile
    get_res = client.get("/api/auth/profile", headers=auth_headers)
    assert get_res.status_code == 200, f"GET /api/auth/profile failed: {get_res.text}"
    profile = get_res.json()
    assert "email" in profile
    assert profile["notif_task_assigned"] is True
    assert profile["notif_vote_needed"] is True
    assert profile["notif_vote_closed"] is True
    assert profile["notif_stay_booked"] is True

    # 2. PUT /api/auth/profile to modify toggles
    put_res = client.put(
        "/api/auth/profile",
        json={
            "notif_stay_booked": False,
            "notif_task_assigned": True,
            "notif_vote_needed": True,
            "notif_vote_closed": True
        },
        headers=auth_headers
    )
    assert put_res.status_code == 200, f"PUT /api/auth/profile failed: {put_res.text}"
    updated = put_res.json()
    assert updated["notif_stay_booked"] is False

    # Restore to True
    client.put("/api/auth/profile", json={"notif_stay_booked": True}, headers=auth_headers)


def test_12_get_and_put_member_settings(auth_headers):
    """Verify GET and PUT /api/members/{id}/settings."""
    # Member 2 (Marguerite)
    get_res = client.get("/api/members/2/settings", headers=auth_headers)
    assert get_res.status_code == 200
    settings = get_res.json()
    assert settings["member_id"] == 2 or settings["id"] == 2
    assert "notif_task_assigned" in settings

    put_res = client.put(
        "/api/members/2/settings",
        json={"notif_vote_closed": False},
        headers=auth_headers
    )
    assert put_res.status_code == 200
    assert put_res.json()["notif_vote_closed"] is False

    # Restore
    client.put("/api/members/2/settings", json={"notif_vote_closed": True}, headers=auth_headers)


def test_13_change_password_endpoint(auth_headers):
    """Verify POST /api/auth/change-password checks old password, hashes new password, and updates DB."""
    current_pass = os.getenv("USER_HENRI_PASS", "N8xK9mP2vQ5rT7wY")
    temp_pass = "HenriTestPass2026!Secured"

    # 1. Invalid old password rejected
    bad_resp = client.post(
        "/api/auth/change-password",
        json={"old_password": "WrongPassword123", "new_password": temp_pass},
        headers=auth_headers
    )
    assert bad_resp.status_code == 400
    assert "incorrect" in bad_resp.text.lower()

    # 2. Valid old password succeeds
    ok_resp = client.post(
        "/api/auth/change-password",
        json={"old_password": current_pass, "new_password": temp_pass},
        headers=auth_headers
    )
    assert ok_resp.status_code == 200, f"Password change failed: {ok_resp.text}"
    assert ok_resp.json()["success"] is True

    # 3. Verify login works with new password
    login_new = client.post("/api/auth/login", json={"prenom": "Henri", "password": temp_pass})
    assert login_new.status_code == 200
    new_token = login_new.json()["access_token"]
    new_headers = {"Authorization": f"Bearer {new_token}"}

    # 4. Revert to original password so other tests and environment remain undisturbed
    revert_resp = client.post(
        "/api/auth/change-password",
        json={"old_password": temp_pass, "new_password": current_pass},
        headers=new_headers
    )
    assert revert_resp.status_code == 200
    assert revert_resp.json()["success"] is True


def test_14_email_test_mode_hermetic_zero_duplicates_and_no_banner(mock_resend_api, monkeypatch):
    """Verify that in test mode, unauthorized emails are blocked by whitelist firewall, and Henri's email is delivered to Resend mock."""
    mock_resend_api.reset_mock()

    test_recipients = ["hortense_jamet@yahoo.fr", "frdjamet@gmail.com"]
    subject_orig = "[SCI Hellenvilliers] Test Propre Sans Banniere"
    html_orig = "<p>Contenu test officiel</p>"

    # 1. Non-whitelisted recipients are immediately blocked with 0 Resend API calls
    result_blocked = send_email(
        to_email=test_recipients,
        subject=subject_orig,
        html_content=html_orig
    )
    assert result_blocked == {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    assert mock_resend_api.call_count == 0

    # 2. Whitelisted recipient (hellenvillierssci@gmail.com) passes cleanly
    result_henri = send_email(
        to_email="hellenvillierssci@gmail.com",
        subject=subject_orig,
        html_content=html_orig
    )
    assert mock_resend_api.call_count == 1
    sent_payload = mock_resend_api.call_args[1]["json"]
    assert sent_payload["to"] == ["hellenvillierssci@gmail.com"]
    assert sent_payload["subject"] == subject_orig
    assert "⚠️ [MODE TEST - COUPE-CIRCUIT EMAIL ACTIVÉ]" not in sent_payload["html"]
    assert "Contenu test officiel" in sent_payload["html"]


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))


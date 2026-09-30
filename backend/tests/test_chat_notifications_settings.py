import os
import sys
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

current_dir = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(current_dir) if os.path.basename(current_dir) == "tests" else current_dir
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from app.main import app
from app.database import SessionLocal
from app.models import Member, MemberSettings, Task, Project, Property
from app.schemas import MemberSettingsResponse, MemberSettingsUpdate, ProfileUpdateRequest
from app.security import create_access_token

client = TestClient(app)


@pytest.fixture(autouse=True)
def hermetic_resend_mock():
    """Garantit l'absence d'appels réseau réels pendant les tests."""
    import httpx
    real_post = httpx.Client.post
    mock_post = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"id": "mock_chat_settings_2026"}
    mock_resp.text = '{"id": "mock_chat_settings_2026"}'
    mock_post.return_value = mock_resp

    def selective_post(self, url, *args, **kwargs):
        if "resend" in str(url):
            return mock_post(url, *args, **kwargs)
        return real_post(self, url, *args, **kwargs)

    with patch.object(httpx.Client, "post", selective_post):
        yield mock_post


@pytest.fixture
def auth_headers():
    token = create_access_token({"sub": "Henri", "user_id": 1})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def josephine_headers():
    token = create_access_token({"sub": "Josephine", "user_id": 4})
    return {"Authorization": f"Bearer {token}"}


def test_schemas_purged_of_notif_stay_confirmation():
    """Vérifie que notif_stay_confirmation a été retiré des schémas Pydantic."""
    assert "notif_stay_confirmation" not in MemberSettingsResponse.model_fields
    assert "notif_stay_confirmation" not in MemberSettingsUpdate.model_fields
    assert "notif_stay_confirmation" not in ProfileUpdateRequest.model_fields

    # Vérification présence des nouveaux réglages de chat
    for schema_cls in (MemberSettingsResponse, MemberSettingsUpdate, ProfileUpdateRequest):
        assert "notif_task_chat_activity" in schema_cls.model_fields
        assert "notif_vote_chat_activity" in schema_cls.model_fields
        assert "notify_mentions" in schema_cls.model_fields


def test_member_settings_api_defaults_and_purge(auth_headers):
    """Vérifie les réglages retournés par l'API pour un membre."""
    response = client.get("/api/members/1/settings", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()

    # notif_stay_confirmation ne doit pas être présent
    assert "notif_stay_confirmation" not in data

    # Valeurs par défaut spécifiées
    assert data["notify_mentions"] is True
    assert data["notif_task_chat_activity"] is False
    assert data["notif_vote_chat_activity"] is False


def test_update_chat_notifications_settings(auth_headers):
    """Vérifie la mise à jour et la persistance des nouveaux commutateurs."""
    # Mise à jour des réglages
    payload = {
        "notif_task_chat_activity": True,
        "notif_vote_chat_activity": True,
        "notify_mentions": False
    }
    response = client.put("/api/members/1/settings", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["notif_task_chat_activity"] is True
    assert data["notif_vote_chat_activity"] is True
    assert data["notify_mentions"] is False

    # Vérification en base
    db = SessionLocal()
    try:
        member = db.query(Member).filter(Member.id == 1).first()
        assert member.notif_task_chat_activity is True
        assert member.notif_vote_chat_activity is True
        assert member.notify_mentions is False

        # Rétablir les réglages par défaut
        member.notif_task_chat_activity = False
        member.notif_vote_chat_activity = False
        member.notify_mentions = True
        db.commit()
    finally:
        db.close()


def test_task_chat_activity_email_dispatch(auth_headers, josephine_headers):
    """
    Vérifie l'envoi d'e-mail d'activité de chat sur tâche :
    1. Déclenché pour le créateur ayant activé notif_task_chat_activity
    2. Pas d'auto-notification si le créateur commente sa propre tâche
    3. Pas de doublon si le créateur est déjà mentionné
    """
    db = SessionLocal()
    try:
        # Henri active notif_task_chat_activity
        henri = db.query(Member).filter(Member.id == 1).first()
        henri.notif_task_chat_activity = True
        henri.email = "hellenvillierssci@gmail.com"

        # Création d'une tâche par Henri
        task = Task(
            title="Tâche Test Chat Notif",
            description="Description test chat",
            subject="SCI",
            category="Jardin",
            status="A_FAIRE",
            created_by="Henri"
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        task_id = task.id
    finally:
        db.close()

    with patch("app.main.send_task_chat_activity_email") as mock_task_mail, \
         patch("app.main.send_mention_notification") as mock_mention_mail:
        
        mock_task_mail.return_value = {"status": "success", "id": "mock_task_mail_1"}
        mock_mention_mail.return_value = {"status": "success", "id": "mock_mention_mail_1"}

        # 1. Joséphine commente la tâche -> Henri doit être notifié
        res = client.post(
            f"/api/tasks/{task_id}/comments",
            json={"author_name": "Josephine", "content": "Superbe idée, je m'en occupe demain !"},
            headers=josephine_headers
        )
        assert res.status_code == 201
        assert mock_task_mail.call_count == 1
        call_kwargs = mock_task_mail.call_args[1]
        assert call_kwargs["to_email"] == "hellenvillierssci@gmail.com"
        assert call_kwargs["task_title"] == "Tâche Test Chat Notif"
        assert call_kwargs["author_name"] == "Josephine"

        # 2. Henri commente sa propre tâche -> AUCUNE auto-notification
        mock_task_mail.reset_mock()
        res = client.post(
            f"/api/tasks/{task_id}/comments",
            json={"author_name": "Henri", "content": "Parfait merci Joséphine !"},
            headers=auth_headers
        )
        assert res.status_code == 201
        assert mock_task_mail.call_count == 0

        # 3. Joséphine mentionne @Henri -> Seule la mention est notifiée, pas de doublon
        mock_task_mail.reset_mock()
        mock_mention_mail.reset_mock()
        res = client.post(
            f"/api/tasks/{task_id}/comments",
            json={"author_name": "Josephine", "content": "Dis-moi @Henri quand tu es dispo pour faire le point."},
            headers=josephine_headers
        )
        assert res.status_code == 201
        assert mock_mention_mail.call_count >= 1
        assert mock_task_mail.call_count == 0

    # Nettoyage
    db = SessionLocal()
    try:
        t = db.query(Task).filter(Task.id == task_id).first()
        if t:
            db.delete(t)
        henri = db.query(Member).filter(Member.id == 1).first()
        henri.notif_task_chat_activity = False
        db.commit()
    finally:
        db.close()


def test_vote_chat_activity_email_dispatch(auth_headers, josephine_headers):
    """
    Vérifie l'envoi d'e-mail d'activité de chat sur vote :
    1. Déclenché pour le proposant ayant activé notif_vote_chat_activity
    2. Pas d'auto-notification si le proposant commente son propre vote
    3. Pas de doublon si le proposant est déjà mentionné
    """
    db = SessionLocal()
    try:
        # Henri active notif_vote_chat_activity
        henri = db.query(Member).filter(Member.id == 1).first()
        henri.notif_vote_chat_activity = True
        henri.email = "hellenvillierssci@gmail.com"

        prop = db.query(Property).first()
        prop_id = prop.id if prop else 1

        # Création d'un projet/vote par Henri
        project = Project(
            property_id=prop_id,
            title="Projet Test Chat Notif",
            description="Discussion sur l'installation d'une pompe à chaleur",
            estimated_cost=2500.0,
            category="🛠️ Maintenance / Réparation",
            submitted_by="Henri",
            status="EN_VOTE"
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        project_id = project.id
    finally:
        db.close()

    with patch("app.main.send_vote_chat_activity_email") as mock_vote_mail, \
         patch("app.main.send_mention_notification") as mock_mention_mail:
        
        mock_vote_mail.return_value = {"status": "success", "id": "mock_vote_mail_1"}
        mock_mention_mail.return_value = {"status": "success", "id": "mock_mention_mail_1"}

        # 1. Joséphine commente le vote -> Henri doit être notifié
        res = client.post(
            f"/api/projects/{project_id}/comments",
            json={"author_name": "Josephine", "content": "Je suis tout à fait favorable à ce devis."},
            headers=josephine_headers
        )
        assert res.status_code == 201
        assert mock_vote_mail.call_count == 1
        call_kwargs = mock_vote_mail.call_args[1]
        assert call_kwargs["to_email"] == "hellenvillierssci@gmail.com"
        assert call_kwargs["vote_title"] == "Projet Test Chat Notif"
        assert call_kwargs["author_name"] == "Josephine"

        # 2. Henri commente son propre vote -> AUCUNE auto-notification
        mock_vote_mail.reset_mock()
        res = client.post(
            f"/api/projects/{project_id}/comments",
            json={"author_name": "Henri", "content": "Merci pour ton avis, j'ai relancé l'artisan."},
            headers=auth_headers
        )
        assert res.status_code == 201
        assert mock_vote_mail.call_count == 0

        # 3. Joséphine mentionne @Henri -> Seule la mention est notifiée, pas de doublon
        mock_vote_mail.reset_mock()
        mock_mention_mail.reset_mock()
        res = client.post(
            f"/api/projects/{project_id}/comments",
            json={"author_name": "Josephine", "content": "Qu'en penses-tu @Henri ?"},
            headers=josephine_headers
        )
        assert res.status_code == 201
        assert mock_mention_mail.call_count >= 1
        assert mock_vote_mail.call_count == 0

    # Nettoyage
    db = SessionLocal()
    try:
        p = db.query(Project).filter(Project.id == project_id).first()
        if p:
            db.delete(p)
        henri = db.query(Member).filter(Member.id == 1).first()
        henri.notif_vote_chat_activity = False
        db.commit()
    finally:
        db.close()

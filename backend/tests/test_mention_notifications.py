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

import app.services.email_service as email_mod
from app.main import app, normalize_text_for_matching, find_mentioned_members
from app.database import SessionLocal
from app.models import Member, Task, Project
from app.security import create_access_token, rate_limiter
from app.services.email_service import send_mention_notification, is_email_disabled

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
    mock_resp.json.return_value = {"id": "mock_mention_resend_2026"}
    mock_resp.text = '{"id": "mock_mention_resend_2026"}'
    mock_post.return_value = mock_resp

    def selective_post(self, url, *args, **kwargs):
        if "resend" in str(url):
            return mock_post(url, *args, **kwargs)
        return real_post(self, url, *args, **kwargs)

    with patch.object(httpx.Client, "post", selective_post):
        yield mock_post


@pytest.fixture
def auth_headers():
    """Génère des en-têtes d'authentification Bearer pour Henri."""
    token = create_access_token({"sub": "Henri", "user_id": 1})
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# TEST 1 : EXTRACTION DE MENTION & APPEL DE NOTIFICATION
# ==============================================================================

def test_01_mention_text_normalization_and_matching():
    """Vérifie que la normalisation de texte est insensible à la casse et aux accents."""
    db = SessionLocal()
    try:
        assert normalize_text_for_matching("Joséphine") == "josephine"
        assert normalize_text_for_matching("Frédéric") == "frederic"
        assert normalize_text_for_matching("HENRI") == "henri"
        assert normalize_text_for_matching("Élisabeth") == "elisabeth"

        # Test extraction via find_mentioned_members
        members = find_mentioned_members("Bonjour @Henri et @joséphine, pouvez-vous voir ça ?", db)
        prenoms = {m.prenom for m in members}
        assert "Henri" in prenoms
        assert any(p in ("Joséphine", "Josephine") for p in prenoms)

        # Test avec nom avec accent et tiret
        members_fred = find_mentioned_members("Avis de @Frédéric nécessaire", db)
        assert any(m.prenom in ("Frédéric", "Frederic") for m in members_fred)

        # Test déduplication si mentionné plusieurs fois
        members_dup = find_mentioned_members("@Henri merci @henri pour le point @Henri", db)
        assert len(members_dup) == 1
        assert members_dup[0].prenom == "Henri"
    finally:
        db.close()


def test_02_send_mention_notification_direct_dispatch(monkeypatch):
    """Vérifie que send_mention_notification construit et expédie l'email Resend correctement."""
    monkeypatch.setattr(email_mod, "DISABLE_ALL_EMAILS", False)
    monkeypatch.setenv("DISABLE_ALL_EMAILS", "false")

    db = SessionLocal()
    try:
        henri = db.query(Member).filter(Member.prenom == "Henri").first()
        assert henri is not None
        # Assure l'email pour le test
        henri.notify_mentions = True
        henri.email = "hellenvillierssci@gmail.com"
        db.commit()

        with patch.object(email_mod, "send_email") as mock_send:
            mock_send.return_value = {"id": "mock_mention_msg_123"}

            success = send_mention_notification(
                mentioned_member=henri,
                author_name="Joséphine Jamet",
                context_title="Réparation Pompe Presbytère",
                message_text="Pourrais-tu jeter un oeil à la pression du circuit ?",
                target_url="https://hellenvilliers.henri-jamet.com/taches?id=10"
            )

            assert success is True
            assert mock_send.call_count == 1
            call_kwargs = mock_send.call_args[1]
            assert call_kwargs["to_email"] == "hellenvillierssci@gmail.com"
            assert call_kwargs["subject"] == '[Hellenvilliers SCI] Joséphine Jamet vous a mentionné(e) dans "Réparation Pompe Presbytère"'
            html = call_kwargs["html_content"]
            assert "Bonjour Henri," in html or "Bonjour," in html
            assert "Joséphine Jamet" in html
            assert "Réparation Pompe Presbytère" in html
            assert "Pourrais-tu jeter un oeil à la pression du circuit ?" in html
            assert "https://hellenvilliers.henri-jamet.com/taches?id=10" in html
            assert "Accéder à la discussion" in html
            assert "Paramètres &amp; Préférences" in html or "Paramètres & Préférences" in html
    finally:
        db.close()


def test_03_mention_triggered_on_task_message_endpoint():
    """Vérifie que l'endpoint POST /api/tasks/{task_id}/messages déclenche la notification de mention."""
    db = SessionLocal()
    try:
        task = db.query(Task).first()
        if not task:
            task = Task(title="Tâche de Test Mention", description="Description", created_by="Henri Jamet")
            db.add(task)
            db.commit()
            db.refresh(task)

        task_id = str(task.id)

        with patch("app.main.send_mention_notification") as mock_notify:
            mock_notify.return_value = True

            payload = {
                "author_name": "Joséphine Jamet",
                "author_role": "Coordinatrice Adjointe",
                "content": "Bonjour @Henri, pourrais-tu valider ce point s'il te plaît ?"
            }

            resp = client.post(f"/api/tasks/{task_id}/messages", json=payload)
            assert resp.status_code == 201
            data = resp.json()
            assert data["content"] == payload["content"]

            # Vérification de l'appel de notification
            assert mock_notify.call_count >= 1
            args, kwargs = mock_notify.call_args
            called_member = kwargs.get("mentioned_member")
            assert called_member is not None
            assert called_member.prenom == "Henri"
            assert kwargs.get("author_name") == "Joséphine Jamet"
            assert kwargs.get("context_title") == task.title
            assert kwargs.get("message_text") == payload["content"]
            assert f"/taches?id={task.id}" in kwargs.get("target_url")
    finally:
        db.close()


# ==============================================================================
# TEST 2 : RESPECT DE LA PRÉFÉRENCE NOTIFY_MENTIONS = FALSE
# ==============================================================================

def test_04_preference_notify_mentions_false_suppresses_email(monkeypatch):
    """Vérifie qu'aucun email n'est envoyé si le membre a désactivé notify_mentions."""
    monkeypatch.setattr(email_mod, "DISABLE_ALL_EMAILS", False)
    monkeypatch.setenv("DISABLE_ALL_EMAILS", "false")

    db = SessionLocal()
    try:
        henri = db.query(Member).filter(Member.prenom == "Henri").first()
        assert henri is not None
        henri.notify_mentions = False
        henri.email = "hellenvillierssci@gmail.com"
        db.commit()

        with patch.object(email_mod, "send_email") as mock_send:
            success = send_mention_notification(
                mentioned_member=henri,
                author_name="Joséphine Jamet",
                context_title="Tâche Peinture",
                message_text="Coucou @Henri",
                target_url="https://hellenvilliers.henri-jamet.com/taches?id=12"
            )

            assert success is False
            assert mock_send.call_count == 0, "Aucun email ne doit être envoyé si notify_mentions est False."
    finally:
        # Restaurer la préférence
        henri.notify_mentions = True
        db.commit()
        db.close()


# ==============================================================================
# TEST 3 : GARDE-FOU ANTI-AUTO-MENTION
# ==============================================================================

def test_05_anti_self_mention_suppresses_email(monkeypatch):
    """Vérifie qu'un auteur qui se mentionne lui-même ne reçoit pas d'e-mail."""
    monkeypatch.setattr(email_mod, "DISABLE_ALL_EMAILS", False)
    monkeypatch.setenv("DISABLE_ALL_EMAILS", "false")

    db = SessionLocal()
    try:
        henri = db.query(Member).filter(Member.prenom == "Henri").first()
        assert henri is not None
        henri.notify_mentions = True
        henri.email = "hellenvillierssci@gmail.com"
        db.commit()

        with patch.object(email_mod, "send_email") as mock_send:
            # 1. Nom complet identique
            res1 = send_mention_notification(
                mentioned_member=henri,
                author_name="Henri Jamet",
                context_title="Point Travaux",
                message_text="Note pour moi-même @Henri",
                target_url="https://hellenvilliers.henri-jamet.com/taches?id=1"
            )
            assert res1 is False
            assert mock_send.call_count == 0

            # 2. Prénom seul identique (insensible à la casse)
            res2 = send_mention_notification(
                mentioned_member=henri,
                author_name="henri",
                context_title="Point Travaux",
                message_text="@Henri penser aux vis",
                target_url="https://hellenvilliers.henri-jamet.com/taches?id=1"
            )
            assert res2 is False
            assert mock_send.call_count == 0
    finally:
        db.close()


# ==============================================================================
# TEST 4 : MISE À JOUR DE LA PRÉFÉRENCE VIA L'API
# ==============================================================================

def test_06_update_preference_via_api_endpoints(auth_headers):
    """Vérifie la mise à jour et la persistance de notify_mentions via les endpoints de settings et profil."""
    # 1. PUT /api/auth/profile -> False
    resp1 = client.put("/api/auth/profile", headers=auth_headers, json={"notify_mentions": False})
    assert resp1.status_code == 200
    assert resp1.json()["notify_mentions"] is False

    # GET /api/auth/profile -> vérification lecture
    resp1_get = client.get("/api/auth/profile", headers=auth_headers)
    assert resp1_get.status_code == 200
    assert resp1_get.json()["notify_mentions"] is False

    # 2. PUT /api/auth/settings -> True
    resp2 = client.put("/api/auth/settings", headers=auth_headers, json={"notify_mentions": True})
    assert resp2.status_code == 200
    assert resp2.json()["notify_mentions"] is True

    # 3. PUT /api/settings/notifications -> False
    resp3 = client.put("/api/settings/notifications", headers=auth_headers, json={"notify_mentions": False})
    assert resp3.status_code == 200
    assert resp3.json()["notify_mentions"] is False

    # GET /api/settings/notifications -> False
    resp3_get = client.get("/api/settings/notifications", headers=auth_headers)
    assert resp3_get.status_code == 200
    assert resp3_get.json()["notify_mentions"] is False

    # 4. PUT /api/members/me/settings -> True
    resp4 = client.put("/api/members/me/settings", headers=auth_headers, json={"notify_mentions": True})
    assert resp4.status_code == 200
    assert resp4.json()["notify_mentions"] is True

    # 5. PUT /api/members/{member_id}/settings -> False puis True
    resp5 = client.put("/api/members/1/settings", json={"notify_mentions": False})
    assert resp5.status_code == 200
    assert resp5.json()["notify_mentions"] is False

    resp6 = client.put("/api/members/1/settings", json={"notify_mentions": True})
    assert resp6.status_code == 200
    assert resp6.json()["notify_mentions"] is True

    # Vérification en base SQLite
    db = SessionLocal()
    try:
        member = db.query(Member).filter(Member.id == 1).first()
        assert member.notify_mentions is True
    finally:
        db.close()


# ==============================================================================
# TEST 5 : MENTIONS SUR LES PROJETS / SCRUTINS
# ==============================================================================

def test_07_mention_triggered_on_project_messages():
    """Vérifie que les messages de projet / vote déclenchent aussi les notifications de mention."""
    db = SessionLocal()
    try:
        project = db.query(Project).first()
        if not project:
            project = Project(
                property_id=1,
                title="Rénovation Toiture Test",
                description="Test",
                submitted_by="Henri Jamet"
            )
            db.add(project)
            db.commit()
            db.refresh(project)

        project_id = project.id

        with patch("app.main.send_mention_notification") as mock_notify:
            mock_notify.return_value = True

            payload = {
                "author_name": "Henri Jamet",
                "content": "Bonjour @Marguerite, pourrais-tu donner ton avis sur ce devis ?"
            }

            resp = client.post(f"/api/projects/{project_id}/messages", json=payload)
            assert resp.status_code == 201

            assert mock_notify.call_count >= 1
            args, kwargs = mock_notify.call_args
            called_member = kwargs.get("mentioned_member")
            assert called_member is not None
            assert called_member.prenom == "Marguerite"
            assert kwargs.get("author_name") == "Henri Jamet"
            assert kwargs.get("context_title") == project.title
            assert kwargs.get("message_text") == payload["content"]
            assert f"/taches?project_id={project.id}" in kwargs.get("target_url")
    finally:
        db.close()

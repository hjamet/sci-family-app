import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.services.drive_service import GoogleDriveJailService, drive_jail_service

client = TestClient(app)


def test_oauth_routes_deleted_return_404():
    """Vérifie que les routes OAuth in-app ont été supprimées et renvoient 404."""
    # Route URL d'autorisation
    res_url = client.get("/api/drive/oauth/url")
    assert res_url.status_code == 404, f"Attendu 404 pour route supprimée, reçu {res_url.status_code}"

    # Route Callback
    res_cb = client.get("/api/drive/oauth/callback?code=fake_code&state=fake_state")
    assert res_cb.status_code == 404, f"Attendu 404 pour route supprimée, reçu {res_cb.status_code}"


def test_missing_env_token_fail_loud():
    """Vérifie qu'une variable GOOGLE_DRIVE_REFRESH_TOKEN absente ou vide provoque une erreur explicite."""
    jail = GoogleDriveJailService()

    # 1. Dans _get_client: levée impérative de RuntimeError
    with patch.dict(os.environ, {"GOOGLE_DRIVE_REFRESH_TOKEN": ""}, clear=False):
        with pytest.raises(RuntimeError) as exc_info:
            jail._get_client()
        assert "GOOGLE_DRIVE_REFRESH_TOKEN manquante (Fail-Loud)" in str(exc_info.value)

    # 2. Dans check_connection_status: statut déconnecté explicite sans crash masqué
    with patch.dict(os.environ, {"GOOGLE_DRIVE_REFRESH_TOKEN": ""}, clear=False):
        status_info = jail.check_connection_status()
        assert status_info["connected"] is False
        assert status_info["status"] == "missing_token"
        assert "non configurée" in status_info["message"]


def test_henri_only_visibility_logic():
    """Vérifie la logique de restriction d'affichage du bandeau d'alerte : Henri uniquement."""
    # Simulation de la fonction de filtrage d'identité (miroir de DriveReauthBanner.jsx)
    def is_visible_to_user(user):
        if not user:
            return False
        if isinstance(user, str):
            return "henri" in user.lower()
        if user.get("prenom") and "henri" in user["prenom"].lower():
            return True
        if user.get("name") and "henri" in user["name"].lower():
            return True
        if user.get("fullName") and "henri" in user["fullName"].lower():
            return True
        if user.get("email") and ("henri" in user["email"].lower() or "hellenvillierssci" in user["email"].lower()):
            return True
        return False

    # Henri -> visible
    assert is_visible_to_user({"prenom": "Henri", "name": "Henri Jamet", "email": "hellenvillierssci@gmail.com", "is_coordinator": True}) is True
    assert is_visible_to_user("Henri Jamet") is True

    # Joséphine (bien que coordinatrice !) -> NON visible
    assert is_visible_to_user({"prenom": "Joséphine", "name": "Joséphine Jamet", "email": "josephine_jamet@yahoo.fr", "is_coordinator": True}) is False

    # Autres associés -> NON visible
    assert is_visible_to_user({"prenom": "Hortense", "name": "Hortense Jamet", "email": "hortense_jamet@yahoo.fr", "is_coordinator": False}) is False
    assert is_visible_to_user({"prenom": "Marguerite", "name": "Marguerite Jamet", "email": "marguerite_jamet@yahoo.fr", "is_coordinator": False}) is False
    assert is_visible_to_user({"prenom": "Eugénie", "name": "Eugénie Jamet", "email": "eugenie_jamet@yahoo.fr", "is_coordinator": False}) is False
    assert is_visible_to_user({"prenom": "Maman", "name": "Maman Jamet", "email": "elizabeth_jamet@yahoo.fr", "is_coordinator": False}) is False
    assert is_visible_to_user({"prenom": "Frédéric", "name": "Frédéric Jamet", "email": "frdjamet@gmail.com", "is_coordinator": False}) is False
    assert is_visible_to_user(None) is False


def test_drive_status_unauthenticated_returns_401():
    """Vérifie que la route /api/drive/status exige l'authentification et renvoie 401 sans jeton."""
    res = client.get("/api/drive/status")
    assert res.status_code == 401, f"Attendu 401 sans jeton, reçu {res.status_code}"


def test_drive_status_authenticated_henri_vs_others():
    """Vérifie que seul Henri accède au détail technique et que les autres reçoivent une vue restreinte."""
    from app.main import get_current_user

    class DummyUser:
        def __init__(self, prenom, email):
            self.prenom = prenom
            self.email = email
            self.id = 1

    # 1. Henri
    app.dependency_overrides[get_current_user] = lambda: DummyUser("Henri", "hellenvillierssci@gmail.com")
    try:
        res = client.get("/api/drive/status")
        assert res.status_code == 200
        data = res.json()
        assert "connected" in data
        assert "service" in data or "status" in data
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    # 2. Autre membre (ex: Marguerite)
    app.dependency_overrides[get_current_user] = lambda: DummyUser("Marguerite", "marguerite@yahoo.fr")
    try:
        res = client.get("/api/drive/status")
        assert res.status_code == 200
        data = res.json()
        assert data.get("restricted") is True
        assert data.get("connected") is True
    finally:
        app.dependency_overrides.pop(get_current_user, None)


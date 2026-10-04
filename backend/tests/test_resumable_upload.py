import os
import sys
import io
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.main import app
from app.services.drive_service import drive_jail_service, SecurityException, ALLOWED_FOLDER_ID
from app.database import get_db, SessionLocal
from app.models import AdminDocument, Task

client = TestClient(app)

from app.main import get_current_user

class DummyUser:
    prenom = "Henri"
    email = "hellenvillierssci@gmail.com"
    id = 1

@pytest.fixture(autouse=True)
def setup_auth_override():
    app.dependency_overrides[get_current_user] = lambda: DummyUser()
    yield
    app.dependency_overrides.pop(get_current_user, None)

def test_resumable_upload_init():
    """Vérifie que l'endpoint init initie correctement la session et renvoie l'URL de session."""
    with patch.object(drive_jail_service, "init_resumable_upload") as mock_init:
        mock_init.return_value = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock123"

        res = client.post(
            "/api/documents/upload/resumable/init",
            json={
                "filename": "facture_travaux_toiture.pdf",
                "total_size": 15000000,
                "mimetype": "application/pdf",
                "organisme": "Bompais",
                "title": "Facture Toiture",
                "category": "Travaux & Chantiers",
                "uploaded_by": "Henri Jamet"
            }
        )

        assert res.status_code == 200, f"Erreur init: {res.text}"
        data = res.json()
        assert "upload_url" in data
        assert data["upload_url"] == "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock123"
        assert data["canonical_filename"].startswith("Bompais ")
        assert data["total_size"] == 15000000
        mock_init.assert_called_once()


def test_resumable_upload_chunk_relay():
    """Vérifie que le relais chunk Vercel transmet le morceau binaire et respecte le plafond de 4 Mo."""
    with patch.object(drive_jail_service, "relay_chunk") as mock_relay:
        mock_relay.return_value = (308, {}, "")

        chunk_data = b"0" * (2 * 1024 * 1024)  # 2 Mo
        res = client.put(
            "/api/documents/upload/resumable/chunk",
            headers={
                "X-Upload-Url": "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock123",
                "Content-Range": "bytes 0-2097151/15000000",
                "Content-Type": "application/pdf"
            },
            content=chunk_data
        )

        assert res.status_code == 308, f"Erreur relay chunk: {res.text}"
        mock_relay.assert_called_once()

    # Test rejet chunk > 4 Mo
    too_large_chunk = b"0" * (5 * 1024 * 1024)
    res_large = client.put(
        "/api/documents/upload/resumable/chunk",
        headers={
            "X-Upload-Url": "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock123",
            "Content-Range": "bytes 0-5242879/15000000",
            "Content-Type": "application/pdf"
        },
        content=too_large_chunk
    )
    assert res_large.status_code == 413, "Le relais aurait dû rejeter le morceau > 4 Mo"


def test_resumable_upload_complete_and_download():
    """Vérifie la finalisation avec Strict Drive Jail, l'archivage avec file_data=None et le téléchargement streaming."""
    fake_drive_id = "test_drive_file_id_9999"
    fake_meta = {
        "id": fake_drive_id,
        "name": "Bompais 102026 Facture Toiture.pdf",
        "parents": [ALLOWED_FOLDER_ID],
        "mimeType": "application/pdf",
        "size": "15000000"
    }

    with patch.object(drive_jail_service, "get_file_metadata") as mock_meta:
        mock_meta.return_value = fake_meta

        complete_res = client.post(
            "/api/documents/upload/resumable/complete",
            json={
                "drive_file_id": fake_drive_id,
                "filename": "Bompais 102026 Facture Toiture.pdf",
                "file_size": 15000000,
                "mimetype": "application/pdf",
                "organisme": "Bompais",
                "title": "Facture Toiture",
                "category": "Travaux & Chantiers",
                "uploaded_by": "Henri Jamet"
            }
        )

        assert complete_res.status_code == 201, f"Erreur complete: {complete_res.text}"
        doc_data = complete_res.json()
        doc_id = doc_data["id"]
        assert doc_data["drive_file_id"] == fake_drive_id

        # Vérifier en base que file_data est STRICTEMENT None (zéro saturation DB)
        db = SessionLocal()
        try:
            db_doc = db.query(AdminDocument).filter(AdminDocument.id == doc_id).first()
            assert db_doc is not None
            assert db_doc.file_data is None, "file_data aurait dû être None pour préserver la base !"
            assert db_doc.drive_file_id == fake_drive_id
            assert db_doc.file_size == 15000000
        finally:
            db.close()

        # Tester le téléchargement streaming depuis Drive quand file_data est None
        fake_binary = b"%PDF-1.4 TEST RESUMABLE DOWNLOAD CONTENT FROM DRIVE"
        with patch.object(drive_jail_service, "stream_file") as mock_stream:
            mock_stream.return_value = (iter([fake_binary]), fake_meta, len(fake_binary))

            dl_res = client.get(f"/api/documents/{doc_id}/download")
            assert dl_res.status_code == 200
            assert dl_res.content == fake_binary
            mock_stream.assert_called_with(fake_drive_id)

        # Nettoyage
        client.delete(f"/api/documents/{doc_id}")


def test_drive_status_endpoint():
    """Vérifie que l'endpoint GET /api/drive/status retourne le statut de connexion pour un utilisateur authentifié."""
    from app.main import get_current_user
    class DummyUser:
        prenom = "Henri"
        email = "hellenvillierssci@gmail.com"
        id = 1
    app.dependency_overrides[get_current_user] = lambda: DummyUser()
    try:
        with patch.object(drive_jail_service, "check_connection_status") as mock_status:
            mock_status.return_value = {
                "connected": True,
                "status": "ok",
                "message": "Connexion Google Drive active et opérationnelle."
            }
            res = client.get("/api/drive/status")
            assert res.status_code == 200
            data = res.json()
            assert data["connected"] is True
            assert data["status"] == "ok"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_drive_oauth_routes_deleted():
    """Vérifie que les routes OAuth /api/drive/oauth/url et /api/drive/oauth/callback ont bien été supprimées (404)."""
    res_url = client.get("/api/drive/oauth/url")
    assert res_url.status_code == 404, f"Attendu 404 pour route supprimée, reçu {res_url.status_code}"

    res_callback = client.get("/api/drive/oauth/callback")
    assert res_callback.status_code == 404, f"Attendu 404 pour route supprimée, reçu {res_callback.status_code}"


def test_drive_missing_env_token_fail_loud():
    """Vérifie le comportement fail-loud lorsque la variable GOOGLE_DRIVE_REFRESH_TOKEN est absente."""
    from app.main import get_current_user
    class DummyUser:
        prenom = "Henri"
        email = "hellenvillierssci@gmail.com"
        id = 1
    app.dependency_overrides[get_current_user] = lambda: DummyUser()
    try:
        # 1. Statut via GET /api/drive/status
        with patch.dict(os.environ, {"GOOGLE_DRIVE_REFRESH_TOKEN": ""}, clear=False):
            res = client.get("/api/drive/status")
            assert res.status_code == 200
            data = res.json()
            assert data["connected"] is False
            assert data["status"] == "missing_token"
            assert "non configurée" in data["message"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    # 2. _get_client lève impérativement RuntimeError sans repli silencieux
    from app.services.drive_service import GoogleDriveJailService
    jail = GoogleDriveJailService()
    with patch.dict(os.environ, {"GOOGLE_DRIVE_REFRESH_TOKEN": ""}, clear=False):
        with pytest.raises(RuntimeError) as exc_info:
            jail._get_client()
        assert "GOOGLE_DRIVE_REFRESH_TOKEN manquante (Fail-Loud)" in str(exc_info.value)


def test_drive_expired_token_fail_loud():
    """Vérifie le message fail-loud clair lorsque le jeton Google Drive est expiré."""
    with patch.object(drive_jail_service, "init_resumable_upload") as mock_init:
        mock_init.side_effect = Exception("invalid_grant: Token has been expired or revoked.")

        # Cas 1 : Henri -> Renvoi vers la note d'accès (sans bouton in-app)
        res_henri = client.post(
            "/api/documents/upload/resumable/init",
            json={
                "filename": "gros_fichier.pdf",
                "total_size": 10000000,
                "mimetype": "application/pdf",
                "organisme": "SCI",
                "title": "Document",
                "uploaded_by": "Henri Jamet"
            }
        )
        assert res_henri.status_code == 503
        assert "Google Drive déconnecté" in res_henri.json()["detail"]
        assert "régénérer le jeton" in res_henri.json()["detail"]

        # Cas 2 : Autre membre -> Message d'indisponibilité rassurant sans jargon
        res_membre = client.post(
            "/api/documents/upload/resumable/init",
            json={
                "filename": "gros_fichier.pdf",
                "total_size": 10000000,
                "mimetype": "application/pdf",
                "organisme": "SCI",
                "title": "Document",
                "uploaded_by": "Anne Jamet"
            }
        )
        assert res_membre.status_code == 503
        assert "Henri a été prévenu" in res_membre.json()["detail"]


def test_resumable_relay_without_token_returns_401():
    """Vérifie que l'appel au relais sans jeton d'authentification retourne impérativement 401 Unauthorized."""
    app.dependency_overrides.pop(get_current_user, None)
    try:
        res = client.put(
            "/api/documents/upload/resumable/chunk",
            headers={
                "X-Upload-Url": "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock123",
                "Content-Range": "bytes 0-1023/2048"
            },
            content=b"0" * 1024
        )
        assert res.status_code == 401
    finally:
        app.dependency_overrides[get_current_user] = lambda: DummyUser()


def test_resumable_relay_non_google_url_returns_400():
    """Vérifie que l'appel au relais avec une URL non-Google retourne 400 Bad Request (protection anti-SSRF)."""
    # 1. Schéma non-https
    res1 = client.put(
        "/api/documents/upload/resumable/chunk",
        headers={
            "X-Upload-Url": "http://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock123",
            "Content-Range": "bytes 0-1023/2048"
        },
        content=b"0" * 1024
    )
    assert res1.status_code == 400

    # 2. Hôte externe non-Google
    res2 = client.put(
        "/api/documents/upload/resumable/chunk",
        headers={
            "X-Upload-Url": "https://attacker.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock123",
            "Content-Range": "bytes 0-1023/2048"
        },
        content=b"0" * 1024
    )
    assert res2.status_code == 400

    # 3. Chemin hors /upload/drive/v3/
    res3 = client.put(
        "/api/documents/upload/resumable/chunk",
        headers={
            "X-Upload-Url": "https://www.googleapis.com/other/service",
            "Content-Range": "bytes 0-1023/2048"
        },
        content=b"0" * 1024
    )
    assert res3.status_code == 400


def test_resumable_relay_propagates_range_header():
    """Vérifie que l'en-tête Range de la réponse 308 Google Drive est fidèlement propagé au client."""
    with patch.object(drive_jail_service, "relay_chunk") as mock_relay:
        from app.services.drive_service import RelayResult
        mock_relay.return_value = RelayResult(308, {}, "", {"Range": "bytes 0-2097151"})

        res = client.put(
            "/api/documents/upload/resumable/chunk",
            headers={
                "X-Upload-Url": "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock123",
                "Content-Range": "bytes 0-2097151/15000000",
                "Content-Type": "application/pdf"
            },
            content=b"0" * 1024
        )
        assert res.status_code == 308
        assert res.headers.get("Range") == "bytes 0-2097151"


def test_drive_q_escaping_apostrophe_and_injection():
    """Vérifie l'échappement strict des apostrophes françaises et l'immunité aux injections q."""
    from app.services.drive_service import GoogleDriveJailService, escape_drive_query_value

    # Apostrophe nominale
    nom_fr = "Facture l'artisan d'eau.pdf"
    assert escape_drive_query_value(nom_fr) == r"Facture l\'artisan d\'eau.pdf"

    # Tentative d'évasion SQL/q
    injection = "x') or (trashed = false"
    assert escape_drive_query_value(injection) == r"x\') or (trashed = false"

    jail = GoogleDriveJailService(folder_id=ALLOWED_FOLDER_ID)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"files": []}

    with patch.object(jail, "_request", return_value=mock_resp) as mock_req:
        # Recherche par nom avec apostrophe
        jail.list_files(name=nom_fr, force_refresh=True)
        call_q1 = mock_req.call_args[1]["params"]["q"]
        assert r"name = 'Facture l\'artisan d\'eau.pdf'" in call_q1
        assert f"'{ALLOWED_FOLDER_ID}' in parents and trashed = false" in call_q1

        # Tentative d'injection via name
        jail.list_files(name=injection, force_refresh=True)
        call_q2 = mock_req.call_args[1]["params"]["q"]
        assert r"name = 'x\') or (trashed = false'" in call_q2
        assert f"'{ALLOWED_FOLDER_ID}' in parents and trashed = false" in call_q2


def test_drive_pagination_next_page_token():
    """Vérifie que list_files boucle sur nextPageToken et agrège toutes les pages."""
    from app.services.drive_service import GoogleDriveJailService
    jail = GoogleDriveJailService(folder_id=ALLOWED_FOLDER_ID)

    resp_page1 = MagicMock()
    resp_page1.status_code = 200
    resp_page1.json.return_value = {
        "files": [{"id": f"file_{i}", "parents": [ALLOWED_FOLDER_ID]} for i in range(100)],
        "nextPageToken": "token_page_2"
    }

    resp_page2 = MagicMock()
    resp_page2.status_code = 200
    resp_page2.json.return_value = {
        "files": [{"id": f"file_{i}", "parents": [ALLOWED_FOLDER_ID]} for i in range(100, 150)],
        "nextPageToken": None
    }

    with patch.object(jail, "_request", side_effect=[resp_page1, resp_page2]):
        files = jail.list_files(force_refresh=True)
        assert len(files) == 150
        assert files[0]["id"] == "file_0"
        assert files[149]["id"] == "file_149"


def test_drive_streaming_download():
    """Vérifie que stream_file diffuse en morceaux sans saturer la RAM."""
    from app.services.drive_service import GoogleDriveJailService
    jail = GoogleDriveJailService(folder_id=ALLOWED_FOLDER_ID)

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"Content-Length": "31457280"}
    mock_resp.iter_content.return_value = [b"chunk_" + str(i).encode() for i in range(30)]

    with patch.object(jail, "get_file_metadata", return_value={"id": "file_big", "parents": [ALLOWED_FOLDER_ID], "size": "31457280"}), \
         patch.object(jail, "_request", return_value=mock_resp):
        gen, meta, size = jail.stream_file("file_big", chunk_size=1024*1024)
        assert size == 31457280
        chunks = list(gen)
        assert len(chunks) == 30
        assert chunks[0] == b"chunk_0"


def test_french_currency_formatting():
    """Vérifie le formatage monétaire français strict avec séparateur de milliers et virgule."""
    from app.main import format_currency_fr
    assert format_currency_fr(1234.50) == "1 234,50 €"
    assert format_currency_fr(1234.50, include_symbol=False) == "1 234,50"
    assert format_currency_fr(45.5) == "45,50 €"
    assert format_currency_fr(1000000.0) == "1 000 000,00 €"


def test_task_advance_only_by_expense_link():
    """Vérifie qu'une tâche n'est qualifiée d'avance que par un lien explicite (expense_id), jamais par catégorie."""
    from app.main import format_task_response
    from app.models import Task
    import json

    # 1. Tâche trésorerie ordinaire SANS expense_id -> N'EST PAS une avance
    t_ordinary = Task(
        id=101,
        title="Point trimestriel banque",
        category="Finances & Trésorerie",
        status="PROPOSED",
        key_values=json.dumps([{"key": "Banque", "value": "CA"}]),
        created_by="Henri Jamet"
    )
    formatted_ordinary = format_task_response(t_ordinary)
    assert formatted_ordinary["expense_id"] is None

    # 2. Tâche d'avance AVEC expense_id -> EST une avance
    t_advance = Task(
        id=102,
        title="Validation avance de frais : Henri - Bricolage (45,00 €)",
        category="Finances & Trésorerie",
        status="TODO",
        key_values=json.dumps([{"key": "expense_id", "value": "42"}]),
        created_by="Henri Jamet"
    )
    formatted_advance = format_task_response(t_advance)
    assert formatted_advance["expense_id"] == 42


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
        with patch.object(drive_jail_service, "download_file") as mock_dl:
            mock_dl.return_value = (fake_binary, fake_meta)

            dl_res = client.get(f"/api/documents/{doc_id}/download")
            assert dl_res.status_code == 200
            assert dl_res.content == fake_binary
            mock_dl.assert_called_with(fake_drive_id)

        # Nettoyage
        client.delete(f"/api/documents/{doc_id}")


def test_drive_status_endpoint():
    """Vérifie que l'endpoint GET /api/drive/status retourne le statut de connexion."""
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


def test_drive_oauth_url_endpoint():
    """Vérifie que l'endpoint GET /api/drive/oauth/url renvoie l'URL Google OAuth."""
    with patch.object(drive_jail_service, "get_oauth_authorization_url") as mock_auth:
        mock_auth.return_value = "https://accounts.google.com/o/oauth2/v2/auth?client_id=fake&response_type=code"
        res = client.get("/api/drive/oauth/url")
        assert res.status_code == 200
        data = res.json()
        assert "auth_url" in data
        assert "https://accounts.google.com" in data["auth_url"]
        assert "redirect_uri" in data


def test_drive_expired_token_fail_loud():
    """Vérifie le message fail-loud clair lorsque le jeton Google Drive est expiré."""
    with patch.object(drive_jail_service, "init_resumable_upload") as mock_init:
        mock_init.side_effect = Exception("invalid_grant: Token has been expired or revoked.")

        # Cas 1 : Henri (coordinateur) -> Invitation explicite à reconnecter
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
        assert "Reconnecter Google Drive" in res_henri.json()["detail"]

        # Cas 2 : Autre membre -> Message rassurant sans jargon
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

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


def test_drive_oauth_url_security():
    """Vérifie la sécurité stricte de /api/drive/oauth/url (401 sans token, 403 non-coordinateur, 200 coordinateur)."""
    from app.models import Member
    from app.security import create_access_token

    # 1. Sans authentification -> 401
    res_no_auth = client.get("/api/drive/oauth/url")
    assert res_no_auth.status_code == 401, f"Attendu 401, reçu {res_no_auth.status_code}"

    # Préparation utilisateurs de test
    db = SessionLocal()
    try:
        # Membre simple (non-coordinateur)
        member = db.query(Member).filter(Member.email == "test_simple_user@hellenvilliers.local").first()
        if not member:
            member = Member(prenom="SimpleTest", name="User", email="test_simple_user@hellenvilliers.local", is_coordinator=False)
            db.add(member)
            db.commit()
            db.refresh(member)
        else:
            member.is_coordinator = False
            db.commit()

        # Coordinateur (Henri)
        coord = db.query(Member).filter(Member.email == "test_coord_henri@hellenvilliers.local").first()
        if not coord:
            coord = Member(prenom="HenriTest", name="Coord", email="test_coord_henri@hellenvilliers.local", is_coordinator=True)
            db.add(coord)
            db.commit()
            db.refresh(coord)
        else:
            coord.is_coordinator = True
            db.commit()

        token_member = create_access_token({"sub": member.prenom, "user_id": member.id, "email": member.email})
        token_coord = create_access_token({"sub": coord.prenom, "user_id": coord.id, "email": coord.email})

        # 2. Utilisateur non-coordinateur -> 403 Forbidden
        res_forbidden = client.get(
            "/api/drive/oauth/url",
            headers={"Authorization": f"Bearer {token_member}"}
        )
        assert res_forbidden.status_code == 403, f"Attendu 403, reçu {res_forbidden.status_code}"

        # 3. Coordinateur authentifié -> 200 OK avec state signé, access_type=offline, prompt=consent
        with patch.object(drive_jail_service, "get_oauth_credentials_info") as mock_creds:
            mock_creds.return_value = ("fake_client_id.apps.googleusercontent.com", "fake_secret", "fake_refresh")
            res_coord = client.get(
                "/api/drive/oauth/url",
                headers={"Authorization": f"Bearer {token_coord}"}
            )
            assert res_coord.status_code == 200
            data = res_coord.json()
            assert "auth_url" in data
            assert "access_type=offline" in data["auth_url"]
            assert "prompt=consent" in data["auth_url"]
            assert "state" in data
            import urllib.parse
            assert urllib.parse.quote(data["state"], safe="") in data["auth_url"]
    finally:
        db.close()


def test_drive_oauth_callback_security():
    """Vérifie le filtrage du callback OAuth (400 si state manquant, 403 si falsifié ou rejeu, 303 si valide)."""
    from app.models import Member
    from app.main import generate_oauth_state

    db = SessionLocal()
    try:
        coord = db.query(Member).filter(Member.email == "test_coord_henri@hellenvilliers.local").first()
        if not coord:
            coord = Member(prenom="HenriTest", name="Coord", email="test_coord_henri@hellenvilliers.local", is_coordinator=True)
            db.add(coord)
            db.commit()
            db.refresh(coord)
        coord_id = coord.id
    finally:
        db.close()

    # 1. State manquant -> 400 Bad Request
    res_no_state = client.get("/api/drive/oauth/callback?code=mock_code")
    assert res_no_state.status_code == 400, f"Attendu 400, reçu {res_no_state.status_code}"

    # 2. State falsifié / signature incorrecte -> 403 Forbidden
    res_bad_state = client.get("/api/drive/oauth/callback?code=mock_code&state=fake:timestamp:nonce:invalidsig")
    assert res_bad_state.status_code == 403, f"Attendu 403, reçu {res_bad_state.status_code}"

    # 3. State valide généré pour le coordinateur
    valid_state = generate_oauth_state(user_id=coord_id)

    with patch.object(drive_jail_service, "exchange_code_and_save_token") as mock_exchange:
        mock_exchange.return_value = {"status": "success"}

        # Premier passage -> 303 Redirect vers /admin?drive_connected=true
        res_success = client.get(f"/api/drive/oauth/callback?code=mock_code_123&state={valid_state}", follow_redirects=False)
        assert res_success.status_code == 303, f"Attendu 303, reçu {res_success.status_code}"
        assert "drive_connected=true" in res_success.headers.get("location", "")

        # 4. Tentative de rejeu du MÊME state -> 403 Forbidden (usage unique anti-rejeu)
        res_replay = client.get(f"/api/drive/oauth/callback?code=mock_code_replay&state={valid_state}", follow_redirects=False)
        assert res_replay.status_code == 403, f"Attendu 403 pour rejeu, reçu {res_replay.status_code}"



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

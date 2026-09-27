import os
import sys
import io
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
from app.services.drive_service import drive_jail_service
from app.models import AdminDocument
from app.database import SessionLocal

client = TestClient(app)

def test_upload_resilience_without_google_drive_credentials():
    """
    Validation Annotation 13 & 14 :
    Vérifie que POST /api/documents/upload ne renvoie JAMAIS HTTP 500
    lorsque Google Drive n'est pas configuré (absence de tokens/credentials sur Vercel Serverless).
    Le document doit être persisté en base de données et téléchargeable avec succès.
    """
    test_binary = b"%PDF-1.4 Zero-Crash Fallback Document Content - No Google Drive Credentials"
    test_org = "TESTORG"
    test_title = "Document Test Sans Credentials Drive"
    test_cat = "Banque & Finances"

    # Simulation d'un environnement sans Google Drive configuré
    with patch.object(drive_jail_service, "is_configured", return_value=False):
        response = client.post(
            "/api/documents/upload",
            data={
                "organisme": test_org,
                "title": test_title,
                "category": test_cat,
                "uploaded_by": "Henri Jamet"
            },
            files={
                "file": ("certif_test.pdf", io.BytesIO(test_binary), "application/pdf")
            }
        )

        assert response.status_code in (200, 201), f"Échec upload: {response.status_code} - {response.text}"
        data = response.json()
        assert data["id"] is not None
        assert data["drive_file_id"] is None
        assert test_org in data["filename"]
        assert test_title in data["filename"]
        doc_id = data["id"]

        # Vérification en base de données
        db = SessionLocal()
        try:
            db_doc = db.query(AdminDocument).filter(AdminDocument.id == doc_id).first()
            assert db_doc is not None
            assert db_doc.file_data == test_binary
            assert db_doc.drive_file_id is None
        finally:
            db.close()

        # Vérification du téléchargement de secours (base / cache)
        dl_resp = client.get(f"/api/documents/{doc_id}/download")
        assert dl_resp.status_code == 200
        assert dl_resp.content == test_binary


def test_upload_resilience_when_google_drive_raises_exception():
    """
    Validation Annotation 13 & 14 :
    Vérifie que POST /api/documents/upload ne renvoie JAMAIS HTTP 500
    si drive_jail_service.upload_file lève une exception inattendue (quota, réseau, HttpError).
    """
    test_binary = b"Contenu de test avec exception Drive simulee"
    test_org = "SCI"
    test_title = "Quittance Exception Test"
    test_cat = "Factures"

    with patch.object(drive_jail_service, "is_configured", return_value=True), \
         patch.object(drive_jail_service, "upload_file", side_effect=RuntimeError("Erreur quota ou timeout")):

        response = client.post(
            "/api/documents/upload",
            data={
                "organisme": test_org,
                "title": test_title,
                "category": test_cat,
                "uploaded_by": "Henri Jamet"
            },
            files={
                "file": ("quittance.pdf", io.BytesIO(test_binary), "application/pdf")
            }
        )

        assert response.status_code in (200, 201), f"Échec upload: {response.status_code} - {response.text}"
        data = response.json()
        assert data["id"] is not None
        assert data["drive_file_id"] is None
        doc_id = data["id"]

        # Téléchargement réussi via le fallback binaire
        dl_resp = client.get(f"/api/documents/{doc_id}/download")
        assert dl_resp.status_code == 200
        assert dl_resp.content == test_binary

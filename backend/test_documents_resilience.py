import os
import sys
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from fastapi import HTTPException
from sqlalchemy.orm import Session

# Assurer l'accès au module backend
sys.path.insert(0, os.path.dirname(__file__))

from app.main import app
from app.models import AdminDocument
from app.database import get_db, SessionLocal

client = TestClient(app)

def test_documents_resilience_drive_credentials_missing():
    """
    Vérifie que la route GET /api/documents renvoie HTTP 200 même si
    Google Drive lève une RuntimeError (credentials manquants sur Vercel).
    """
    with patch("app.main.drive_jail_service.list_files", side_effect=RuntimeError("Aucun identifiant Google Drive valide trouvé")):
        response = client.get("/api/documents")
        assert response.status_code == 200, f"Erreur inattendue : {response.status_code} {response.text}"
        data = response.json()
        assert isinstance(data, list), "La réponse doit être une liste"
        
        # Vérification des champs attendus par le frontend
        if len(data) > 0:
            doc = data[0]
            assert "id" in doc
            assert "title" in doc
            assert "name" in doc
            assert "category" in doc
            assert "created_at" in doc
            assert "size" in doc
            assert "mime_type" in doc
            assert "drive_file_id" in doc

def test_documents_resilience_drive_http_error():
    """
    Vérifie que la route GET /api/documents renvoie HTTP 200 même si
    l'API Google Drive échoue avec une exception HTTP (quota, 503, etc.).
    """
    with patch("app.main.drive_jail_service.list_files", side_effect=HTTPException(status_code=503, detail="Service Google Drive indisponible")):
        response = client.get("/api/documents?")
        assert response.status_code == 200, f"Erreur inattendue : {response.status_code} {response.text}"
        data = response.json()
        assert isinstance(data, list)

def test_documents_resilience_database_error():
    """
    Vérifie que la route GET /api/documents renvoie HTTP 200 même si
    la base de données rencontre une erreur de colonne/table manquante.
    """
    with patch.object(Session, "query", side_effect=Exception("column admin_documents.drive_file_id does not exist")):
        response = client.get("/api/documents")
        assert response.status_code == 200, f"Erreur inattendue : {response.status_code} {response.text}"
        data = response.json()
        assert isinstance(data, list)

def test_documents_resilience_both_drive_and_db_down():
    """
    Vérifie le pire scénario (Drive down ET DB down simultanément) :
    la route DOIT renvoyer HTTP 200 avec [] au lieu d'un crash 500.
    """
    with patch("app.main.drive_jail_service.list_files", side_effect=RuntimeError("Drive indisponible")), \
         patch.object(Session, "query", side_effect=Exception("DB indisponible")):
        response = client.get("/api/documents")
        assert response.status_code == 200, f"Erreur inattendue : {response.status_code} {response.text}"
        data = response.json()
        assert isinstance(data, list)
        assert data == []

def test_documents_drive_sync_success():
    """
    Vérifie la synchronisation gracieuse lorsque Google Drive renvoie des fichiers.
    """
    mock_drive_files = [
        {
            "id": "drive_test_file_999",
            "name": "SCI 092026 Facture Rénovation Toiture.pdf",
            "size": 24576,
            "mimeType": "application/pdf",
            "createdTime": "2026-09-26T20:00:00Z"
        }
    ]
    with patch("app.main.drive_jail_service.list_files", return_value=mock_drive_files):
        response = client.get("/api/documents")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Trouver le document synchronisé
        synced = next((d for d in data if d.get("drive_file_id") == "drive_test_file_999"), None)
        assert synced is not None, "Le document Drive doit être synchronisé et présent dans la liste"
        assert synced["category"] == "Travaux & Factures"
        assert "download" in synced["file_url"]

def test_documents_category_filtering():
    """
    Vérifie le bon fonctionnement du filtre de catégorie.
    """
    response_all = client.get("/api/documents?category=all")
    assert response_all.status_code == 200

    response_cat = client.get("/api/documents?category=Actes%20%26%20Statuts")
    assert response_cat.status_code == 200
    for doc in response_cat.json():
        assert doc["category"] == "Actes & Statuts"

def test_admin_documents_alias():
    """
    Vérifie que la route alias /api/admin-documents fonctionne également sans crash.
    """
    response = client.get("/api/admin-documents")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

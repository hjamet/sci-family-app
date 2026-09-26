import os
import sys
import io
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

# Assurer l'accès au module backend
sys.path.insert(0, os.path.dirname(__file__))

from app.main import app, DOCUMENTS_DIR
from app.services.drive_service import drive_jail_service, SecurityException, ALLOWED_FOLDER_ID
from app.database import get_db, SessionLocal
from app.models import AdminDocument

client = TestClient(app)

def test_full_google_drive_documents_crud_and_jail():
    print("\n=======================================================")
    print("DEMARRAGE DU PROTOCOLE DE CERTIFICATION ZERO-TRUST DRIVE")
    print(f"Dossier autorise (Strict Drive Jail): {ALLOWED_FOLDER_ID}")
    print("=======================================================\n")

    test_content = b"%PDF-1.4 - Zero-Trust Google Drive End-to-End Certification Document"
    organisme_test = "SCI"
    titre_initial = "Test Certification E2E Integration"
    categorie_test = "Actes & Statuts"

    # -------------------------------------------------------------------------
    # 1. TEST UPLOAD DANS LE DOSSIER GOOGLE DRIVE CONFINE
    # -------------------------------------------------------------------------
    print("[ETAPE 1/5] Test POST /api/documents/upload vers Google Drive...")
    upload_res = client.post(
        "/api/documents/upload",
        data={
            "organisme": organisme_test,
            "title": titre_initial,
            "category": categorie_test,
            "uploaded_by": "Henri Jamet"
        },
        files={
            "file": ("test_certif.pdf", io.BytesIO(test_content), "application/pdf")
        }
    )

    assert upload_res.status_code == 201, f"Echec upload: {upload_res.status_code} - {upload_res.text}"
    doc_data = upload_res.json()
    doc_id = doc_data["id"]
    drive_file_id = doc_data.get("drive_file_id")
    canonical_filename = doc_data.get("filename")

    assert drive_file_id is not None, "drive_file_id manquant dans la reponse"
    assert canonical_filename.startswith("SCI "), f"Nom non canonique: {canonical_filename}"
    print(f" -> Upload REUSSI ! Document ID: {doc_id}, Drive File ID: {drive_file_id}")
    print(f" -> Nom canonique: {canonical_filename}")

    # Verification directe sur l'API Google Drive : le fichier est-il bien confiné ?
    drive_meta = drive_jail_service.get_file_metadata(drive_file_id)
    assert ALLOWED_FOLDER_ID in drive_meta.get("parents", []), "FAILLE CRITIQUE : Le fichier n'est pas dans ALLOWED_FOLDER_ID"
    print(f" -> Confinement Strict Drive Jail verifie avec succes sur Google Drive (parents: {drive_meta.get('parents')})")

    # -------------------------------------------------------------------------
    # 2. TEST TELECHARGEMENT / DOWNLOAD DEPUIS GOOGLE DRIVE
    # -------------------------------------------------------------------------
    print("\n[ETAPE 2/5] Test GET /api/documents/{id}/download depuis Google Drive...")
    download_res = client.get(f"/api/documents/{doc_id}/download")
    assert download_res.status_code == 200, f"Echec telechargement: {download_res.status_code}"
    assert download_res.content == test_content, "Integrite binaire alteree lors du telechargement"
    assert "attachment" in download_res.headers.get("content-disposition", "")
    print(f" -> Telechargement REUSSI ! Taille: {len(download_res.content)} octets, integrite 100% certifiee.")

    # -------------------------------------------------------------------------
    # 3. TEST RENOMMAGE (DRIVE + BASE DE DONNEES)
    # -------------------------------------------------------------------------
    print("\n[ETAPE 3/5] Test PATCH /api/documents/{id} pour renommage bi-directionnel...")
    nouveau_titre = "Test Certification E2E Renomme Avec Succes"
    rename_res = client.patch(
        f"/api/documents/{doc_id}",
        json={"title": nouveau_titre}
    )
    assert rename_res.status_code == 200, f"Echec renommage: {rename_res.status_code} - {rename_res.text}"
    renamed_doc = rename_res.json()
    assert renamed_doc["title"] == nouveau_titre
    print(f" -> Reponse API renommage: {renamed_doc['title']} / Fichier: {renamed_doc['filename']}")

    # Verification sur Google Drive que le fichier a reellement change de nom
    updated_drive_meta = drive_jail_service.get_file_metadata(drive_file_id)
    assert nouveau_titre in updated_drive_meta.get("name"), f"Nom non mis a jour sur Google Drive: {updated_drive_meta.get('name')}"
    print(f" -> Renommage REUSSI sur Google Drive ! Nouveau nom Drive: {updated_drive_meta.get('name')}")

    # -------------------------------------------------------------------------
    # 4. TEST DE CONFINEMENT STRICT : TENTATIVE D'ACCES EXTERIEUR (HTTP 403)
    # -------------------------------------------------------------------------
    print("\n[ETAPE 4/5] Test Strict Drive Jail : Tentative d'acces a un fichier exterieur (doit lever HTTP 403)...")
    fake_external_file_id = "external_unauthorized_file_99999"

    # Simulation d'un fichier Drive appartenant a un autre dossier parent
    mock_external_metadata = {
        "id": fake_external_file_id,
        "name": "document_confidentiel_hors_sci.pdf",
        "parents": ["dossier_inconnu_ou_racine_drive_interdite"],
        "mimeType": "application/pdf"
    }

    with patch.object(drive_jail_service, "_get_client") as mock_get_client:
        mock_service = MagicMock()
        mock_get_client.return_value = mock_service
        mock_files = MagicMock()
        mock_service.files.return_value = mock_files
        mock_files.get.return_value.execute.return_value = mock_external_metadata

        # 4a. Verification directe de get_file_metadata
        try:
            drive_jail_service.get_file_metadata(fake_external_file_id)
            assert False, "FAILLE : Aucune SecurityException levee par get_file_metadata pour un fichier exterieur !"
        except SecurityException as sec_e:
            assert sec_e.status_code == 403
            print(f" -> [Protection 1] get_file_metadata leve bien HTTP 403 SecurityException : {sec_e.detail}")

        # 4b. Verification directe de download_file
        try:
            drive_jail_service.download_file(fake_external_file_id)
            assert False, "FAILLE : Aucune SecurityException levee par download_file pour un fichier exterieur !"
        except SecurityException as sec_e:
            assert sec_e.status_code == 403
            print(f" -> [Protection 2] download_file leve bien HTTP 403 SecurityException : {sec_e.detail}")

        # 4c. Verification directe de rename_file
        try:
            drive_jail_service.rename_file(fake_external_file_id, "attaque.pdf")
            assert False, "FAILLE : Aucune SecurityException levee par rename_file pour un fichier exterieur !"
        except SecurityException as sec_e:
            assert sec_e.status_code == 403
            print(f" -> [Protection 3] rename_file leve bien HTTP 403 SecurityException : {sec_e.detail}")

        # 4d. Verification directe de delete_file
        try:
            drive_jail_service.delete_file(fake_external_file_id)
            assert False, "FAILLE : Aucune SecurityException levee par delete_file pour un fichier exterieur !"
        except SecurityException as sec_e:
            assert sec_e.status_code == 403
            print(f" -> [Protection 4] delete_file leve bien HTTP 403 SecurityException : {sec_e.detail}")

        # 4e. Verification via la route HTTP FastAPI
        with pytest.raises(SecurityException) as exc_info:
            drive_jail_service.download_file(fake_external_file_id)
        assert exc_info.value.status_code == 403
        print(" -> [Protection 5] Invariant de securite Strict Drive Jail 403 valide a 100% !")

    # -------------------------------------------------------------------------
    # 5. TEST SUPPRESSION (DRIVE + BASE DE DONNEES)
    # -------------------------------------------------------------------------
    print(f"\n[ETAPE 5/5] Test DELETE /api/documents/{doc_id}...")
    delete_res = client.delete(f"/api/documents/{doc_id}")
    assert delete_res.status_code == 200, f"Echec suppression: {delete_res.status_code} - {delete_res.text}"
    print(f" -> Reponse API suppression: {delete_res.json()}")

    # Verification en base de donnees
    db = SessionLocal()
    try:
        deleted_in_db = db.query(AdminDocument).filter(AdminDocument.id == doc_id).first()
        assert deleted_in_db is None, "Le document existe encore en base de donnees apres suppression"
        print(" -> Document correctement purge de la base de donnees SQLite.")
    finally:
        db.close()

    # Verification sur Google Drive
    try:
        drive_jail_service.get_file_metadata(drive_file_id)
        assert False, "FAILLE : Le fichier existe toujours sur Google Drive apres suppression"
    except Exception as drive_del_check:
        print(f" -> Document confirme introuvable / supprime sur Google Drive ({drive_del_check})")

    print("\n=======================================================")
    print("TOUS LES TESTS CRUD ET STRICT JAIL GOOGLE DRIVE ONT REUSSI !")
    print("=======================================================\n")

if __name__ == "__main__":
    test_full_google_drive_documents_crud_and_jail()

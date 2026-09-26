import os
import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from app.services.drive_service import (
    GoogleDriveJailService,
    SecurityException,
    ALLOWED_FOLDER_ID,
    drive_jail_service
)

def test_drive_jail_constants():
    """Vérifie que la constante de confinement pointe bien vers le dossier Hellenvilliers SCI."""
    assert ALLOWED_FOLDER_ID == "14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J"
    assert drive_jail_service.folder_id == "14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J"

def test_drive_jail_forced_parent_on_upload():
    """Vérifie que upload_file force impérativement parents=[ALLOWED_FOLDER_ID]."""
    mock_service = MagicMock()
    mock_files = MagicMock()
    mock_create = MagicMock()
    mock_execute = MagicMock(return_value={
        "id": "file_123",
        "name": "test.txt",
        "parents": [ALLOWED_FOLDER_ID]
    })

    mock_service.files.return_value = mock_files
    mock_files.create.return_value = mock_create
    mock_create.execute = mock_execute

    jail = GoogleDriveJailService(folder_id=ALLOWED_FOLDER_ID)
    jail._service = mock_service

    result = jail.upload_file("test.txt", b"Contenu de test", mimetype="text/plain")

    # Vérification que create a été appelé avec le bon parent forcé
    call_kwargs = mock_files.create.call_args[1]
    assert "body" in call_kwargs
    body = call_kwargs["body"]
    assert body["parents"] == [ALLOWED_FOLDER_ID]
    assert body["name"] == "test.txt"
    assert result["id"] == "file_123"

def test_drive_jail_forced_query_on_list():
    """Vérifie que list_files force impérativement la clause de confinement."""
    mock_service = MagicMock()
    mock_files = MagicMock()
    mock_list = MagicMock()
    mock_execute = MagicMock(return_value={"files": [{"id": "file_1", "parents": [ALLOWED_FOLDER_ID]}]})

    mock_service.files.return_value = mock_files
    mock_files.list.return_value = mock_list
    mock_list.execute = mock_execute

    jail = GoogleDriveJailService(folder_id=ALLOWED_FOLDER_ID)
    jail._service = mock_service

    # Sans filtre supplémentaire
    jail.list_files()
    call_kwargs = mock_files.list.call_args[1]
    assert call_kwargs["q"] == f"'{ALLOWED_FOLDER_ID}' in parents and trashed = false"

    # Avec filtre supplémentaire
    jail.list_files(query_filter="mimeType = 'application/pdf'")
    call_kwargs2 = mock_files.list.call_args[1]
    assert call_kwargs2["q"] == f"'{ALLOWED_FOLDER_ID}' in parents and trashed = false and (mimeType = 'application/pdf')"

def test_drive_jail_security_exception_on_unauthorized_folder():
    """Vérifie qu'un fichier hors du dossier autorisé lève impérativement SecurityException."""
    mock_service = MagicMock()
    mock_files = MagicMock()
    mock_get = MagicMock()
    
    # Fichier se trouvant dans un autre dossier que le dossier confiné
    mock_execute = MagicMock(return_value={
        "id": "rogue_file_999",
        "name": "secret_autre_dossier.txt",
        "parents": ["some_other_folder_id_not_allowed"]
    })

    mock_service.files.return_value = mock_files
    mock_files.get.return_value = mock_get
    mock_get.execute = mock_execute

    jail = GoogleDriveJailService(folder_id=ALLOWED_FOLDER_ID)
    jail._service = mock_service

    # 1. get_file_metadata doit lever SecurityException
    with pytest.raises(SecurityException) as exc_info:
        jail.get_file_metadata("rogue_file_999")
    assert exc_info.value.status_code == 403
    assert "Accès refusé" in exc_info.value.detail

    # 2. download_file doit lever SecurityException avant tout téléchargement
    with pytest.raises(SecurityException) as exc_info:
        jail.download_file("rogue_file_999")
    assert exc_info.value.status_code == 403

    # 3. delete_file doit lever SecurityException sans supprimer
    with pytest.raises(SecurityException) as exc_info:
        jail.delete_file("rogue_file_999")
    assert exc_info.value.status_code == 403
    mock_files.delete.assert_not_called()

def test_drive_jail_live_roundtrip():
    """Test en direct (live roundtrip) avec les identifiants OAuth réels dans le dossier SCI."""
    jail = GoogleDriveJailService()
    test_content = b"Zero-Trust automated live test of Drive Jail."
    filename = "test_jail_live_cert.txt"

    # 1. Upload dans le dossier confiné
    upload_res = jail.upload_file(filename, test_content, mimetype="text/plain")
    file_id = upload_res["id"]
    assert file_id is not None
    assert ALLOWED_FOLDER_ID in upload_res.get("parents", [])

    try:
        # 2. Vérification des métadonnées
        meta = jail.get_file_metadata(file_id)
        assert meta["name"] == filename
        assert ALLOWED_FOLDER_ID in meta["parents"]

        # 3. Téléchargement et intégrité
        downloaded, d_meta = jail.download_file(file_id)
        assert downloaded == test_content

        # 4. Listage avec vérification de la présence
        files = jail.list_files()
        found = any(f["id"] == file_id for f in files)
        assert found is True

    finally:
        # 5. Nettoyage / Suppression
        deleted = jail.delete_file(file_id)
        assert deleted is True

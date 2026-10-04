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
    """Vérifie que upload_file force impérativement parents=[ALLOWED_FOLDER_ID] dans le payload REST."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "id": "file_123",
        "name": "test.txt",
        "parents": [ALLOWED_FOLDER_ID]
    }

    jail = GoogleDriveJailService(folder_id=ALLOWED_FOLDER_ID)
    with patch.object(jail, "_request", return_value=mock_resp) as mock_req:
        result = jail.upload_file("test.txt", b"Contenu de test", mimetype="text/plain")
        assert result["id"] == "file_123"

        call_kwargs = mock_req.call_args[1]
        body = call_kwargs["data"].decode("utf-8")
        assert f'"{ALLOWED_FOLDER_ID}"' in body
        assert '"name": "test.txt"' in body

def test_drive_jail_forced_query_on_list():
    """Vérifie que list_files force impérativement la clause de confinement dans la requête REST."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"files": [{"id": "file_1", "parents": [ALLOWED_FOLDER_ID]}]}

    jail = GoogleDriveJailService(folder_id=ALLOWED_FOLDER_ID)
    with patch.object(jail, "_request", return_value=mock_resp) as mock_req:
        # Sans filtre supplémentaire
        jail.list_files(force_refresh=True)
        call_params = mock_req.call_args[1]["params"]
        assert call_params["q"] == f"'{ALLOWED_FOLDER_ID}' in parents and trashed = false"

        # Avec filtre supplémentaire
        jail.list_files(query_filter="mimeType = 'application/pdf'", force_refresh=True)
        call_params2 = mock_req.call_args[1]["params"]
        assert call_params2["q"] == f"'{ALLOWED_FOLDER_ID}' in parents and trashed = false and (mimeType = 'application/pdf')"

def test_drive_jail_security_exception_on_unauthorized_folder():
    """Vérifie qu'un fichier hors du dossier autorisé lève impérativement SecurityException."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    # Fichier se trouvant dans un autre dossier que le dossier confiné
    mock_resp.json.return_value = {
        "id": "rogue_file_999",
        "name": "secret_autre_dossier.txt",
        "parents": ["some_other_folder_id_not_allowed"]
    }

    jail = GoogleDriveJailService(folder_id=ALLOWED_FOLDER_ID)
    with patch.object(jail, "_request", return_value=mock_resp) as mock_req:
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

def test_drive_jail_live_roundtrip():
    """Test en direct (live roundtrip) avec les identifiants OAuth réels dans le dossier SCI."""
    jail = GoogleDriveJailService()
    if not os.getenv("GOOGLE_DRIVE_REFRESH_TOKEN") and not os.path.exists(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "oauth_tokens.json")):
        pytest.skip("Identifiants Google Drive OAuth réels non disponibles dans l'environnement pour le live roundtrip")

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
        files = jail.list_files(force_refresh=True)
        found = any(f["id"] == file_id for f in files)
        assert found is True

    finally:
        # 5. Nettoyage / Suppression
        deleted = jail.delete_file(file_id)
        assert deleted is True

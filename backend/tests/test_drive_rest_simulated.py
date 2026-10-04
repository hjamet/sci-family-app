import os
import io
import json
import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from app.services.drive_service import (
    GoogleDriveJailService,
    SecurityException,
    ALLOWED_FOLDER_ID,
    drive_jail_service,
    DRIVE_API_BASE,
    DRIVE_UPLOAD_BASE
)


@pytest.fixture(autouse=True)
def clean_drive_cache():
    """Nettoie le cache mémoire Google Drive avant chaque test."""
    GoogleDriveJailService.clear_cache()
    yield
    GoogleDriveJailService.clear_cache()


def test_drive_list_simulated_http():
    """1. Test de list_files via requêtes REST simulées (succès, cache TTL, fallback stale)."""
    jail = GoogleDriveJailService(folder_id=ALLOWED_FOLDER_ID)

    fake_files = [
        {"id": "file_1", "name": "doc1.pdf", "parents": [ALLOWED_FOLDER_ID], "size": "1024"},
        {"id": "file_2", "name": "doc2.pdf", "parents": [ALLOWED_FOLDER_ID], "size": "2048"}
    ]

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"files": fake_files}

    with patch.object(jail, "_request", return_value=mock_resp) as mock_req:
        # Premier appel : requête HTTP
        res = jail.list_files(force_refresh=True)
        assert len(res) == 2
        assert res[0]["id"] == "file_1"

        # Vérification des paramètres HTTP
        call_args = mock_req.call_args
        assert call_args[0][0] == "GET"
        assert call_args[0][1] == f"{DRIVE_API_BASE}/files"
        params = call_args[1]["params"]
        assert f"'{ALLOWED_FOLDER_ID}' in parents and trashed = false" in params["q"]
        assert params["pageSize"] == 100

        # Deuxième appel sans force_refresh : cache hit (zéro nouvelle requête)
        res_cached = jail.list_files(force_refresh=False)
        assert len(res_cached) == 2
        assert mock_req.call_count == 1

    # Test stale cache fallback en cas d'erreur HTTP 500 ultérieure
    mock_error_resp = MagicMock()
    mock_error_resp.status_code = 500
    mock_error_resp.text = "Internal Server Error"
    mock_error_resp.json.return_value = {"error": {"message": "Internal Server Error"}}

    with patch.object(jail, "_request", return_value=mock_error_resp):
        res_stale = jail.list_files(force_refresh=True)
        assert len(res_stale) == 2  # Le stale cache est renvoyé avec succès


def test_drive_metadata_simulated_http():
    """2. Test de get_file_metadata via REST simulé (succès, 404, erreur serveur)."""
    jail = GoogleDriveJailService()

    # Cas A : Succès 200
    mock_ok = MagicMock()
    mock_ok.status_code = 200
    mock_ok.json.return_value = {
        "id": "file_100",
        "name": "contrat.pdf",
        "parents": [ALLOWED_FOLDER_ID],
        "size": "5000"
    }

    with patch.object(jail, "_request", return_value=mock_ok) as mock_req:
        meta = jail.get_file_metadata("file_100")
        assert meta["name"] == "contrat.pdf"
        assert meta["parents"] == [ALLOWED_FOLDER_ID]
        assert mock_req.call_args[0][1] == f"{DRIVE_API_BASE}/files/file_100"

    # Cas B : 404 Not Found
    mock_404 = MagicMock()
    mock_404.status_code = 404
    mock_404.text = "File not found"
    with patch.object(jail, "_request", return_value=mock_404):
        with pytest.raises(HTTPException) as exc_404:
            jail.get_file_metadata("file_inexistant")
        assert exc_404.value.status_code == 404
        assert "Fichier non trouvé" in exc_404.value.detail


def test_drive_download_simulated_http():
    """3. Test de download_file via REST simulé (vérification metadata + alt=media stream)."""
    jail = GoogleDriveJailService()

    fake_meta = {
        "id": "file_dl_1",
        "name": "facture.pdf",
        "parents": [ALLOWED_FOLDER_ID],
        "mimeType": "application/pdf"
    }
    fake_content = b"%PDF-1.4 Fake PDF stream binary payload"

    def side_effect(method, url, **kwargs):
        resp = MagicMock()
        if kwargs.get("params", {}).get("alt") == "media":
            resp.status_code = 200
            resp.content = fake_content
            return resp
        else:
            resp.status_code = 200
            resp.json.return_value = fake_meta
            return resp

    with patch.object(jail, "_request", side_effect=side_effect) as mock_req:
        content, meta = jail.download_file("file_dl_1")
        assert content == fake_content
        assert meta["name"] == "facture.pdf"
        assert mock_req.call_count == 2


def test_drive_multipart_upload_simulated_http():
    """4. Test de upload_file multipart REST (vérification boundary, JSON metadata et binaire)."""
    jail = GoogleDriveJailService()
    test_bytes = b"Contenu binaire facture travaux 2026"
    filename = "Facture 2026.pdf"

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "id": "new_drive_id_777",
        "name": filename,
        "parents": [ALLOWED_FOLDER_ID],
        "mimeType": "application/pdf"
    }

    with patch.object(jail, "_request", return_value=mock_resp) as mock_req:
        res = jail.upload_file(
            filename=filename,
            content=test_bytes,
            mimetype="application/pdf",
            description="Facture toiture"
        )
        assert res["id"] == "new_drive_id_777"

        call_args = mock_req.call_args
        method, url = call_args[0][0], call_args[0][1]
        assert method == "POST"
        assert "uploadType=multipart" in url

        headers = call_args[1]["headers"]
        assert "multipart/related" in headers["Content-Type"]

        body = call_args[1]["data"]
        assert isinstance(body, bytes)
        assert f'"{ALLOWED_FOLDER_ID}"'.encode("utf-8") in body
        assert f'"{filename}"'.encode("utf-8") in body
        assert b"Facture toiture" in body
        assert test_bytes in body


def test_drive_resumable_upload_simulated_http():
    """5. Test de l'upload résumable REST (init_resumable_upload et relay_chunk)."""
    jail = GoogleDriveJailService()
    fake_token = "ya29.fake_resumable_token"

    # A. Initialisation session resumable
    mock_init_resp = MagicMock()
    mock_init_resp.status_code = 200
    mock_session_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=session_xyz_123"
    mock_init_resp.headers = {"Location": mock_session_url}

    with patch.object(jail, "get_access_token", return_value=fake_token):
        with patch("requests.post", return_value=mock_init_resp) as mock_post:
            session_url = jail.init_resumable_upload(
                filename="gros_fichier_35Mo.pdf",
                mimetype="application/pdf",
                total_size=35000000,
                description="Archive lourde"
            )
            assert session_url == mock_session_url

            call_kwargs = mock_post.call_args[1]
            assert call_kwargs["headers"]["Authorization"] == f"Bearer {fake_token}"
            assert call_kwargs["headers"]["X-Upload-Content-Length"] == "35000000"
            assert call_kwargs["json"]["parents"] == [ALLOWED_FOLDER_ID]

    # B. Relais de chunk binaire
    mock_chunk_resp = MagicMock()
    mock_chunk_resp.status_code = 308
    mock_chunk_resp.text = ""

    chunk_data = b"0" * 2000000
    with patch("requests.put", return_value=mock_chunk_resp) as mock_put:
        code, data, raw = jail.relay_chunk(
            upload_url=mock_session_url,
            chunk_bytes=chunk_data,
            content_range="bytes 0-1999999/35000000",
            mimetype="application/pdf"
        )
        assert code == 308
        put_kwargs = mock_put.call_args[1]
        assert put_kwargs["headers"]["Content-Range"] == "bytes 0-1999999/35000000"
        assert put_kwargs["data"] == chunk_data


def test_drive_delete_simulated_http():
    """6. Test de delete_file REST (vérification préalable confinement + DELETE 204)."""
    jail = GoogleDriveJailService()

    fake_meta = {
        "id": "file_to_del",
        "name": "a_supprimer.pdf",
        "parents": [ALLOWED_FOLDER_ID]
    }

    def side_effect(method, url, **kwargs):
        resp = MagicMock()
        if method == "GET":
            resp.status_code = 200
            resp.json.return_value = fake_meta
            return resp
        elif method == "DELETE":
            resp.status_code = 204
            return resp
        return resp

    with patch.object(jail, "_request", side_effect=side_effect) as mock_req:
        res = jail.delete_file("file_to_del")
        assert res is True
        assert mock_req.call_count == 2


def test_drive_refusal_outside_root_jail():
    """7. Test de refus strict (SecurityException HTTP 403) pour tout fichier hors dossier autorisé."""
    jail = GoogleDriveJailService(folder_id=ALLOWED_FOLDER_ID)

    mock_rogue_meta = MagicMock()
    mock_rogue_meta.status_code = 200
    mock_rogue_meta.json.return_value = {
        "id": "rogue_doc_999",
        "name": "secret_externe.pdf",
        "parents": ["unauthorized_rogue_folder_id"]
    }

    with patch.object(jail, "_request", return_value=mock_rogue_meta):
        # A. get_file_metadata doit bloquer
        with pytest.raises(SecurityException) as exc_meta:
            jail.get_file_metadata("rogue_doc_999")
        assert exc_meta.value.status_code == 403
        assert "Accès refusé" in exc_meta.value.detail

        # B. download_file doit bloquer
        with pytest.raises(SecurityException) as exc_dl:
            jail.download_file("rogue_doc_999")
        assert exc_dl.value.status_code == 403

        # C. delete_file doit bloquer
        with pytest.raises(SecurityException) as exc_del:
            jail.delete_file("rogue_doc_999")
        assert exc_del.value.status_code == 403

        # D. rename_file doit bloquer
        with pytest.raises(SecurityException) as exc_ren:
            jail.rename_file("rogue_doc_999", "nouveau_nom.pdf")
        assert exc_ren.value.status_code == 403


def test_drive_invalid_or_expired_token_explicit_error():
    """8. Test de fail-loud clair lorsque le jeton est manquant, expiré ou invalide."""
    jail = GoogleDriveJailService()

    # A. Variable d'environnement absente => RuntimeError immédiate
    with patch.dict(os.environ, {"GOOGLE_DRIVE_REFRESH_TOKEN": ""}, clear=False):
        with pytest.raises(RuntimeError) as exc_rt:
            jail._get_client()
        assert "GOOGLE_DRIVE_REFRESH_TOKEN manquante (Fail-Loud)" in str(exc_rt.value)

        # check_connection_status renvoie missing_token
        status = jail.check_connection_status()
        assert status["connected"] is False
        assert status["status"] == "missing_token"

    # B. Jeton révoqué / expiré (invalid_grant)
    mock_creds = MagicMock()
    mock_creds.valid = False
    mock_creds.token = None
    mock_creds.refresh.side_effect = Exception("invalid_grant: Token has been expired or revoked.")

    jail._credentials = mock_creds
    with patch.object(jail, "_get_client", return_value=mock_creds):
        with pytest.raises(HTTPException) as exc_exp:
            jail.get_access_token()
        assert exc_exp.value.status_code == 503
        assert "a expiré ou est invalide" in exc_exp.value.detail

        # check_connection_status renvoie expired
        with patch.dict(os.environ, {
            "GOOGLE_DRIVE_REFRESH_TOKEN": "1//fake",
            "GOOGLE_DRIVE_CLIENT_ID": "client.id",
            "GOOGLE_DRIVE_CLIENT_SECRET": "secret"
        }):
            status_exp = jail.check_connection_status()
            assert status_exp["connected"] is False
            assert status_exp["status"] == "expired"
            assert "régénérer le jeton" in status_exp["message"]


def test_reportlab_and_qrcode_imports_and_functionality():
    """9. Test d'importation et de fonctionnement de reportlab et qrcode."""
    import reportlab
    import qrcode

    assert reportlab.__version__ is not None
    assert hasattr(qrcode, "QRCode")

    # Test génération QR Code en mémoire
    qr = qrcode.QRCode(box_size=4, border=2)
    qr.add_data("https://hellenvilliers.henri-jamet.com")
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    assert len(buf.getvalue()) > 100

    # Test disponibilité dans call_for_funds_service et génération d'un avis PDF
    from app.services.call_for_funds_service import REPORTLAB_AVAILABLE, generate_call_for_funds_pdf
    assert REPORTLAB_AVAILABLE is True

    dummy_call_data = {
        "reference": "TEST-REST-001",
        "year": 2026,
        "month": 10,
        "period_label": "Octobre 2026",
        "theoretical_contribution": 50.0,
        "approved_expenses_total": 0.0,
        "net_amount": 50.0,
        "amount_due": 50.0,
        "balance_before": 0.0,
        "status": "EMIS",
        "payment_reference": "HLV-HENRI",
        "deducted_expenses": []
    }

    class DummyMember:
        name = "Henri Jamet"
        prenom = "Henri"
        role = "Coordinateur"
        email = "henri.jamet@example.com"

    pdf_bytes = generate_call_for_funds_pdf(
        call_data=dummy_call_data,
        member=DummyMember(),
        bank_info={"iban": "FR7612345678901234567890189", "bic": "SWNBFR22"},
        is_bank_pending=False
    )
    assert pdf_bytes is not None
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 1000

import os
import io
import sys
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaInMemoryUpload, MediaIoBaseDownload
from googleapiclient.errors import HttpError

SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), "service_account.json")
FOLDER_ID = "14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J"
SCOPES = ["https://www.googleapis.com/auth/drive"]

def run_test():
    result = {
        "service_account_file": SERVICE_ACCOUNT_FILE,
        "folder_id": FOLDER_ID,
        "upload_success": False,
        "download_success": False,
        "delete_success": False,
        "file_id": None,
        "error": None,
        "error_details": None
    }
    
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        result["error"] = f"Fichier {SERVICE_ACCOUNT_FILE} introuvable."
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return result

    try:
        print(f"[1/4] Authentification avec Service Account: {SERVICE_ACCOUNT_FILE}...")
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES
        )
        service = build("drive", "v3", credentials=creds)
        print(f"Service Account email: {creds.service_account_email}")

        # 1. Tentative d'upload
        print(f"[2/4] Tentative d'upload de test_quota_sa.txt dans le dossier {FOLDER_ID}...")
        file_metadata = {
            "name": "test_quota_sa.txt",
            "parents": [FOLDER_ID]
        }
        test_content = b"Zero-Trust test upload verifying Google Drive service account quota behavior."
        media = MediaInMemoryUpload(test_content, mimetype="text/plain", resumable=False)

        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, name, parents, owners, size"
        ).execute()

        file_id = file.get("id")
        result["upload_success"] = True
        result["file_id"] = file_id
        result["file_metadata"] = file
        print(f"Upload REUSSI ! File ID: {file_id}")
        print(f"Metadata: {file}")

        # 2. Tentative de téléchargement
        print(f"[3/4] Tentative de telechargement du fichier {file_id}...")
        request = service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            status, done = downloader.next_chunk()
        
        downloaded_bytes = fh.getvalue()
        if downloaded_bytes == test_content:
            result["download_success"] = True
            print("Telechargement REUSSI et integrite validee !")
        else:
            result["error"] = f"Contenu telecharge incoherent: {downloaded_bytes!r}"
            print(f"Echec integrite: {downloaded_bytes!r}")

        # 3. Nettoyage / Suppression
        print(f"[4/4] Suppression du fichier de test {file_id}...")
        service.files().delete(fileId=file_id).execute()
        result["delete_success"] = True
        print("Suppression REUSSIE !")

    except HttpError as err:
        result["error"] = f"HttpError {err.resp.status}: {err._get_reason()}"
        try:
            error_content = json.loads(err.content.decode("utf-8"))
            result["error_details"] = error_content
        except Exception:
            result["error_details"] = err.content.decode("utf-8", errors="replace")
        print(f"ERREUR HTTP CAPTUREE: {result['error']}")
        print(f"Details: {json.dumps(result['error_details'], indent=2, ensure_ascii=False)}")
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {str(e)}"
        print(f"ERREUR GENERIQUE CAPTUREE: {result['error']}")

    print("\n--- RAPPORT FINAL TEST SERVICE ACCOUNT ---")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return result

if __name__ == "__main__":
    run_test()

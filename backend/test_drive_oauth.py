import os
import io
import sys
import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaInMemoryUpload, MediaIoBaseDownload
from googleapiclient.errors import HttpError

TOKENS_FILE = os.path.join(os.path.dirname(__file__), "oauth_tokens.json")
FOLDER_ID = "14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J"

def run_test():
    with open(TOKENS_FILE, "r", encoding="utf-8") as f:
        tokens = json.load(f)

    creds = Credentials(
        token=tokens.get("access_token"),
        refresh_token=tokens.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=tokens.get("client_id"),
        client_secret=tokens.get("client_secret"),
        scopes=["https://www.googleapis.com/auth/drive"]
    )

    service = build("drive", "v3", credentials=creds)

    print(f"[1/4] Test d'upload via OAuth dans le dossier {FOLDER_ID}...")
    file_metadata = {
        "name": "test_quota_oauth.txt",
        "parents": [FOLDER_ID]
    }
    test_content = b"Zero-Trust test upload verifying Google Drive OAuth credentials."
    media = MediaInMemoryUpload(test_content, mimetype="text/plain", resumable=False)

    file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields="id, name, parents, owners, size"
    ).execute()

    file_id = file.get("id")
    print(f"[2/4] Upload OAuth REUSSI ! File ID: {file_id}")
    print(f"Metadata: {file}")

    print(f"[3/4] Telechargement du fichier {file_id}...")
    request = service.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while not done:
        status, done = downloader.next_chunk()

    downloaded = fh.getvalue()
    assert downloaded == test_content, "Contenu corrompu"
    print("[3/4] Telechargement REUSSI et integrite certifiee !")

    print(f"[4/4] Suppression du fichier {file_id}...")
    service.files().delete(fileId=file_id).execute()
    print("[4/4] Suppression REUSSIE !")

    return {
        "success": True,
        "file_id": file_id,
        "owners": [o.get("emailAddress") for o in file.get("owners", [])]
    }

if __name__ == "__main__":
    res = run_test()
    print("TEST_RESULT:", json.dumps(res, indent=2))

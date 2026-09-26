import os
import io
import json
import logging
from typing import Optional, List, Tuple, Dict, Any
from fastapi import HTTPException
try:
    from google.oauth2.credentials import Credentials
    from google.oauth2 import service_account
    from googleapiclient.discovery import build, Resource
    from googleapiclient.http import MediaInMemoryUpload, MediaIoBaseDownload
    from googleapiclient.errors import HttpError
    GOOGLE_DRIVE_AVAILABLE = True
except ImportError as _import_err:
    logger.warning(f"Google Drive API libraries not installed: {_import_err}")
    Credentials = None
    service_account = None
    build = None
    Resource = Any
    MediaInMemoryUpload = None
    MediaIoBaseDownload = None
    HttpError = Exception
    GOOGLE_DRIVE_AVAILABLE = False

logger = logging.getLogger(__name__)

# Strict Drive Jail Invariant
ALLOWED_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J")
SCOPES = ["https://www.googleapis.com/auth/drive"]

class SecurityException(HTTPException):
    """Exception levée en cas de tentative d'accès à un fichier hors du dossier autorisé (Strict Drive Jail)."""
    def __init__(self, detail: str = "Accès refusé : fichier hors du dossier Hellenvilliers SCI"):
        super().__init__(status_code=403, detail=detail)


class GoogleDriveJailService:
    """Service de gestion sécurisée Google Drive avec confinement strict (Strict Drive Jail).
    Garantit qu'aucun fichier ne peut être créé, lu, listé ou supprimé en dehors de ALLOWED_FOLDER_ID.
    """

    def __init__(self, folder_id: Optional[str] = None):
        self.folder_id = folder_id or ALLOWED_FOLDER_ID
        self._service: Optional[Resource] = None

    def _get_client(self) -> Resource:
        """Initialise le client Google Drive API v3 avec gestion prioritaire OAuth puis fallback Service Account."""
        if not GOOGLE_DRIVE_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="Service Google Drive temporairement indisponible (dépendances manquantes sur le serveur)."
            )

        if self._service is not None:
            return self._service

        client_id = os.getenv("GOOGLE_DRIVE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_DRIVE_CLIENT_SECRET")
        refresh_token = os.getenv("GOOGLE_DRIVE_REFRESH_TOKEN")

        # Fallback local oauth_tokens.json si présent dans backend/
        tokens_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "oauth_tokens.json")
        if not refresh_token and os.path.exists(tokens_file):
            try:
                with open(tokens_file, "r", encoding="utf-8") as f:
                    tok_data = json.load(f)
                    client_id = client_id or tok_data.get("client_id")
                    client_secret = client_secret or tok_data.get("client_secret")
                    refresh_token = refresh_token or tok_data.get("refresh_token")
            except Exception as e:
                logger.warning(f"Impossible de lire oauth_tokens.json: {e}")

        # 1. Mode OAuth (Prioritaire, quota du compte personnel Henri)
        if refresh_token and client_id and client_secret:
            logger.info("Initialisation Google Drive via OAuth Refresh Token (Compte personnel)")
            creds = Credentials(
                token=None,
                refresh_token=refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=client_id,
                client_secret=client_secret,
                scopes=SCOPES
            )
            self._service = build("drive", "v3", credentials=creds, cache_discovery=False)
            return self._service

        # 2. Mode Service Account (Secours si Shared Drive disponible)
        sa_filename = os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE", "service_account.json")
        sa_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), sa_filename)
        if os.path.exists(sa_path):
            logger.info(f"Initialisation Google Drive via Service Account ({sa_path})")
            creds = service_account.Credentials.from_service_account_file(sa_path, scopes=SCOPES)
            self._service = build("drive", "v3", credentials=creds, cache_discovery=False)
            return self._service

        raise RuntimeError("Aucun identifiant Google Drive valide trouvé (ni OAuth Refresh Token, ni Service Account).")

    def upload_file(
        self,
        file_content_or_filename: Any = None,
        filename_or_content: Any = None,
        mimetype: Optional[str] = None,
        description: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """Téléverse un fichier en forçant impérativement son parent dans ALLOWED_FOLDER_ID (Jail).
        Prend en charge de manière robuste (content, filename) ou (filename, content).
        """
        # Résolution flexible des arguments
        if isinstance(file_content_or_filename, (bytes, bytearray)):
            content = bytes(file_content_or_filename)
            filename = str(filename_or_content or kwargs.get("filename", "document.bin"))
        elif isinstance(filename_or_content, (bytes, bytearray)):
            content = bytes(filename_or_content)
            filename = str(file_content_or_filename or kwargs.get("filename", "document.bin"))
        else:
            content = kwargs.get("file_content") or kwargs.get("content") or b""
            filename = str(kwargs.get("filename") or file_content_or_filename or "document.bin")

        resolved_mimetype = mimetype or kwargs.get("mime_type") or "application/octet-stream"

        service = self._get_client()

        # CONFINEMENT STRICT : Interdiction absolue de créer hors du dossier autorisé
        file_metadata: Dict[str, Any] = {
            "name": os.path.basename(filename),
            "parents": [self.folder_id],
        }
        if description:
            file_metadata["description"] = description

        media = MediaInMemoryUpload(content, mimetype=resolved_mimetype, resumable=False)

        try:
            file = service.files().create(
                body=file_metadata,
                media_body=media,
                fields="id, name, parents, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink"
            ).execute()
            logger.info(f"Fichier créé avec succès dans le dossier {self.folder_id} : {file.get('id')} ({filename})")
            return file
        except HttpError as err:
            logger.error(f"Erreur API Google Drive lors de l'upload : {err}")
            raise HTTPException(status_code=err.resp.status, detail=f"Google Drive Error: {err._get_reason()}")

    def list_files(self, query_filter: Optional[str] = None, page_size: int = 100) -> List[Dict[str, Any]]:
        """Liste uniquement les fichiers présents dans ALLOWED_FOLDER_ID.
        Clause de confinement obligatoire : '{ALLOWED_FOLDER_ID}' in parents and trashed = false.
        """
        service = self._get_client()

        # CONFINEMENT STRICT : La condition d'appartenance au dossier est inviolable
        jail_clause = f"'{self.folder_id}' in parents and trashed = false"
        if query_filter:
            q = f"{jail_clause} and ({query_filter})"
        else:
            q = jail_clause

        try:
            results = service.files().list(
                q=q,
                pageSize=page_size,
                fields="nextPageToken, files(id, name, parents, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink)"
            ).execute()
            return results.get("files", [])
        except HttpError as err:
            logger.error(f"Erreur API Google Drive lors du listage : {err}")
            raise HTTPException(status_code=err.resp.status, detail=f"Google Drive Error: {err._get_reason()}")

    def get_file_metadata(self, file_id: str) -> Dict[str, Any]:
        """Récupère les métadonnées d'un fichier et vérifie impérativement son confinement (Jail Check)."""
        service = self._get_client()

        try:
            file = service.files().get(
                fileId=file_id,
                fields="id, name, parents, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, trashed"
            ).execute()
        except HttpError as err:
            if err.resp.status == 404:
                raise HTTPException(status_code=404, detail="Fichier non trouvé sur Google Drive.")
            raise HTTPException(status_code=err.resp.status, detail=f"Google Drive Error: {err._get_reason()}")

        # CONFINEMENT STRICT : Vérification immédiate des parents
        parents = file.get("parents", [])
        if self.folder_id not in parents:
            logger.warning(f"ALERTE SÉCURITÉ : Tentative d'accès au fichier {file_id} hors du dossier autorisé {self.folder_id} (parents: {parents})")
            raise SecurityException("Accès refusé : fichier hors du dossier Hellenvilliers SCI")

        return file

    def download_file(self, file_id: str) -> Tuple[bytes, Dict[str, Any]]:
        """Télécharge un fichier après vérification préalable de son confinement dans le dossier autorisé."""
        metadata = self.get_file_metadata(file_id)

        service = self._get_client()
        try:
            request = service.files().get_media(fileId=file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            return fh.getvalue(), metadata
        except HttpError as err:
            logger.error(f"Erreur API Google Drive lors du téléchargement de {file_id} : {err}")
            raise HTTPException(status_code=err.resp.status, detail=f"Google Drive Error: {err._get_reason()}")

    def rename_file(self, file_id: str, new_name: str) -> Dict[str, Any]:
        """Renomme un fichier sur Google Drive après vérification stricte de son confinement."""
        # Vérification préalable obligatoire (lève SecurityException si hors dossier)
        self.get_file_metadata(file_id)

        clean_name = os.path.basename(new_name).strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="Le nouveau nom de fichier ne peut être vide.")

        service = self._get_client()
        try:
            updated_file = service.files().update(
                fileId=file_id,
                body={"name": clean_name},
                fields="id, name, parents, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink"
            ).execute()
            logger.info(f"Fichier {file_id} renommé en '{clean_name}' avec succès sur Google Drive.")
            return updated_file
        except HttpError as err:
            logger.error(f"Erreur API Google Drive lors du renommage de {file_id} : {err}")
            raise HTTPException(status_code=err.resp.status, detail=f"Google Drive Error: {err._get_reason()}")

    def delete_file(self, file_id: str) -> bool:
        """Supprime définitivement un fichier après vérification stricte de son confinement."""
        # Vérification préalable obligatoire (lève SecurityException si hors dossier)
        self.get_file_metadata(file_id)

        service = self._get_client()
        try:
            service.files().delete(fileId=file_id).execute()
            logger.info(f"Fichier {file_id} supprimé avec succès de Google Drive.")
            return True
        except HttpError as err:
            logger.error(f"Erreur API Google Drive lors de la suppression de {file_id} : {err}")
            raise HTTPException(status_code=err.resp.status, detail=f"Google Drive Error: {err._get_reason()}")


# Instance singleton exportée pour l'application
drive_jail_service = GoogleDriveJailService()

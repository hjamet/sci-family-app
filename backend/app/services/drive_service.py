import os
import io
import json
import time
import threading
import logging
from typing import Optional, List, Tuple, Dict, Any
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Cache mémoire pour list_files Google Drive (TTL: 120s, Stale-While-Revalidate)
_DRIVE_FILES_CACHE: Dict[str, Any] = {}
_DRIVE_FILES_CACHE_TIMESTAMP: float = 0.0
DRIVE_FILES_CACHE_TTL: int = 120
_DRIVE_CACHE_LOCK = threading.Lock()


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

# Strict Drive Jail Invariant (Dossier Admin historique + Dossier Hellenvilliers SCI téléversement)
DEFAULT_ALLOWED_FOLDER_IDS = [
    "1712huYEQ_7IYa4eUCQtcnXy3Zdd3S3zu",  # Dossier Admin (où résident tous les documents et factures historiques)
    "14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J",  # Dossier Hellenvilliers SCI (téléversements directs Henri Jamet)
]

SCOPES = ["https://www.googleapis.com/auth/drive"]

class SecurityException(HTTPException):
    """Exception levée en cas de tentative d'accès à un fichier hors du dossier autorisé (Strict Drive Jail)."""
    def __init__(self, detail: str = "Accès refusé : fichier hors du dossier Hellenvilliers SCI"):
        super().__init__(status_code=403, detail=detail)


class GoogleDriveJailService:
    """Service de gestion sécurisée Google Drive avec confinement strict (Strict Drive Jail).
    Garantit qu'aucun fichier ne peut être créé, lu, listé ou supprimé en dehors des dossiers autorisés.
    """

    def __init__(self, folder_id: Optional[str] = None):
        self.folder_id = folder_id or os.getenv("GOOGLE_DRIVE_FOLDER_ID", "14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J")
        self.allowed_folder_ids = set(DEFAULT_ALLOWED_FOLDER_IDS)
        if self.folder_id:
            self.allowed_folder_ids.add(self.folder_id)
        env_extra = os.getenv("GOOGLE_DRIVE_FOLDER_IDS")
        if env_extra:
            for fid in env_extra.split(","):
                if fid.strip():
                    self.allowed_folder_ids.add(fid.strip())
        self._service: Optional[Resource] = None

    def is_configured(self) -> bool:
        """Vérifie si les dépendances et identifiants Google Drive sont disponibles sans lever d'exception."""
        if not GOOGLE_DRIVE_AVAILABLE:
            return False
        try:
            self._get_client()
            return True
        except Exception:
            return False

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

        # Fallback local backend/.env si non encore chargé
        if not refresh_token:
            for env_candidate in [
                os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
                os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "backend", ".env"),
            ]:
                if os.path.exists(env_candidate):
                    try:
                        with open(env_candidate, "r", encoding="utf-8") as ef:
                            for eline in ef:
                                eline = eline.strip()
                                if eline.startswith("GOOGLE_DRIVE_CLIENT_ID="):
                                    client_id = client_id or eline.split("=", 1)[1].strip().strip('"').strip("'")
                                elif eline.startswith("GOOGLE_DRIVE_CLIENT_SECRET="):
                                    client_secret = client_secret or eline.split("=", 1)[1].strip().strip('"').strip("'")
                                elif eline.startswith("GOOGLE_DRIVE_REFRESH_TOKEN="):
                                    refresh_token = refresh_token or eline.split("=", 1)[1].strip().strip('"').strip("'")
                    except Exception as env_err:
                        logger.warning(f"Impossible de lire {env_candidate}: {env_err}")

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

        # CONFINEMENT STRICT : Téléversement prioritaire dans le dossier Hellenvilliers SCI (droits d'écriture)
        upload_parent = "14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J" if "14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J" in self.allowed_folder_ids else self.folder_id
        file_metadata: Dict[str, Any] = {
            "name": os.path.basename(filename),
            "parents": [upload_parent],
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
            logger.info(f"Fichier créé avec succès dans le dossier {upload_parent} : {file.get('id')} ({filename})")
            self.clear_cache()
            return file
        except HttpError as err:
            logger.error(f"Erreur API Google Drive lors de l'upload : {err}")
            raise HTTPException(status_code=err.resp.status, detail=f"Google Drive Error: {err._get_reason()}")

    def list_files(self, query_filter: Optional[str] = None, page_size: int = 100, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Liste uniquement les fichiers présents dans les dossiers autorisés (ALLOWED_FOLDER_IDS).
        Clause de confinement obligatoire : ('{fid1}' in parents or '{fid2}' in parents) and trashed = false.
        Maintient un cache en mémoire TTL de 120s avec verrou thread-safe.
        """
        global _DRIVE_FILES_CACHE, _DRIVE_FILES_CACHE_TIMESTAMP
        folders_key = "_".join(sorted(self.allowed_folder_ids))
        cache_key = f"{folders_key}_{query_filter or ''}_{page_size}"
        now = time.time()

        if not force_refresh and (cache_key in _DRIVE_FILES_CACHE) and (now - _DRIVE_FILES_CACHE_TIMESTAMP < DRIVE_FILES_CACHE_TTL):
            return _DRIVE_FILES_CACHE[cache_key].copy()

        with _DRIVE_CACHE_LOCK:
            now = time.time()
            if not force_refresh and (cache_key in _DRIVE_FILES_CACHE) and (now - _DRIVE_FILES_CACHE_TIMESTAMP < DRIVE_FILES_CACHE_TTL):
                return _DRIVE_FILES_CACHE[cache_key].copy()

            service = self._get_client()

            # CONFINEMENT STRICT : La condition d'appartenance aux dossiers autorisés est inviolable
            folder_clauses = [f"'{fid}' in parents" for fid in self.allowed_folder_ids]
            jail_clause = f"({' or '.join(folder_clauses)}) and trashed = false"
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
                files = results.get("files", [])
                _DRIVE_FILES_CACHE[cache_key] = files
                _DRIVE_FILES_CACHE_TIMESTAMP = time.time()
                return files.copy()
            except Exception as err:
                logger.error(f"Erreur API Google Drive lors du listage : {err}")
                if cache_key in _DRIVE_FILES_CACHE:
                    logger.warning(f"[DRIVE] Renvoi du cache stale pour les fichiers Google Drive suite à: {err}")
                    return _DRIVE_FILES_CACHE[cache_key].copy()
                if isinstance(err, HttpError):
                    raise HTTPException(status_code=err.resp.status, detail=f"Google Drive Error: {err._get_reason()}")
                raise

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
        if not any(pid in self.allowed_folder_ids for pid in parents):
            logger.warning(f"ALERTE SÉCURITÉ : Tentative d'accès au fichier {file_id} hors des dossiers autorisés {self.allowed_folder_ids} (parents: {parents})")
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
            self.clear_cache()
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
            self.clear_cache()
            return True
        except HttpError as err:
            logger.error(f"Erreur API Google Drive lors de la suppression de {file_id} : {err}")
            raise HTTPException(status_code=err.resp.status, detail=f"Google Drive Error: {err._get_reason()}")

    @classmethod
    def clear_cache(cls):
        """Réinitialise le cache mémoire du listage Google Drive."""
        global _DRIVE_FILES_CACHE, _DRIVE_FILES_CACHE_TIMESTAMP
        with _DRIVE_CACHE_LOCK:
            _DRIVE_FILES_CACHE.clear()
            _DRIVE_FILES_CACHE_TIMESTAMP = 0.0



# Instance singleton exportée pour l'application
drive_jail_service = GoogleDriveJailService()

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

# Strict Drive Jail Invariant
ALLOWED_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J")
DEFAULT_ALLOWED_FOLDER_IDS = {
    "14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J",  # Hellenvilliers SCI
    "1712huYEQ_7IYa4eUCQtcnXy3Zdd3S3zu",  # Admin
}
SCOPES = ["https://www.googleapis.com/auth/drive"]

class SecurityException(HTTPException):
    """Exception levée en cas de tentative d'accès à un fichier hors du dossier autorisé (Strict Drive Jail)."""
    def __init__(self, detail: str = "Accès refusé : fichier hors du dossier Hellenvilliers SCI"):
        super().__init__(status_code=403, detail=detail)


class GoogleDriveJailService:
    """Service de gestion sécurisée Google Drive avec confinement strict (Strict Drive Jail).
    Garantit qu'aucun fichier ne peut être créé, lu, listé ou supprimé en dehors des dossiers Hellenvilliers SCI.
    """

    def __init__(self, folder_id: Optional[str] = None):
        if folder_id:
            self.folder_id = folder_id
            self.allowed_folder_ids = {folder_id}
        else:
            self.folder_id = ALLOWED_FOLDER_ID
            self.allowed_folder_ids = set(DEFAULT_ALLOWED_FOLDER_IDS)
            if self.folder_id:
                self.allowed_folder_ids.add(self.folder_id)
            env_fids = os.getenv("GOOGLE_DRIVE_FOLDER_IDS")
            if env_fids:
                for fid in env_fids.split(","):
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

        # Fallback base de données (table system_settings sur Supabase PostgreSQL / SQLite)
        if not refresh_token or not client_id or not client_secret:
            try:
                from app.database import engine
                from sqlalchemy import text
                with engine.connect() as db_conn:
                    rows = db_conn.execute(
                        text("SELECT key, value FROM system_settings WHERE key IN ('GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN', 'GOOGLE_DRIVE_FOLDER_ID', 'GOOGLE_DRIVE_FOLDER_IDS')")
                    ).fetchall()
                    for r_key, r_val in rows:
                        if r_key == "GOOGLE_DRIVE_CLIENT_ID" and not client_id:
                            client_id = r_val
                        elif r_key == "GOOGLE_DRIVE_CLIENT_SECRET" and not client_secret:
                            client_secret = r_val
                        elif r_key == "GOOGLE_DRIVE_REFRESH_TOKEN" and not refresh_token:
                            refresh_token = r_val
                        elif r_key == "GOOGLE_DRIVE_FOLDER_ID":
                            if r_val:
                                self.allowed_folder_ids.add(r_val)
                            if not self.folder_id:
                                self.folder_id = r_val
                        elif r_key == "GOOGLE_DRIVE_FOLDER_IDS":
                            if r_val:
                                for fid in r_val.split(","):
                                    if fid.strip():
                                        self.allowed_folder_ids.add(fid.strip())
            except Exception as db_err:
                logger.warning(f"Impossible de lire system_settings depuis la base de données: {db_err}")

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
            self._credentials = creds
            self._service = build("drive", "v3", credentials=creds, cache_discovery=False)
            return self._service

        # 2. Mode Service Account (Secours si Shared Drive disponible)
        sa_filename = os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE", "service_account.json")
        sa_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), sa_filename)
        if os.path.exists(sa_path):
            logger.info(f"Initialisation Google Drive via Service Account ({sa_path})")
            creds = service_account.Credentials.from_service_account_file(sa_path, scopes=SCOPES)
            self._credentials = creds
            self._service = build("drive", "v3", credentials=creds, cache_discovery=False)
            return self._service

        raise RuntimeError("Aucun identifiant Google Drive valide trouvé (ni OAuth Refresh Token, ni Service Account).")

    def get_access_token(self) -> str:
        """Récupère ou rafraîchit le Bearer access_token OAuth pour les requêtes HTTP directes."""
        self._get_client()
        if not getattr(self, "_credentials", None):
            raise HTTPException(
                status_code=503,
                detail="Service Google Drive temporairement indisponible (identifiants non initialisés)."
            )
        try:
            import google.auth.transport.requests
            req = google.auth.transport.requests.Request()
            self._credentials.refresh(req)
            return self._credentials.token
        except Exception as err:
            logger.error(f"Erreur de rafraîchissement du jeton OAuth Google Drive: {err}")
            raise HTTPException(
                status_code=503,
                detail="Le jeton d'accès Google Drive a expiré ou est invalide. Veuillez ré-authentifier la connexion Google Drive."
            )

    def init_resumable_upload(
        self,
        filename: str,
        mimetype: str,
        total_size: int,
        description: Optional[str] = None,
        origin: Optional[str] = None
    ) -> str:
        """Initialise une session Google Drive v3 Resumable Upload avec confinement Strict Drive Jail.
        Garantit que le fichier sera créé EXCLUSIVEMENT dans self.folder_id (ALLOWED_FOLDER_ID).
        Renvoie l'URL de session unique (Location header de Google).
        """
        token = self.get_access_token()
        clean_name = os.path.basename(filename)

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mimetype or "application/octet-stream",
            "X-Upload-Content-Length": str(total_size)
        }
        if origin:
            headers["Origin"] = origin

        # Confinement Strict Drive Jail
        metadata = {
            "name": clean_name,
            "parents": [self.folder_id]
        }
        if description:
            metadata["description"] = description

        import requests
        url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable"
        resp = requests.post(url, headers=headers, json=metadata, timeout=30)
        if resp.status_code not in (200, 201):
            logger.error(f"Échec init resumable Google Drive ({resp.status_code}): {resp.text}")
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Échec Google Drive Resumable Init: {resp.text}"
            )

        session_url = resp.headers.get("Location")
        if not session_url:
            raise HTTPException(
                status_code=502,
                detail="Google Drive n'a renvoyé aucun en-tête Location."
            )

        logger.info(f"Session Resumable Google Drive initiée avec succès pour {clean_name} (taille: {total_size} octets)")
        return session_url

    def relay_chunk(
        self,
        upload_url: str,
        chunk_bytes: bytes,
        content_range: str,
        mimetype: Optional[str] = None
    ) -> Tuple[int, Dict[str, Any], str]:
        """Transmet un morceau binaire (<= 4 Mo) vers l'URL de session Resumable Google Drive."""
        import requests
        headers = {
            "Content-Range": content_range,
            "Content-Length": str(len(chunk_bytes)),
            "Content-Type": mimetype or "application/octet-stream"
        }
        resp = requests.put(upload_url, headers=headers, data=chunk_bytes, timeout=60)
        data = {}
        if resp.text:
            try:
                data = resp.json()
            except Exception:
                pass
        return resp.status_code, data, resp.text

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
            self.clear_cache()
            return file
        except HttpError as err:
            logger.error(f"Erreur API Google Drive lors de l'upload : {err}")
            raise HTTPException(status_code=err.resp.status, detail=f"Google Drive Error: {err._get_reason()}")

    def list_files(self, query_filter: Optional[str] = None, page_size: int = 100, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Liste uniquement les fichiers présents dans ALLOWED_FOLDER_ID.
        Clause de confinement obligatoire : '{ALLOWED_FOLDER_ID}' in parents and trashed = false.
        Maintient un cache en mémoire TTL de 120s avec verrou thread-safe.
        """
        global _DRIVE_FILES_CACHE, _DRIVE_FILES_CACHE_TIMESTAMP
        cache_key = f"{self.folder_id}_{query_filter or ''}_{page_size}"
        now = time.time()

        if not force_refresh and (cache_key in _DRIVE_FILES_CACHE) and (now - _DRIVE_FILES_CACHE_TIMESTAMP < DRIVE_FILES_CACHE_TTL):
            return _DRIVE_FILES_CACHE[cache_key].copy()

        with _DRIVE_CACHE_LOCK:
            now = time.time()
            if not force_refresh and (cache_key in _DRIVE_FILES_CACHE) and (now - _DRIVE_FILES_CACHE_TIMESTAMP < DRIVE_FILES_CACHE_TTL):
                return _DRIVE_FILES_CACHE[cache_key].copy()

            service = self._get_client()

            # CONFINEMENT STRICT : La condition d'appartenance aux dossiers autorisés est inviolable
            if len(self.allowed_folder_ids) > 1:
                parents_conditions = " or ".join([f"'{fid}' in parents" for fid in self.allowed_folder_ids])
                jail_clause = f"({parents_conditions}) and trashed = false"
            else:
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

    def get_oauth_credentials_info(self, db: Optional[Any] = None) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """Récupère client_id, client_secret et refresh_token depuis l'env ou system_settings."""
        client_id = os.getenv("GOOGLE_DRIVE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_DRIVE_CLIENT_SECRET")
        refresh_token = os.getenv("GOOGLE_DRIVE_REFRESH_TOKEN")

        if not client_id or not client_secret or not refresh_token:
            try:
                from app.database import engine
                from sqlalchemy import text
                conn = db.connection() if db and hasattr(db, 'connection') else engine.connect()
                try:
                    rows = conn.execute(
                        text("SELECT key, value FROM system_settings WHERE key IN ('GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN')")
                    ).fetchall()
                    for r_key, r_val in rows:
                        if r_key == "GOOGLE_DRIVE_CLIENT_ID" and not client_id:
                            client_id = r_val
                        elif r_key == "GOOGLE_DRIVE_CLIENT_SECRET" and not client_secret:
                            client_secret = r_val
                        elif r_key == "GOOGLE_DRIVE_REFRESH_TOKEN" and not refresh_token:
                            refresh_token = r_val
                finally:
                    if not db or not hasattr(db, 'connection'):
                        conn.close()
            except Exception as e:
                logger.warning(f"Erreur lecture credentials DB: {e}")

        return client_id, client_secret, refresh_token

    def get_oauth_authorization_url(self, redirect_uri: str, state: Optional[str] = None) -> str:
        """Construit l'URL d'autorisation Google OAuth2 pour reconnexion in-app par le coordinateur."""
        client_id, _, _ = self.get_oauth_credentials_info()
        if not client_id:
            raise HTTPException(status_code=500, detail="GOOGLE_DRIVE_CLIENT_ID non configuré.")

        import urllib.parse
        scope = "https://www.googleapis.com/auth/drive"
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": scope,
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
        }
        if state:
            params["state"] = state
        return f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"

    def exchange_code_and_save_token(self, code: str, redirect_uri: str, db: Any) -> Dict[str, Any]:
        """Échange le code d'autorisation contre un refresh_token et l'enregistre en base."""
        client_id, client_secret, _ = self.get_oauth_credentials_info(db)
        if not client_id or not client_secret:
            raise HTTPException(status_code=500, detail="Identifiants client Google OAuth manquants.")

        token_url = "https://oauth2.googleapis.com/token"
        payload = {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }

        resp = requests.post(token_url, data=payload, timeout=15)
        if resp.status_code != 200:
            logger.error(f"Échec échange code Google OAuth: {resp.status_code} {resp.text}")
            raise HTTPException(
                status_code=502,
                detail=f"Erreur échange OAuth Google ({resp.status_code}): {resp.text}"
            )

        data = resp.json()
        new_refresh = data.get("refresh_token")
        if not new_refresh:
            logger.warning("Google n'a pas renvoyé de refresh_token (prompt=consent requis).")

        from sqlalchemy import text
        if new_refresh:
            try:
                # Tentative syntaxe Postgres avec ON CONFLICT
                db.execute(
                    text("""
                        INSERT INTO system_settings (key, value)
                        VALUES ('GOOGLE_DRIVE_REFRESH_TOKEN', :tok)
                        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                    """),
                    {"tok": new_refresh}
                )
                db.commit()
            except Exception:
                db.rollback()
                # Repli SQLite / standard
                db.execute(
                    text("DELETE FROM system_settings WHERE key = 'GOOGLE_DRIVE_REFRESH_TOKEN'")
                )
                db.execute(
                    text("INSERT INTO system_settings (key, value) VALUES ('GOOGLE_DRIVE_REFRESH_TOKEN', :tok)"),
                    {"tok": new_refresh}
                )
                db.commit()
            logger.info("Nouveau GOOGLE_DRIVE_REFRESH_TOKEN enregistré avec succès en base de données.")

        # Réinitialiser le client et le cache pour prise en compte immédiate
        self._service = None
        self._credentials = None
        self.clear_cache()

        return {
            "status": "success",
            "has_refresh_token": bool(new_refresh),
            "access_token_present": bool(data.get("access_token"))
        }

    def check_connection_status(self, db: Optional[Any] = None) -> Dict[str, Any]:
        """Contrôle la validité de la connexion Google Drive sans repli masquant."""
        try:
            token = self.get_access_token()
            return {
                "connected": True,
                "status": "ok",
                "message": "Connexion Google Drive active et opérationnelle."
            }
        except Exception as e:
            err_msg = str(e)
            is_expired = "invalid_grant" in err_msg.lower() or "expiré" in err_msg.lower()
            return {
                "connected": False,
                "status": "expired" if is_expired else "error",
                "message": "Le jeton Google Drive a expiré ou est invalide. Reconnexion requise." if is_expired else f"Erreur Google Drive: {err_msg}"
            }



# Instance singleton exportée pour l'application
drive_jail_service = GoogleDriveJailService()

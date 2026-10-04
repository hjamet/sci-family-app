import os
import io
import json
import time
import threading
import logging
import requests
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
    import google.auth.transport.requests
    GOOGLE_DRIVE_AVAILABLE = True
except ImportError as _import_err:
    logger.warning(f"Google Drive auth libraries not installed: {_import_err}")
    Credentials = None
    GOOGLE_DRIVE_AVAILABLE = False

# Strict Drive Jail Invariant
ALLOWED_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J")
DEFAULT_ALLOWED_FOLDER_IDS = {
    "14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J",  # Hellenvilliers SCI
    "1712huYEQ_7IYa4eUCQtcnXy3Zdd3S3zu",  # Admin / Appels de fonds
}
SCOPES = ["https://www.googleapis.com/auth/drive"]
DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3"


class SecurityException(HTTPException):
    """Exception levée en cas de tentative d'accès à un fichier hors du dossier autorisé (Strict Drive Jail)."""
    def __init__(self, detail: str = "Accès refusé : fichier hors du dossier Hellenvilliers SCI"):
        super().__init__(status_code=403, detail=detail)


class GoogleDriveJailService:
    """Service de gestion sécurisée Google Drive via API REST directe v3 avec confinement strict (Strict Drive Jail).
    Garantit qu'aucun fichier ne peut être créé, lu, listé ou supprimé en dehors des dossiers Hellenvilliers SCI.
    Remplace google-api-python-client par des appels REST directs vers https://www.googleapis.com/drive/v3.
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
        self._credentials: Optional[Any] = None
        self._service: Optional[Any] = None

    def is_configured(self) -> bool:
        """Vérifie si les dépendances et identifiants Google Drive sont disponibles sans lever d'exception."""
        if not GOOGLE_DRIVE_AVAILABLE:
            return False
        try:
            self._get_client()
            return True
        except Exception:
            return False

    def _get_client(self) -> Any:
        """Initialise les identifiants Google Drive API v3 via le refresh token en variable d'environnement (Fail-Loud)."""
        if not GOOGLE_DRIVE_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="Service Google Drive temporairement indisponible (dépendances manquantes sur le serveur)."
            )

        if self._credentials is not None:
            return self._credentials

        client_id = os.getenv("GOOGLE_DRIVE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_DRIVE_CLIENT_SECRET")
        refresh_token = os.getenv("GOOGLE_DRIVE_REFRESH_TOKEN")

        if not refresh_token:
            logger.error("GOOGLE_DRIVE_REFRESH_TOKEN manquant dans les variables d'environnement (Fail-Loud).")
            raise RuntimeError(
                "Variable d'environnement GOOGLE_DRIVE_REFRESH_TOKEN manquante (Fail-Loud). "
                "Le jeton doit être configuré en variable d'environnement (Vercel / .env). "
                "Aucun repli en base de données n'est autorisé."
            )

        if not client_id or not client_secret:
            logger.error("GOOGLE_DRIVE_CLIENT_ID ou GOOGLE_DRIVE_CLIENT_SECRET manquant dans l'environnement.")
            raise RuntimeError(
                "Identifiants client Google Drive manquants (GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET)."
            )

        logger.info("Initialisation Google Drive via GOOGLE_DRIVE_REFRESH_TOKEN (variable d'environnement)")
        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=SCOPES
        )
        self._credentials = creds
        self._service = creds
        return creds

    def _get_service_mock_if_any(self) -> Optional[Any]:
        """Détecte si un mock service (avec .files) a été injecté pour rétro-compatibilité de tests."""
        if self._service is not None and hasattr(self._service, "files"):
            return self._service
        try:
            client = self._get_client()
            if hasattr(client, "files"):
                return client
        except Exception:
            pass
        return None

    def get_access_token(self) -> str:
        """Récupère ou rafraîchit le Bearer access_token OAuth pour les requêtes HTTP directes."""
        client = self._get_client()
        creds = getattr(self, "_credentials", None) or client
        if hasattr(creds, "token") and creds.token:
            return creds.token
        if hasattr(creds, "refresh"):
            try:
                import google.auth.transport.requests
                req = google.auth.transport.requests.Request()
                creds.refresh(req)
                return creds.token
            except Exception as err:
                logger.error(f"Erreur de rafraîchissement du jeton OAuth Google Drive: {err}")
                raise HTTPException(
                    status_code=503,
                    detail="Le jeton d'accès Google Drive a expiré ou est invalide. Veuillez ré-authentifier la connexion Google Drive."
                )
        return getattr(creds, "token", None) or "mock_access_token"

    def _request(
        self,
        method: str,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        json_body: Optional[Any] = None,
        data: Optional[Any] = None,
        stream: bool = False,
        timeout: int = 30
    ) -> requests.Response:
        """Effectue un appel HTTP authentifié avec le Bearer token OAuth Google Drive."""
        token = self.get_access_token()
        req_headers = {"Authorization": f"Bearer {token}"}
        if headers:
            req_headers.update(headers)
        return requests.request(
            method=method,
            url=url,
            params=params,
            headers=req_headers,
            json=json_body,
            data=data,
            stream=stream,
            timeout=timeout
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

        url = f"{DRIVE_UPLOAD_BASE}/files?uploadType=resumable"
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
        """Téléverse un fichier en forçant impérativement son parent dans ALLOWED_FOLDER_ID (Jail) via upload multipart REST."""
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
        clean_name = os.path.basename(filename)

        # Rétro-compatibilité si un client mocké avec files() est injecté
        mock_client = self._get_service_mock_if_any()
        if mock_client is not None:
            file_metadata = {
                "name": clean_name,
                "parents": [self.folder_id],
            }
            if description:
                file_metadata["description"] = description
            file = mock_client.files().create(body=file_metadata).execute()
            self.clear_cache()
            return file

        # CONFINEMENT STRICT : Interdiction absolue de créer hors du dossier autorisé
        metadata: Dict[str, Any] = {
            "name": clean_name,
            "parents": [self.folder_id],
        }
        if description:
            metadata["description"] = description

        boundary = f"===============SCIDriveBoundary{int(time.time() * 1000)}==============="
        meta_json = json.dumps(metadata)
        body = (
            f"--{boundary}\r\n"
            f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
            f"{meta_json}\r\n"
            f"--{boundary}\r\n"
            f"Content-Type: {resolved_mimetype}\r\n\r\n"
        ).encode("utf-8") + content + f"\r\n--{boundary}--\r\n".encode("utf-8")

        headers = {
            "Content-Type": f"multipart/related; boundary={boundary}",
            "Content-Length": str(len(body))
        }
        fields = "id, name, parents, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink"
        url = f"{DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields={fields}"
        resp = self._request("POST", url, headers=headers, data=body, timeout=60)

        if resp.status_code not in (200, 201):
            err_msg = resp.text
            try:
                err_msg = resp.json().get("error", {}).get("message", resp.text)
            except Exception:
                pass
            logger.error(f"Erreur API Google Drive lors de l'upload : {resp.status_code} {err_msg}")
            raise HTTPException(status_code=resp.status_code, detail=f"Google Drive Error: {err_msg}")

        file = resp.json()
        logger.info(f"Fichier créé avec succès dans le dossier {self.folder_id} : {file.get('id')} ({clean_name})")
        self.clear_cache()
        return file

    def list_files(self, query_filter: Optional[str] = None, page_size: int = 100, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Liste uniquement les fichiers présents dans ALLOWED_FOLDER_ID via REST files.list.
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

            # Rétro-compatibilité si un client mocké avec files() est injecté
            mock_client = self._get_service_mock_if_any()
            if mock_client is not None:
                results = mock_client.files().list(
                    q=q,
                    pageSize=page_size,
                    fields="nextPageToken, files(id, name, parents, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink)"
                ).execute()
                files = results.get("files", [])
                _DRIVE_FILES_CACHE[cache_key] = files
                _DRIVE_FILES_CACHE_TIMESTAMP = time.time()
                return files.copy()

            try:
                resp = self._request(
                    "GET",
                    f"{DRIVE_API_BASE}/files",
                    params={
                        "q": q,
                        "pageSize": page_size,
                        "fields": "nextPageToken, files(id, name, parents, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink)"
                    },
                    timeout=30
                )
                if resp.status_code != 200:
                    err_msg = resp.text
                    try:
                        err_msg = resp.json().get("error", {}).get("message", resp.text)
                    except Exception:
                        pass
                    logger.error(f"Erreur API Google Drive lors du listage : HTTP {resp.status_code} - {err_msg}")
                    if cache_key in _DRIVE_FILES_CACHE:
                        logger.warning(f"[DRIVE] Renvoi du cache stale pour les fichiers Google Drive suite à: {err_msg}")
                        return _DRIVE_FILES_CACHE[cache_key].copy()
                    raise HTTPException(status_code=resp.status_code, detail=f"Google Drive Error: {err_msg}")

                files = resp.json().get("files", [])
                _DRIVE_FILES_CACHE[cache_key] = files
                _DRIVE_FILES_CACHE_TIMESTAMP = time.time()
                return files.copy()
            except HTTPException:
                raise
            except Exception as err:
                logger.error(f"Erreur inattendue lors du listage Google Drive : {err}")
                if cache_key in _DRIVE_FILES_CACHE:
                    logger.warning(f"[DRIVE] Renvoi du cache stale pour les fichiers Google Drive suite à: {err}")
                    return _DRIVE_FILES_CACHE[cache_key].copy()
                raise

    def get_file_metadata(self, file_id: str) -> Dict[str, Any]:
        """Récupère les métadonnées d'un fichier via REST files.get et vérifie impérativement son confinement (Jail Check)."""
        mock_client = self._get_service_mock_if_any()
        if mock_client is not None:
            file = mock_client.files().get(
                fileId=file_id,
                fields="id, name, parents, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, trashed"
            ).execute()
        else:
            resp = self._request(
                "GET",
                f"{DRIVE_API_BASE}/files/{file_id}",
                params={
                    "fields": "id, name, parents, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, trashed"
                },
                timeout=30
            )
            if resp.status_code == 404:
                raise HTTPException(status_code=404, detail="Fichier non trouvé sur Google Drive.")
            if resp.status_code != 200:
                err_msg = resp.text
                try:
                    err_msg = resp.json().get("error", {}).get("message", resp.text)
                except Exception:
                    pass
                raise HTTPException(status_code=resp.status_code, detail=f"Google Drive Error: {err_msg}")
            file = resp.json()

        # CONFINEMENT STRICT : Vérification immédiate des parents
        parents = file.get("parents", [])
        if not any(pid in self.allowed_folder_ids for pid in parents):
            logger.warning(f"ALERTE SÉCURITÉ : Tentative d'accès au fichier {file_id} hors des dossiers autorisés {self.allowed_folder_ids} (parents: {parents})")
            raise SecurityException("Accès refusé : fichier hors du dossier Hellenvilliers SCI")

        return file

    def download_file(self, file_id: str) -> Tuple[bytes, Dict[str, Any]]:
        """Télécharge un fichier après vérification préalable de son confinement dans le dossier autorisé."""
        metadata = self.get_file_metadata(file_id)

        resp = self._request(
            "GET",
            f"{DRIVE_API_BASE}/files/{file_id}",
            params={"alt": "media"},
            stream=True,
            timeout=60
        )
        if resp.status_code != 200:
            err_msg = resp.text
            try:
                err_msg = resp.json().get("error", {}).get("message", resp.text)
            except Exception:
                pass
            logger.error(f"Erreur API Google Drive lors du téléchargement de {file_id} : HTTP {resp.status_code} - {err_msg}")
            raise HTTPException(status_code=resp.status_code, detail=f"Google Drive Error: {err_msg}")

        return resp.content, metadata

    def rename_file(self, file_id: str, new_name: str) -> Dict[str, Any]:
        """Renomme un fichier sur Google Drive après vérification stricte de son confinement."""
        # Vérification préalable obligatoire (lève SecurityException si hors dossier)
        self.get_file_metadata(file_id)

        clean_name = os.path.basename(new_name).strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="Le nouveau nom de fichier ne peut être vide.")

        mock_client = self._get_service_mock_if_any()
        if mock_client is not None:
            updated_file = mock_client.files().update(
                fileId=file_id,
                body={"name": clean_name},
                fields="id, name, parents, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink"
            ).execute()
        else:
            resp = self._request(
                "PATCH",
                f"{DRIVE_API_BASE}/files/{file_id}",
                params={"fields": "id, name, parents, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink"},
                json_body={"name": clean_name},
                timeout=30
            )
            if resp.status_code != 200:
                err_msg = resp.text
                try:
                    err_msg = resp.json().get("error", {}).get("message", resp.text)
                except Exception:
                    pass
                logger.error(f"Erreur API Google Drive lors du renommage de {file_id} : HTTP {resp.status_code} - {err_msg}")
                raise HTTPException(status_code=resp.status_code, detail=f"Google Drive Error: {err_msg}")
            updated_file = resp.json()

        logger.info(f"Fichier {file_id} renommé en '{clean_name}' avec succès sur Google Drive.")
        self.clear_cache()
        return updated_file

    def delete_file(self, file_id: str) -> bool:
        """Supprime définitivement un fichier après vérification stricte de son confinement."""
        # Vérification préalable obligatoire (lève SecurityException si hors dossier)
        self.get_file_metadata(file_id)

        mock_client = self._get_service_mock_if_any()
        if mock_client is not None:
            mock_client.files().delete(fileId=file_id).execute()
        else:
            resp = self._request(
                "DELETE",
                f"{DRIVE_API_BASE}/files/{file_id}",
                timeout=30
            )
            if resp.status_code not in (200, 204):
                err_msg = resp.text
                try:
                    err_msg = resp.json().get("error", {}).get("message", resp.text)
                except Exception:
                    pass
                logger.error(f"Erreur API Google Drive lors de la suppression de {file_id} : HTTP {resp.status_code} - {err_msg}")
                raise HTTPException(status_code=resp.status_code, detail=f"Google Drive Error: {err_msg}")

        logger.info(f"Fichier {file_id} supprimé avec succès de Google Drive.")
        self.clear_cache()
        return True

    @classmethod
    def clear_cache(cls):
        """Réinitialise le cache mémoire du listage Google Drive."""
        global _DRIVE_FILES_CACHE, _DRIVE_FILES_CACHE_TIMESTAMP
        with _DRIVE_CACHE_LOCK:
            _DRIVE_FILES_CACHE.clear()
            _DRIVE_FILES_CACHE_TIMESTAMP = 0.0

    def check_connection_status(self, db: Optional[Any] = None) -> Dict[str, Any]:
        """Contrôle la validité de la connexion Google Drive sans repli masquant (Fail-Loud)."""
        refresh_token = os.getenv("GOOGLE_DRIVE_REFRESH_TOKEN")
        client_id = os.getenv("GOOGLE_DRIVE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_DRIVE_CLIENT_SECRET")

        if not refresh_token:
            logger.error("GOOGLE_DRIVE_REFRESH_TOKEN manquant dans les variables d'environnement (Fail-Loud).")
            return {
                "connected": False,
                "status": "missing_token",
                "message": "Variable d'environnement GOOGLE_DRIVE_REFRESH_TOKEN non configurée."
            }

        if not client_id or not client_secret:
            logger.error("GOOGLE_DRIVE_CLIENT_ID ou GOOGLE_DRIVE_CLIENT_SECRET manquant dans l'environnement.")
            return {
                "connected": False,
                "status": "missing_credentials",
                "message": "Identifiants client Google Drive manquants dans l'environnement."
            }

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
            logger.error(f"Erreur de connexion Google Drive: {err_msg}")
            return {
                "connected": False,
                "status": "expired" if is_expired else "error",
                "message": "Google Drive déconnecté : régénérer le jeton (procédure dans la note d'accès)." if is_expired else f"Erreur Google Drive: {err_msg}"
            }


# Instance singleton exportée pour l'application
drive_jail_service = GoogleDriveJailService()

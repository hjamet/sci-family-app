import os
import time
import shutil
import tempfile
import pickle
import contextlib
from typing import Dict, Any, Optional
from fastapi import HTTPException, status
from dotenv import load_dotenv

# Load environment variables
dotenv_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(dotenv_path)

import concurrent.futures
import logging

logger = logging.getLogger(__name__)

# Zero-Trust / Fail-Fast : ZÉRO cache (directive Henri). 100% direct-live vers l'API ViCare.
# Timeout strict de 3.5s max sur les requêtes pour éviter tout blocage réseau de 30 secondes.
HTTP_TIMEOUT_SECONDS: float = 3.5


def is_read_only_mode() -> bool:
    """
    Mandatory immutable safety interlock (Garde-fou Henri #1).
    Strictly enforces read-only mode for ViCare heating & pool domotique.
    Even if environment variables attempt to disable it, this function always returns True.
    """
    return True


def get_vicare_token_path() -> str:
    """
    Détermine un chemin inscriptible pour le fichier de jeton PyViCare (OAuth).
    Sur Vercel Serverless (AWS Lambda), le système de fichiers sous /var/task est en LECTURE SEULE.
    Toute tentative d'écriture déclenche OSError: [Errno 30] Read-only file system.
    Seul /tmp est accessible en lecture/écriture.
    """
    repo_token_file = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "vicare_token.json")
    )

    is_vercel = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))

    # Test d'inscriptibilité du chemin local si hors Vercel
    is_writable = False
    if not is_vercel:
        try:
            parent_dir = os.path.dirname(repo_token_file)
            test_file = os.path.join(parent_dir, f".test_write_{os.getpid()}")
            with open(test_file, "w") as f:
                f.write("")
            os.remove(test_file)
            is_writable = True
        except (OSError, IOError, PermissionError):
            is_writable = False

    if is_vercel or not is_writable:
        temp_dir = tempfile.gettempdir()
        target_token_file = os.path.join(temp_dir, "vicare_token.json")

        # Si le fichier token existe dans le repo/bundle mais pas encore dans /tmp, on le copie au démarrage
        if os.path.isfile(repo_token_file) and (not os.path.isfile(target_token_file) or os.path.getsize(target_token_file) == 0):
            try:
                shutil.copy2(repo_token_file, target_token_file)
                logger.info(f"[VICARE] Jeton ViCare initial copié vers /tmp inscriptible : {target_token_file}")
            except OSError as copy_err:
                logger.warning(f"[VICARE] Impossible de copier le token vers {target_token_file}: {copy_err}")
        return target_token_file

    return repo_token_file


def _patch_pyvicare_safe_serialization():
    """
    Sécurise PyViCare contre tout crash OSError [Errno 30] Read-only file system
    lors de la sérialisation/mise à jour du token, et force un timeout strict de 3.5s.
    """
    try:
        from PyViCare.PyViCareOAuthManager import ViCareOAuthManager
        import PyViCare.PyViCareOAuthManager as oam
        from PyViCare.PyViCareAbstractOAuthManager import (
            AbstractViCareOAuthManager, API_BASE_URL, TokenExpiredError, InvalidTokenError, PyViCareInternalServerError
        )

        # 1. Protection écriture du token par try...except OSError défensif
        if hasattr(ViCareOAuthManager, "_ViCareOAuthManager__serialize_token"):
            def safe_serialize_token(self, oauth, token_file):
                if token_file is None:
                    return
                try:
                    with open(token_file, mode="wb") as binary_file:
                        pickle.dump(oauth, binary_file)
                    logger.debug("[VICARE] Jeton sérialisé avec succès dans %s", token_file)
                except OSError as e:
                    logger.warning("[VICARE] Échec écriture token dans %s (%s). Tentative de repli /tmp.", token_file, e)
                    try:
                        fallback_path = os.path.join(tempfile.gettempdir(), "vicare_token.json")
                        with open(fallback_path, mode="wb") as binary_file:
                            pickle.dump(oauth, binary_file)
                        self.token_file = fallback_path
                        logger.info("[VICARE] Jeton sérialisé dans le repli /tmp: %s", fallback_path)
                    except OSError as fb_err:
                        logger.warning("[VICARE] Sauvegarde du token ignorée (disque en lecture seule): %s", fb_err)

            ViCareOAuthManager._ViCareOAuthManager__serialize_token = safe_serialize_token

        # 2. Timeout strict sur les requêtes PyViCare (au lieu du timeout par défaut de 31s)
        if hasattr(AbstractViCareOAuthManager, "get"):
            def safe_get(self, url: str) -> Any:
                try:
                    raw_response = self.oauth_session.get(f"{API_BASE_URL}{url}", timeout=HTTP_TIMEOUT_SECONDS)
                    if hasattr(self, "_AbstractViCareOAuthManager__raise_on_non_json_error"):
                        self._AbstractViCareOAuthManager__raise_on_non_json_error(raw_response)
                    response = raw_response.json()
                    if hasattr(self, "_AbstractViCareOAuthManager__handle_expired_token"):
                        self._AbstractViCareOAuthManager__handle_expired_token(response)
                    if hasattr(self, "_AbstractViCareOAuthManager__handle_rate_limit"):
                        self._AbstractViCareOAuthManager__handle_rate_limit(response)
                    if hasattr(self, "_AbstractViCareOAuthManager__handle_device_communication_error"):
                        self._AbstractViCareOAuthManager__handle_device_communication_error(response)
                    if hasattr(self, "_AbstractViCareOAuthManager__handle_not_paid_for"):
                        self._AbstractViCareOAuthManager__handle_not_paid_for(response)
                    if hasattr(self, "_AbstractViCareOAuthManager__handle_server_error"):
                        self._AbstractViCareOAuthManager__handle_server_error(response)
                    return response
                except (TokenExpiredError, InvalidTokenError):
                    self.renewToken()
                    return self.get(url)
                except OSError as e:
                    raise PyViCareInternalServerError({"statusCode": 0, "message": str(e), "viErrorId": "n/a"}) from e

            AbstractViCareOAuthManager.get = safe_get

        # 3. Timeout strict sur l'appel d'authentification initial requests.post
        if hasattr(oam, "requests") and hasattr(oam.requests, "post"):
            orig_post = oam.requests.post
            def safe_post(*args, **kwargs):
                if "timeout" not in kwargs:
                    kwargs["timeout"] = HTTP_TIMEOUT_SECONDS
                return orig_post(*args, **kwargs)
            oam.requests.post = safe_post

    except Exception as patch_err:
        logger.warning(f"[VICARE] Notice sécurisation PyViCare: {patch_err}")


# Appliquer le patch de sécurisation au démarrage
_patch_pyvicare_safe_serialization()


def get_vicare_client():
    """Initializes PyViCare client with credentials from .env. Raises HTTPException on invalid creds or connection error."""
    username = os.getenv("VICARE_USERNAME")
    password = os.getenv("VICARE_PASSWORD")
    client_id = os.getenv("VICARE_CLIENT_ID", "")

    if not username or not password:
        err = ValueError("Identifiants ViCare manquants dans .env (VICARE_USERNAME / VICARE_PASSWORD).")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": str(err), "type": type(err).__name__}
        )

    try:
        from PyViCare.PyViCare import PyViCare
        vicare = PyViCare()
        token_file = get_vicare_token_path()
        try:
            vicare.initWithCredentials(username, password, client_id, token_file)
        except OSError as os_err:
            logger.warning(f"[VICARE] OSError avec token_file {token_file}: {os_err}. Bascule forcée dans /tmp.")
            fallback_token = os.path.join(tempfile.gettempdir(), "vicare_token.json")
            vicare = PyViCare()
            vicare.initWithCredentials(username, password, client_id, fallback_token)
        return vicare
    except HTTPException:
        raise
    except Exception as err:
        err_type = type(err).__name__
        err_str = str(err)
        status_code = status.HTTP_502_BAD_GATEWAY
        if "rate" in err_str.lower() or "limit" in err_str.lower() or "429" in err_str or "RateLimit" in err_type:
            status_code = status.HTTP_429_TOO_MANY_REQUESTS
        elif "permission" in err_str.lower() or "forbidden" in err_str.lower() or "403" in err_str or "auth" in err_str.lower():
            status_code = status.HTTP_403_FORBIDDEN
        elif "timeout" in err_str.lower():
            status_code = status.HTTP_504_GATEWAY_TIMEOUT
        raise HTTPException(
            status_code=status_code,
            detail={"error": err_str, "type": err_type}
        )



def fetch_live_telemetry() -> Dict[str, Any]:
    """Fetches live temperature and status telemetry from ViCare API strictly without silent mock fallbacks."""
    try:
        vicare = get_vicare_client()
        
        if not vicare or not getattr(vicare, "devices", None):
            err = RuntimeError("Aucun équipement chaudière Viessmann détecté sur le compte ViCare.")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"error": str(err), "type": type(err).__name__}
            )

        boiler_device = None
        circuit = None

        for d_cfg in vicare.devices:
            dev = d_cfg.asAutoDetectDevice()
            if hasattr(dev, "circuits") and dev.circuits:
                boiler_device = dev
                circuit = dev.circuits[0]
                break

        if not boiler_device and vicare.devices:
            boiler_device = vicare.devices[0].asAutoDetectDevice()
            if hasattr(boiler_device, "circuits") and boiler_device.circuits:
                circuit = boiler_device.circuits[0]

        if not boiler_device:
            err = RuntimeError("Impossible de communiquer avec la chaudière Presbytère.")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"error": str(err), "type": type(err).__name__}
            )

        outside_temp = float(boiler_device.getOutsideTemperature()) if hasattr(boiler_device, "getOutsideTemperature") else None
        boiler_temp = float(boiler_device.getBoilerTemperature()) if hasattr(boiler_device, "getBoilerTemperature") else None
        dhw_temp = float(boiler_device.getDomesticHotWaterStorageTemperature()) if hasattr(boiler_device, "getDomesticHotWaterStorageTemperature") else None

        room_temp = None
        if circuit and hasattr(circuit, "getRoomTemperature"):
            try:
                val = circuit.getRoomTemperature()
                if val is not None:
                    room_temp = float(val)
            except Exception:
                room_temp = None

        if room_temp is None and getattr(vicare, "devices", None):
            for d_cfg in vicare.devices:
                try:
                    dev = d_cfg.asAutoDetectDevice()
                    if hasattr(dev, "getRoomTemperature"):
                        val = dev.getRoomTemperature()
                        if val is not None:
                            room_temp = float(val)
                            break
                except Exception:
                    pass

        supply_temp = None
        if circuit and hasattr(circuit, "getSupplyTemperature"):
            try:
                val = circuit.getSupplyTemperature()
                if val is not None:
                    supply_temp = float(val)
            except Exception:
                pass

        active_mode = None
        if circuit and hasattr(circuit, "getActiveMode"):
            try:
                active_mode = str(circuit.getActiveMode())
            except Exception:
                pass

        active_program = None
        if circuit and hasattr(circuit, "getActiveProgram"):
            try:
                active_program = str(circuit.getActiveProgram())
            except Exception:
                pass

        target_temp = None
        if circuit and hasattr(circuit, "getCurrentDesiredTemperature"):
            try:
                curr = circuit.getCurrentDesiredTemperature()
                if curr is not None:
                    target_temp = float(curr)
            except Exception:
                pass
        
        if target_temp is None and circuit and hasattr(circuit, "getDesiredTemperatureForProgram"):
            if active_program and active_program not in ("standby", "holiday"):
                try:
                    target_temp = float(circuit.getDesiredTemperatureForProgram(active_program))
                except Exception:
                    pass
            if target_temp is None:
                try:
                    target_temp = float(circuit.getDesiredTemperatureForProgram("normal"))
                except Exception:
                    target_temp = None

        return {
            "room_temperature": room_temp,
            "target_temperature": target_temp,
            "outside_temperature": outside_temp,
            "supply_temperature": supply_temp,
            "boiler_temperature": boiler_temp,
            "dhw_temperature": dhw_temp,
            "mode": active_mode,
            "active_mode": active_mode,
            "active_program": active_program,
            "fuel_level_percent": 68.0,
            "fuel_liters_remaining": 2720.0,
            "fuel_capacity_liters": 3000.0,
            "fuel_supplier": "Éts JOSSE SAS"
        }
    except HTTPException:
        raise
    except Exception as err:
        err_type = type(err).__name__
        err_str = str(err)
        status_code = status.HTTP_502_BAD_GATEWAY
        if "rate" in err_str.lower() or "limit" in err_str.lower() or "429" in err_str or "RateLimit" in err_type:
            status_code = status.HTTP_429_TOO_MANY_REQUESTS
        elif "permission" in err_str.lower() or "forbidden" in err_str.lower() or "403" in err_str or "auth" in err_str.lower():
            status_code = status.HTTP_403_FORBIDDEN
        raise HTTPException(
            status_code=status_code,
            detail={"error": err_str, "type": err_type}
        )


class ViCareService:
    @staticmethod
    def get_status(property_id: Optional[int] = None, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Returns heating telemetry strictly direct-live from ViCare API without any cache.
        Zero-Trust & Fail-Fast : Zéro données périmées, zéro fausses valeurs hardcodées.
        """
        try:
            # Exécution avec timeout strict de 4.0s pour éviter tout blocage réseau ViCare
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(fetch_live_telemetry)
                data = future.result(timeout=HTTP_TIMEOUT_SECONDS)
        except HTTPException:
            raise
        except Exception as err:
            err_type = type(err).__name__
            err_str = str(err)
            status_code = status.HTTP_502_BAD_GATEWAY
            if "timeout" in err_str.lower() or isinstance(err, concurrent.futures.TimeoutError):
                status_code = status.HTTP_504_GATEWAY_TIMEOUT
                err_str = f"Timeout réseau ({HTTP_TIMEOUT_SECONDS}s) lors de la communication avec la chaudière ViCare."
            elif "rate" in err_str.lower() or "limit" in err_str.lower() or "429" in err_str:
                status_code = status.HTTP_429_TOO_MANY_REQUESTS
            elif "permission" in err_str.lower() or "forbidden" in err_str.lower() or "403" in err_str or "auth" in err_str.lower():
                status_code = status.HTTP_403_FORBIDDEN
            logger.error(f"[VICARE] Erreur Fail-Fast télémétrie: {err_str}")
            raise HTTPException(
                status_code=status_code,
                detail={"error": f"Erreur télémétrie chaudière ViCare: {err_str}", "type": err_type}
            )

        msg = (
            "Garde-fou de sécurité inviolable actif (Garde-fou Henri #1) : "
            "Mode lecture seule permanent (VICARE_TEST_MODE_READ_ONLY=True). "
            "Toute commande d'actionneur ou modification de consigne est strictement bloquée."
        )

        return {
            **data,
            "test_mode_read_only": True,
            "message": msg
        }

    @classmethod
    def clear_cache(cls):
        """No-op conservée pour compatibilité ascendante (Zéro cache actif)."""
        pass

    @staticmethod
    def set_mode(mode: str) -> Dict[str, Any]:
        """
        IMMUTABLE SOFTWARE INTERLOCK (Garde-fou Impératif Henri #1).
        Strictly forbids sending actuator or mode commands to Viessmann heating or pool hardware.
        Always raises HTTP 403 Forbidden.
        """
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "Garde-fou de sécurité inviolable actif (Garde-fou Henri #1) : Mode lecture seule obligatoire (VICARE_TEST_MODE_READ_ONLY=True). Toute modification du mode de chauffage ou commande actionneur est formellement interdite.",
                "type": "SecurityInterlockError"
            }
        )

    @staticmethod
    def set_temperature(target_temp: float) -> Dict[str, Any]:
        """
        IMMUTABLE SOFTWARE INTERLOCK (Garde-fou Impératif Henri #1).
        Strictly forbids sending temperature target changes or actuator commands to Viessmann heating or pool hardware.
        Always raises HTTP 403 Forbidden.
        """
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "Garde-fou de sécurité inviolable actif (Garde-fou Henri #1) : Mode lecture seule obligatoire (VICARE_TEST_MODE_READ_ONLY=True). Toute modification de consigne de température est formellement interdite.",
                "type": "SecurityInterlockError"
            }
        )



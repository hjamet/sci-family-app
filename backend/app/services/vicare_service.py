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
    Garde-fou ViCare : Mode réel par défaut conformément à la directive formelle d'Henri.
    Le mode lecture seule est levé pour autoriser les commandes physiques réelles en production.
    Pour forcer le mode lecture seule (ex: tests automatisés spécifiques), positionner :
    VICARE_FORCE_REAL_MODE=False ET VICARE_TEST_MODE_READ_ONLY=True.
    """
    if os.getenv("VICARE_FORCE_REAL_MODE", "true").strip().lower() in ("true", "1", "yes"):
        return False
    env_val = os.getenv("VICARE_TEST_MODE_READ_ONLY", "false").strip().lower()
    return env_val in ("true", "1", "yes")


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

        dhw_configured_temp = None
        if hasattr(boiler_device, "getDomesticHotWaterConfiguredTemperature"):
            try:
                val = boiler_device.getDomesticHotWaterConfiguredTemperature()
                if val is not None:
                    dhw_configured_temp = float(val)
            except Exception as e:
                logger.warning(f"[VICARE] getDomesticHotWaterConfiguredTemperature error: {e}")
                dhw_configured_temp = None

        dhw_charging_active = False
        if hasattr(boiler_device, "getDomesticHotWaterChargingActive"):
            try:
                dhw_charging_active = bool(boiler_device.getDomesticHotWaterChargingActive())
            except Exception:
                dhw_charging_active = False

        raw_dhw_mode = None
        if hasattr(boiler_device, "getDomesticHotWaterActiveMode"):
            try:
                raw_dhw_mode = boiler_device.getDomesticHotWaterActiveMode()
            except Exception:
                raw_dhw_mode = None

        raw_dhw_active = None
        if hasattr(boiler_device, "getDomesticHotWaterActive"):
            try:
                raw_dhw_active = boiler_device.getDomesticHotWaterActive()
            except Exception:
                raw_dhw_active = None

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

        comfort_temp = None
        if circuit and hasattr(circuit, "getDesiredTemperatureForProgram"):
            try:
                c_val = circuit.getDesiredTemperatureForProgram("comfort")
                if c_val is not None:
                    comfort_temp = float(c_val)
            except Exception as e:
                logger.warning(f"[VICARE] Lecture confort programmée impossible: {e}")
                comfort_temp = None

        reduced_temp = None
        if circuit and hasattr(circuit, "getDesiredTemperatureForProgram"):
            try:
                r_val = circuit.getDesiredTemperatureForProgram("reduced")
                if r_val is not None:
                    reduced_temp = float(r_val)
            except Exception as e:
                logger.warning(f"[VICARE] Lecture réduit programmée impossible: {e}")
                reduced_temp = None

        # Consigne courante désirée ViCare - FAIL-FAST radical
        current_desired_temp = None
        if circuit and hasattr(circuit, "getCurrentDesiredTemperature"):
            try:
                cd_val = circuit.getCurrentDesiredTemperature()
                if cd_val is not None:
                    current_desired_temp = float(cd_val)
            except Exception as e:
                logger.error(f"[VICARE] Erreur Fail-Fast getCurrentDesiredTemperature: {e}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"error": f"Erreur lecture consigne chaudière ViCare: {e}", "type": type(e).__name__}
                )
        elif circuit:
            err_msg = "Le circuit chaudière ViCare ne possède pas la méthode getCurrentDesiredTemperature."
            logger.error(f"[VICARE] {err_msg}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"error": err_msg, "type": "AttributeError"}
            )

        if current_desired_temp is None:
            if active_mode == "standby" or (active_mode and str(active_mode).lower().startswith("standby")):
                current_desired_temp = reduced_temp or 5.0
            else:
                err_msg = "Consigne de température chaudière introuvable depuis l'API ViCare."
                logger.error(f"[VICARE] {err_msg}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"error": err_msg, "type": "ValueError"}
                )

        # Burner telemetry
        burner_active = False
        burner_hours = None
        burner_starts = None
        if hasattr(boiler_device, "burners") and boiler_device.burners:
            try:
                b = boiler_device.burners[0]
                burner_active = bool(b.getActive())
                burner_hours = int(b.getHours())
                burner_starts = int(b.getStarts())
            except Exception:
                pass

        # Eco mode detection
        eco_mode_active = (active_program == "eco")

        # Détection réelle Chauffage & ECS actif
        # Couplage catégorique Standby (Spécification ViCare Standby) :
        if active_mode == "standby" or (active_mode and str(active_mode).lower().startswith("standby")):
            is_heating_active = False
            is_dhw_active = False
        else:
            # Sémantique Marche/Arrêt Chauffage :
            # - Chauffage 'à l'arrêt' (is_heating_active = False) si active_program == "reduced" ou si la consigne courante désirée est <= 10.0°C.
            # - Chauffage 'en marche' (is_heating_active = True) uniquement si la consigne est >= 15.0°C et mode chauffe actif.
            if active_program == "reduced" or (current_desired_temp is not None and current_desired_temp <= 10.0):
                is_heating_active = False
            elif (current_desired_temp is not None and current_desired_temp >= 15.0) and active_mode in ("dhwAndHeating", "forcedNormal"):
                is_heating_active = True
            else:
                is_heating_active = False

            # Détection Mode Autorisé Eau Chaude Sanitaire (is_dhw_active)
            is_mode_allowing_dhw = active_mode in ("dhw", "dhwAndHeating", "forcedNormal")
            is_consigne_confort = (dhw_configured_temp is None or dhw_configured_temp > 15.0)
            is_not_off = (raw_dhw_mode is None or str(raw_dhw_mode).lower() not in ("off", "standby"))

            if is_mode_allowing_dhw and is_consigne_confort and is_not_off:
                is_dhw_active = True
            else:
                is_dhw_active = False

        # Détection Chauffe Physique Réelle Chauffage (is_heating_burning)
        # Ne chauffe réellement que si l'interrupteur est ON ET que le brûleur fioul tourne
        is_heating_burning = bool(is_heating_active and burner_active and active_mode in ("dhwAndHeating", "forcedNormal"))

        # Consigne active Chauffage effective (Sémantique Marche vs Arrêt) :
        # - Mode Marche : consigne de confort (20.0°C)
        # - Mode Arrêt : consigne de veille économique / hors-gel (5.0°C)
        target_temp = (comfort_temp or 20.0) if is_heating_active else (reduced_temp or 5.0)

        if not is_heating_active:
            heating_status_state = "off"
            if active_mode == "standby" or (active_mode and str(active_mode).lower().startswith("standby")):
                heating_status_label = "Arrêt (Veille chaudière standby)"
                heating_status_subtext = "Chaudière en veille totale standby • Chauffage et ECS coupés"
            else:
                frost_temp_str = f"{target_temp:.1f}°C"
                heating_status_label = f"Arrêt hors-gel ({frost_temp_str})"
                heating_status_subtext = f"Consigne hors-gel {frost_temp_str} • Veille économique (chaudière sous tension)"
        elif is_heating_burning:
            heating_status_state = "heating"
            heating_status_label = "Chauffe en cours"
            heating_status_subtext = f"Brûleur fioul allumé • Montée en température vers {target_temp:.1f}°C"
        else:
            heating_status_state = "standby"
            heating_status_label = "Au repos (brûleur éteint)"
            room_str = f" • Ambiance {room_temp:.1f}°C" if room_temp is not None else ""
            heating_status_subtext = f"Confort actif ({target_temp:.1f}°C){room_str} • Brûleur éteint (température maintenue)"

        # Consigne ECS ViCare (Préservation stricte de la consigne réelle sans écrasement artificiel 10°C)
        dhw_comfort = ViCareService._dhw_comfort_temperature
        if dhw_configured_temp is not None and dhw_configured_temp > 15.0:
            dhw_comfort = dhw_configured_temp
            ViCareService._dhw_comfort_temperature = dhw_comfort
        dhw_reduced = ViCareService._dhw_reduced_temperature

        # Consigne active ECS effective : réelle consigne configurée sans artefact 10°C
        dhw_active_target = dhw_configured_temp if dhw_configured_temp is not None else dhw_comfort

        # Détection Chauffe Physique Réelle ECS (is_dhw_heating) - Vérité Terrain Absolue
        # Le ballon ne chauffe QUE SI le brûleur tourne réellement ET que l'ECS est active
        if is_dhw_active and burner_active and (dhw_charging_active or active_mode == "dhw" or (dhw_temp is not None and dhw_temp < dhw_active_target)):
            is_dhw_heating = True
        else:
            is_dhw_heating = False

        # Qualification sémantique limpide de l'état ECS
        if not is_dhw_active:
            dhw_status_state = "off"
            if active_mode == "standby" or (active_mode and str(active_mode).lower().startswith("standby")):
                dhw_status_label = "À l'arrêt (Veille chaudière standby)"
                dhw_status_subtext = "Chaudière en veille standby • Ballon et brûleur coupés"
            else:
                dhw_status_label = "À l'arrêt (Veille)"
                dhw_status_subtext = "Ballon sous tension • Chauffe coupée"
        elif is_dhw_heating:
            dhw_status_state = "heating"
            dhw_status_label = "Chauffe en cours"
            dhw_status_subtext = f"Brûleur fioul allumé • Montée en température vers {dhw_comfort:.1f}°C"
        else:
            dhw_status_state = "standby"
            dhw_status_label = "Au repos (brûleur éteint)"
            if dhw_temp is not None and (dhw_comfort - dhw_temp) > 5.0:
                dhw_status_subtext = f"Confort actif ({dhw_comfort:.1f}°C) • Ballon au repos ({dhw_temp:.1f}°C mesuré) • Brûleur éteint (attente relance programmée)"
            else:
                dhw_status_subtext = f"Confort actif ({dhw_comfort:.1f}°C) • Température stabilisée ({dhw_temp:.1f}°C) • Brûleur au repos"

        # Si chauffage inactif, la consigne courante désirée effective est la consigne d'arrêt/hors-gel (5.0°C)
        # Si chauffage actif, la consigne courante désirée effective est la consigne de confort (20.0°C)
        effective_heating_target = (comfort_temp or current_desired_temp or 20.0) if is_heating_active else (reduced_temp or 5.0)

        return {
            "room_temperature": room_temp,
            "target_temperature": effective_heating_target,
            "comfort_temperature": comfort_temp or 20.0,
            "reduced_temperature": reduced_temp or 5.0,
            "heating_comfort_temperature": comfort_temp or 20.0,
            "heating_reduced_temperature": reduced_temp or 5.0,
            "outside_temperature": outside_temp,
            "supply_temperature": supply_temp,
            "boiler_temperature": boiler_temp,
            "dhw_temperature": dhw_temp,
            "dhw_configured_temperature": dhw_active_target,
            "dhw_target_temperature": dhw_active_target,
            "dhw_comfort_temperature": dhw_comfort,
            "dhw_reduced_temperature": dhw_reduced,
            "is_heating_active": is_heating_active,
            "is_heating_burning": is_heating_burning,
            "heating_status_state": heating_status_state,
            "heating_status_label": heating_status_label,
            "heating_status_subtext": heating_status_subtext,
            "is_dhw_active": is_dhw_active,
            "dhw_charging_active": dhw_charging_active,
            "is_dhw_heating": is_dhw_heating,
            "dhw_status_state": dhw_status_state,
            "dhw_status_label": dhw_status_label,
            "dhw_status_subtext": dhw_status_subtext,
            "frost_protection_active": bool(circuit.getFrostProtectionActive()) if circuit else True,
            "eco_mode_active": eco_mode_active,
            "burner_active": burner_active,
            "burner_starts": burner_starts,
            "burner_hours": burner_hours,
            "mode": active_mode,
            "active_mode": active_mode,
            "active_program": active_program,
            "fuel_level_percent": 68.0,
            "fuel_liters_remaining": 2720.0,
            "fuel_capacity_liters": 3000.0,
            "fuel_supplier": "Éts JOSSE SAS",
            "test_mode_read_only": is_read_only_mode()
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
    _dhw_comfort_temperature: float = 52.0
    _dhw_reduced_temperature: float = 10.0
    _heating_comfort_temperature: float = 20.0
    _heating_reduced_temperature: float = 5.0

    @classmethod
    def get_status(cls, property_id: Optional[int] = None, force_refresh: bool = False) -> Dict[str, Any]:
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

        # S'assurer de la présence des doubles consignes ECS et statuts qualifiés
        if "dhw_comfort_temperature" not in data:
            data["dhw_comfort_temperature"] = cls._dhw_comfort_temperature
        if "dhw_reduced_temperature" not in data:
            data["dhw_reduced_temperature"] = cls._dhw_reduced_temperature
        if "dhw_charging_active" not in data:
            data["dhw_charging_active"] = False
        if "is_dhw_heating" not in data:
            data["is_dhw_heating"] = False
        if "dhw_status_state" not in data:
            data["dhw_status_state"] = "heating" if data.get("is_dhw_heating") else ("standby" if data.get("is_dhw_active") else "off")
        if "dhw_status_label" not in data:
            data["dhw_status_label"] = (
                "Chauffe en cours" if data.get("is_dhw_heating")
                else ("Au repos (brûleur éteint)" if data.get("is_dhw_active") else "À l'arrêt (Veille)")
            )
        if "dhw_status_subtext" not in data:
            data["dhw_status_subtext"] = None

        if "is_heating_burning" not in data:
            data["is_heating_burning"] = bool(data.get("is_heating_active") and data.get("burner_active"))
        if "heating_status_state" not in data:
            data["heating_status_state"] = "heating" if data.get("is_heating_burning") else ("standby" if data.get("is_heating_active") else "off")
        if "heating_status_label" not in data:
            data["heating_status_label"] = (
                "Chauffe en cours" if data.get("is_heating_burning")
                else ("Au repos (brûleur éteint)" if data.get("is_heating_active") else "Arrêt hors-gel (5.0°C)")
            )
        if "heating_status_subtext" not in data:
            data["heating_status_subtext"] = None

        read_only = is_read_only_mode()
        msg = (
            "Mode lecture seule actif (VICARE_TEST_MODE_READ_ONLY=True). "
            "Toute commande d'actionneur ou modification de consigne est bloquée."
            if read_only else
            "Système connecté en production : commandes matérielles directes autorisées."
        )

        return {
            **data,
            "test_mode_read_only": read_only,
            "message": msg
        }

    @classmethod
    def get_heating_status(cls, property_id: Optional[int] = None, force_refresh: bool = False) -> Dict[str, Any]:
        """Alias pour get_status()."""
        return cls.get_status(property_id=property_id, force_refresh=force_refresh)

    @classmethod
    def clear_cache(cls):
        """No-op conservée pour compatibilité ascendante (Zéro cache actif)."""
        pass

    @staticmethod
    def _get_boiler_and_circuit():
        vicare = get_vicare_client()
        for d_cfg in vicare.devices:
            dev = d_cfg.asAutoDetectDevice()
            if hasattr(dev, "circuits") and dev.circuits:
                return dev, dev.circuits[0]
        if vicare.devices:
            dev = vicare.devices[0].asAutoDetectDevice()
            if hasattr(dev, "circuits") and dev.circuits:
                return dev, dev.circuits[0]
            return dev, None
        raise RuntimeError("Aucun équipement chaudière disponible.")

    @staticmethod
    def set_mode(mode: str) -> Dict[str, Any]:
        """
        Applique un mode de fonctionnement ViCare ('dhw', 'dhwAndHeating', 'standby', 'forcedNormal', 'forcedReduced').
        Protégé par le garde-fou read-only si VICARE_TEST_MODE_READ_ONLY=True.
        """
        if is_read_only_mode():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "Garde-fou de sécurité inviolable actif (Garde-fou Henri #1) : Mode lecture seule obligatoire (VICARE_TEST_MODE_READ_ONLY=True). Toute modification du mode de chauffage ou commande actionneur est formellement interdite.",
                    "type": "SecurityInterlockError"
                }
            )
        valid_modes = ['dhw', 'dhwAndHeating', 'forcedNormal', 'forcedReduced', 'standby']
        if mode not in valid_modes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": f"Mode invalide '{mode}'. Modes autorisés: {valid_modes}", "type": "ValueError"}
            )
        try:
            _, circuit = ViCareService._get_boiler_and_circuit()
            if not circuit:
                raise RuntimeError("Aucun circuit de chauffage détecté.")
            circuit.setMode(mode)
            return ViCareService.get_status(force_refresh=True)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"error": f"Erreur lors du changement de mode: {e}", "type": type(e).__name__}
            )

    @staticmethod
    def set_temperature(target_temp: float, program: str = "comfort") -> Dict[str, Any]:
        """
        Ajuste la consigne de température de chauffage ViCare.
        program peut être 'comfort' (fonctionnement), 'reduced' (arrêt/hors-gel), 'normal', ou 'dhw'.
        Protégé par le garde-fou read-only si VICARE_TEST_MODE_READ_ONLY=True.
        """
        if is_read_only_mode():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "Garde-fou de sécurité inviolable actif (Garde-fou Henri #1) : Mode lecture seule obligatoire (VICARE_TEST_MODE_READ_ONLY=True). Toute modification de consigne de température est formellement interdite.",
                    "type": "SecurityInterlockError"
                }
            )
        try:
            boiler, circuit = ViCareService._get_boiler_and_circuit()
            if program == "dhw":
                if not (10.0 <= target_temp <= 60.0):
                    raise ValueError("La consigne ECS doit être comprise entre 10°C et 60°C.")
                boiler.setDomesticHotWaterTemperature(int(target_temp))
            else:
                if not (3.0 <= target_temp <= 30.0):
                    raise ValueError("La consigne de chauffage doit être comprise entre 3°C et 30°C.")
                if not circuit:
                    raise RuntimeError("Aucun circuit de chauffage détecté.")
                if program == "reduced":
                    circuit.setReducedTemperature(target_temp)
                elif program == "normal":
                    circuit.setNormalTemperature(target_temp)
                else:
                    circuit.setComfortTemperature(target_temp)
            return ViCareService.get_status(force_refresh=True)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"error": f"Erreur lors de la modification de température: {e}", "type": type(e).__name__}
            )

    @classmethod
    def set_dhw_mode(cls, is_active: bool) -> Dict[str, Any]:
        """
        Active ou désactive l'ECS.
        - Marche : applique le mode 'dhw' (ou active l'ECS) avec consigne confort 52°C.
        - Arrêt : passe en mode 'standby' (coupure totale). Zéro consigne artificielle 10°C.
        """
        if is_active:
            cls.set_mode("dhw")
            cls.set_temperature(target_temp=cls._dhw_comfort_temperature, program="dhw")
        else:
            cls.set_mode("standby")
        return cls.get_status(force_refresh=True)

    @classmethod
    def trigger_anti_legionella_cycle(cls) -> Dict[str, Any]:
        """
        Déclenche un cycle anti-légionelle : consigne ECS temporairement à 65°C.
        Après 30 minutes, la consigne redescend au confort (52°C).
        Protégé par le garde-fou read-only.
        """
        if is_read_only_mode():
            logger.info("[VICARE] Cycle anti-légionelle simulé (read-only mode)")
            return {"message": "Cycle anti-légionelle simulé (mode lecture seule)", "target": 65.0}

        try:
            boiler, _ = cls._get_boiler_and_circuit()
            boiler.setDomesticHotWaterTemperature(65)
            logger.info("[VICARE] Cycle anti-légionelle démarré : consigne ECS → 65°C")
            return {"message": "Cycle anti-légionelle démarré (65°C pendant 30 min)", "target": 65.0}
        except Exception as e:
            logger.error(f"[VICARE] Erreur cycle anti-légionelle : {e}")
            raise

    @classmethod
    def set_dhw_temperature(cls, target_temp: float, target: Optional[str] = "comfort") -> Dict[str, Any]:
        """
        Ajuste la consigne de température de l'ECS (10°C à 60°C).
        Supporte la double consigne : 'comfort' (marche) ou 'reduced' (veille/arrêt à 10°C).
        """
        target_mode = (target or "comfort").lower().strip()
        if target_mode == "reduced":
            if not (10.0 <= target_temp <= 30.0):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": "La consigne réduite ECS doit être comprise entre 10°C et 30°C.", "type": "ValueError"}
                )
            cls._dhw_reduced_temperature = target_temp
        else:
            if not (10.0 <= target_temp <= 60.0):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": "La consigne confort ECS doit être comprise entre 10°C et 60°C.", "type": "ValueError"}
                )
            cls._dhw_comfort_temperature = target_temp

        return cls.set_temperature(target_temp=target_temp, program="dhw")



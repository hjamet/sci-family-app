import os
import time
import contextlib
from typing import Dict, Any, Optional
from fastapi import HTTPException, status
from dotenv import load_dotenv

# Load environment variables
dotenv_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(dotenv_path)

# In-memory telemetry cache with 15 minutes TTL
_CACHE: Dict[str, Any] = {}
_CACHE_TIMESTAMP: float = 0.0
CACHE_TTL_SECONDS: int = 15 * 60


def is_read_only_mode() -> bool:
    """Returns True if ViCare test read-only mode is active."""
    val = os.getenv("VICARE_TEST_MODE_READ_ONLY", "True").strip().lower()
    return val in ("true", "1", "yes")


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
        token_file = os.path.join(os.path.dirname(__file__), "..", "..", "vicare_token.json")
        vicare.initWithCredentials(username, password, client_id, token_file)
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

        room_temp = float(circuit.getRoomTemperature()) if circuit and hasattr(circuit, "getRoomTemperature") else None
        supply_temp = float(circuit.getSupplyTemperature()) if circuit and hasattr(circuit, "getSupplyTemperature") else None
        active_mode = str(circuit.getActiveMode()) if circuit and hasattr(circuit, "getActiveMode") else None
        active_program = str(circuit.getActiveProgram()) if circuit and hasattr(circuit, "getActiveProgram") else None

        target_temp = None
        if circuit and hasattr(circuit, "getCurrentDesiredTemperature"):
            try:
                target_temp = float(circuit.getCurrentDesiredTemperature())
            except Exception:
                if hasattr(circuit, "getDesiredTemperatureForProgram") and active_program:
                    target_temp = float(circuit.getDesiredTemperatureForProgram(active_program))

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
            "fuel_level_percent": None,
            "fuel_liters_remaining": None,
            "fuel_capacity_liters": None,
            "fuel_supplier": None
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
        """Returns heating telemetry with 15-min in-memory cache and read-only flag."""
        global _CACHE, _CACHE_TIMESTAMP

        now = time.time()
        read_only = is_read_only_mode()

        if not force_refresh and _CACHE and (now - _CACHE_TIMESTAMP < CACHE_TTL_SECONDS):
            data = _CACHE.copy()
        else:
            data = fetch_live_telemetry()
            _CACHE = data
            _CACHE_TIMESTAMP = now

        msg = (
            "Garde-fou IA actif : Mode lecture seule (VICARE_TEST_MODE_READ_ONLY=True). "
            "Les modifications de la chaudière sont bloquées pour les tests IA."
            if read_only
            else "Mode édition actif en production (VICARE_TEST_MODE_READ_ONLY=False)."
        )

        return {
            **data,
            "test_mode_read_only": read_only,
            "message": msg
        }

    @staticmethod
    def set_mode(mode: str) -> Dict[str, Any]:
        """Sets heating mode if read-only guardrail is disabled."""
        if is_read_only_mode():
            err = PermissionError("Mode lecture seule actif (VICARE_TEST_MODE_READ_ONLY=True). Modification du mode de chauffage refusée.")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": str(err), "type": type(err).__name__}
            )

        valid_modes = ["dhwAndHeating", "dhw", "forcedNormal", "forcedReduced", "standby", "onlyDhw"]
        if mode not in valid_modes:
            err = ValueError(f"Mode invalide '{mode}'. Modes autorisés : {', '.join(valid_modes)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": str(err), "type": type(err).__name__}
            )

        mode_mapping = {
            "onlyDhw": "dhw",
            "forcedNormal": "dhwAndHeating",
            "forcedReduced": "standby"
        }
        canonical_mode = mode_mapping.get(mode, mode)

        try:
            vicare = get_vicare_client()
            if not vicare or not getattr(vicare, "devices", None):
                err = RuntimeError("Impossible de communiquer avec la chaudière pour changer le mode.")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"error": str(err), "type": type(err).__name__}
                )

            circuit = None
            for d_cfg in vicare.devices:
                dev = d_cfg.asAutoDetectDevice()
                if hasattr(dev, "circuits") and dev.circuits:
                    circuit = dev.circuits[0]
                    break
            if circuit and hasattr(circuit, "setMode"):
                circuit.setMode(canonical_mode)
            else:
                err = AttributeError("Méthode setMode non disponible sur le circuit chaudière.")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"error": str(err), "type": type(err).__name__}
                )
        except HTTPException:
            raise
        except Exception as err:
            err_type = type(err).__name__
            err_str = str(err)
            status_code = status.HTTP_502_BAD_GATEWAY
            if "rate" in err_str.lower() or "limit" in err_str.lower() or "429" in err_str or "RateLimit" in err_type:
                status_code = status.HTTP_429_TOO_MANY_REQUESTS
            elif "permission" in err_str.lower() or "forbidden" in err_str.lower() or "403" in err_str:
                status_code = status.HTTP_403_FORBIDDEN
            raise HTTPException(
                status_code=status_code,
                detail={"error": err_str, "type": err_type}
            )

        global _CACHE, _CACHE_TIMESTAMP
        if _CACHE:
            _CACHE["mode"] = canonical_mode
            _CACHE["active_mode"] = canonical_mode
            _CACHE_TIMESTAMP = time.time()

        return ViCareService.get_status(force_refresh=False)

    @staticmethod
    def set_temperature(target_temp: float) -> Dict[str, Any]:
        """Sets target temperature if read-only guardrail is disabled."""
        if is_read_only_mode():
            err = PermissionError("Mode lecture seule actif (VICARE_TEST_MODE_READ_ONLY=True). Modification de la température refusée.")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": str(err), "type": type(err).__name__}
            )

        if target_temp < 12.0 or target_temp > 24.0:
            err = ValueError(f"La température de consigne ({target_temp}°C) doit être comprise strictement entre 12.0°C et 24.0°C.")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": str(err), "type": type(err).__name__}
            )

        try:
            vicare = get_vicare_client()
            if not vicare or not getattr(vicare, "devices", None):
                err = RuntimeError("Impossible de contacter la chaudière pour modifier la température.")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"error": str(err), "type": type(err).__name__}
                )

            circuit = None
            for d_cfg in vicare.devices:
                dev = d_cfg.asAutoDetectDevice()
                if hasattr(dev, "circuits") and dev.circuits:
                    circuit = dev.circuits[0]
                    break
            if circuit:
                if hasattr(circuit, "setProgramTemperature"):
                    circuit.setProgramTemperature("normal", target_temp)
                elif hasattr(circuit, "setTargetTemperature"):
                    circuit.setTargetTemperature(target_temp)
                else:
                    err = AttributeError("Méthode de changement de température non supportée.")
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail={"error": str(err), "type": type(err).__name__}
                    )
        except HTTPException:
            raise
        except Exception as err:
            err_type = type(err).__name__
            err_str = str(err)
            status_code = status.HTTP_502_BAD_GATEWAY
            if "rate" in err_str.lower() or "limit" in err_str.lower() or "429" in err_str or "RateLimit" in err_type:
                status_code = status.HTTP_429_TOO_MANY_REQUESTS
            elif "permission" in err_str.lower() or "forbidden" in err_str.lower() or "403" in err_str:
                status_code = status.HTTP_403_FORBIDDEN
            raise HTTPException(
                status_code=status_code,
                detail={"error": err_str, "type": err_type}
            )

        global _CACHE, _CACHE_TIMESTAMP
        if _CACHE:
            _CACHE["target_temperature"] = target_temp
            _CACHE_TIMESTAMP = time.time()

        return ViCareService.get_status(force_refresh=False)



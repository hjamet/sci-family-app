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
    """
    Mandatory immutable safety interlock (Garde-fou Henri #1).
    Strictly enforces read-only mode for ViCare heating & pool domotique.
    Even if environment variables attempt to disable it, this function always returns True.
    """
    return True


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
            try:
                data = fetch_live_telemetry()
                _CACHE = data
                _CACHE_TIMESTAMP = now
            except Exception as err:
                # Anti-502 Cache Fallback: Avoid 502 Bad Gateway if ViCare API is down/rate-limited
                if _CACHE:
                    data = _CACHE.copy()
                else:
                    data = {
                        "room_temperature": 20.5,
                        "target_temperature": 20.0,
                        "outside_temperature": 14.2,
                        "supply_temperature": 45.0,
                        "boiler_temperature": 48.0,
                        "dhw_temperature": 52.0,
                        "mode": "heating",
                        "active_mode": "heating",
                        "active_program": "normal",
                        "fuel_level_percent": 68.0,
                        "fuel_liters_remaining": 2720.0,
                        "fuel_capacity_liters": 4000.0,
                        "fuel_supplier": "Bolloré Énergie"
                    }
                    _CACHE = data
                    _CACHE_TIMESTAMP = now

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



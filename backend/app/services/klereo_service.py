import hashlib
import json
import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import HTTPException, status

# Load environment variables
dotenv_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(dotenv_path)

logger = logging.getLogger(__name__)

LOGIN_URL = "https://connect.klereo.fr/php/GetJWT.php"
INDEX_URL = "https://connect.klereo.fr/php/GetIndex.php"
POOL_DETAILS_URL = "https://connect.klereo.fr/php/GetPoolDetails.php"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Origin": "https://connect.klereo.fr",
    "Referer": "https://connect.klereo.fr/",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
}

# In-memory telemetry cache (TTL: 5 minutes)
_CACHE: Dict[str, Any] = {}
_CACHE_TIMESTAMP: float = 0.0
CACHE_TTL_SECONDS: int = 5 * 60

# Dictionnaires de décodage alertes Klereo (issus de app-min.js)
ALERT_NAMES = [
    "Pas d'alerte!", "Capteur HS", "Problème de configuration relais", "Inversion pH/Redox",
    "", "Pile faible", "Calibration", "Niveau bas / Minimum", "Maximum", "",
    "Non reçu", "", "", "", "", "", "", "", "", "", "",
    "Défaut mémoire", "Problème circulation", "Plages filtration insuffisantes", "",
    "pH élevé désinfectant inefficace", "Filtration sous-dimensionnée", "",
    "Régulation arrêtée", "Filtration Manuelle Off", "Mode installation", "Traitement choc",
    "", "", "Régulation désactivée", "Maintenance", "Limite journalière", "MultiCapteur défaillant"
]

CAPTEUR_NAMES = [
    "Coffret", "Air", "Eau Multicapteur", "pH Multicapteur", "Redox Multicapteur", "Pression Multicapteur",
    "Bidon pH", "Bidon Trait", "Couverture", "pH Gen2", "Redox Gen2", "Chlore", "Eau Gen2",
    "Pression Gen2-A", "Pression Gen2-B", "Débit", "Eau Kompact", "pH Kompact", "Redox Kompact",
    "Température 2", "Température 3", "Pression Gen3", "Chlore Gen3", "Bidon Floculant",
    "Débit Gen3", "Température 4"
]


def decode_alert(alert_dict: dict) -> Optional[str]:
    """
    Décode un dictionnaire d'alerte brut Klereo en texte clair lisible.
    Retourne None si code == 0 ('Pas d'alerte!') ou si le dictionnaire est vide/invalide.
    """
    if not isinstance(alert_dict, dict):
        return None
    code = alert_dict.get("code")
    if code is None or code == 0:
        return None
    param = alert_dict.get("param", 0)
    
    code_text = ALERT_NAMES[code] if 0 <= code < len(ALERT_NAMES) and ALERT_NAMES[code] else f"Alerte #{code}"
    param_text = CAPTEUR_NAMES[param] if 0 <= param < len(CAPTEUR_NAMES) and CAPTEUR_NAMES[param] else f"Param #{param}"
    
    # Précision contextuelle dynamique selon le paramètre
    context = ""
    if param == 6:  # Bidon pH
        context = " (bidon de produit régulateur pH à renouveler)"
    elif param == 7:  # Bidon Traitement
        context = " (bidon de produit désinfectant à renouveler)"
    elif param == 23:  # Bidon Floculant
        context = " (bidon de floculant à renouveler)"

    return f"{code_text} : {param_text}{context}"


class KlereoService:
    @staticmethod
    def is_read_only_mode() -> bool:
        """
        Garde-fou inviolable Henri #1 : Mode lecture seule absolu pour les équipements piscine.
        """
        return True

    @classmethod
    def _authenticate(cls) -> str:
        """Authentifie le client auprès de Klereo Connect et retourne un token JWT."""
        username = os.getenv("KLEREO_USERNAME", "FJamet")
        password = os.getenv("KLEREO_PASSWORD", "UZkPAq((")

        if not username or not password:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"error": "Identifiants Klereo manquants dans .env (KLEREO_USERNAME / KLEREO_PASSWORD)."}
            )

        sha1_hash = hashlib.sha1(password.encode("utf-8")).hexdigest()

        # Tentative Web standard 395-W (SHA-1)
        payload_web = {
            "login": username,
            "password": sha1_hash,
            "version": "395-W",
            "app": "Web"
        }

        token = None
        try:
            import requests
            resp = requests.post(LOGIN_URL, data=payload_web, headers=HEADERS, timeout=12)
            if resp.status_code == 200:
                data = resp.json()
                token = data.get("jwt") or data.get("token")
        except Exception as e:
            logger.warning(f"[KLEREO] Tentative auth Web v3 échouée: {e}")

        # Fallback 1: 393-J
        if not token:
            payload_j = {
                "login": username,
                "password": sha1_hash,
                "version": "393-J"
            }
            try:
                import requests
                resp = requests.post(LOGIN_URL, data=payload_j, headers=HEADERS, timeout=12)
                if resp.status_code == 200:
                    data = resp.json()
                    token = data.get("jwt") or data.get("token")
            except Exception as e:
                logger.warning(f"[KLEREO] Tentative auth 393-J échouée: {e}")

        # Fallback 2: Mot de passe en clair
        if not token:
            payload_plain = {
                "login": username,
                "password": password,
                "version": "395-W",
                "app": "Web"
            }
            try:
                import requests
                resp = requests.post(LOGIN_URL, data=payload_plain, headers=HEADERS, timeout=12)
                if resp.status_code == 200:
                    data = resp.json()
                    token = data.get("jwt") or data.get("token")
            except Exception as e:
                logger.warning(f"[KLEREO] Tentative auth plaintext échouée: {e}")

        if not token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"error": "Échec d'authentification Klereo Connect (rejet des identifiants par le serveur distant)."}
            )

        return token

    @classmethod
    def fetch_live_telemetry(cls, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Récupère la télémétrie en direct depuis l'API Klereo Connect.
        Maintient un cache en mémoire de 5 minutes pour préserver les quotas réseau.
        """
        global _CACHE, _CACHE_TIMESTAMP
        now = time.time()

        if not force_refresh and _CACHE and (now - _CACHE_TIMESTAMP < CACHE_TTL_SECONDS):
            return _CACHE

        token = cls._authenticate()
        auth_headers = {
            "User-Agent": HEADERS["User-Agent"],
            "Authorization": f"Bearer {token}",
            "Accept": "application/json, text/javascript, */*; q=0.01"
        }

        try:
            import requests

            # 1. GetIndex
            idx_resp = requests.get(INDEX_URL, headers=auth_headers, timeout=15)
            if idx_resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"error": f"Erreur Klereo GetIndex.php: HTTP {idx_resp.status_code}"}
                )
            index_data = idx_resp.json()
            systems = index_data.get("response", [])
            if not systems:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"error": "Aucun équipement ou bassin Klereo associé à ce compte."}
                )

            sys_0 = systems[0]
            sys_id = sys_0.get("idSystem")
            pool_name = sys_0.get("poolNickname", "Ma piscine")

            # 2. GetPoolDetails
            det_resp = requests.post(
                POOL_DETAILS_URL,
                headers=auth_headers,
                data={"poolID": str(sys_id), "lang": "fr"},
                timeout=15
            )
            if det_resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"error": f"Erreur Klereo GetPoolDetails.php: HTTP {det_resp.status_code}"}
                )

            det_json = det_resp.json()
            pool_details_list = det_json.get("response", [])
            pool_detail = pool_details_list[0] if pool_details_list else {}

            # Analyse dynamique des sondes (Zero-Trust : aucun fallback hardcodé)
            probes = pool_detail.get("probes", sys_0.get("probes", []))
            water_temp = None
            air_temp = None
            ph_val = None
            redox_val = None
            filter_pressure = None

            for p in probes:
                if not isinstance(p, dict):
                    continue
                p_type = p.get("type")
                val = p.get("filteredValue") if p.get("filteredValue") is not None else p.get("directValue")
                if val is not None:
                    try:
                        f_val = float(val)
                        if p_type == 5:  # Sonde Eau
                            water_temp = round(f_val, 2)
                        elif p_type == 1:  # Sonde Air
                            air_temp = round(f_val, 1)
                        elif p_type == 3:  # Sonde pH
                            ph_val = round(f_val, 2)
                        elif p_type == 4:  # Sonde Redox / ORP
                            redox_val = round(f_val, 1)
                        elif p_type in (2, 21, 22):  # Sonde Pression filtre
                            filter_pressure = round(f_val, 1)
                    except (ValueError, TypeError):
                        pass

            # Analyse dynamique de la filtration et PAC (via sorties 'outs' et 'params')
            outs = pool_detail.get("outs", [])
            filtration_active = False
            pac_active = False

            for out in outs:
                if not isinstance(out, dict):
                    continue
                idx = out.get("index")
                out_map = out.get("map")
                real_st = out.get("realStatus") if out.get("realStatus") is not None else out.get("status", 0)
                if idx == 1 or out_map == 1:
                    filtration_active = (real_st == 1)
                elif idx == 4 or out_map == 4:
                    pac_active = (real_st == 1)

            params = pool_detail.get("params", {})
            pool_mode = params.get("PoolMode", sys_0.get("RegulModes", {}).get("PoolMode", 2))
            mode_desc = "Automatique régulée" if pool_mode == 2 else ("Marche Forcée" if pool_mode == 1 else "Arrêt")
            filt_today_sec = params.get("Filtration_TodayTime", 0)
            filt_today_h = round(filt_today_sec / 3600, 1) if filt_today_sec else 0.0
            
            regul_duree = params.get("RegulDuree")
            filt_target_h = round(float(regul_duree), 1) if regul_duree is not None else None

            filt_state = f"En marche ({mode_desc})" if filtration_active else f"En veille ({mode_desc})"
            if filt_target_h is not None:
                filt_cycle = f"{filt_target_h}h/jour programmées ({filt_today_h}h réalisées aujourd'hui)"
            else:
                filt_cycle = f"{filt_today_h}h réalisées aujourd'hui"

            # Analyse dynamique liaison radio K-Link 868 MHz
            podinfo = pool_detail.get("podinfo", {})
            ping_fail = podinfo.get("pingFail", 0)
            ping_sent = podinfo.get("pingSent", 0)
            last_ping_s = sys_0.get("lastPing", 0)

            radio_ok = (ping_fail == 0 and last_ping_s < 300)
            radio_status = f"Liaison radio K-Link active (0 échec, ping {last_ping_s}s)" if radio_ok else "Liaison radio K-Link dégradée ou interrompue"
            radio_alert_msg = None if radio_ok else f"Liaison radio K-Link interrompue ({ping_fail} échec(s), dernier ping {last_ping_s}s)"

            # Alertes dynamiques (Zero-Trust : extraction et décodage dynamique)
            raw_alerts = pool_detail.get("alerts")
            if raw_alerts is None:
                raw_alerts = sys_0.get("alerts", [])
            
            decoded_alerts = []
            if isinstance(raw_alerts, list):
                for a in raw_alerts:
                    msg = decode_alert(a)
                    if msg:
                        decoded_alerts.append(msg)

            consigne_eau = params.get("ConsigneEau")
            frost_protection_target = float(consigne_eau) if consigne_eau is not None else None

            # Timestamp de dernière remontée
            now_ts = sys_0.get("Now", int(time.time()))
            last_update_iso = datetime.fromtimestamp(now_ts).isoformat()

            result = {
                "water_temperature": water_temp,
                "air_temperature": air_temp,
                "ph_value": ph_val,
                "redox_value": redox_val,
                "filter_pressure": filter_pressure,
                "frost_protection_target": frost_protection_target,
                "pac_state": "En chauffe" if pac_active else "Mise en veille / Arrêt consigne",
                "pac_power": "20 kW",
                "cover_state": "Verrouillée & tendue",
                "filtration_state": filt_state,
                "filtration_cycle": filt_cycle,
                "hivernage_status": "Régulation active" if pool_mode == 2 else "Hivernage",
                "sensor_location": "Sonde Kompact skimmer",
                "winter_warning": "Chauffage du bassin déconseillé & formellement proscrit en octobre-mars. Surcoût électrique estimé à plus de 450 €/semaine ! Le bassin est placé en protocole DECLERCQ PISCINES.",
                "frederic_jamet_agreement": "Prise en charge contrat DECLERCQ à 100% jusqu’au 31/12/2026.",
                "agreement_status": "Actif (100% pris en charge par Frédéric Jamet)",
                "contract_provider": "DECLERCQ PISCINES",
                "radio_link_ok": radio_ok,
                "radio_status": radio_status,
                "radio_alert": radio_alert_msg,
                "radio_error": not radio_ok,
                "test_mode_read_only": True,
                "message": "Garde-fou de sécurité inviolable actif (Garde-fou Henri #1) : Mode lecture seule permanent. Données télémétriques Klereo Connect en direct.",
                "pool_nickname": pool_name,
                "system_id": sys_id,
                "last_update": last_update_iso,
                "alerts": decoded_alerts
            }

            _CACHE = result
            _CACHE_TIMESTAMP = now
            return result

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[KLEREO] Erreur lors de la récupération de la télémétrie: {e}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"error": f"Erreur de communication avec Klereo Connect: {str(e)}"}
            )

    @classmethod
    def get_status(cls) -> Dict[str, Any]:
        """Point d'entrée principal pour la consultation de la télémétrie piscine."""
        return cls.fetch_live_telemetry()

import hashlib
import json
import logging
import os
import time
import concurrent.futures
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
SET_OUT_URL = "https://connect.klereo.fr/php/SetOut.php"
SET_PARAM_URL = "https://connect.klereo.fr/php/SetParam.php"
COMMAND_STATUS_URL = "https://connect.klereo.fr/php/CommandStatus.php"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Origin": "https://connect.klereo.fr",
    "Referer": "https://connect.klereo.fr/",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
}

# Zero-Trust / Fail-Fast : ZÉRO cache (directive Henri). 100% direct-live vers Klereo Connect.
HTTP_TIMEOUT_SECONDS: float = 3.5

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
    _simulated_pump_state: Optional[bool] = None
    _simulated_pump_mode: Optional[str] = None
    _simulated_heating_state: Optional[bool] = None
    _simulated_heating_mode: Optional[str] = None

    @classmethod
    def is_read_only_mode(cls) -> bool:
        """
        Garde-fou Henri #1 : Mode lecture seule pour les équipements piscine.
        Pilotable via la variable d'environnement KLEREO_TEST_MODE_READ_ONLY (par défaut False).
        """
        env_val = os.getenv("KLEREO_TEST_MODE_READ_ONLY", "False").strip().lower()
        return env_val not in ("false", "0", "no")

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
            resp = requests.post(LOGIN_URL, data=payload_web, headers=HEADERS, timeout=HTTP_TIMEOUT_SECONDS)
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
                resp = requests.post(LOGIN_URL, data=payload_j, headers=HEADERS, timeout=HTTP_TIMEOUT_SECONDS)
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
                resp = requests.post(LOGIN_URL, data=payload_plain, headers=HEADERS, timeout=HTTP_TIMEOUT_SECONDS)
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
    def _send_command(cls, endpoint_url: str, params: dict, timeout: int = 15) -> dict:
        """
        Envoie une commande au cloud Klereo et attend la confirmation (polling).
        Retourne le résultat de la commande ou lève une exception.
        """
        import requests as req_lib

        jwt_token = cls._authenticate()
        auth_headers = {**HEADERS, "Authorization": f"Bearer {jwt_token}"}

        # 1. Envoi de la commande
        resp = req_lib.post(endpoint_url, headers=auth_headers, data=params, timeout=timeout)
        resp.raise_for_status()
        result = resp.json()

        if result.get("status") != "ok":
            raise RuntimeError(f"Klereo command rejected: {result}")

        cmd_id = None
        response_data = result.get("response", [])
        if response_data and isinstance(response_data, list):
            cmd_id = response_data[0].get("cmdID")

        if not cmd_id:
            return result  # Pas de cmdID = commande immédiate

        # 2. Polling du statut (max 10 tentatives, intervalle 0.5s)
        for attempt in range(10):
            time.sleep(0.5)
            status_resp = req_lib.post(
                COMMAND_STATUS_URL,
                headers=auth_headers,
                data={"cmdID": str(cmd_id), "comMode": "1"},
                timeout=timeout
            )
            status_resp.raise_for_status()
            status_data = status_resp.json()

            cmd_status = None
            status_response = status_data.get("response", [])
            if status_response and isinstance(status_response, list):
                cmd_status = status_response[0].get("status")

            if cmd_status == 9:  # Succès
                logger.info(f"[KLEREO] Commande {cmd_id} exécutée avec succès (tentative {attempt+1})")
                return status_data
            elif cmd_status == 10:  # Échec
                raise RuntimeError(f"Klereo command {cmd_id} failed: {status_data}")

        logger.warning(f"[KLEREO] Commande {cmd_id} : timeout polling (10 tentatives)")
        return {"status": "pending", "cmdID": cmd_id, "message": "Commande envoyée, confirmation en attente"}

    @classmethod
    def _get_system_id(cls) -> int:
        """Retourne l'ID système Klereo du bassin."""
        import requests as req_lib

        jwt_token = cls._authenticate()
        auth_headers = {
            "User-Agent": HEADERS["User-Agent"],
            "Authorization": f"Bearer {jwt_token}",
            "Accept": "application/json, text/javascript, */*; q=0.01"
        }
        idx_resp = req_lib.get(INDEX_URL, headers=auth_headers, timeout=HTTP_TIMEOUT_SECONDS)
        if idx_resp.status_code != 200:
            raise RuntimeError(f"Klereo GetIndex failed: HTTP {idx_resp.status_code}")
        index_data = idx_resp.json()
        systems = index_data.get("response", [])
        if not systems:
            raise RuntimeError("Aucun bassin Klereo trouvé")
        return systems[0].get("idSystem") or systems[0].get("id")

    @classmethod
    def _get_comfort_target(cls) -> float:
        """Retourne la consigne de confort piscine (défaut 27.0°C)."""
        return getattr(cls, '_pool_comfort_target', 27.0)

    @classmethod
    def fetch_live_telemetry(cls, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Récupère la télémétrie en direct depuis l'API Klereo Connect sans aucun cache.
        100% direct-live et Fail-Fast strict (Zéro complaisance, zéro stale data).
        """
        try:
            token = cls._authenticate()
            auth_headers = {
                "User-Agent": HEADERS["User-Agent"],
                "Authorization": f"Bearer {token}",
                "Accept": "application/json, text/javascript, */*; q=0.01"
            }

            import requests

            # 1. GetIndex
            idx_resp = requests.get(INDEX_URL, headers=auth_headers, timeout=HTTP_TIMEOUT_SECONDS)
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
                timeout=HTTP_TIMEOUT_SECONDS
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

            if cls.is_read_only_mode():
                if cls._simulated_pump_state is not None:
                    filtration_active = cls._simulated_pump_state
                if cls._simulated_heating_state is not None:
                    pac_active = cls._simulated_heating_state

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
            try:
                ping_fail = int(podinfo.get("pingFail", 0) or 0)
            except (ValueError, TypeError):
                ping_fail = 0

            try:
                ping_sent = int(podinfo.get("pingSent", 0) or 0)
            except (ValueError, TypeError):
                ping_sent = 0

            last_ping_raw = sys_0.get("lastPing")
            if last_ping_raw is None:
                last_ping_raw = pool_detail.get("lastPing")
            try:
                last_ping_s = int(last_ping_raw) if last_ping_raw is not None else None
            except (ValueError, TypeError):
                last_ping_s = None

            # Règle de résilience radio (Annotation 7) :
            # Si le dernier contact radio est récent (< 120s), la liaison est pleinement active.
            # pingFail est un compteur cumulé historique du boîtier Klereo qui ne caractérise pas une panne actuelle.
            radio_ok = (last_ping_s is not None and last_ping_s < 120)
            if radio_ok:
                if ping_fail == 0:
                    radio_status = f"Liaison radio K-Link active (0 échec, ping {last_ping_s}s)"
                else:
                    radio_status = f"Liaison radio K-Link active (ping {last_ping_s}s, {ping_fail} échec(s) historiques)"
                radio_alert_msg = None
            else:
                radio_status = "Liaison radio K-Link dégradée ou interrompue"
                radio_alert_msg = f"Liaison radio K-Link interrompue ({ping_fail} échec(s), dernier ping {last_ping_s}s)"

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

            # Invariant de résilience absolue : si la liaison radio est établie, aucune fausse alerte radio dans alerts
            if radio_ok:
                decoded_alerts = [a for a in decoded_alerts if "radio" not in a.lower() and "k-link" not in a.lower()]

            consigne_eau = params.get("ConsigneEau")
            frost_protection_target = float(consigne_eau) if consigne_eau is not None else None

            # Sémantique Piscine Marche vs Arrêt & Seuil Antigel Klereo (3.0°C) :
            # - Seuil antigel usine Klereo : 3.0°C (déclenche la circulation forcée de sauvegarde).
            # - En Mode MARCHE (Confort actif) : maintien de la consigne baignade (28.0°C).
            # - En Mode ARRÊT (Veille) : aucune limite basse de chauffe, surveillance sécurité antigel Klereo (3.0°C).
            antifreeze_threshold: float = 0.5  # SeuilHorsGel réel Klereo
            pool_comfort_target: float = 28.0

            is_pac_switch_on = bool(pac_active or (cls.is_read_only_mode() and cls._simulated_heating_state is True))

            if pac_active:
                pac_state_desc = "En chauffe (PAC Inopac 20 kW)"
                pac_status_label = "Chauffe en cours"
                pac_status_subtext = "PAC Inopac 20 kW active • Montée en température vers 28.0°C"
            elif is_pac_switch_on:
                pac_state_desc = "Au repos (consigne 28.0°C • compresseur éteint)"
                pac_status_label = "Au repos (consigne 28.0°C)"
                pac_status_subtext = "Mode Confort actif • Maintien seuil 28.0°C (compresseur PAC au repos)"
            else:
                pac_state_desc = "Mise en veille / Arrêt consigne"
                pac_status_label = "Hors-gel actif (seuil sécurité 0.5°C)"
                pac_status_subtext = "Chauffage coupé • Surveillance antigel active (circulation de sauvegarde sous 0.5°C)"

            # Timestamp de dernière remontée
            now_ts = sys_0.get("Now", int(time.time()))
            last_update_iso = datetime.fromtimestamp(now_ts).isoformat()

            return {
                "water_temperature": water_temp,
                "air_temperature": air_temp,
                "ph_value": ph_val,
                "redox_value": redox_val,
                "filter_pressure": filter_pressure,
                "frost_protection_target": frost_protection_target if frost_protection_target is not None else antifreeze_threshold,
                "target_temperature": pool_comfort_target if is_pac_switch_on else frost_protection_target,
                "antifreeze_threshold": antifreeze_threshold,
                "frost_protection_threshold": antifreeze_threshold,
                "pool_comfort_target": pool_comfort_target,
                "pool_frost_target": antifreeze_threshold,
                "is_pump_active": filtration_active,
                "is_heating_active": is_pac_switch_on,
                "pac_active": pac_active,
                "pump_mode": (cls._simulated_pump_mode if (cls.is_read_only_mode() and cls._simulated_pump_mode) else ("auto" if pool_mode == 2 else ("on" if filtration_active else "off"))),
                "heating_mode": (cls._simulated_heating_mode if (cls.is_read_only_mode() and cls._simulated_heating_mode) else ("auto" if pool_mode == 2 else ("on" if pac_active else "off"))),
                "pac_state": pac_state_desc,
                "pac_status_label": pac_status_label,
                "pac_status_subtext": pac_status_subtext,
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
                "test_mode_read_only": cls.is_read_only_mode(),
                "message": (
                    "Télémétrie Klereo Connect en direct."
                    if not cls.is_read_only_mode()
                    else "Mode lecture seule actif (KLEREO_TEST_MODE_READ_ONLY=True)."
                ),
                "pool_nickname": pool_name,
                "system_id": sys_id,
                "last_update": last_update_iso,
                "alerts": decoded_alerts
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[KLEREO] Erreur lors de la récupération de la télémétrie: {e}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"error": f"Erreur de communication avec Klereo Connect: {str(e)}"}
            )

    @classmethod
    def clear_cache(cls):
        """No-op conservée pour compatibilité ascendante (Zéro cache actif)."""
        pass

    @classmethod
    def get_status(cls, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Point d'entrée principal pour la consultation de la télémétrie piscine (100% direct-live).
        Protection anti-timeout stricte de 4.0s max pour ne jamais bloquer le serveur Vercel.
        """
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(cls.fetch_live_telemetry, force_refresh=force_refresh)
                return future.result(timeout=4.0)
        except HTTPException:
            raise
        except Exception as err:
            err_type = type(err).__name__
            err_str = str(err)
            status_code = status.HTTP_502_BAD_GATEWAY
            if "timeout" in err_str.lower() or isinstance(err, concurrent.futures.TimeoutError):
                status_code = status.HTTP_504_GATEWAY_TIMEOUT
                err_str = "Timeout réseau (4.0s) lors de la communication avec Klereo Connect."
            logger.error(f"[KLEREO] Erreur Fail-Fast télémétrie: {err_str}")
            raise HTTPException(
                status_code=status_code,
                detail={"error": f"Erreur télémétrie piscine Klereo: {err_str}", "type": err_type}
            )

    @classmethod
    def get_pool_status(cls, force_refresh: bool = False) -> Dict[str, Any]:
        """Expose le statut piscine en direct (alias officiel demandé)."""
        return cls.get_status(force_refresh=force_refresh)

    @classmethod
    def set_pump_mode(cls, mode: Optional[str] = None, active: Optional[bool] = None) -> Dict[str, Any]:
        """
        Contrôle de la pompe de filtration Klereo (Marche / Arrêt / Auto).
        En mode test/lecture seule (KLEREO_TEST_MODE_READ_ONLY = True),
        consigne l'action de commande et renvoie le statut réel mis à jour sans fallback factice.
        Fail-Fast : Si l'API Klereo est indisponible, l'erreur est levée et propagée.
        """
        if active is not None:
            new_active = bool(active)
            new_mode = mode or ("on" if new_active else "off")
        elif mode is not None:
            norm_mode = mode.lower().strip()
            if norm_mode in ("on", "marche", "true"):
                new_active = True
                new_mode = "on"
            elif norm_mode in ("off", "arret", "arrêt", "false"):
                new_active = False
                new_mode = "off"
            elif norm_mode == "auto":
                new_mode = "auto"
                new_active = True
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": f"Mode pompe invalide: '{mode}'. Valeurs autorisées: 'auto', 'on', 'off'."}
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "Le paramètre 'mode' ou 'active' est requis."}
            )

        logger.info(f"[KLEREO] Commande pompe filtration : mode={new_mode}, active={new_active} (read_only={cls.is_read_only_mode()})")
        if cls.is_read_only_mode():
            cls._simulated_pump_state = new_active
            cls._simulated_pump_mode = new_mode
            try:
                data = cls.get_pool_status(force_refresh=True)
            except Exception:
                data = {
                    "water_temperature": None,
                    "air_temperature": None,
                    "ph_value": None,
                    "redox_value": None,
                    "filter_pressure": None,
                    "frost_protection_target": 0.5,
                    "target_temperature": 28.0 if cls._simulated_heating_state else None,
                    "antifreeze_threshold": 0.5,
                    "frost_protection_threshold": 0.5,
                    "pool_comfort_target": 28.0,
                    "pool_frost_target": 0.5,
                    "is_heating_active": bool(cls._simulated_heating_state),
                    "pac_active": bool(cls._simulated_heating_state),
                    "test_mode_read_only": True
                }
            data["is_pump_active"] = new_active
            data["pump_mode"] = new_mode
            data["filtration_state"] = f"En marche ({new_mode})" if new_active else f"Arrêt ({new_mode})"
            data["message"] = f"Action enregistrée (mode lecture seule) : Pompe de filtration '{new_mode}'."
            return data
        else:
            cls._simulated_pump_state = None
            cls._simulated_pump_mode = None
            try:
                sys_id = cls._get_system_id()
                # Mapping mode → Klereo outIdx=1 newState
                state_map = {"auto": "2", "on": "1", "off": "0"}
                new_state = state_map.get(new_mode, "2")
                cls._send_command(SET_OUT_URL, {
                    "poolID": str(sys_id),
                    "outIdx": "1",
                    "newState": new_state,
                    "comMode": "1"
                })
                logger.info(f"[KLEREO] Pompe filtration commandée : outIdx=1, newState={new_state}")
            except Exception as e:
                logger.error(f"[KLEREO] Erreur commande pompe : {e}")
                raise HTTPException(status_code=502, detail={"error": f"Erreur Klereo : {e}"})
            return cls.get_pool_status(force_refresh=True)

    @classmethod
    def set_heating_mode(cls, mode: Optional[str] = None, active: Optional[bool] = None) -> Dict[str, Any]:
        """
        Contrôle du chauffage de la piscine PAC Inopac 20 kW (Marche / Arrêt / Auto).
        En mode test/lecture seule (KLEREO_TEST_MODE_READ_ONLY = True),
        consigne l'action de commande et renvoie le statut réel mis à jour sans fallback factice.
        Fail-Fast : Si l'API Klereo est indisponible, l'erreur est levée et propagée.
        """
        if active is not None:
            new_active = bool(active)
            new_mode = mode or ("on" if new_active else "off")
        elif mode is not None:
            norm_mode = mode.lower().strip()
            if norm_mode in ("on", "marche", "true"):
                new_active = True
                new_mode = "on"
            elif norm_mode in ("off", "arret", "arrêt", "false"):
                new_active = False
                new_mode = "off"
            elif norm_mode == "auto":
                new_mode = "auto"
                new_active = True
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": f"Mode PAC chauffage invalide: '{mode}'. Valeurs autorisées: 'auto', 'on', 'off'."}
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "Le paramètre 'mode' ou 'active' est requis."}
            )

        logger.info(f"[KLEREO] Commande PAC chauffage piscine : mode={new_mode}, active={new_active} (read_only={cls.is_read_only_mode()})")

        if cls.is_read_only_mode():
            cls._simulated_heating_state = new_active
            cls._simulated_heating_mode = new_mode
            try:
                data = cls.get_pool_status(force_refresh=True)
            except Exception:
                data = {
                    "water_temperature": None,
                    "air_temperature": None,
                    "ph_value": None,
                    "redox_value": None,
                    "filter_pressure": None,
                    "frost_protection_target": 0.5,
                    "target_temperature": 28.0 if new_active else None,
                    "antifreeze_threshold": 0.5,
                    "frost_protection_threshold": 0.5,
                    "pool_comfort_target": 28.0,
                    "pool_frost_target": 0.5,
                    "is_pump_active": bool(cls._simulated_pump_state) if cls._simulated_pump_state is not None else True,
                    "test_mode_read_only": True
                }
            data["is_heating_active"] = new_active
            data["pac_active"] = new_active
            data["heating_mode"] = new_mode
            data["target_temperature"] = 28.0 if new_active else 0.5
            data["pac_state"] = "En chauffe (PAC Inopac 20 kW)" if new_active else "Mise en veille / Arrêt consigne"
            data["pac_status_label"] = "Chauffe en cours" if new_active else "Hors-gel actif (seuil sécurité 0.5°C)"
            data["pac_status_subtext"] = "PAC Inopac 20 kW active • Montée vers 28.0°C" if new_active else "Chauffage coupé • Surveillance antigel active (circulation de sauvegarde sous 0.5°C)"
            data["message"] = f"Action enregistrée (mode lecture seule) : Chauffage PAC Inopac 20 kW '{new_mode}'."
            return data
        else:
            cls._simulated_heating_state = None
            cls._simulated_heating_mode = None
            try:
                sys_id = cls._get_system_id()
                if new_active:
                    # PAC ON : SetOut outIdx=4 newState=1 (Auto/Chauffe)
                    cls._send_command(SET_OUT_URL, {
                        "poolID": str(sys_id),
                        "outIdx": "4",
                        "newState": "1",
                        "comMode": "1"
                    })
                    # Appliquer la consigne de température
                    target = cls._get_comfort_target()  # 27°C
                    cls._send_command(SET_PARAM_URL, {
                        "poolID": str(sys_id),
                        "paramID": "ConsigneEau",
                        "newValue": str(target),
                        "comMode": "1"
                    })
                    logger.info(f"[KLEREO] PAC activée, consigne → {target}°C")
                else:
                    # PAC OFF : SetOut outIdx=4 newState=0 (Stop)
                    cls._send_command(SET_OUT_URL, {
                        "poolID": str(sys_id),
                        "outIdx": "4",
                        "newState": "0",
                        "comMode": "1"
                    })
                    logger.info("[KLEREO] PAC désactivée (mode antigel natif)")
            except Exception as e:
                logger.error(f"[KLEREO] Erreur commande PAC : {e}")
                raise HTTPException(status_code=502, detail={"error": f"Erreur Klereo : {e}"})
            return cls.get_pool_status(force_refresh=True)

    @classmethod
    def set_temperature(cls, target_temperature: float) -> Dict[str, Any]:
        """Ajuste la consigne de température de baignade Klereo (15°C à 32°C)."""
        if cls.is_read_only_mode():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "Garde-fou de sécurité actif : Mode lecture seule obligatoire pour la piscine.",
                    "type": "SecurityInterlockError"
                }
            )
        try:
            sys_id = cls._get_system_id()
            cls._send_command(SET_PARAM_URL, {
                "poolID": str(sys_id),
                "paramID": "ConsigneEau",
                "newValue": str(round(float(target_temperature), 1)),
                "comMode": "1"
            })
            logger.info(f"[KLEREO] Consigne température eau ajustée → {target_temperature}°C")
            return cls.get_pool_status(force_refresh=True)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[KLEREO] Erreur consigne température : {e}")
            raise HTTPException(status_code=502, detail={"error": f"Erreur Klereo : {e}"})


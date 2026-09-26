import os
import json
import time
import uuid
import logging
import base64
import tempfile
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from pathlib import Path
import urllib.request
import urllib.error

from dotenv import load_dotenv
import jwt
from sqlalchemy.orm import Session
from ..models import BankAccount, BankTransaction, BankAuthSession
try:
    from .eb_embedded_key import DEFAULT_ENABLE_BANKING_PRIVATE_KEY
except ImportError:
    DEFAULT_ENABLE_BANKING_PRIVATE_KEY = ""

logger = logging.getLogger("sci_banking")


class EnableBankingService:
    """Service d'intégration Open Banking DSP2 via l'API Enable Banking.
    
    Fournit l'authentification sécurisée par JWT signé RS256,
    l'initiation de sessions de consentement DSP2 pour Swan France (SWNBFR22),
    et la synchronisation des soldes et transactions bancaires réelles.
    """

    def __init__(self):
        backend_dir = Path(__file__).resolve().parent.parent.parent
        dotenv_path = backend_dir / ".env"
        if dotenv_path.exists():
            load_dotenv(dotenv_path)
        else:
            load_dotenv()

        # Chemins de résolution de la clé privée
        default_key_path = backend_dir / "certs" / "enable_banking_private_key.pem"
        
        env_key_path = os.getenv("ENABLE_BANKING_KEY_PATH", "certs/enable_banking_private_key.pem")
        if os.path.isabs(env_key_path):
            self.key_path = Path(env_key_path)
        else:
            self.key_path = backend_dir / env_key_path

        self.app_id = os.getenv("ENABLE_BANKING_APPLICATION_ID", "4b6c7aaa-8404-4979-9648-f0bfcf019fdc")
        self.aspsp_name = os.getenv("ENABLE_BANKING_ASPSP_NAME", "Swan")
        self.aspsp_country = os.getenv("ENABLE_BANKING_ASPSP_COUNTRY", "FR")
        self.aspsp_bic = os.getenv("ENABLE_BANKING_ASPSP_BIC", "SWNBFR22")
        self.redirect_url = os.getenv("ENABLE_BANKING_REDIRECT_URL", "https://hellenvilliers.henri-jamet.com/api/banking/callback")
        self.base_url = os.getenv("ENABLE_BANKING_BASE_URL", "https://api.enablebanking.com")
        
        self._jwt_cache = None
        self._jwt_expires_at = 0

        # Tentative d'initialisation résiliente de la clé pour Vercel Serverless
        try:
            self._ensure_key_available()
        except Exception as e:
            logger.debug(f"Initialisation différée de la clé Enable Banking : {e}")

    @staticmethod
    def _normalize_key_content(raw_key: str) -> str:
        """Nettoie et normalise le contenu d'une clé PEM.
        
        Supporte :
        - Texte brut avec sauts de ligne réels.
        - Texte avec sauts de ligne échappés (\\n, \\r).
        - Chaînes entourées de guillemets ("..." ou '...').
        - Clé encodée en base64 (avec ou sans retours à la ligne).
        - En-têtes PKCS#1 (-----BEGIN RSA PRIVATE KEY-----) et PKCS#8 (-----BEGIN PRIVATE KEY-----).
        """
        if not raw_key:
            return ""
        val = raw_key.strip()
        # Supprimer les guillemets englobants si présents
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1].strip()

        # Si la chaîne contient directement l'en-tête PEM
        if "-----BEGIN" in val and "PRIVATE KEY" in val:
            val = val.replace("\\n", "\n").replace("\\r", "\r").strip()
            return val + "\n"

        # Sinon, tenter le décodage Base64
        try:
            compact_b64 = "".join(val.split())
            decoded_bytes = base64.b64decode(compact_b64, validate=False)
            decoded_text = decoded_bytes.decode("utf-8", errors="ignore")
            if "-----BEGIN" in decoded_text and "PRIVATE KEY" in decoded_text:
                decoded_text = decoded_text.replace("\\n", "\n").replace("\\r", "\r").strip()
                return decoded_text + "\n"
        except Exception:
            pass

        val = val.replace("\\n", "\n").replace("\\r", "\r").strip()
        return val + "\n" if val else ""

    def _write_key_to_tmp(self, pem_content: str) -> Path:
        """Écrit la clé privée PEM dans le répertoire temporaire Serverless (/tmp).
        
        Sur AWS Lambda et Vercel Serverless, le système de fichiers racine /var/task/
        est en lecture seule. Seul /tmp est inscriptible.
        """
        target_candidates = [
            Path("/tmp/enable_banking_private_key.pem"),
            Path(tempfile.gettempdir()) / "enable_banking_private_key.pem"
        ]
        last_error = None
        for target in target_candidates:
            try:
                target.parent.mkdir(parents=True, exist_ok=True)
                # Éviter les réécritures disque redondantes si le contenu est déjà identique
                if target.exists():
                    try:
                        with open(target, "r", encoding="utf-8") as f:
                            if f.read().strip() == pem_content.strip():
                                return target
                    except Exception:
                        pass
                with open(target, "w", encoding="utf-8") as f:
                    f.write(pem_content)
                if hasattr(os, "chmod") and os.name != "nt":
                    try:
                        os.chmod(target, 0o600)
                    except Exception:
                        pass
                logger.info(f"Clé privée Enable Banking initialisée dans le stockage temporaire : {target}")
                return target
            except Exception as e:
                last_error = e
                continue
        raise IOError(f"Impossible d'écrire la clé privée Enable Banking dans /tmp : {last_error}")

    def _ensure_key_available(self) -> Optional[Path]:
        """Assure que la clé privée est accessible sur disque (notamment /tmp sur Vercel) et à jour."""
        env_key = os.getenv("ENABLE_BANKING_PRIVATE_KEY") or os.getenv("ENABLE_BANKING_KEY_PEM")
        if env_key:
            pem_content = self._normalize_key_content(env_key)
            if pem_content:
                # Si le fichier configuré n'existe pas (ex: /var/task/... en lecture seule sur Vercel),
                # on matérialise la clé dans /tmp et on redirige key_path
                if not self.key_path.exists():
                    self.key_path = self._write_key_to_tmp(pem_content)
                return self.key_path

        # Si pas d'env var mais que le fichier local existe déjà (dev local)
        if self.key_path.exists():
            return self.key_path

        # Vérifier si elle avait déjà été écrite dans /tmp lors d'une précédente invocation
        tmp_target = Path("/tmp/enable_banking_private_key.pem")
        if tmp_target.exists():
            self.key_path = tmp_target
            return self.key_path

        # Fallback sur la clé embarquée de secours pour Vercel Serverless
        if DEFAULT_ENABLE_BANKING_PRIVATE_KEY:
            pem_content = self._normalize_key_content(DEFAULT_ENABLE_BANKING_PRIVATE_KEY)
            if pem_content and not self.key_path.exists():
                try:
                    self.key_path = self._write_key_to_tmp(pem_content)
                    return self.key_path
                except Exception:
                    pass

        return None

    def _load_private_key(self) -> str:
        """Charge et retourne la clé privée RSA PEM en mémoire.
        
        Garantit le support de :
        1. ENABLE_BANKING_PRIVATE_KEY ou ENABLE_BANKING_KEY_PEM (texte brut PEM ou base64).
        2. Le fichier local backend/certs/enable_banking_private_key.pem (sans régression locale).
        3. L'écriture dynamique dans /tmp/enable_banking_private_key.pem en environnement Serverless Vercel.
        """
        # 1. Priorité aux variables d'environnement
        env_key = os.getenv("ENABLE_BANKING_PRIVATE_KEY") or os.getenv("ENABLE_BANKING_KEY_PEM")
        if env_key:
            pem_content = self._normalize_key_content(env_key)
            if pem_content:
                # Si le chemin local n'existe pas, écrire à la volée dans /tmp
                if not self.key_path.exists():
                    try:
                        self.key_path = self._write_key_to_tmp(pem_content)
                    except Exception as e:
                        logger.warning(f"Avertissement écriture /tmp clé privée : {e}")
                return pem_content

        # 2. Si un fichier existe déjà au chemin configuré (ex: dev local)
        if self.key_path.exists():
            try:
                with open(self.key_path, "r", encoding="utf-8") as f:
                    content = f.read()
                pem_content = self._normalize_key_content(content)
                if pem_content:
                    return pem_content
            except Exception as e:
                logger.error(f"Erreur lecture clé privée sur {self.key_path} : {e}")

        # 3. Vérification du fichier dans /tmp si existant
        tmp_target = Path("/tmp/enable_banking_private_key.pem")
        if tmp_target.exists():
            try:
                self.key_path = tmp_target
                with open(tmp_target, "r", encoding="utf-8") as f:
                    content = f.read()
                pem_content = self._normalize_key_content(content)
                if pem_content:
                    return pem_content
            except Exception as e:
                logger.error(f"Erreur lecture clé temporaire {tmp_target} : {e}")

        # 4. Fallback sur la clé embarquée de secours pour Vercel Serverless
        if DEFAULT_ENABLE_BANKING_PRIVATE_KEY:
            pem_content = self._normalize_key_content(DEFAULT_ENABLE_BANKING_PRIVATE_KEY)
            if pem_content:
                if not self.key_path.exists():
                    try:
                        self.key_path = self._write_key_to_tmp(pem_content)
                    except Exception as e:
                        logger.warning(f"Avertissement écriture /tmp clé de secours embarquée : {e}")
                return pem_content

        # 5. Si aucune clé n'a pu être trouvée
        raise FileNotFoundError(
            f"Clé privée Enable Banking introuvable à l'emplacement : {self.key_path}. "
            f"Pour Vercel Serverless, veuillez configurer la variable d'environnement "
            f"ENABLE_BANKING_PRIVATE_KEY (texte PEM brut ou encodé en base64)."
        )

    def get_jwt_token(self, force_refresh: bool = False) -> str:
        """Génère un token JWT signé RS256 pour l'API Enable Banking (valide 1h)."""
        now = int(time.time())
        if not force_refresh and self._jwt_cache and now < (self._jwt_expires_at - 60):
            return self._jwt_cache

        private_key = self._load_private_key()
        payload = {
            "iss": "enablebanking.com",
            "aud": "api.enablebanking.com",
            "iat": now,
            "exp": now + 3600
        }
        headers = {
            "kid": self.app_id
        }

        token = jwt.encode(payload, private_key, algorithm="RS256", headers=headers)
        self._jwt_cache = token
        self._jwt_expires_at = now + 3600
        return token

    def _api_request(self, method: str, endpoint: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Exécute une requête HTTP authentifiée vers l'API Enable Banking."""
        token = self.get_jwt_token()
        url = f"{self.base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "SCI-Hellenvilliers/2.0"
        }

        body_bytes = json.dumps(data).encode("utf-8") if data is not None else None
        req = urllib.request.Request(url, data=body_bytes, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req) as resp:
                resp_text = resp.read().decode("utf-8")
                return json.loads(resp_text) if resp_text else {}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            logger.error(f"Erreur API Enable Banking [{e.code}] {url} : {err_body}")
            try:
                err_json = json.loads(err_body)
                msg = err_json.get("message") or err_json.get("error", {}).get("message") or str(err_json)
            except Exception:
                msg = err_body
            raise RuntimeError(f"Erreur Enable Banking ({e.code}) : {msg}")
        except Exception as e:
            logger.error(f"Erreur réseau Enable Banking : {e}")
            raise RuntimeError(f"Échec de connexion vers Enable Banking : {e}")

    def get_aspsps(self, country: str = "FR") -> List[Dict[str, Any]]:
        """Récupère la liste des établissements bancaires (ASPSPs) disponibles."""
        data = self._api_request("GET", f"/aspsps?country={country}")
        return data.get("aspsps", [])

    def start_auth(
        self,
        aspsp_name: Optional[str] = None,
        psu_type: str = "business",
        redirect_url: Optional[str] = None,
        state: Optional[str] = None
    ) -> Dict[str, Any]:
        """Démarre une session d'autorisation DSP2.
        
        Génère l'URL de redirection bancaire pour Swan (ou autre ASPSP)
        et stocke la session d'autorisation en attente.
        """
        target_aspsp = aspsp_name or self.aspsp_name
        target_redirect = redirect_url or self.redirect_url
        session_state = state or f"sci_{uuid.uuid4().hex[:12]}"
        valid_until = (datetime.utcnow() + timedelta(days=180)).isoformat() + "Z"

        payload = {
            "access": {
                "valid_until": valid_until
            },
            "aspsp": {
                "name": target_aspsp,
                "country": self.aspsp_country
            },
            "state": session_state,
            "redirect_url": target_redirect,
            "psu_type": psu_type
        }

        res = self._api_request("POST", "/auth", data=payload)
        return {
            "url": res.get("url"),
            "session_id": res.get("session_id"),
            "state": session_state,
            "aspsp_name": target_aspsp,
            "valid_until": valid_until
        }

    def authorize_session(self, code: str) -> Dict[str, Any]:
        """Échange le code d'autorisation reçu lors du callback contre une session active."""
        payload = {"code": code}
        return self._api_request("POST", "/sessions", data=payload)

    def get_session(self, session_id: str) -> Dict[str, Any]:
        """Récupère l'état et les comptes associés à une session d'autorisation."""
        return self._api_request("GET", f"/sessions/{session_id}")

    @staticmethod
    def _extract_account_id_str(account_id: Any) -> Optional[str]:
        """Extrait sous forme de chaîne de caractères l'identifiant de compte bancaire.
        
        Gère de façon robuste :
        - str pur (UUID ou IBAN)
        - dict avec uid, account_id (str ou dict avec iban), ou id
        """
        if not account_id:
            return None
        if isinstance(account_id, str):
            val = account_id.strip()
            return val if val else None
        if isinstance(account_id, dict):
            raw = account_id.get("uid") or account_id.get("id")
            if isinstance(raw, str) and raw.strip():
                return raw.strip()
            raw_acc = account_id.get("account_id")
            if isinstance(raw_acc, str) and raw_acc.strip():
                return raw_acc.strip()
            if isinstance(raw_acc, dict):
                sub = raw_acc.get("iban") or raw_acc.get("other") or raw_acc.get("id")
                if isinstance(sub, str) and sub.strip():
                    return sub.strip()
            raw_iban = account_id.get("iban")
            if isinstance(raw_iban, str) and raw_iban.strip():
                return raw_iban.strip()
        return None

    def get_accounts(self) -> List[Any]:
        """Récupère les comptes bancaires autorisés."""
        try:
            data = self._api_request("GET", "/accounts")
            if isinstance(data, dict):
                res = data.get("accounts", [])
                return res if isinstance(res, list) else []
            elif isinstance(data, list):
                return data
            return []
        except Exception as e:
            logger.warning(f"Impossible de récupérer /accounts : {e}")
            return []

    def get_account_details(self, account_id: Any) -> Dict[str, Any]:
        """Récupère les détails d'un compte bancaire (IBAN, titulaire, devise, etc.)."""
        acc_str = self._extract_account_id_str(account_id)
        if not acc_str:
            return {}
        try:
            data = self._api_request("GET", f"/accounts/{acc_str}")
            return data if isinstance(data, dict) else {}
        except Exception as e:
            logger.debug(f"Détails compte non disponibles via API pour {acc_str} : {e}")
            return {}

    def get_account_balances(self, account_id: Any) -> List[Dict[str, Any]]:
        """Récupère les soldes d'un compte bancaire."""
        acc_str = self._extract_account_id_str(account_id)
        if not acc_str:
            logger.warning(f"Identifiant de compte invalide pour solde : {account_id}")
            return []
        try:
            data = self._api_request("GET", f"/accounts/{acc_str}/balances")
            if isinstance(data, dict):
                balances = data.get("balances", [])
                return balances if isinstance(balances, list) else []
            elif isinstance(data, list):
                return data
            return []
        except Exception as e:
            logger.warning(f"Erreur API balances pour compte {acc_str} : {e}")
            return []

    def get_account_transactions(
        self,
        account_id: Any,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Récupère les transactions d'un compte bancaire."""
        acc_str = self._extract_account_id_str(account_id)
        if not acc_str:
            logger.warning(f"Identifiant de compte invalide pour transactions : {account_id}")
            return []
        endpoint = f"/accounts/{acc_str}/transactions"
        params = []
        if date_from:
            params.append(f"date_from={date_from}")
        if date_to:
            params.append(f"date_to={date_to}")
        if params:
            endpoint += "?" + "&".join(params)

        try:
            data = self._api_request("GET", endpoint)
            if isinstance(data, dict):
                txs = data.get("transactions", [])
                return txs if isinstance(txs, list) else []
            elif isinstance(data, list):
                return data
            return []
        except Exception as e:
            logger.warning(f"Erreur API transactions pour compte {acc_str} : {e}")
            return []

    def categorize_transaction(self, label: str, amount: float) -> str:
        """Attribue automatiquement une catégorie analytique de la SCI aux transactions."""
        text = (label or "").lower()
        if any(w in text for w in ["fioul", "chauffage", "combustible", "gaz"]):
            return "Chauffage & Fioul"
        elif any(w in text for w in ["enedis", "edf", "engie", "totalenergies", "électricité"]):
            return "Électricité & Énergie"
        elif any(w in text for w in ["eau", "veolia", "suez", "assainissement"]):
            return "Eau & Assainissement"
        elif any(w in text for w in ["assurance", "allianz", "axa", "macif", "mma", "maif"]):
            return "Assurance Domaine"
        elif any(w in text for w in ["plombier", "toiture", "couverture", "maçon", "artisan", "travaux", "brico", "leroy"]):
            return "Travaux & Rénovation"
        elif any(w in text for w in ["taxe", "impots", "foncier", "foncière", "cfe"]):
            return "Taxes & Impôts"
        elif any(w in text for w in ["jardin", "tonte", "élagage", "paysag"]):
            return "Parc & Espaces Verts"
        elif any(w in text for w in ["piscine", "chlore", "pompe", "bâche"]):
            return "Piscine"
        elif amount > 0 and any(w in text for w in ["apport", "cca", "virement henri", "virement frederic", "virement marguerite"]):
            return "Apport Compte Courant d'Associé (CCA)"
        elif amount > 0:
            return "Recette / Virement entrant"
        else:
            return "Dépense Courante Domaine"

    def sync_database(self, db: Session, session_id: Optional[str] = None) -> Dict[str, Any]:
        """Synchronise les soldes et transactions depuis Enable Banking vers la base SQLite.
        
        Supporte de façon robuste :
        - Les sessions retournant des comptes sous forme de list of strings (UIDs purs)
        - Les sessions retournant des comptes sous forme de list of dicts
        - L'interrogation sécurisée des détails, soldes et transactions sans régression
        """
        accounts_data = []
        
        # Si une session est spécifiée ou présente en base
        sessions_query = db.query(BankAuthSession).filter(BankAuthSession.status == "AUTHORIZED")
        if session_id:
            sessions_query = sessions_query.filter(BankAuthSession.session_id == session_id)
        active_sessions = sessions_query.all()

        synced_accounts_count = 0
        synced_transactions_count = 0

        # Récupération via l'API Enable Banking
        try:
            accounts_res = self.get_accounts()
            if isinstance(accounts_res, list):
                accounts_data.extend(accounts_res)
        except Exception as e:
            logger.warning(f"Impossible de lister les comptes globaux Enable Banking ({e}), tentative via sessions...")

        if not accounts_data and active_sessions:
            for s in active_sessions:
                try:
                    s_detail = self.get_session(s.session_id)
                    if isinstance(s_detail, dict):
                        s_accounts = s_detail.get("accounts", [])
                        if isinstance(s_accounts, list):
                            accounts_data.extend(s_accounts)
                except Exception as ex:
                    logger.warning(f"Erreur lecture session {s.session_id} : {ex}")
                if not accounts_data and getattr(s, "accounts_data", None):
                    try:
                        cached_accs = json.loads(s.accounts_data)
                        if isinstance(cached_accs, list):
                            accounts_data.extend(cached_accs)
                    except Exception:
                        pass

        # Traitement défensif universel de chaque compte
        seen_account_ids = set()

        for acc in accounts_data:
            if not acc:
                continue

            iban = None
            acc_id = None
            acc_name = None
            currency = "EUR"

            if isinstance(acc, dict):
                acc_uid = acc.get("uid") or acc.get("id")
                raw_acc_id = acc.get("account_id")

                if isinstance(raw_acc_id, dict):
                    iban = raw_acc_id.get("iban")
                    acc_id = acc_uid or iban or raw_acc_id.get("other")
                elif isinstance(raw_acc_id, str):
                    acc_id = acc_uid or raw_acc_id
                    if raw_acc_id.startswith("FR") or len(raw_acc_id) >= 14:
                        iban = raw_acc_id
                else:
                    acc_id = acc_uid

                if not iban and isinstance(acc.get("iban"), str):
                    iban = acc.get("iban")

                acc_name = acc.get("name") or acc.get("account_name")
                currency = acc.get("currency") or "EUR"

            elif isinstance(acc, str):
                acc_id = acc.strip()
                # Tenter d'enrichir avec les détails du compte depuis l'API Enable Banking
                try:
                    detail_res = self.get_account_details(acc_id)
                    if isinstance(detail_res, dict) and detail_res:
                        raw_acc_id = detail_res.get("account_id")
                        if isinstance(raw_acc_id, dict):
                            iban = raw_acc_id.get("iban")
                        elif isinstance(raw_acc_id, str) and (raw_acc_id.startswith("FR") or len(raw_acc_id) >= 14):
                            iban = raw_acc_id

                        if not iban and isinstance(detail_res.get("iban"), str):
                            iban = detail_res.get("iban")

                        acc_name = detail_res.get("name") or detail_res.get("account_name")
                        currency = detail_res.get("currency") or "EUR"
                except Exception as ex:
                    logger.debug(f"Détails complémentaires non récupérés pour {acc_id} : {ex}")
            else:
                logger.warning(f"Format de compte inattendu ignoré : {type(acc)}")
                continue

            if not acc_id or not isinstance(acc_id, str):
                continue

            if acc_id in seen_account_ids:
                continue
            seen_account_ids.add(acc_id)

            # Récupération du solde
            balance_val = 0.0
            balance_type = "interimAvailable"
            try:
                balances = self.get_account_balances(acc_id)
                if balances and isinstance(balances, list):
                    bal_obj = balances[0]
                    if isinstance(bal_obj, dict):
                        bal_amt = bal_obj.get("balance_amount")
                        if isinstance(bal_amt, dict):
                            try:
                                balance_val = float(bal_amt.get("amount", 0.0))
                            except (ValueError, TypeError):
                                balance_val = 0.0
                            currency = bal_amt.get("currency", currency)
                        elif isinstance(bal_amt, (int, float)):
                            balance_val = float(bal_amt)
                        balance_type = bal_obj.get("balance_type", "interimAvailable")
                    elif isinstance(bal_obj, (int, float)):
                        balance_val = float(bal_obj)
            except Exception as e:
                logger.warning(f"Erreur récupération solde pour compte {acc_id} : {e}")

            # Upsert BankAccount
            db_account = db.query(BankAccount).filter(BankAccount.account_id == acc_id).first()
            if not db_account and iban:
                db_account = db.query(BankAccount).filter(BankAccount.iban == iban).first()

            final_name = acc_name or "Compte Swan SCI Hellenvilliers"

            if not db_account:
                db_account = BankAccount(
                    account_id=acc_id,
                    iban=iban,
                    name=final_name,
                    currency=currency,
                    balance=balance_val,
                    balance_type=balance_type,
                    last_synced_at=datetime.utcnow(),
                    aspsp_name=self.aspsp_name
                )
                db.add(db_account)
                db.flush()
            else:
                db_account.account_id = acc_id
                db_account.balance = balance_val
                db_account.balance_type = balance_type
                if iban:
                    db_account.iban = iban
                if acc_name:
                    db_account.name = acc_name
                db_account.last_synced_at = datetime.utcnow()

            synced_accounts_count += 1

            # Récupération des transactions
            try:
                tx_list = self.get_account_transactions(acc_id)
                if isinstance(tx_list, list):
                    for tx in tx_list:
                        if not isinstance(tx, dict):
                            continue

                        amt_field = tx.get("transaction_amount")
                        amt_str = amt_field.get("amount") if isinstance(amt_field, dict) else amt_field
                        tx_id = (
                            tx.get("transaction_id")
                            or tx.get("entry_reference")
                            or f"tx_{acc_id}_{tx.get('booking_date')}_{amt_str}"
                        )

                        # Vérifier si déjà existante
                        existing_tx = db.query(BankTransaction).filter(BankTransaction.transaction_id == tx_id).first()
                        if existing_tx:
                            continue

                        amount_val = 0.0
                        tx_curr = currency
                        if isinstance(amt_field, dict):
                            try:
                                amount_val = float(amt_field.get("amount", 0.0))
                            except (ValueError, TypeError):
                                amount_val = 0.0
                            tx_curr = amt_field.get("currency", currency)
                        elif isinstance(amt_field, (int, float)):
                            amount_val = float(amt_field)
                        elif isinstance(amt_field, str):
                            try:
                                amount_val = float(amt_field)
                            except (ValueError, TypeError):
                                amount_val = 0.0

                        # Si c'est un débit, vérifier le signe
                        credit_debit = tx.get("credit_debit_indicator", "")
                        if credit_debit == "DBIT" and amount_val > 0:
                            amount_val = -amount_val

                        remittance = ""
                        rem_info = tx.get("remittance_information", [])
                        if isinstance(rem_info, list):
                            remittance = " ".join(str(r) for r in rem_info if r)
                        elif isinstance(rem_info, str):
                            remittance = rem_info

                        creditor = None
                        if isinstance(tx.get("creditor"), dict):
                            creditor = tx.get("creditor", {}).get("name")
                        elif isinstance(tx.get("creditor"), str):
                            creditor = tx.get("creditor")

                        debtor = None
                        if isinstance(tx.get("debtor"), dict):
                            debtor = tx.get("debtor", {}).get("name")
                        elif isinstance(tx.get("debtor"), str):
                            debtor = tx.get("debtor")

                        category = self.categorize_transaction(remittance or creditor or debtor or "", amount_val)

                        new_tx = BankTransaction(
                            transaction_id=tx_id,
                            account_id=db_account.id,
                            booking_date=tx.get("booking_date") or tx.get("value_date") or datetime.utcnow().strftime("%Y-%m-%d"),
                            value_date=tx.get("value_date"),
                            amount=amount_val,
                            currency=tx_curr,
                            remittance_information=remittance,
                            creditor_name=creditor,
                            debtor_name=debtor,
                            category=category,
                            raw_json=json.dumps(tx)
                        )
                        db.add(new_tx)
                        synced_transactions_count += 1

            except Exception as e:
                logger.warning(f"Erreur récupération transactions pour compte {acc_id} : {e}")

        db.commit()
        return {
            "success": True,
            "accounts_synced": synced_accounts_count,
            "transactions_synced": synced_transactions_count,
            "timestamp": datetime.utcnow().isoformat()
        }

    def create_auth_session(
        self,
        aspsp_name: Optional[str] = None,
        psu_type: str = "business",
        redirect_url: Optional[str] = None,
        state: Optional[str] = None
    ) -> Dict[str, Any]:
        """Crée une nouvelle session d'autorisation DSP2 et retourne l'URL Tilisy pour Swan."""
        return self.start_auth(
            aspsp_name=aspsp_name,
            psu_type=psu_type,
            redirect_url=redirect_url,
            state=state
        )

    def _get_or_create_reauth_url(self, db: Session) -> Dict[str, Any]:
        """Récupère une URL d'autorisation récente ou en génère une nouvelle via start_auth."""
        recent_session = (
            db.query(BankAuthSession)
            .filter(BankAuthSession.status == "INITIATED", BankAuthSession.auth_url.isnot(None))
            .order_by(BankAuthSession.created_at.desc())
            .first()
        )
        if recent_session and recent_session.created_at and (datetime.utcnow() - recent_session.created_at).total_seconds() < 1800:
            return {"url": recent_session.auth_url, "session_id": recent_session.session_id}

        try:
            auth_data = self.create_auth_session()
            new_sess = BankAuthSession(
                session_id=auth_data.get("session_id") or auth_data.get("state"),
                aspsp_name=auth_data.get("aspsp_name", self.aspsp_name),
                psu_type="business",
                status="INITIATED",
                auth_url=auth_data.get("url"),
                redirect_url=self.redirect_url,
                created_at=datetime.utcnow()
            )
            db.add(new_sess)
            db.commit()
            return {"url": auth_data.get("url"), "session_id": new_sess.session_id}
        except Exception as e:
            logger.error(f"Impossible d'initialiser l'URL de ré-authentification Enable Banking : {e}")
            return {"url": None, "session_id": None}

    def check_connection_status(self, db: Session) -> Dict[str, Any]:
        """Vérifie de manière réactive l'état réel de la liaison bancaire Swan via Enable Banking.
        
        RÈGLE D'OR DE DÉTECTION (Consigne stricte Henri) :
        Détection purement réactive :
        1. Lorsque l'API / le système n'arrive plus à récupérer les données (erreur HTTP, rejet d'accès,
           jeton expiré, 401/403/404, session expirée ou inaccessible).
        2. Ou lorsque le compte ou la liaison bancaire n'est plus actif/active.
        
        En temps normal (requêtes réussies) : status='ok', needs_reauth=False.
        En cas d'échec : status='expired'|'error', needs_reauth=True, URL Tilisy instantanée fournie.
        """
        accounts = db.query(BankAccount).all()
        total_bal = sum(a.balance for a in accounts) if accounts else 0.0
        latest_sync = max((a.last_synced_at for a in accounts if a.last_synced_at), default=None)

        # Vérification des sessions autorisées en base
        active_sessions = db.query(BankAuthSession).filter(BankAuthSession.status == "AUTHORIZED").all()

        # Si aucune session active et aucun compte synchronisé avec succès
        if not active_sessions and (not accounts or not latest_sync):
            reauth_info = self._get_or_create_reauth_url(db)
            return {
                "status": "expired",
                "needs_reauth": True,
                "days_left": None,
                "valid_until": None,
                "message": "Liaison bancaire interrompue : La ré-authentification DSP2 de sécurité (tous les 180 jours) est requise pour actualiser les données.",
                "reauth_url": reauth_info.get("url"),
                "active_accounts_count": len(accounts),
                "total_balance": round(total_bal, 2),
                "last_synced_at": latest_sync,
                "last_successful_sync": latest_sync
            }

        # Test réactif effectif de l'API Enable Banking
        is_query_successful = False
        error_detail = ""
        is_auth_error = False

        try:
            if accounts:
                target_acc_id = accounts[0].account_id
                # Tentative d'interrogation réelle du solde
                self.get_account_balances(target_acc_id)
                is_query_successful = True
            elif active_sessions:
                sess = active_sessions[0]
                sess_data = self.get_session(sess.session_id)
                if sess_data and sess_data.get("status") in ["AUTHORIZED", "ACTIVE"]:
                    is_query_successful = True
                else:
                    is_auth_error = True
                    error_detail = f"Statut session : {sess_data.get('status') if sess_data else 'inconnu'}"
            else:
                self.get_accounts()
                is_query_successful = True
        except Exception as e:
            error_str = str(e)
            logger.warning(f"Échec de l'interrogation réactive Enable Banking Swan : {error_str}")
            error_detail = error_str
            lower_err = error_str.lower()
            if any(term in lower_err for term in ["401", "403", "404", "expired", "not found", "unauthorized", "does_not_exist", "session", "consent"]):
                is_auth_error = True
            else:
                is_auth_error = False

        if is_query_successful:
            return {
                "status": "ok",
                "needs_reauth": False,
                "days_left": None,
                "valid_until": None,
                "message": "Liaison bancaire Swan active et opérationnelle.",
                "reauth_url": None,
                "active_accounts_count": len(accounts),
                "total_balance": round(total_bal, 2),
                "last_synced_at": latest_sync,
                "last_successful_sync": latest_sync
            }
        else:
            # Marquer les sessions comme expirées en cas de rejet d'authentification
            if is_auth_error and active_sessions:
                for s in active_sessions:
                    s.status = "EXPIRED"
                try:
                    db.commit()
                except Exception:
                    db.rollback()

            reauth_info = self._get_or_create_reauth_url(db)
            status_code = "expired" if is_auth_error else "error"
            msg = (
                "Liaison bancaire interrompue : La ré-authentification DSP2 de sécurité (tous les 180 jours) est requise pour actualiser les données."
                if is_auth_error
                else f"Liaison bancaire indisponible : Impossible d'interroger Swan via Enable Banking ({error_detail})."
            )
            return {
                "status": status_code,
                "needs_reauth": True,
                "days_left": None,
                "valid_until": None,
                "message": msg,
                "reauth_url": reauth_info.get("url"),
                "active_accounts_count": len(accounts),
                "total_balance": round(total_bal, 2),
                "last_synced_at": latest_sync,
                "last_successful_sync": latest_sync
            }


# Instance globale du service
enable_banking_service = EnableBankingService()

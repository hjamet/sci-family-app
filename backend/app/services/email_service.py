import os
import re
import json
import html as html_lib
import logging
import base64
import unicodedata
from typing import List, Optional, Union, Set, Dict, Any
import urllib.request
import urllib.error

try:
    import httpx
except ImportError:
    httpx = None

logger = logging.getLogger("email_service")

# --- Environment & Configuration ---
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "https://hellenvilliers.henri-jamet.com").rstrip("/")
# Resend verified domain on account is henri-jamet.com; fallback if sci-familiale.fr not yet verified
DEFAULT_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "SCI Familiale Hellenvilliers <notifications@henri-jamet.com>")
FALLBACK_FROM_EMAIL = "SCI Familiale Hellenvilliers <notifications@henri-jamet.com>"
SANDBOX_FROM_EMAIL = "SCI Familiale Hellenvilliers <onboarding@resend.dev>"

# ==============================================================================
# GOUVERNANCE PRODUCTION & ENVOI RÉEL PÉRENNE (PRODUCTION READY)
# ==============================================================================
# EMAIL_FORCE_REAL_MODE est actif en permanence pour la production réelle Resend.
# Le mode simulation (EMAIL_TEST_MODE) est définitivement désactivé par défaut.
# DISABLE_ALL_EMAILS sert uniquement de coupe-circuit d'urgence si explicitement activé ('true').
DISABLE_ALL_EMAILS: bool = False

# ==============================================================================
# MODE MAINTENANCE & REDIRECTION TEST VERS HENRI (PROTECTION FAMILIALE)
# ==============================================================================
# Quand MAINTENANCE_EMAIL_REDIRECT_ONLY est True :
# - Seules hellenvillierssci@gmail.com et ses alias Gmail (+prenom) sont expédiées via Resend.
# - Toute autre adresse (sœurs, parents, externe) est automatiquement redirigée vers
#   hellenvillierssci@gmail.com avec indication du destinataire prévu dans l'objet.
# - Zéro e-mail ne peut atteindre la famille pendant la maintenance.
MAINTENANCE_EMAIL_REDIRECT_ONLY: bool = os.getenv("MAINTENANCE_EMAIL_REDIRECT_ONLY", "false").strip().lower() in ("true", "1", "yes")
MAINTENANCE_EMAIL_REDIRECT_TO: str = "hellenvillierssci@gmail.com"


def is_henri_test_address(addr: str) -> bool:
    """Retourne True uniquement pour hellenvillierssci@gmail.com et ses alias Gmail (+...)."""
    clean = (addr or "").strip().lower()
    if clean == "hellenvillierssci@gmail.com":
        return True
    return clean.startswith("hellenvillierssci+") and clean.endswith("@gmail.com")

def is_email_disabled() -> bool:
    """
    Coupe-circuit d'urgence global :
    Par défaut, l'envoi d'email est ACTIF en production réelle (EMAIL_FORCE_REAL_MODE=True pérenne).
    L'envoi est bloqué UNIQUEMENT si le coupe-circuit DISABLE_ALL_EMAILS est explicitement 'true', '1' ou 'yes'.
    """
    return os.getenv("DISABLE_ALL_EMAILS", "false").strip().lower() in ("true", "1", "yes")

def is_test_mode() -> bool:
    """
    Mode simulation définitivement désactivé :
    EMAIL_FORCE_REAL_MODE est actif en permanence (envois physiques réels Resend).
    Ne retourne True que si EMAIL_TEST_MODE est explicitement 'true', '1' ou 'yes' (ex: tests unitaires).
    """
    return os.getenv("EMAIL_TEST_MODE", "false").strip().lower() in ("true", "1", "yes")


def get_circuit_breaker_response() -> dict:
    """Retour standardisé du coupe-circuit d'urgence."""
    log_msg = "[COUPE-CIRCUIT] Envoi d'email totalement désactivé (urgence). Aucun email envoyé."
    logger.warning(log_msg)
    print(log_msg)
    return {"status": "disabled", "id": "mock_emergency_off"}

# PARE-FEU DE PRODUCTION : LISTE BLANCHE DES 7 ASSOCIÉS OFFICIELS DE LA SCI
# Adresses officielles synchronisées avec la base PostgreSQL de production (plus anciens alias historiques).
ALLOWED_RECIPIENTS: Set[str] = {
    "hellenvillierssci@gmail.com",
    "marguerite_jamet@yahoo.fr",
    "hortense_jamet@yahoo.fr",
    "josephine_jamet@yahoo.fr",
    "eejamet@gmail.com",
    "frdjamet@gmail.com",
    "elizabeth_jamet@yahoo.fr",
    # Anciens alias historiques conservés par tolérance
    "marguerite.jamet@orange.fr",
    "eugenie_jamet@yahoo.fr",
    "elisabeth.jamet@yahoo.fr",
    "frederic_jamet@orange.fr",
}

# Circuit Breaker / Hermetic Test Mode (désactivé par défaut en production)
EMAIL_TEST_MODE: bool = os.getenv("EMAIL_TEST_MODE", "false").lower() in ("true", "1", "yes")
EMAIL_TEST_REDIRECT_TO: str = os.getenv("EMAIL_TEST_REDIRECT_TO", "hellenvillierssci@gmail.com").strip() or "hellenvillierssci@gmail.com"

ALLOWED_TEST_RECIPIENTS: Set[str] = set(ALLOWED_RECIPIENTS)

DEFAULT_MEMBER_EMAILS: List[str] = [
    "hellenvillierssci@gmail.com",
    "marguerite_jamet@yahoo.fr",
    "hortense_jamet@yahoo.fr",
    "josephine_jamet@yahoo.fr",
    "eejamet@gmail.com",
    "frdjamet@gmail.com",
    "elizabeth_jamet@yahoo.fr",
]


# ==============================================================================
# HELPERS LINGUISTIQUES & FORMATAGE FRANÇAIS (Accords, élisions, dates, montants)
# ==============================================================================

FEMININE_MEMBER_FIRSTNAMES: Set[str] = {
    "marguerite",
    "hortense",
    "josephine",
    "eugenie",
    "elisabeth",
    "elizabeth",
    "maman",
}


def _norm_first_token(name: Optional[str]) -> str:
    if not name:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(name))
    ascii_str = nfkd.encode("ASCII", "ignore").decode("utf-8").strip().lower()
    return ascii_str.split()[0] if ascii_str else ""


def is_feminine_member(name: Optional[str]) -> bool:
    return _norm_first_token(name) in FEMININE_MEMBER_FIRSTNAMES


def accord_fr(name: Optional[str], masc: str, fem: str, neutral: Optional[str] = None) -> str:
    """Accorde un terme français selon le prénom du destinataire."""
    if not name or not str(name).strip():
        return neutral if neutral is not None else masc
    return fem if is_feminine_member(name) else masc


def escape_html_text(text: Optional[str], preserve_newlines: bool = False) -> str:
    escaped = html_lib.escape(str(text or ""))
    if preserve_newlines:
        escaped = escaped.replace("\r\n", "\n").replace("\n", "<br>")
    return escaped


def format_de_mois(period_label: Optional[str]) -> str:
    """Formate 'Octobre 2026' -> \"d'octobre 2026\", 'Novembre 2026' -> 'de novembre 2026'."""
    clean = str(period_label or "ce mois").strip()
    if not clean:
        return "de ce mois"
    lowered = clean[0].lower() + clean[1:]
    first_norm = unicodedata.normalize("NFKD", lowered[0]).encode("ASCII", "ignore").decode("utf-8").lower()
    if first_norm in ("a", "e", "i", "o", "u", "y", "h"):
        return f"d'{lowered}"
    return f"de {lowered}"


def format_a_demeure(property_name: Optional[str]) -> str:
    """Formate la préposition de lieu correcte ('au Presbytère', 'à Rosings', \"au Domaine d'Hellenvilliers\")."""
    clean = str(property_name or "Domaine d'Hellenvilliers").strip()
    low = clean.lower()
    if "presbyt" in low:
        return "au Presbytère"
    if "rosing" in low:
        return "à Rosings"
    if "domaine" in low:
        return "au Domaine d'Hellenvilliers"
    if low.startswith("le "):
        return f"au {clean[3:]}"
    if low.startswith("les "):
        return f"aux {clean[4:]}"
    if low.startswith("la ") or low.startswith("l'"):
        return f"à {clean}"
    return f"à {clean}"


def format_date_fr(date_val: Optional[str]) -> str:
    """Convertit une date ISO YYYY-MM-DD (ou préfixe ISO) en DD/MM/YYYY."""
    raw = str(date_val or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    return raw


def format_eur_fr(amount: Any) -> str:
    """Formate un montant au format français : 1 250,50 €."""
    try:
        val = float(amount or 0.0)
    except (ValueError, TypeError):
        val = 0.0
    return f"{val:,.2f}".replace(",", " ").replace(".", ",") + " €"

# ==============================================================================
# REGISTRE D'EMAILS RÉCENTS DISPATCHÉS / SIMULÉS (POUR NOTIFICATIONS & PREVIEWS)
# ==============================================================================
RECENT_DISPATCHED_EMAILS: List[Dict[str, Any]] = []

def record_dispatched_email(
    trigger_action: str,
    subject: str,
    recipients: Union[str, List[str]],
    html_content: str,
    recipients_names: Optional[List[str]] = None,
    status: str = "simulated",
    store_in_recent: bool = True
) -> Dict[str, Any]:
    """Construit l'entrée de prévisualisation et, si store_in_recent=True, l'enregistre dans RECENT_DISPATCHED_EMAILS (max 20)."""
    global RECENT_DISPATCHED_EMAILS
    import uuid
    from datetime import datetime

    recips_list = [recipients] if isinstance(recipients, str) else list(recipients)
    names = list(recipients_names) if recipients_names else []
    if not names:
        for r in recips_list:
            clean = r.split("@")[0].replace(".", " ").replace("_", " ").title()
            names.append(clean)

    email_entry = {
        "id": str(uuid.uuid4()),
        "created_at": datetime.utcnow().isoformat() + "Z",
        "trigger_action": trigger_action,
        "subject": subject,
        "recipients": recips_list,
        "recipients_names": names,
        "html_content": html_content,
        "status": status
    }
    if store_in_recent:
        RECENT_DISPATCHED_EMAILS.insert(0, email_entry)
        if len(RECENT_DISPATCHED_EMAILS) > 20:
            RECENT_DISPATCHED_EMAILS = RECENT_DISPATCHED_EMAILS[:20]
    return email_entry


def _dispatch_and_record(
    trigger_action: str,
    to_email: Union[str, List[str]],
    subject: str,
    html_body: str,
    recipients_names: Optional[List[str]] = None,
    actually_send: bool = True,
    attachments: Optional[List[Dict[str, Any]]] = None
) -> dict:
    """Envoie l'e-mail via send_email() si actif, puis consigne son statut RÉEL."""
    should_send = actually_send and not is_email_disabled() and not is_test_mode()
    if should_send:
        res = send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_body,
            attachments=attachments
        )
        real_status = res.get("status", "error") if isinstance(res, dict) else "error"
        email_entry = record_dispatched_email(
            trigger_action=trigger_action,
            subject=subject,
            recipients=to_email,
            html_content=html_body,
            recipients_names=recipients_names,
            status=real_status,
            store_in_recent=True
        )
    else:
        email_entry = record_dispatched_email(
            trigger_action=trigger_action,
            subject=subject,
            recipients=to_email,
            html_content=html_body,
            recipients_names=recipients_names,
            status="simulated",
            store_in_recent=is_test_mode()
        )
        res = {"status": "simulated", "id": email_entry["id"]}

    if isinstance(res, dict):
        res["_email_dispatched"] = email_entry
    return res

def check_firewall(to_email: Union[str, List[str]]) -> Optional[dict]:
    """
    Vérification pare-feu hermétique avant tout envoi ou rendu HTML :
    1. Si le coupe-circuit global est actif, bloque immédiatement 100% des envois.
    2. En mode maintenance (MAINTENANCE_EMAIL_REDIRECT_ONLY), autorise le passage vers
       send_email qui redirige 100% des destinataires vers hellenvillierssci@gmail.com.
    3. Sinon, intercepte immédiatement tout destinataire non autorisé sans appel réseau Resend.
    """
    if is_email_disabled():
        return get_circuit_breaker_response()

    if MAINTENANCE_EMAIL_REDIRECT_ONLY:
        return None

    allowed_whitelist = {r.strip().lower() for r in ALLOWED_RECIPIENTS}
    if isinstance(to_email, str):
        clean = to_email.strip().lower()
        if clean not in allowed_whitelist and not is_henri_test_address(clean):
            log_msg = f"[FIREWALL] Envoi vers {to_email} bloqué (non autorisé par le pare-feu SCI)"
            logger.warning(log_msg)
            print(log_msg)
            return {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    elif isinstance(to_email, (list, tuple, set)):
        has_allowed = any(
            str(r).strip().lower() in allowed_whitelist or is_henri_test_address(str(r))
            for r in to_email
        )
        if not has_allowed:
            for r in to_email:
                log_msg = f"[FIREWALL] Envoi vers {r} bloqué (non autorisé par le pare-feu SCI)"
                logger.warning(log_msg)
                print(log_msg)
            return {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    return None




# ==============================================================================
# HTML STYLING & BASE EMAIL LAYOUT (Domaine d'Hellenvilliers)
# ==============================================================================

def render_email_layout(title: str, preheader: str, content_html: str, action_url: Optional[str] = None, action_label: Optional[str] = None) -> str:
    """
    Renders an elegant, modern, responsive HTML email themed with Domaine d'Hellenvilliers visual identity:
    Forest green accents (#1e3a2f), warm ivory background (#fcfbf9), gold highlights (#b89047),
    and crisp readable typography.
    """
    safe_title = escape_html_text(title)
    safe_preheader = escape_html_text(preheader)
    cta_html = ""
    if action_url and action_label:
        safe_action_label = escape_html_text(action_label)
        cta_html = f"""
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 10px 0;">
            <tr>
                <td align="center" style="border-radius: 6px; background-color: #1e3a2f;">
                    <a href="{action_url}" target="_blank" style="display: inline-block; padding: 14px 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; background: linear-gradient(135deg, #1e3a2f 0%, #2d5a47 100%); border: 1px solid #162c23; letter-spacing: 0.3px;">
                        {safe_action_label} &rarr;
                    </a>
                </td>
            </tr>
        </table>
        """

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{safe_title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f6f2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.6;">
    <div style="display: none; font-size: 1px; color: #f7f6f2; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
        {safe_preheader}
    </div>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f7f6f2; padding: 24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e3dc; box-shadow: 0 4px 16px rgba(30, 58, 47, 0.06);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #1e3a2f; padding: 26px 32px; text-align: left; border-bottom: 3px solid #b89047;">
                            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #d4af37; font-weight: 700; margin-bottom: 4px;">
                                DOMAINE D'HELLENVILLIERS
                            </div>
                            <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: bold; color: #ffffff; margin: 0;">
                                SCI Familiale
                            </div>
                        </td>
                    </tr>
                    <!-- Main Body -->
                    <tr>
                        <td style="padding: 32px 32px 24px 32px;">
                            <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 20px; color: #1e3a2f; margin: 0 0 16px 0; font-weight: bold;">
                                {safe_title}
                            </h1>
                            <div style="font-size: 15px; color: #374151; line-height: 1.65;">
                                {content_html}
                            </div>
                            {cta_html}
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #faf9f6; padding: 20px 32px; border-top: 1px solid #edebe4; font-size: 12px; color: #6b7280; text-align: center; line-height: 1.5;">
                            <div style="font-weight: 600; color: #1e3a2f; margin-bottom: 4px;">
                                SCI Familiale Hellenvilliers &bull; Rosings &amp; Le Presbyt&egrave;re
                            </div>
                            <div>
                                Notification automatique transmise aux associ&eacute;s. Vos pr&eacute;f&eacute;rences de notifications sont r&eacute;glables dans vos
                                <a href="{APP_BASE_URL}/parametres" style="color: #2d5a47; text-decoration: underline; font-weight: 500;">Param&egrave;tres</a>.
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""


# ==============================================================================
# RESEND CLIENT & SENDER LOGIC
# ==============================================================================

def send_email(
    to_email: Union[str, List[str]],
    subject: str,
    html_content: str,
    from_email: Optional[str] = None,
    attachments: Optional[List[Dict[str, Any]]] = None
) -> dict:
    """
    Sends an email using Resend HTTP API client.
    Enforces a strict circuit breaker and hermetic family firewall:
    - If DISABLE_ALL_EMAILS is active, 0 network calls, returns {"status": "disabled", "id": "mock_emergency_off"}.
    - Only ALLOWED_RECIPIENTS ("hellenvillierssci@gmail.com") is permitted if enabled.
    - All other addresses (family members, third parties) are strictly blocked with 0 Resend network calls.
    - Returns {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}.
    """
    # 0. COUPE-CIRCUIT D'URGENCE TOTAL & ABSOLU
    if is_email_disabled():
        return get_circuit_breaker_response()

    # 1. VERROU HERMÉTIQUE & PARE-FEU STRICT DE PROTECTION FAMILIALE
    if isinstance(to_email, (list, tuple, set)):
        incoming_recipients = [str(r).strip() for r in to_email if str(r).strip()]
    else:
        incoming_recipients = [str(to_email).strip()] if str(to_email).strip() else []

    if MAINTENANCE_EMAIL_REDIRECT_ONLY:
        redirected_from = []
        safe_recipients = []
        for r in incoming_recipients:
            if is_henri_test_address(r):
                safe_recipients.append(r)
            else:
                redirected_from.append(r)
                if MAINTENANCE_EMAIL_REDIRECT_TO not in safe_recipients:
                    safe_recipients.append(MAINTENANCE_EMAIL_REDIRECT_TO)
        if redirected_from:
            logger.info(
                f"[MAINTENANCE EMAIL REDIRECT] Destinataires {redirected_from} redirigés vers {MAINTENANCE_EMAIL_REDIRECT_TO}"
            )
            if not subject.startswith("[TEST"):
                subject = f"[TEST -> {', '.join(redirected_from)}] {subject}"
        raw_recipients = safe_recipients
        allowed_whitelist = {r.lower() for r in raw_recipients}
    else:
        allowed_whitelist = {r.strip().lower() for r in ALLOWED_RECIPIENTS}
        allowed = []
        for r in incoming_recipients:
            if r.lower() in allowed_whitelist or is_henri_test_address(r):
                allowed.append(r)
            else:
                log_msg = f"[FIREWALL] Envoi vers {r} bloqué (non autorisé par le pare-feu SCI)"
                logger.warning(log_msg)
                print(log_msg)
        if not allowed:
            return {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
        raw_recipients = allowed

    # 2. MODE TEST HERMÉTIQUE (AUCUN EMAIL PHYSIQUE RESEND SORTANT)
    # Si EMAIL_TEST_MODE est actif (par défaut en dev/test), AUCUN appel réseau n'est effectué.
    # L'email est consigné pour prévisualisation in-app (EmailPreviewModal / cloche).
    if is_test_mode():
        import uuid
        log_msg = f"[EMAIL TEST MODE] Mode test hermétique actif : 0 appel réseau Resend. Email consigné pour preview in-app : '{subject}' vers {raw_recipients}"
        logger.info(log_msg)
        print(log_msg)
        return {
            "status": "simulated",
            "simulated": True,
            "id": f"simulated_test_{uuid.uuid4().hex[:12]}",
            "to": raw_recipients,
            "subject": subject,
            "html": html_content,
            "intercepted": []
        }

    # Normalize final recipients
    seen: Set[str] = set()
    cleaned_final = []
    for r in raw_recipients:
        if r.lower() not in seen and r.lower() in allowed_whitelist:
            seen.add(r.lower())
            cleaned_final.append(r)
    final_recipients: List[str] = cleaned_final

    if not final_recipients:
        msg = "[EMAIL SERVICE] No valid recipients to send to."
        logger.warning(msg)
        return {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}

    api_key = os.environ.get("RESEND_API_KEY", RESEND_API_KEY).strip()
    if not api_key:
        logger.warning("[EMAIL SERVICE] RESEND_API_KEY non configurée. Mode dégradé : email simulé et loggé.")
        return {
            "status": "simulated",
            "simulated": True,
            "to": final_recipients,
            "subject": subject,
            "html": html_content,
            "intercepted": []
        }

    effective_from = from_email or DEFAULT_FROM_EMAIL

    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload: Dict[str, Any] = {
        "from": effective_from,
        "to": final_recipients,
        "subject": subject,
        "html": html_content
    }
    if attachments:
        payload["attachments"] = attachments

    try:
        if httpx is not None:
            with httpx.Client(timeout=15.0) as client:
                resp = client.post(url, headers=headers, json=payload)

                # If domain verification error occurred (403 on unverified domain), fallback cleanly
                if resp.status_code == 403 and "domain" in resp.text.lower():
                    fallback_sender = FALLBACK_FROM_EMAIL if effective_from != FALLBACK_FROM_EMAIL else SANDBOX_FROM_EMAIL
                    if fallback_sender != effective_from:
                        logger.warning(f"[EMAIL SERVICE] Sender '{effective_from}' returned 403 domain error. Retrying with fallback '{fallback_sender}'.")
                        payload["from"] = fallback_sender
                        resp = client.post(url, headers=headers, json=payload)

                if resp.status_code in (200, 201):
                    result = resp.json()
                    if isinstance(result, dict):
                        result["status"] = "sent"
                        result["status_code"] = resp.status_code
                    logger.info(f"[EMAIL SERVICE] Email sent successfully via Resend to {final_recipients}: {result}")
                    return result
                else:
                    logger.error(f"[EMAIL SERVICE] Resend HTTP Error {resp.status_code}: {resp.text}")
                    return {"error": resp.text, "status_code": resp.status_code, "status": "error"}
        else:
            # Fallback direct urllib si httpx non installé
            data_bytes = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=data_bytes, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=10.0) as resp:
                    resp_text = resp.read().decode("utf-8")
                    result = json.loads(resp_text) if resp_text else {}
                    if isinstance(result, dict):
                        result["status"] = "sent"
                        result["status_code"] = 200
                    logger.info(f"[EMAIL SERVICE (urllib)] Email sent successfully via Resend to {final_recipients}: {result}")
                    return result
            except urllib.error.HTTPError as he:
                err_text = he.read().decode("utf-8")
                logger.error(f"[EMAIL SERVICE (urllib)] Resend HTTP Error {he.code}: {err_text}")
                return {"error": err_text, "status_code": he.code, "status": "error"}
    except Exception as e:
        logger.error(f"[EMAIL SERVICE] Network error calling Resend API: {e}")
        return {"error": str(e), "status": "error"}


# ==============================================================================
# 4 EMAIL TEMPLATES (Domaine d'Hellenvilliers)
# ==============================================================================

def send_task_assigned_email(
    to_email: Union[str, List[str]],
    task_title: str,
    domain: str,
    location: str,
    priority: str,
    charge: str,
    task_id: Optional[Union[int, str]] = None,
    assignee_name: Optional[str] = None,
    deadline: Optional[str] = None,
    description: Optional[str] = None,
    actually_send: bool = True
) -> dict:
    """
    Template 1: TÂCHE ASSIGNÉE
    Notifies a member that an estate task has been assigned to them.
    """
    if is_email_disabled():
        return get_circuit_breaker_response()

    priority_colors = {
        "immédiate": ("#fee2e2", "#991b1b", "#dc2626"),
        "immediate": ("#fee2e2", "#991b1b", "#dc2626"),
        "critique": ("#fee2e2", "#991b1b", "#dc2626"),
        "rapide": ("#ffedd5", "#9a3412", "#ea580c"),
        "haute": ("#ffedd5", "#9a3412", "#ea580c"),
        "normale": ("#dbeafe", "#1e40af", "#2563eb"),
        "sans urgence": ("#f3f4f6", "#374151", "#4b5563"),
        "basse": ("#f3f4f6", "#374151", "#4b5563"),
        "planifié": ("#f3f4f6", "#374151", "#4b5563"),
    }
    p_key = (priority or "normale").strip().lower()
    bg_p, text_p, border_p = priority_colors.get(p_key, ("#dbeafe", "#1e40af", "#2563eb"))

    safe_assignee = escape_html_text(assignee_name) if assignee_name else ""
    safe_title = escape_html_text(task_title)
    safe_domain = escape_html_text(domain or "SCI Familiale")
    safe_location = escape_html_text(location or "Domaine d'Hellenvilliers")
    safe_priority = escape_html_text(priority or "Normale")
    safe_charge = escape_html_text(charge or "Non spécifiée")
    safe_description = escape_html_text(description, preserve_newlines=True) if description else ""

    greeting = f"Bonjour {safe_assignee}," if safe_assignee else "Bonjour,"
    action_url = f"{APP_BASE_URL}/taches?task_id={task_id}" if task_id else f"{APP_BASE_URL}/taches"

    location_row = ""
    if safe_location and safe_location.lower() != safe_domain.lower():
        location_row = f"""
            <tr>
                <td style="color: #6b7280;">📍 Lieu :</td>
                <td style="font-weight: 600; color: #1f2937;">{safe_location}</td>
            </tr>"""

    deadline_row = ""
    if deadline and str(deadline).strip():
        deadline_row = f"""
            <tr>
                <td style="color: #6b7280;">📅 Échéance :</td>
                <td style="font-weight: 600; color: #1f2937;">{escape_html_text(format_date_fr(deadline))}</td>
            </tr>"""

    content_html = f"""
    <p>{greeting}</p>
    <p>Une nouvelle tâche vous a été assignée sur le Domaine d'Hellenvilliers :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #1e3a2f; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: #1e3a2f; margin-bottom: 12px;">
            📌 {safe_title}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8;">
            <tr>
                <td style="color: #6b7280; width: 150px;">👤 Assignée à :</td>
                <td style="font-weight: 600; color: #1f2937;">{safe_assignee or 'Non spécifié'}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">🏛️ Domaine / Catégorie :</td>
                <td style="font-weight: 600; color: #1f2937;">{safe_domain}</td>
            </tr>
            {location_row}
            <tr>
                <td style="color: #6b7280;">⏱️ Urgence :</td>
                <td>
                    <span style="display: inline-block; background-color: {bg_p}; color: {text_p}; border: 1px solid {border_p}; padding: 2px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
                        {safe_priority}
                    </span>
                </td>
            </tr>
            <tr>
                <td style="color: #6b7280;">⚖️ Difficulté :</td>
                <td style="font-weight: 600; color: #1f2937;">{safe_charge}</td>
            </tr>
            {deadline_row}
        </table>
        {f'<div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #d1cfc7; color: #4b5563; font-size: 13.5px;"><strong>Description :</strong><br><div style="margin-top: 6px;">{safe_description}</div></div>' if safe_description else ''}
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Vous pouvez consulter les détails, les documents joints, la checklist et échanger avec les autres associés directement depuis votre espace :
    </p>
    """

    subject = f"[SCI Hellenvilliers] 📌 Tâche assignée : {task_title}"
    preheader = f"Une nouvelle mission vous a été confiée : {task_title} ({priority})"
    html_body = render_email_layout(
        title="Nouvelle tâche assignée",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter la tâche sur l'application"
    )

    names = [assignee_name] if assignee_name else []
    return _dispatch_and_record(
        trigger_action="task_assigned",
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        recipients_names=names,
        actually_send=actually_send
    )


def send_task_creation_pending_email(
    to_email: Union[str, List[str]],
    task_title: str,
    created_by: str,
    domain: str = "SCI Familiale",
    location: str = "Domaine d'Hellenvilliers",
    priority: str = "Normale",
    complexity: str = "Modérée",
    task_id: Optional[Union[int, str]] = None,
    coordinator_name: Optional[str] = None,
    description: Optional[str] = None,
    actually_send: bool = True
) -> dict:
    """
    Template: TÂCHE EN ATTENTE DE CRÉATION
    Notifies a coordinator that a new task proposal has been submitted and is pending creation/arbitration.
    """
    priority_colors = {
        "immédiate": ("#fee2e2", "#991b1b", "#dc2626"),
        "immediate": ("#fee2e2", "#991b1b", "#dc2626"),
        "critique": ("#fee2e2", "#991b1b", "#dc2626"),
        "rapide": ("#ffedd5", "#9a3412", "#ea580c"),
        "haute": ("#ffedd5", "#9a3412", "#ea580c"),
        "normale": ("#dbeafe", "#1e40af", "#2563eb"),
        "sans urgence": ("#f3f4f6", "#374151", "#4b5563"),
        "basse": ("#f3f4f6", "#374151", "#4b5563"),
        "planifié": ("#f3f4f6", "#374151", "#4b5563"),
    }
    p_key = (priority or "normale").strip().lower()
    bg_p, text_p, border_p = priority_colors.get(p_key, ("#dbeafe", "#1e40af", "#2563eb"))

    safe_coord = escape_html_text(coordinator_name) if coordinator_name else ""
    safe_title = escape_html_text(task_title)
    safe_creator = escape_html_text(created_by or "un associé")
    safe_domain = escape_html_text(domain or "SCI Familiale")
    safe_location = escape_html_text(location or "Domaine d'Hellenvilliers")
    safe_priority = escape_html_text(priority or "Normale")
    safe_complexity = escape_html_text(complexity or "Modérée")
    safe_description = escape_html_text(description, preserve_newlines=True) if description else ""
    coord_role_label = accord_fr(coordinator_name, "coordinateur", "coordinatrice", "membre de la coordination")

    greeting = f"Bonjour {safe_coord}," if safe_coord else "Bonjour,"
    action_url = f"{APP_BASE_URL}/taches?task_id={task_id}" if task_id else f"{APP_BASE_URL}/taches"

    location_row = ""
    if safe_location and safe_location.lower() != safe_domain.lower():
        location_row = f"""
            <tr>
                <td style="color: #6b7280;">📍 Lieu :</td>
                <td style="font-weight: 600; color: #1f2937;">{safe_location}</td>
            </tr>"""

    content_html = f"""
    <p>{greeting}</p>
    <p>Une nouvelle tâche a été soumise par <strong>{safe_creator}</strong> et est actuellement <strong>en attente de validation</strong> par la coordination :</p>

    <div style="background-color: #fefce8; border: 1px solid #fef08a; border-left: 4px solid #ca8a04; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: #854d0e; margin-bottom: 12px;">
            ⏳ {safe_title}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8;">
            <tr>
                <td style="color: #6b7280; width: 150px;">👤 Proposée par :</td>
                <td style="font-weight: 600; color: #1f2937;">{safe_creator}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">🏛️ Domaine / Catégorie :</td>
                <td style="font-weight: 600; color: #1f2937;">{safe_domain}</td>
            </tr>
            {location_row}
            <tr>
                <td style="color: #6b7280;">⏱️ Urgence :</td>
                <td>
                    <span style="display: inline-block; background-color: {bg_p}; color: {text_p}; border: 1px solid {border_p}; padding: 2px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
                        {safe_priority}
                    </span>
                </td>
            </tr>
            <tr>
                <td style="color: #6b7280;">⚖️ Difficulté :</td>
                <td style="font-weight: 600; color: #1f2937;">{safe_complexity}</td>
            </tr>
        </table>
        {f'<div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e2e8f0; color: #4b5563; font-size: 13.5px;"><strong>Description :</strong><br><div style="margin-top: 6px;">{safe_description}</div></div>' if safe_description else ''}
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        En tant que {coord_role_label}, vous pouvez examiner la proposition, désigner un responsable et lancer sa mise en œuvre :
    </p>
    """

    subject = f"[SCI Hellenvilliers] ⏳ Nouvelle tâche en attente de validation : {task_title}"
    preheader = f"Nouvelle proposition de tâche soumise par {created_by or 'un associé'} : {task_title}"
    html_body = render_email_layout(
        title="Nouvelle tâche en attente de validation",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Examiner et approuver la tâche"
    )

    names = [coordinator_name] if coordinator_name else []
    return _dispatch_and_record(
        trigger_action="task_creation_pending",
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        recipients_names=names,
        actually_send=actually_send
    )


def send_task_completion_pending_email(
    to_email: Union[str, List[str]],
    task_title: str,
    submitted_by: str,
    coordinator_name: Optional[str] = None,
    completion_notes: Optional[str] = None,
    task_id: Optional[Union[int, str]] = None,
    actually_send: bool = True
) -> dict:
    """
    Template: TÂCHE SOUMISE POUR VALIDATION DE CLÔTURE
    Notifies coordinators when an associate submits a task as completed for validation.
    """
    safe_coord = escape_html_text(coordinator_name) if coordinator_name else ""
    safe_title = escape_html_text(task_title)
    safe_submitter = escape_html_text(submitted_by or "un associé")
    safe_notes = escape_html_text(completion_notes, preserve_newlines=True) if completion_notes else ""
    coord_role_label = accord_fr(coordinator_name, "coordinateur", "coordinatrice", "membre de la coordination")

    greeting = f"Bonjour {safe_coord}," if safe_coord else "Bonjour,"
    action_url = f"{APP_BASE_URL}/taches?task_id={task_id}" if task_id else f"{APP_BASE_URL}/taches"

    content_html = f"""
    <p>{greeting}</p>
    <p><strong>{safe_submitter}</strong> a déclaré la tâche suivante comme terminée et demande sa <strong>validation finale</strong> par la coordination :</p>

    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: #166534; margin-bottom: 10px;">
            ✅ {safe_title}
        </div>
        <div style="font-size: 14px; color: #374151;">
            <strong>Soumise pour clôture par :</strong> {safe_submitter}
        </div>
        {f'<div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #bbf7d0; color: #374151; font-size: 13.5px;"><strong>Compte-rendu :</strong><br><div style="margin-top: 6px;">{safe_notes}</div></div>' if safe_notes else ''}
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        En tant que {coord_role_label}, vous pouvez vérifier les justificatifs et valider ou renvoyer cette tâche en révision :
    </p>
    """

    subject = f"[SCI Hellenvilliers] ✅ Tâche terminée à valider : {task_title}"
    preheader = f"{submitted_by or 'Un associé'} demande la validation finale de la tâche : {task_title}"
    html_body = render_email_layout(
        title="Tâche en attente de validation finale",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Vérifier et valider la tâche"
    )

    names = [coordinator_name] if coordinator_name else []
    return _dispatch_and_record(
        trigger_action="task_completion_pending",
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        recipients_names=names,
        actually_send=actually_send
    )


def send_task_taken_over_email(
    to_email: Union[str, List[str]],
    task_title: str,
    taken_over_by: str,
    previous_assignee_name: Optional[str] = None,
    mode: str = "claimed",
    charge_points: Optional[int] = None,
    completion_notes: Optional[str] = None,
    task_id: Optional[Union[int, str]] = None,
    actually_send: bool = True
) -> dict:
    """
    Template: TÂCHE REPRISE / GÉRÉE SUR PLACE PAR UN AUTRE ASSOCIÉ
    Prévient l'associé qui gérait la tâche qu'elle a été reprise en charge ou directement gérée sur place.
    mode: 'claimed' (reprise en cours) | 'completed' (déjà réalisée sur place) | 'finalized' (clôturée/validée)
    """
    if is_email_disabled():
        return get_circuit_breaker_response()

    safe_prev = escape_html_text(previous_assignee_name) if previous_assignee_name else ""
    safe_actor = escape_html_text(taken_over_by or "Un associé")
    safe_title = escape_html_text(task_title)
    safe_notes = escape_html_text(completion_notes, preserve_newlines=True) if completion_notes else ""
    greeting = f"Bonjour {safe_prev}," if safe_prev else "Bonjour,"
    action_url = f"{APP_BASE_URL}/taches?task_id={task_id}" if task_id else f"{APP_BASE_URL}/sejour"
    pts_note = f" ({int(charge_points)} pts transférés)" if charge_points else ""

    if mode == "completed":
        lead_html = f"Bonne nouvelle : <strong>{safe_actor}</strong> s'est directement occupé sur place de la tâche qui vous était confiée et l'a déclarée terminée !"
        box_bg, box_border, box_accent, title_color = "#f0fdf4", "#bbf7d0", "#16a34a", "#166534"
        badge_txt = "✅ Gérée sur place (en attente de validation)"
        subject = f"[SCI Hellenvilliers] ✅ Votre tâche a été gérée sur place : {task_title}"
        email_title = "Tâche gérée sur place à votre place"
        closing_txt = f"Vous n'avez plus rien à faire sur ce point. Les points de la tâche{pts_note} seront crédités à {safe_actor} dès la validation finale."
    elif mode == "finalized":
        lead_html = f"La tâche reprise sur place par <strong>{safe_actor}</strong> vient d'être validée et clôturée par la coordination."
        box_bg, box_border, box_accent, title_color = "#f0fdf4", "#bbf7d0", "#059669", "#065f46"
        badge_txt = "✅ Réalisée et clôturée"
        subject = f"[SCI Hellenvilliers] ✅ Tâche reprise et clôturée : {task_title}"
        email_title = "Tâche gérée et clôturée"
        closing_txt = "Le sujet est désormais officiellement réglé."
    else:
        lead_html = f"Bonne nouvelle : <strong>{safe_actor}</strong> a repris votre tâche sur place pour s'en occuper pendant son séjour au domaine !"
        box_bg, box_border, box_accent, title_color = "#ecfdf5", "#a7f3d0", "#047857", "#065f46"
        badge_txt = "🤝 Reprise sur place"
        subject = f"[SCI Hellenvilliers] 🤝 Tâche reprise sur place par {taken_over_by} : {task_title}"
        email_title = "Votre tâche a été reprise sur place"
        closing_txt = f"Vous êtes déchargé{accord_fr(previous_assignee_name, '', 'e')} de cette mission. Les points de la tâche{pts_note} reviendront à {safe_actor} lorsqu'elle sera terminée."

    content_html = f"""
    <p>{greeting}</p>
    <p>{lead_html}</p>

    <div style="background-color: {box_bg}; border: 1px solid {box_border}; border-left: 4px solid {box_accent}; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: {title_color}; margin-bottom: 10px;">
            {safe_title}
        </div>
        <div style="font-size: 13.5px; color: #374151; margin-bottom: 6px;">
            <strong>Statut :</strong> {badge_txt}
        </div>
        <div style="font-size: 13.5px; color: #374151;">
            <strong>Prise en charge par :</strong> {safe_actor}
        </div>
        {f'<div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed {box_border}; color: #374151; font-size: 13.5px;"><strong>Note laissée sur place :</strong><br><div style="margin-top: 6px;">{safe_notes}</div></div>' if safe_notes else ''}
    </div>

    <p style="color: #4b5563; font-size: 14px;">{closing_txt}</p>
    """

    html_body = render_email_layout(
        title=email_title,
        preheader=f"{taken_over_by} s'est occupé de « {task_title} » sur place.",
        content_html=content_html,
        action_url=action_url,
        action_label="Voir la tâche sur le portail"
    )

    names = [previous_assignee_name] if previous_assignee_name else []
    return _dispatch_and_record(
        trigger_action=f"task_taken_over_{mode}",
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        recipients_names=names,
        actually_send=actually_send
    )


def send_vote_required_email(
    to_email: Union[str, List[str]],
    vote_title: str,
    estimated_cost: Optional[float] = None,
    deadline: Optional[str] = None,
    project_id: Optional[Union[int, str]] = None,
    submitted_by: Optional[str] = None,
    description: Optional[str] = None
) -> dict:
    """
    Template 2: VOTE REQUIS
    Notifies members that a formal decision/vote requires their ballot.
    """
    if is_email_disabled():
        return get_circuit_breaker_response()

    action_url = f"{APP_BASE_URL}/taches?project_id={project_id}" if project_id else f"{APP_BASE_URL}/taches"
    safe_title = escape_html_text(vote_title)
    safe_submitter = escape_html_text(submitted_by or "Un associé")
    safe_description = escape_html_text(description, preserve_newlines=True) if description else ""

    content_html = f"""
    <p>Bonjour,</p>
    <p>Un nouveau scrutin requiert le vote formel de tous les associés de la SCI Familiale :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #b89047; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: #1e3a2f; margin-bottom: 12px;">
            🗳️ {safe_title}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8;">
            <tr>
                <td style="color: #6b7280; width: 140px;">👤 Proposé par :</td>
                <td style="font-weight: 600; color: #1f2937;">{safe_submitter}</td>
            </tr>
        </table>
        {f'<div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #d1cfc7; color: #374151; font-size: 14px; line-height: 1.6;"><strong>Description du scrutin :</strong><br><div style="margin-top: 6px;">{safe_description}</div></div>' if safe_description else ''}
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Votre avis et votre vote sont attendus afin de statuer collectivement sur cette décision patrimoniale.
    </p>
    """

    subject = f"[SCI Hellenvilliers] 🗳️ Vote requis : {vote_title}"
    preheader = f"Scrutin ouvert : votre avis est attendu sur {vote_title}"
    html_body = render_email_layout(
        title="Scrutin ouvert : votre vote est requis",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Exprimer mon vote"
    )

    names = ["Tous les associés"] if (isinstance(to_email, (list, tuple, set)) and len(to_email) >= 5) else None
    return _dispatch_and_record(
        trigger_action="vote_required",
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        recipients_names=names,
        actually_send=True
    )


def send_vote_creation_pending_email(
    to_email: Union[str, List[str]],
    vote_title: str,
    submitted_by: Optional[str] = None,
    coordinator_name: Optional[str] = None,
    description: Optional[str] = None,
    project_id: Optional[Union[int, str]] = None,
    actually_send: bool = True
) -> dict:
    """
    Template: SCRUTIN EN ATTENTE D'ARBITRAGE DE CRÉATION
    Notifies a coordinator that a new vote has been proposed in PROPOSED status and awaits arbitration to open.
    """
    safe_coord = escape_html_text(coordinator_name) if coordinator_name else ""
    safe_title = escape_html_text(vote_title)
    safe_submitter = escape_html_text(submitted_by or "un associé")
    safe_description = escape_html_text(description, preserve_newlines=True) if description else ""
    coord_role_label = accord_fr(coordinator_name, "coordinateur", "coordinatrice", "membre de la coordination")

    greeting = f"Bonjour {safe_coord}," if safe_coord else "Bonjour,"
    action_url = f"{APP_BASE_URL}/taches?project_id={project_id}" if project_id else f"{APP_BASE_URL}/taches"

    content_html = f"""
    <p>{greeting}</p>
    <p>Un nouveau scrutin a été soumis par <strong>{safe_submitter}</strong> et est actuellement <strong>en attente d'arbitrage</strong> par la coordination :</p>

    <div style="background-color: #fefce8; border: 1px solid #fef08a; border-left: 4px solid #ca8a04; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: #854d0e; margin-bottom: 12px;">
            ⏳ {safe_title}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8;">
            <tr>
                <td style="color: #6b7280; width: 140px;">👤 Proposé par :</td>
                <td style="font-weight: 600; color: #1f2937;">{safe_submitter}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">📋 Statut :</td>
                <td style="font-weight: 600; color: #ca8a04;">En attente d'arbitrage (Proposition)</td>
            </tr>
        </table>
        {f'<div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e2e8f0; color: #4b5563; font-size: 13.5px;"><strong>Description complète :</strong><br><div style="margin-top: 6px;">{safe_description}</div></div>' if safe_description else ''}
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        En tant que {coord_role_label}, vous pouvez examiner la proposition, ajuster les options de vote si nécessaire et ouvrir officiellement le scrutin à l'ensemble des associés :
    </p>
    """

    subject = f"[SCI Hellenvilliers] 🗳️ Nouveau scrutin en attente d'arbitrage : {vote_title}"
    preheader = f"Une nouvelle proposition de scrutin a été soumise : {vote_title}"
    html_body = render_email_layout(
        title="Nouveau scrutin en attente d'arbitrage",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Examiner et ouvrir le scrutin"
    )

    names = [coordinator_name] if coordinator_name else []
    return _dispatch_and_record(
        trigger_action="vote_creation_pending",
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        recipients_names=names,
        actually_send=actually_send
    )


def send_vote_arbitration_email(
    to_email: Union[str, List[str]],
    vote_title: str,
    decision: str,
    votes_summary: Union[dict, str],
    coordinator_name: Optional[str] = None,
    project_id: Optional[Union[int, str]] = None,
    description: Optional[str] = None,
    actually_send: bool = True
) -> dict:
    """
    Template: SCRUTIN EN ATTENTE D'ARBITRAGE D'ARCHIVAGE
    Notifies coordinators when a vote reaches quorum (7/7) or REPORT_AG and is in PENDING_VALIDATION / REPORT_AG.
    """
    safe_coord = escape_html_text(coordinator_name) if coordinator_name else ""
    safe_title = escape_html_text(vote_title)
    safe_decision = escape_html_text(decision)
    coord_role_label = accord_fr(coordinator_name, "coordinateur", "coordinatrice", "membre de la coordination")

    greeting = f"Bonjour {safe_coord}," if safe_coord else "Bonjour,"
    action_url = f"{APP_BASE_URL}/taches?project_id={project_id}" if project_id else f"{APP_BASE_URL}/taches"

    if isinstance(votes_summary, dict):
        std_keys = {"pour", "oui", "contre", "non", "abstention", "report_prochaine_ag", "report_ag"}
        custom_items = [(k, v) for k, v in votes_summary.items() if str(k).lower() not in std_keys and v]
        parts = [
            f"Pour : {votes_summary.get('pour', 0) + votes_summary.get('oui', 0)}",
            f"Contre : {votes_summary.get('contre', 0) + votes_summary.get('non', 0)}",
            f"Abstention : {votes_summary.get('abstention', 0)}",
            f"Report AG : {votes_summary.get('report_prochaine_ag', 0) + votes_summary.get('report_ag', 0)}",
        ]
        for k, v in custom_items:
            parts.append(f"{k} : {v}")
        summary_text = " | ".join(parts)
    else:
        summary_text = str(votes_summary or "")

    safe_summary = escape_html_text(summary_text)
    safe_description = escape_html_text(description, preserve_newlines=True) if description else ""

    content_html = f"""
    <p>{greeting}</p>
    <p>Le scrutin <strong>« {safe_title} »</strong> vient d'atteindre le quorum complet (ou fait l'objet d'une demande de report en AG) et est désormais <strong>en attente d'arbitrage et d'archivage</strong> par la coordination :</p>

    <div style="background-color: #faf5ff; border: 1px solid #e9d5ff; border-left: 4px solid #9333ea; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: #581c87; margin-bottom: 12px;">
            ⚖️ {safe_title}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8;">
            <tr>
                <td style="color: #6b7280; width: 150px;">📊 Statut provisoire :</td>
                <td style="font-weight: 700; color: #581c87;">{safe_decision}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">🗳️ Synthèse des voix :</td>
                <td style="font-weight: 600; color: #1f2937;">{safe_summary}</td>
            </tr>
        </table>
        {f'<div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e9d5ff; color: #4b5563; font-size: 13.5px;"><strong>Description du scrutin :</strong><br><div style="margin-top: 6px;">{safe_description}</div></div>' if safe_description else ''}
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        En tant que {coord_role_label}, il vous appartient d'arbitrer formellement ce scrutin afin de valider son archivage définitif ou de demander un nouvel examen :
    </p>
    """

    subject = f"[SCI Hellenvilliers] ⚖️ Scrutin en attente d'arbitrage : {vote_title}"
    preheader = f"Arbitrage requis sur {vote_title} ({decision})"
    html_body = render_email_layout(
        title="Scrutin en attente d'arbitrage",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Arbitrer et archiver le scrutin"
    )

    names = [coordinator_name] if coordinator_name else []
    return _dispatch_and_record(
        trigger_action="vote_arbitration_pending",
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        recipients_names=names,
        actually_send=actually_send
    )


def send_vote_closed_email(
    to_email: Union[str, List[str]],
    vote_title: str,
    decision: str,
    votes_summary: Union[Dict[str, int], str],
    total_votes: int = 7,
    project_id: Optional[Union[int, str]] = None,
    estimated_cost: Optional[float] = None
) -> dict:
    """
    Template 3: DÉCISION FINALE DE VOTE
    Notifies all members of the final archived decision of a vote.
    """
    dec_norm = unicodedata.normalize("NFKD", str(decision or "")).encode("ASCII", "ignore").decode("utf-8").lower()
    if "adopt" in dec_norm or "approuv" in dec_norm or "valid" in dec_norm:
        badge_bg, badge_text, badge_border = "#dcfce7", "#166534", "#22c55e"
        status_label = "✅ ADOPTÉ"
    elif "report" in dec_norm:
        badge_bg, badge_text, badge_border = "#fef3c7", "#92400e", "#f59e0b"
        status_label = "⚠️ REPORTÉ PROCHAINE AG"
    elif "rejet" in dec_norm or "refus" in dec_norm:
        badge_bg, badge_text, badge_border = "#fee2e2", "#991b1b", "#ef4444"
        status_label = "❌ REJETÉ"
    elif "egalit" in dec_norm:
        badge_bg, badge_text, badge_border = "#e0e7ff", "#3730a3", "#6366f1"
        status_label = "⚖️ ÉGALITÉ — ARCHIVÉ"
    else:
        badge_bg, badge_text, badge_border = "#f1f5f9", "#334155", "#94a3b8"
        status_label = "📋 ARCHIVÉ"

    safe_title = escape_html_text(vote_title)
    votes_word = "vote exprimé" if total_votes == 1 else "votes exprimés"

    if isinstance(votes_summary, dict):
        pour_cnt = int(votes_summary.get("pour", 0) or 0) + int(votes_summary.get("oui", 0) or 0)
        contre_cnt = int(votes_summary.get("contre", 0) or 0) + int(votes_summary.get("non", 0) or 0)
        abst_cnt = int(votes_summary.get("abstention", 0) or 0)
        report_cnt = int(votes_summary.get("report_prochaine_ag", 0) or 0) + int(votes_summary.get("report_ag", 0) or 0)
        std_keys = {"pour", "oui", "contre", "non", "abstention", "report_prochaine_ag", "report_ag"}
        custom_options = [(k, v) for k, v in votes_summary.items() if str(k).lower() not in std_keys and v]

        if custom_options:
            option_rows = "".join(
                f'<tr><td style="padding: 4px 0; color: #374151;">• {escape_html_text(opt_name)}</td><td style="padding: 4px 0; text-align: right; font-weight: bold; color: #1e3a2f;">{int(cnt)}</td></tr>'
                for opt_name, cnt in custom_options
            )
            if abst_cnt:
                option_rows += f'<tr><td style="padding: 4px 0; color: #6b7280;">⚪ Abstention / Blanc</td><td style="padding: 4px 0; text-align: right; font-weight: bold;">{abst_cnt}</td></tr>'
            if report_cnt:
                option_rows += f'<tr><td style="padding: 4px 0; color: #92400e;">🟡 Report AG</td><td style="padding: 4px 0; text-align: right; font-weight: bold;">{report_cnt}</td></tr>'
            tally_html = f'<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px;">{option_rows}</table>'
        else:
            tally_html = f"""
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px;">
                <tr>
                    <td style="padding: 3px 0;">🟢 Pour : <strong>{pour_cnt}</strong></td>
                    <td style="padding: 3px 0;">🔴 Contre : <strong>{contre_cnt}</strong></td>
                    <td style="padding: 3px 0;">⚪ Abstention : <strong>{abst_cnt}</strong></td>
                    <td style="padding: 3px 0;">🟡 Report AG : <strong>{report_cnt}</strong></td>
                </tr>
            </table>"""
        preheader_detail = f"({pour_cnt} Pour / {contre_cnt} Contre)" if not custom_options else f"({total_votes} {votes_word})"
    else:
        safe_raw_summary = escape_html_text(str(votes_summary or "Résultats archivés"))
        tally_html = f'<div style="font-size: 14px; color: #1f2937; font-weight: 600;">{safe_raw_summary}</div>'
        preheader_detail = f"({votes_summary})" if votes_summary else ""

    cost_row = ""
    if estimated_cost and estimated_cost > 0:
        cost_row = f"""
        <tr>
            <td style="color: #6b7280;">💶 Montant engagé :</td>
            <td style="font-weight: 700; color: #1e3a2f;">{format_eur_fr(estimated_cost)}</td>
        </tr>
        """

    action_url = f"{APP_BASE_URL}/taches?project_id={project_id}" if project_id else f"{APP_BASE_URL}/taches"

    content_html = f"""
    <p>Bonjour,</p>
    <p>Le scrutin concernant le projet ci-dessous est désormais clos et archivé :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-radius: 6px; padding: 20px; margin: 20px 0;">
        <div style="font-size: 18px; font-weight: bold; color: #1e3a2f; margin-bottom: 12px;">
            {safe_title}
        </div>

        <div style="margin-bottom: 16px;">
            <span style="display: inline-block; background-color: {badge_bg}; color: {badge_text}; border: 1px solid {badge_border}; padding: 6px 16px; border-radius: 9999px; font-size: 14px; font-weight: bold; text-transform: uppercase;">
                {status_label}
            </span>
        </div>

        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8; margin-top: 10px;">
            <tr>
                <td style="color: #6b7280; width: 140px;">📊 Participation :</td>
                <td style="font-weight: 600; color: #1f2937;">{total_votes} {votes_word} sur 7 associés</td>
            </tr>
            {cost_row}
        </table>

        <div style="background-color: #ffffff; border: 1px solid #e5e3dc; border-radius: 6px; padding: 12px 16px; margin-top: 14px;">
            <div style="font-size: 13px; font-weight: bold; color: #4b5563; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                Dépouillement des suffrages :
            </div>
            {tally_html}
        </div>
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Le résultat complet ainsi que les éventuelles réserves et commentaires d'associés sont archivés sur l'application.
    </p>
    """

    subject = f"[SCI Hellenvilliers] ⚖️ Résultat du scrutin : {vote_title} ({status_label})"
    preheader = f"Décision finale : {vote_title} — {status_label} {preheader_detail}".strip()
    html_body = render_email_layout(
        title="Décision finale du scrutin",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter les détails du scrutin"
    )

    return _dispatch_and_record(
        trigger_action="vote_closed",
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        recipients_names=["Tous les associés"],
        actually_send=True
    )


def send_stay_booked_email(
    to_email: Union[str, List[str]],
    member_name: str,
    start_date: str,
    end_date: str,
    property_name: str,
    rooms: Optional[Union[List[str], str]] = None,
    guest_count: Optional[int] = 1,
    reservation_id: Optional[Union[int, str]] = None,
    notes: Optional[str] = None
) -> dict:
    """
    Template 4: NOUVEAU SÉJOUR RÉSERVÉ
    Notifies family members when an associate books a stay at the estate.
    """
    rooms_display = ""
    if rooms:
        if isinstance(rooms, str):
            try:
                parsed = json.loads(rooms)
                if isinstance(parsed, list):
                    rooms = parsed
            except Exception:
                pass
        if isinstance(rooms, list):
            rooms_display = ", ".join(str(r) for r in rooms if r)
        else:
            rooms_display = str(rooms)

    start_fr = format_date_fr(start_date)
    end_fr = format_date_fr(end_date)
    cnt = int(guest_count or 1)
    occupants_label = f"{cnt} occupant" if cnt <= 1 else f"{cnt} occupants"
    a_demeure = format_a_demeure(property_name)

    safe_member = escape_html_text(member_name)
    safe_prop = escape_html_text(property_name or "Domaine d'Hellenvilliers")
    safe_rooms = escape_html_text(rooms_display)
    safe_notes = escape_html_text(notes, preserve_newlines=True) if notes else ""

    action_url = f"{APP_BASE_URL}/calendrier"

    content_html = f"""
    <p>Bonjour,</p>
    <p>Un nouveau séjour vient d'être planifié {escape_html_text(a_demeure)} :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #2d5a47; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: #1e3a2f; margin-bottom: 12px;">
            🏡 Séjour de {safe_member}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8;">
            <tr>
                <td style="color: #6b7280; width: 140px;">🏛️ Demeure :</td>
                <td style="font-weight: 700; color: #1e3a2f;">{safe_prop}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">📅 Dates :</td>
                <td style="font-weight: 600; color: #1f2937;">Du <strong>{escape_html_text(start_fr)}</strong> au <strong>{escape_html_text(end_fr)}</strong></td>
            </tr>
            <tr>
                <td style="color: #6b7280;">👥 Personnes :</td>
                <td style="font-weight: 600; color: #1f2937;">{occupants_label}</td>
            </tr>
            {f'<tr><td style="color: #6b7280;">🛏️ Chambres :</td><td style="font-weight: 600; color: #1f2937;">{safe_rooms}</td></tr>' if safe_rooms else ''}
        </table>
        {f'<div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #d1cfc7; font-style: italic; color: #4b5563; font-size: 13.5px;">Remarques : {safe_notes}</div>' if safe_notes else ''}
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Retrouvez le calendrier partagé, les présences croisées et les consignes du vademecum sur l'espace séjours :
    </p>
    """

    subject = f"[SCI Hellenvilliers] 🏡 Nouveau séjour réservé : {member_name} ({start_fr} → {end_fr})"
    preheader = f"{member_name} a réservé {a_demeure} du {start_fr} au {end_fr}"
    html_body = render_email_layout(
        title="Nouveau séjour planifié",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter le calendrier des séjours"
    )

    return _dispatch_and_record(
        trigger_action="stay_booked",
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        recipients_names=["Famille Hellenvilliers"],
        actually_send=True
    )


def send_password_reset_email(
    to_email: Union[str, List[str]],
    member_name: str,
    new_temporary_password: str
) -> dict:
    """
    Template: RÉINITIALISATION DE MOT DE PASSE
    Envoie un mot de passe temporaire hautement sécurisé à un associé du Domaine d'Hellenvilliers.
    """
    blocked = check_firewall(to_email)
    if blocked:
        return blocked
    safe_member = escape_html_text(member_name) if member_name else ""
    safe_pwd = escape_html_text(new_temporary_password)
    greeting = f"Bonjour {safe_member}," if safe_member else "Bonjour,"
    action_url = f"{APP_BASE_URL}/"

    content_html = f"""
    <p>{greeting}</p>
    <p>Une réinitialisation de votre mot de passe d'accès au portail de la <strong>SCI Familiale Hellenvilliers</strong> vient d'être effectuée.</p>

    <p>Voici votre nouveau mot de passe temporaire pour vous connecter :</p>

    <div style="background-color: #faf9f6; border: 1px solid #e5e3dc; border-left: 4px solid #1e3a2f; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; font-weight: 600; margin-bottom: 10px;">
            Nouveau mot de passe temporaire
        </div>
        <div style="font-family: monospace; letter-spacing: 2px; font-size: 18px; font-weight: bold; background: #fff; padding: 12px; border: 1px dashed #b89047; text-align: center; color: #1e3a2f;">
            {safe_pwd}
        </div>
    </div>

    <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-top: 16px;">
        🔒 <strong>Conseil de sécurité :</strong> Pour des raisons de confidentialité, nous vous recommandons vivement de modifier ce mot de passe dès votre première connexion en vous rendant dans l'onglet <strong>Paramètres</strong> du portail.
    </p>

    <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin-top: 12px;">
        Votre ancien mot de passe a été remplacé par ce mot de passe temporaire. Si vous n'êtes pas à l'origine de cette demande, connectez-vous immédiatement pour définir un nouveau mot de passe et prévenez le gérant de la SCI.
    </p>
    """

    subject = "[SCI Hellenvilliers] 🔒 Réinitialisation de votre mot de passe"
    preheader = "Votre nouveau mot de passe temporaire pour accéder au Domaine d'Hellenvilliers"
    html_body = render_email_layout(
        title="Réinitialisation de mot de passe",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Se connecter au portail"
    )

    return send_email(to_email=to_email, subject=subject, html_content=html_body)


# ==============================================================================
# BACKWARD COMPATIBILITY HELPERS
# ==============================================================================

def notify_coordinator_new_issue(
    issue_title: str,
    created_by: str,
    description: str,
    category: str = "SIGNALEMENT",
    priority: str = "Moyenne",
    coordinator_email: str = "hellenvillierssci@gmail.com"
) -> dict:
    """Legacy helper for issue notification to coordinator."""
    return send_task_assigned_email(
        to_email=coordinator_email,
        task_title=issue_title,
        domain=category,
        location="Domaine d'Hellenvilliers",
        priority=priority,
        charge="À évaluer",
        assignee_name="Henri"
    )


def notify_all_members_project_vote(
    project_title: str,
    submitted_by: str,
    description: str,
    estimated_cost: float = 0.0,
    project_id: Optional[int] = None,
    member_emails: Optional[List[str]] = None
) -> dict:
    """Legacy helper for project vote notification."""
    recipients = member_emails or DEFAULT_MEMBER_EMAILS
    return send_vote_required_email(
        to_email=recipients,
        vote_title=project_title,
        estimated_cost=estimated_cost,
        project_id=project_id,
        submitted_by=submitted_by,
        description=description
    )


def send_thermal_change_email(
    target_emails: Union[str, List[str]],
    author_name: str,
    equipment_type: str,
    details: str
) -> dict:
    """
    Template 5: MODIFICATION DES CONSIGNES THERMIQUES (Chauffage ViCare & Piscine Klereo)
    Notifies subscribed members when heating or pool settings are adjusted.
    """
    safe_author = escape_html_text(author_name or "Système")
    safe_equip = escape_html_text(equipment_type)
    safe_details = escape_html_text(details, preserve_newlines=True)

    subject = f"[SCI Hellenvilliers] 🌡️ Consignes thermiques — {equipment_type}"
    preheader = f"Consignes modifiées par {author_name} pour {equipment_type} : {details}"
    action_url = f"{APP_BASE_URL}/sejour"

    content_html = f"""
    <p>Bonjour,</p>
    <p>Une modification des consignes thermiques a été enregistrée par <strong>{safe_author}</strong> :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-radius: 6px; padding: 20px; margin: 20px 0;">
        <div style="font-size: 16px; font-weight: bold; color: #1e3a2f; margin-bottom: 8px;">
            {safe_equip}
        </div>
        <div style="font-size: 14px; color: #1f2937; margin-bottom: 12px; line-height: 1.6;">
            <strong>Détails de la modification :</strong> {safe_details}
        </div>
        <div style="font-size: 12px; color: #6b7280; line-height: 1.5; border-top: 1px dashed #e5e3dc; padding-top: 10px; margin-top: 10px;">
            Cette modification a été validée et enregistrée. Tous les associés ayant activé l'option de notification thermique reçoivent cet avis pour le suivi et la maîtrise énergétique du domaine.
        </div>
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Vous pouvez consulter le tableau de bord et les télémesures en direct sur l'espace Séjour de l'application.
    </p>
    """

    html_body = render_email_layout(
        title=f"Consignes thermiques — {equipment_type}",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter l'espace Séjour & Énergie"
    )

    return _dispatch_and_record(
        trigger_action="thermal_change",
        to_email=target_emails,
        subject=subject,
        html_body=html_body,
        recipients_names=["Associés abonnés énergie"],
        actually_send=True
    )


def send_notification_email(
    to_email: Union[str, List[str]],
    subject: str,
    content_html: str,
    title: str = "Notification Domaine d'Hellenvilliers"
) -> dict:
    """Helper générique d'envoi de notification."""
    if is_email_disabled() or is_test_mode():
        return get_circuit_breaker_response()
    blocked = check_firewall(to_email)
    if blocked:
        return blocked
    layout_html = render_email_layout(title=title, preheader=subject, content_html=content_html)
    return send_email(to_email=to_email, subject=subject, html_content=layout_html)


def send_welcome_email(to_email: str, member_name: str) -> dict:
    """Envoi d'un email de bienvenue / accès portail."""
    if is_email_disabled() or is_test_mode():
        return get_circuit_breaker_response()
    safe_member = escape_html_text(member_name)
    return send_notification_email(
        to_email=to_email,
        subject="[SCI Hellenvilliers] Bienvenue sur votre espace associé",
        content_html=f"<p>Bonjour {safe_member},</p><p>Votre accès au portail de la SCI d'Hellenvilliers est prêt.</p>",
        title="Bienvenue sur le portail"
    )


def send_reservation_confirmation(
    to_email: Union[str, List[str]],
    member_name: str,
    start_date: str,
    end_date: str,
    property_name: str
) -> dict:
    """Alias pour la confirmation de séjour."""
    if is_email_disabled() or is_test_mode():
        return get_circuit_breaker_response()
    return send_stay_booked_email(
        to_email=to_email,
        member_name=member_name,
        start_date=start_date,
        end_date=end_date,
        property_name=property_name
    )


def send_mention_notification(
    mentioned_member: Any,
    author_name: str,
    context_title: str,
    message_text: str,
    target_url: str,
    is_collective: bool = False,
    actually_send: bool = True
) -> bool:
    """
    Template 6: MENTION DANS UNE DISCUSSION (@membre ou @all)
    Notifies a mentioned member by email when they are @tagged in a chat (tasks, projects/votes, issues).
    Returns True if sent/simulated/dispatched successfully, False otherwise.
    """
    if not mentioned_member:
        return False

    member_name = getattr(mentioned_member, "name", "") or ""
    member_prenom = getattr(mentioned_member, "prenom", "") or member_name
    to_email = getattr(mentioned_member, "email", None)

    # 1. Garde-fou Anti-auto-mention (uniquement mentions directes individuelles, jamais @all)
    author_clean = (author_name or "").strip().lower()
    name_clean = member_name.strip().lower()
    prenom_clean = member_prenom.strip().lower()

    if not is_collective and author_clean and (
        author_clean == name_clean
        or author_clean == prenom_clean
        or (len(author_clean) >= 3 and (author_clean in name_clean or name_clean in author_clean))
        or (len(prenom_clean) >= 3 and (prenom_clean in author_clean or author_clean in prenom_clean))
    ):
        logger.info(f"[MENTION] Anti-auto-mention ignorée : '{author_name}' s'est mentionné ({member_name}). Aucun email.")
        return False

    # 2. Préférence d'envoi d'e-mail physique du membre (directe ou collective @all)
    pref_enabled = getattr(mentioned_member, "notify_mention_all", True) if is_collective else getattr(mentioned_member, "notify_mentions", True)
    if not pref_enabled:
        logger.info(f"[MENTION] Envoi e-mail physique désactivé par préférence pour {member_name} (is_collective={is_collective}). L'e-mail reste simulé pour la cloche.")
        actually_send = False

    # 3. Construction du message HTML selon la charte de la SCI Hellenvilliers
    safe_message = escape_html_text(message_text, preserve_newlines=True)
    safe_author = escape_html_text(author_name or "Un associé")
    safe_title = escape_html_text(context_title or "Discussion")

    greeting_raw = member_prenom or member_name or ""
    safe_greeting = escape_html_text(greeting_raw) if greeting_raw else ""
    greeting_line = f"Bonjour {safe_greeting}," if safe_greeting else "Bonjour,"
    mentionne_word = accord_fr(greeting_raw, "mentionné", "mentionnée", "mentionné(e)")

    if is_collective:
        subject = f'[SCI Hellenvilliers] 📢 {author_name} a mentionné tous les associés dans « {context_title} »'
        preheader = f"{author_name} a adressé un message à tous les associés dans {context_title}"
        email_title = "Mention collective dans une discussion"
        intro_text = f"<strong>{safe_author}</strong> a adressé un message à <strong>l'ensemble des associés (@all)</strong> dans la discussion de <strong>{safe_title}</strong> :"
    else:
        subject = f'[SCI Hellenvilliers] 💬 {author_name} vous a {mentionne_word} dans « {context_title} »'
        preheader = f"{author_name} vous a {mentionne_word} dans la discussion de {context_title}"
        email_title = "Mention dans une discussion"
        intro_text = f"<strong>{safe_author}</strong> vous a {mentionne_word} dans la discussion de <strong>{safe_title}</strong> :"

    content_html = f"""
    <p>{greeting_line}</p>
    <p>{intro_text}</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #1e3a2f; border-radius: 6px; padding: 16px 20px; margin: 20px 0; font-style: italic; color: #1f2937; font-size: 15px; line-height: 1.6;">
        « {safe_message} »
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Vous pouvez accéder directement à la discussion pour prendre connaissance de l'échange et y répondre :
    </p>
    """

    effective_target_url = target_url or f"{APP_BASE_URL}/taches"
    html_body = render_email_layout(
        title=email_title,
        preheader=preheader,
        content_html=content_html,
        action_url=effective_target_url,
        action_label="Accéder à la discussion"
    )

    can_physically_send = bool(actually_send and pref_enabled and to_email and "@" in str(to_email))
    res = _dispatch_and_record(
        trigger_action="mention_all" if is_collective else "mention",
        to_email=to_email or "famille@sci-familiale.fr",
        subject=subject,
        html_body=html_body,
        recipients_names=[greeting_raw or "Associé"],
        actually_send=can_physically_send
    )
    email_entry = res.get("_email_dispatched") if isinstance(res, dict) else None
    setattr(send_mention_notification, "last_dispatched_email", email_entry)

    if not pref_enabled:
        return False

    if not can_physically_send or is_email_disabled():
        return True

    if isinstance(res, dict) and (res.get("error") or res.get("status") == "error"):
        logger.error(f"[MENTION] Échec de l'envoi de l'e-mail Resend à {to_email} : {res}")
        return False

    return True


def send_task_chat_activity_email(
    to_email: str,
    recipient_name: str,
    author_name: str,
    task_title: str,
    message_text: str,
    task_id: Any,
    actually_send: bool = True
) -> dict:
    """
    Template: NOUVEAU MESSAGE SUR UNE TÂCHE CRÉÉE / PROPOSÉE (notif_task_chat_activity)
    Notifies the creator of a task when another member posts a comment.
    """
    safe_message = escape_html_text(message_text, preserve_newlines=True)
    safe_author = escape_html_text(author_name or "Un associé")
    safe_title = escape_html_text(task_title or "Tâche")
    safe_recipient = escape_html_text(recipient_name) if recipient_name else ""
    greeting_line = f"Bonjour {safe_recipient}," if safe_recipient else "Bonjour,"

    subject = f"[SCI Hellenvilliers] 💬 Nouveau message sur votre tâche : {task_title}"
    preheader = f"{author_name} a publié un message sur votre tâche {task_title}"
    action_url = f"{APP_BASE_URL}/taches?task_id={task_id}" if task_id else f"{APP_BASE_URL}/taches"

    content_html = f"""
    <p>{greeting_line}</p>
    <p><strong>{safe_author}</strong> a publié un nouveau message sur une tâche que vous avez créée ou proposée (<strong>{safe_title}</strong>) :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #1e3a2f; border-radius: 6px; padding: 16px 20px; margin: 20px 0; font-style: italic; color: #1f2937; font-size: 15px; line-height: 1.6;">
        « {safe_message} »
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Vous pouvez accéder directement à la tâche pour lire l'échange et y répondre :
    </p>
    """

    html_body = render_email_layout(
        title="Nouveau message sur votre tâche",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter la tâche"
    )

    return _dispatch_and_record(
        trigger_action="task_chat_activity",
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        recipients_names=[recipient_name] if recipient_name else None,
        actually_send=actually_send
    )


def send_vote_chat_activity_email(
    to_email: str,
    recipient_name: str,
    author_name: str,
    vote_title: str,
    message_text: str,
    project_id: Any,
    actually_send: bool = True
) -> dict:
    """
    Template: NOUVEAU MESSAGE SUR UN VOTE / SCRUTIN PROPOSÉ (notif_vote_chat_activity)
    Notifies the creator of a vote/proposal when another member posts a comment.
    """
    safe_message = escape_html_text(message_text, preserve_newlines=True)
    safe_author = escape_html_text(author_name or "Un associé")
    safe_title = escape_html_text(vote_title or "Scrutin")
    safe_recipient = escape_html_text(recipient_name) if recipient_name else ""
    greeting_line = f"Bonjour {safe_recipient}," if safe_recipient else "Bonjour,"

    subject = f"[SCI Hellenvilliers] 💬 Nouveau message sur votre scrutin : {vote_title}"
    preheader = f"{author_name} a publié un message sur votre scrutin {vote_title}"
    action_url = f"{APP_BASE_URL}/taches?project_id={project_id}" if project_id else f"{APP_BASE_URL}/taches"

    content_html = f"""
    <p>{greeting_line}</p>
    <p><strong>{safe_author}</strong> a publié un nouveau message sur un scrutin que vous avez proposé (<strong>{safe_title}</strong>) :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #1e3a2f; border-radius: 6px; padding: 16px 20px; margin: 20px 0; font-style: italic; color: #1f2937; font-size: 15px; line-height: 1.6;">
        « {safe_message} »
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Vous pouvez accéder directement au scrutin pour lire l'échange et y répondre :
    </p>
    """

    html_body = render_email_layout(
        title="Nouveau message sur votre scrutin",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter le scrutin"
    )

    return _dispatch_and_record(
        trigger_action="vote_chat_activity",
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        recipients_names=[recipient_name] if recipient_name else None,
        actually_send=actually_send
    )


def send_call_for_funds_email(
    member: Any,
    call_data: Dict[str, Any],
    actually_send: bool = True,
    db: Optional[Any] = None
) -> dict:
    """
    Template 10: APPEL DE FONDS & AVIS DE COTISATION MENSUELLE
    Envoie l'avis récapitulatif mensuel et le QR-code de virement dès que la quote-part nette est émise.
    """
    from .call_for_funds_service import (
        is_bank_account_active,
        get_official_bank_info,
        generate_epc_qr_image_bytes,
        SCI_NAME,
    )

    net_amount = float(call_data.get("net_amount", 0.0))
    should_issue = call_data.get("should_issue", True)
    if net_amount <= 0.0 or not should_issue:
        logger.info(
            f"[EXCLUSION APPEL DE FONDS] Aucun e-mail d'appel de fonds envoyé à {getattr(member, 'name', '')} : "
            f"solde net <= 0 € ({format_eur_fr(net_amount)})."
        )
        return {
            "status": "neutralized_no_email",
            "message": "Solde net ≤ 0 € : aucun avis ni notification émis (associé à jour ou solde créditeur)."
        }

    if not is_bank_account_active(db):
        log_msg = (
            f"[GARDE-FOU IBAN] Avis d'appel de fonds pour {getattr(member, 'name', '')} non expédié : "
            "IBAN Swan officiel non validé (IS_BANK_ACCOUNT_ACTIVE=false)."
        )
        logger.warning(log_msg)
        return {
            "status": "blocked_pending_iban",
            "message": "En attente de validation IBAN Swan. Zéro e-mail envoyé."
        }

    notif_pref = getattr(member, "notif_new_invoices", True)
    if not notif_pref:
        logger.info(f"[PRÉFÉRENCE DÉSACTIVÉE] {getattr(member, 'name', '')} a désactivé les notifications d'appels de fonds.")
        return {
            "status": "preference_disabled",
            "message": f"Notifications d'appels de fonds désactivées par {getattr(member, 'prenom', 'le membre')}."
        }

    to_email = getattr(member, "email", None)
    if not to_email:
        return {"status": "skipped_no_email", "message": "Aucune adresse e-mail renseignée pour cet associé."}

    prenom = getattr(member, "prenom", "") or ""
    safe_prenom = escape_html_text(prenom)
    greeting_line = f"Bonjour {safe_prenom}," if safe_prenom else "Bonjour,"
    period_label = call_data.get("period_label", "mois en cours")
    de_mois = format_de_mois(period_label)
    theoretical = float(call_data.get("theoretical_contribution", 50.0))
    payment_ref = call_data.get("payment_reference", f"Apport CCA - {prenom or 'Associe'}")
    bank_info = get_official_bank_info(db)
    iban_val = bank_info.get("iban", "")
    bic_val = bank_info.get("bic", "SWNBFR22")

    qr_bytes = generate_epc_qr_image_bytes(
        iban=iban_val,
        bic=bic_val,
        amount=net_amount,
        beneficiary_name=SCI_NAME,
        remittance_info=payment_ref,
        is_specimen=False
    )
    qr_b64 = base64.b64encode(qr_bytes).decode("ascii")

    net_fr = format_eur_fr(net_amount)
    subject = f"[SCI Hellenvilliers] 🏛️ Appel de fonds {period_label} ({net_fr})"
    preheader = f"Votre avis d'appel de fonds {de_mois} est disponible : {net_fr} à régler."

    raw_deducted = call_data.get("deducted_expenses") or []
    if isinstance(raw_deducted, dict):
        deducted = raw_deducted.get("deducted_expenses") or []
    elif isinstance(raw_deducted, list):
        deducted = raw_deducted
    else:
        deducted = []

    expenses_rows_html = ""
    valid_expenses = [exp for exp in deducted if isinstance(exp, dict)]
    if valid_expenses:
        for exp in valid_expenses:
            exp_title = escape_html_text(exp.get("title", "Dépense"))
            exp_amt = format_eur_fr(float(exp.get("amount") or 0))
            expenses_rows_html += f"""
            <tr>
                <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; color: #475569;">Déduction avance : {exp_title}</td>
                <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #b91c1c; font-weight: 600;">-{exp_amt}</td>
            </tr>
            """
    else:
        expenses_rows_html = """
        <tr>
            <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; color: #94a3b8; font-style: italic;">Aucune avance de frais enregistrée</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #94a3b8;">0,00 €</td>
        </tr>
        """

    content_html = f"""
    <p>{greeting_line}</p>
    <p>Votre avis d'appel de fonds pour le mois <strong>{escape_html_text(de_mois)}</strong> a été établi pour la SCI Hellenvilliers :</p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #064e3b; border-radius: 8px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 16px; font-weight: bold; color: #064e3b; margin-bottom: 12px;">
            📋 Décompte de la quote-part — {escape_html_text(period_label)}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 13.5px; line-height: 1.6;">
            <tr>
                <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9;">Quote-part mensuelle théorique :</td>
                <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #1e293b;">+{format_eur_fr(theoretical)}</td>
            </tr>
            {expenses_rows_html}
            <tr style="background-color: #ecfdf5;">
                <td style="padding: 10px; font-size: 15px; font-weight: bold; color: #064e3b;">Solde net à régler :</td>
                <td style="padding: 10px; font-size: 16px; font-weight: bold; text-align: right; color: #064e3b;">{net_fr}</td>
            </tr>
        </table>
    </div>

    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <div style="font-size: 14px; font-weight: bold; color: #166534; margin-bottom: 12px;">
            🏦 Coordonnées pour virement bancaire SEPA
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td style="vertical-align: top; padding-right: 16px;">
                    <p style="font-size: 13px; color: #1e293b; margin: 0 0 10px 0; line-height: 1.6;">
                        • Titulaire : <strong>SCI HELLENVILLIERS</strong><br/>
                        • IBAN : <code style="font-family: monospace; font-size: 13px; background: #ffffff; padding: 2px 6px; border-radius: 4px; border: 1px solid #cbd5e1;">{escape_html_text(iban_val)}</code><br/>
                        • BIC : <code style="font-family: monospace;">{escape_html_text(bic_val)}</code>
                    </p>
                    <p style="font-size: 12.5px; color: #064e3b; margin: 0 0 10px 0; line-height: 1.5; font-weight: 500;">
                        💡 Il vous suffit d'effectuer votre virement depuis votre compte bancaire personnel (il sera automatiquement détecté et affecté à votre trésorerie à votre nom).
                    </p>
                    <p style="font-size: 12px; color: #475569; margin: 0;">
                        📱 <em>Scannez le QR-Code SEPA EPC avec votre application bancaire pour pré-remplir le virement instantanément.</em>
                    </p>
                </td>
                <td style="vertical-align: middle; text-align: center; width: 130px;">
                    <img src="data:image/png;base64,{qr_b64}" width="130" height="130" style="display: block; border-radius: 6px; border: 1px solid #cbd5e1; box-shadow: 0 2px 6px rgba(0,0,0,0.08);" alt="QR-Code SEPA EPC" />
                </td>
            </tr>
        </table>
    </div>
    """

    action_url = f"{APP_BASE_URL}/admin"
    html_body = render_email_layout(
        title="Appel de fonds mensuel",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter l'avis & télécharger le PDF"
    )

    return _dispatch_and_record(
        trigger_action="call_for_funds",
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        recipients_names=[prenom or "Associé"],
        actually_send=actually_send
    )


def send_invoice_approval_request_email(
    to_email: str,
    recipient_name: str,
    submitter_name: str,
    expense_title: str,
    amount_str: str,
    expense_date_str: str,
    payer_type: str,
    task_id: int,
    actually_send: bool = True
) -> dict:
    """
    Template: NOUVELLE FACTURE / DÉPENSE DÉPOSÉE POUR APPROBATION (notif_invoice_approval_request)
    Notifies members who opted in when a new invoice or expense advance is submitted.
    """
    safe_submitter = escape_html_text(submitter_name or "Un associé")
    safe_title = escape_html_text(expense_title or "Facture")
    safe_amount = escape_html_text(amount_str or "")
    safe_date = escape_html_text(format_date_fr(expense_date_str) or "")
    safe_recipient = escape_html_text(recipient_name) if recipient_name else ""
    greeting_line = f"Bonjour {safe_recipient}," if safe_recipient else "Bonjour,"

    is_sci = (payer_type or "").lower() == "sci"
    type_label = "Facture directe à régler par la SCI" if is_sci else "Avance de frais membre"
    subject = f"[SCI Hellenvilliers] 🧾 Nouvelle {'facture' if is_sci else 'avance'} à approuver : {expense_title} ({amount_str})"
    preheader = f"{submitter_name or 'Un associé'} a soumis une dépense ({amount_str}) pour approbation."
    action_url = f"{APP_BASE_URL}/taches?task_id={task_id}" if task_id else f"{APP_BASE_URL}/taches"

    content_html = f"""
    <p>{greeting_line}</p>
    <p>Une nouvelle {'facture directe SCI' if is_sci else 'avance de frais'} a été soumise pour approbation par <strong>{safe_submitter}</strong> :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #1e3a2f; border-radius: 6px; padding: 16px 20px; margin: 20px 0; color: #1f2937; font-size: 15px; line-height: 1.6;">
        <p style="margin: 0 0 8px 0;"><strong>Objet :</strong> {safe_title}</p>
        <p style="margin: 0 0 8px 0;"><strong>Montant :</strong> {safe_amount}</p>
        <p style="margin: 0 0 8px 0;"><strong>Date :</strong> {safe_date}</p>
        <p style="margin: 0;"><strong>Type :</strong> {type_label}</p>
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Vous pouvez consulter la tâche correspondante et valider les justificatifs sur le portail de la SCI :
    </p>
    """

    html_body = render_email_layout(
        title="Nouvelle facture déposée" if is_sci else "Nouvelle avance de frais déposée",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter la tâche & approuver"
    )

    return _dispatch_and_record(
        trigger_action="invoice_approval_request",
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        recipients_names=[recipient_name] if recipient_name else None,
        actually_send=actually_send
    )




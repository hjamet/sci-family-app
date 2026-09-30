import os
import json
import logging
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
# GOUVERNANCE PRODUCTION & COUPE-CIRCUIT D'URGENCE
# ==============================================================================
# Conformément à la directive formelle de passage en production d'Henri :
# L'envoi d'e-mails est activé en production réelle.
# Le pare-feu strict de protection familiale reste actif (hellenvillierssci@gmail.com).
# Pour forcer le coupe-circuit hermétique en test automatisé : DISABLE_ALL_EMAILS=true ou EMAIL_FORCE_REAL_MODE=false.
DISABLE_ALL_EMAILS: bool = False

def is_email_disabled() -> bool:
    """
    Coupe-circuit d'urgence global :
    En production réelle (directive formelle d'Henri), les emails sont réactivés.
    Le coupe-circuit peut être réarmé d'urgence via DISABLE_ALL_EMAILS=true.
    """
    if os.getenv("EMAIL_FORCE_REAL_MODE", "true").strip().lower() in ("true", "1", "yes"):
        env_val = os.getenv("DISABLE_ALL_EMAILS", "false").strip().lower()
        return env_val in ("true", "1", "yes")
    env_val = os.getenv("DISABLE_ALL_EMAILS", "").strip().lower()
    if env_val in ("false", "0", "no"):
        return False
    if env_val in ("true", "1", "yes"):
        return True
    return DISABLE_ALL_EMAILS

def is_test_mode() -> bool:
    """
    Mode test hermétique :
    Si EMAIL_TEST_MODE est actif (ex: 'true' dans conftest.py), AUCUN e-mail physique ne sort via Resend.
    En production réelle, EMAIL_TEST_MODE=False permet la délivrance effective des courriels.
    """
    if os.getenv("EMAIL_FORCE_REAL_MODE", "true").strip().lower() in ("true", "1", "yes"):
        env_val = os.getenv("EMAIL_TEST_MODE", "false").strip().lower()
        return env_val in ("true", "1", "yes")
    env_val = os.getenv("EMAIL_TEST_MODE", "").strip().lower()
    if env_val in ("false", "0", "no"):
        return False
    if env_val in ("true", "1", "yes"):
        return True
    return False

def get_circuit_breaker_response() -> dict:
    """Retour standardisé du coupe-circuit d'urgence."""
    log_msg = "[COUPE-CIRCUIT] Envoi d'email totalement désactivé (urgence). Aucun email envoyé."
    logger.warning(log_msg)
    print(log_msg)
    return {"status": "disabled", "id": "mock_emergency_off"}

# PARE-FEU STRICT DE PROTECTION FAMILIALE
# Tant que l'envoi global n'a pas été formellement débloqué par Henri en production :
# SEULE l'adresse hellenvillierssci@gmail.com est autorisée à recevoir des e-mails.
# Tout envoi vers une boîte personnelle (ex: henri.jamet.ch@gmail.com ou famille) est STRICTEMENT INTERCEPTÉ, SANS AUCUN APPEL RÉSEAU RESEND.
ALLOWED_RECIPIENTS: Set[str] = {"hellenvillierssci@gmail.com"}

# Circuit Breaker / Hermetic Test Mode
EMAIL_TEST_MODE: bool = os.getenv("EMAIL_TEST_MODE", "true").lower() in ("true", "1", "yes")
EMAIL_TEST_REDIRECT_TO: str = os.getenv("EMAIL_TEST_REDIRECT_TO", "hellenvillierssci@gmail.com").strip() or "hellenvillierssci@gmail.com"

ALLOWED_TEST_RECIPIENTS: Set[str] = {"hellenvillierssci@gmail.com"}

DEFAULT_MEMBER_EMAILS: List[str] = [
    "hellenvillierssci@gmail.com",
    "hortense_jamet@yahoo.fr",
    "marguerite_jamet@yahoo.fr",
    "eugenie_jamet@yahoo.fr",
    "josephine_jamet@yahoo.fr",
    "frdjamet@gmail.com",
    "elizabeth_jamet@yahoo.fr"
]

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
    status: str = "simulated"
) -> Dict[str, Any]:
    """Enregistre un email dans le registre en mémoire RECENT_DISPATCHED_EMAILS (max 20)."""
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
    RECENT_DISPATCHED_EMAILS.insert(0, email_entry)
    if len(RECENT_DISPATCHED_EMAILS) > 20:
        RECENT_DISPATCHED_EMAILS = RECENT_DISPATCHED_EMAILS[:20]
    return email_entry

def check_firewall(to_email: Union[str, List[str]]) -> Optional[dict]:
    """
    Vérification pare-feu hermétique avant tout envoi ou rendu HTML :
    1. Si le coupe-circuit global est actif, bloque immédiatement 100% des envois.
    2. Sinon, intercepte immédiatement tout destinataire non autorisé sans appel réseau Resend.
    """
    if is_email_disabled():
        return get_circuit_breaker_response()

    allowed_whitelist = {r.strip().lower() for r in ALLOWED_RECIPIENTS}
    allowed_whitelist.discard("henri.jamet.ch@gmail.com")
    if isinstance(to_email, str):
        clean = to_email.strip().lower()
        if clean not in allowed_whitelist:
            log_msg = f"[FIREWALL] Envoi vers {to_email} bloqué (seul hellenvillierssci@gmail.com est autorisé)"
            logger.warning(log_msg)
            print(log_msg)
            return {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
    elif isinstance(to_email, (list, tuple, set)):
        has_allowed = any(str(r).strip().lower() in allowed_whitelist for r in to_email)
        if not has_allowed:
            for r in to_email:
                log_msg = f"[FIREWALL] Envoi vers {r} bloqué (seul hellenvillierssci@gmail.com est autorisé)"
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
    cta_html = ""
    if action_url and action_label:
        cta_html = f"""
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 10px 0;">
            <tr>
                <td align="center" style="border-radius: 6px; background-color: #1e3a2f;">
                    <a href="{action_url}" target="_blank" style="display: inline-block; padding: 14px 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; background: linear-gradient(135deg, #1e3a2f 0%, #2d5a47 100%); border: 1px solid #162c23; letter-spacing: 0.3px;">
                        {action_label} &rarr;
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
    <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f6f2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.6;">
    <div style="display: none; font-size: 1px; color: #f7f6f2; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
        {preheader}
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
                                {title}
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
                                SCI Familiale Hellenvilliers • Rosings & Le Presbytère
                            </div>
                            <div>
                                Notification automatique transmise aux associés. Vos préférences de notifications sont réglables sur votre
                                <a href="{APP_BASE_URL}/#settings" style="color: #2d5a47; text-decoration: underline; font-weight: 500;">espace profil</a>.
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
    from_email: Optional[str] = None
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
    allowed_whitelist = {r.strip().lower() for r in ALLOWED_RECIPIENTS}
    allowed_whitelist.discard("henri.jamet.ch@gmail.com")

    if isinstance(to_email, str):
        clean_email = to_email.strip().lower()
        if clean_email not in allowed_whitelist:
            log_msg = f"[FIREWALL] Envoi vers {to_email} bloqué (seul hellenvillierssci@gmail.com est autorisé)"
            logger.warning(log_msg)
            print(log_msg)
            return {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
        raw_recipients = [to_email.strip()]
    elif isinstance(to_email, (list, tuple, set)):
        allowed = []
        for r in to_email:
            r_str = str(r).strip()
            if r_str.lower() in allowed_whitelist:
                allowed.append(r_str)
            else:
                log_msg = f"[FIREWALL] Envoi vers {r} bloqué (seul hellenvillierssci@gmail.com est autorisé)"
                logger.warning(log_msg)
                print(log_msg)
        if not allowed:
            return {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
        raw_recipients = allowed
    else:
        clean_email = str(to_email).strip().lower()
        if clean_email not in allowed_whitelist:
            log_msg = f"[FIREWALL] Envoi vers {to_email} bloqué (seul hellenvillierssci@gmail.com est autorisé)"
            logger.warning(log_msg)
            print(log_msg)
            return {"status": "blocked_by_whitelist", "id": "local_mock_blocked"}
        raw_recipients = [str(to_email).strip()]

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
    payload = {
        "from": effective_from,
        "to": final_recipients,
        "subject": subject,
        "html": html_content
    }

    try:
        if httpx is not None:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(url, headers=headers, json=payload)
                
                # If domain verification error occurred (e.g. 403 on unverified domain), fallback to onboarding@resend.dev
                if resp.status_code == 403 and "domain" in resp.text.lower() and effective_from != FALLBACK_FROM_EMAIL:
                    logger.warning(f"[EMAIL SERVICE] Sender '{effective_from}' returned 403 domain error. Retrying with fallback '{FALLBACK_FROM_EMAIL}'.")
                    payload["from"] = FALLBACK_FROM_EMAIL
                    resp = client.post(url, headers=headers, json=payload)

                if resp.status_code in (200, 201):
                    result = resp.json()
                    logger.info(f"[EMAIL SERVICE] Email sent successfully via Resend to {final_recipients}: {result}")
                    return result
                else:
                    logger.error(f"[EMAIL SERVICE] Resend HTTP Error {resp.status_code}: {resp.text}")
                    return {"error": resp.text, "status_code": resp.status_code}
        else:
            # Fallback direct urllib si httpx non installé
            data_bytes = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=data_bytes, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=10.0) as resp:
                    resp_text = resp.read().decode("utf-8")
                    result = json.loads(resp_text) if resp_text else {}
                    logger.info(f"[EMAIL SERVICE (urllib)] Email sent successfully via Resend to {final_recipients}: {result}")
                    return result
            except urllib.error.HTTPError as he:
                err_text = he.read().decode("utf-8")
                logger.error(f"[EMAIL SERVICE (urllib)] Resend HTTP Error {he.code}: {err_text}")
                return {"error": err_text, "status_code": he.code}
    except Exception as e:
        logger.error(f"[EMAIL SERVICE] Network error calling Resend API: {e}")
        return {"error": str(e)}


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
    Champs réels conservés : Titre, Catégorie/Domaine, Localisation, Priorité, Charge (points), Assigné à, Description.
    Zéro champ fictif (aucune date limite).
    """
    # Pare-feu et coupe-circuit hermétiques gérés de façon centrale dans send_email
    if is_email_disabled():
        return get_circuit_breaker_response()

    priority_colors = {
        "critique": ("#fee2e2", "#991b1b", "#dc2626"),
        "haute": ("#ffedd5", "#9a3412", "#ea580c"),
        "normale": ("#dbeafe", "#1e40af", "#2563eb"),
        "basse": ("#f3f4f6", "#374151", "#4b5563"),
        "planifié": ("#e0e7ff", "#3730a3", "#4f46e5")
    }
    p_key = (priority or "normale").strip().lower()
    bg_p, text_p, border_p = priority_colors.get(p_key, ("#dbeafe", "#1e40af", "#2563eb"))

    greeting = f"Bonjour {assignee_name}," if assignee_name else "Bonjour,"
    action_url = f"{APP_BASE_URL}/#tasks"

    content_html = f"""
    <p>{greeting}</p>
    <p>Une nouvelle tâche vous a été assignée sur le Domaine d'Hellenvilliers :</p>
    
    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #1e3a2f; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: #1e3a2f; margin-bottom: 12px;">
            📌 {task_title}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8;">
            <tr>
                <td style="color: #6b7280; width: 140px;">👤 Assigné à :</td>
                <td style="font-weight: 600; color: #1f2937;">{assignee_name or 'Non spécifié'}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">🏛️ Domaine / Réf :</td>
                <td style="font-weight: 600; color: #1f2937;">{domain or 'SCI Familiale'}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">📍 Lieu :</td>
                <td style="font-weight: 600; color: #1f2937;">{location or 'Hellenvilliers'}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">⚡ Priorité :</td>
                <td>
                    <span style="display: inline-block; background-color: {bg_p}; color: {text_p}; border: 1px solid {border_p}; padding: 2px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
                        {priority}
                    </span>
                </td>
            </tr>
            <tr>
                <td style="color: #6b7280;">⏱️ Charge (points) :</td>
                <td style="font-weight: 600; color: #1f2937;">{charge or 'Non spécifiée'}</td>
            </tr>
        </table>
        {f'<div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #d1cfc7; color: #4b5563; font-size: 13.5px;"><strong>Description :</strong> {description}</div>' if description else ''}
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Vous pouvez consulter les détails, documents attachés, checklist et échanger avec les autres associés directement depuis votre espace :
    </p>
    """

    subject = f"[SCI Hellenvilliers] 📌 Tâche assignée : {task_title}"
    preheader = f"Une nouvelle mission vous a été confiée : {task_title} ({priority})"
    html_body = render_email_layout(
        title="Nouvelle Tâche Assignée",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter la tâche sur l'application"
    )

    names = [assignee_name] if assignee_name else []
    email_entry = record_dispatched_email(
        trigger_action="task_assigned",
        subject=subject,
        recipients=to_email,
        html_content=html_body,
        recipients_names=names,
        status="sent" if (actually_send and not is_email_disabled() and not is_test_mode()) else "simulated"
    )

    if actually_send and not is_email_disabled() and not is_test_mode():
        res = send_email(to_email=to_email, subject=subject, html_content=html_body)
    else:
        res = {"status": "simulated", "id": email_entry["id"]}

    if isinstance(res, dict):
        res["_email_dispatched"] = email_entry
    return res


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
    Template: TÂCHE EN ATTENTE DE CRÉATION (Annotation 16 & Annotation 2)
    Notifies a coordinator that a new task proposal has been submitted and is pending creation/arbitration.
    """
    priority_colors = {
        "critique": ("#fee2e2", "#991b1b", "#dc2626"),
        "haute": ("#ffedd5", "#9a3412", "#ea580c"),
        "normale": ("#dbeafe", "#1e40af", "#2563eb"),
        "basse": ("#f3f4f6", "#374151", "#4b5563"),
        "planifié": ("#e0e7ff", "#3730a3", "#4f46e5")
    }
    p_key = (priority or "normale").strip().lower()
    bg_p, text_p, border_p = priority_colors.get(p_key, ("#dbeafe", "#1e40af", "#2563eb"))

    greeting = f"Bonjour {coordinator_name}," if coordinator_name else "Bonjour,"
    action_url = f"{APP_BASE_URL}/#tasks"

    content_html = f"""
    <p>{greeting}</p>
    <p>Une nouvelle tâche a été soumise par <strong>{created_by or 'un associé'}</strong> et est actuellement <strong>en attente de création</strong> et d'arbitrage par la coordination :</p>
    
    <div style="background-color: #fefce8; border: 1px solid #fef08a; border-left: 4px solid #ca8a04; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: #854d0e; margin-bottom: 12px;">
            ⏳ {task_title}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8;">
            <tr>
                <td style="color: #6b7280; width: 140px;">👤 Proposée par :</td>
                <td style="font-weight: 600; color: #1f2937;">{created_by or 'Non spécifié'}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">🏛️ Domaine / Réf :</td>
                <td style="font-weight: 600; color: #1f2937;">{domain or 'SCI Familiale'}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">📍 Lieu :</td>
                <td style="font-weight: 600; color: #1f2937;">{location or 'Hellenvilliers'}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">⚡ Priorité :</td>
                <td>
                    <span style="display: inline-block; background-color: {bg_p}; color: {text_p}; border: 1px solid {border_p}; padding: 2px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
                        {priority}
                    </span>
                </td>
            </tr>
            <tr>
                <td style="color: #6b7280;">⏱️ Charge de la tâche :</td>
                <td style="font-weight: 600; color: #1f2937;">{complexity or 'Modérée'}</td>
            </tr>
        </table>
        {f'<div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e2e8f0; color: #4b5563; font-size: 13.5px;"><strong>Description :</strong> {description}</div>' if description else ''}
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Vous pouvez examiner la proposition, lui assigner un membre responsable et suivre sa mise en œuvre :
    </p>
    """

    subject = f"[SCI Hellenvilliers] ⏳ Nouvelle tâche en attente de création : {task_title}"
    preheader = f"Une nouvelle proposition de mission a été soumise : {task_title} ({priority})"
    html_body = render_email_layout(
        title="Nouvelle Tâche en Attente de Création",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Examiner et approuver la tâche"
    )

    names = [coordinator_name] if coordinator_name else []
    email_entry = record_dispatched_email(
        trigger_action="task_creation_pending",
        subject=subject,
        recipients=to_email,
        html_content=html_body,
        recipients_names=names,
        status="sent" if (actually_send and not is_email_disabled() and not is_test_mode()) else "simulated"
    )

    if actually_send and not is_email_disabled() and not is_test_mode():
        res = send_email(to_email=to_email, subject=subject, html_content=html_body)
    else:
        res = {"status": "simulated", "id": email_entry["id"]}

    if isinstance(res, dict):
        res["_email_dispatched"] = email_entry
    return res


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
    Notifies a member that a formal decision/vote requires their ballot.
    Annotation 6:
    - Supprime le montant estimé / budget qui n'a plus de sens.
    - Ajoute la description complète du vote.
    - Supprime l'encadré verbeux « Règle statutaire etc. ».
    """
    if is_email_disabled():
        return get_circuit_breaker_response()

    import html as html_lib
    action_url = f"{APP_BASE_URL}/#votes"
    safe_description = html_lib.escape(description or "").replace("\n", "<br>") if description else ""

    content_html = f"""
    <p>Bonjour,</p>
    <p>Un nouveau scrutin requiert le vote formel de tous les associés de la SCI Familiale :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #b89047; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: #1e3a2f; margin-bottom: 12px;">
            🗳️ {vote_title}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8;">
            <tr>
                <td style="color: #6b7280; width: 140px;">👤 Proposé par :</td>
                <td style="font-weight: 600; color: #1f2937;">{submitted_by or 'Un associé'}</td>
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
        title="Scrutin Ouvert : Votre Vote est Requis",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Exprimer mon vote"
    )

    names = ["Tous les associés"] if (isinstance(to_email, (list, tuple, set)) and len(to_email) >= 5) else None
    email_entry = record_dispatched_email(
        trigger_action="vote_required",
        subject=subject,
        recipients=to_email,
        html_content=html_body,
        recipients_names=names,
        status="simulated" if (is_email_disabled() or is_test_mode()) else "sent"
    )

    res = send_email(to_email=to_email, subject=subject, html_content=html_body)
    if isinstance(res, dict):
        res["_email_dispatched"] = email_entry
    return res


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
    Template: SCRUTIN EN ATTENTE D'ARBITRAGE DE CRÉATION (Annotation 3)
    Notifies a coordinator that a new vote has been proposed in PROPOSED status and awaits arbitration to open.
    """
    import html as html_lib
    safe_description = html_lib.escape(description or "").replace("\n", "<br>") if description else ""
    greeting = f"Bonjour {coordinator_name}," if coordinator_name else "Bonjour,"
    action_url = f"{APP_BASE_URL}/#votes"

    content_html = f"""
    <p>{greeting}</p>
    <p>Un nouveau scrutin a été soumis par <strong>{submitted_by or 'un associé'}</strong> et est actuellement <strong>en attente d'arbitrage</strong> par la coordination :</p>

    <div style="background-color: #fefce8; border: 1px solid #fef08a; border-left: 4px solid #ca8a04; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: #854d0e; margin-bottom: 12px;">
            ⏳ {vote_title}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8;">
            <tr>
                <td style="color: #6b7280; width: 140px;">👤 Proposé par :</td>
                <td style="font-weight: 600; color: #1f2937;">{submitted_by or 'Non spécifié'}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">📋 Statut :</td>
                <td style="font-weight: 600; color: #ca8a04;">En attente d'arbitrage (Proposition)</td>
            </tr>
        </table>
        {f'<div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e2e8f0; color: #4b5563; font-size: 13.5px;"><strong>Description complète :</strong><br><div style="margin-top: 6px;">{safe_description}</div></div>' if safe_description else ''}
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        En tant que coordinateur, vous pouvez examiner la proposition, ajuster les options de vote si nécessaire et ouvrir officiellement le scrutin à l'ensemble des associés :
    </p>
    """

    subject = f"[SCI Hellenvilliers] 🗳️ Nouveau scrutin en attente d'arbitrage : {vote_title}"
    preheader = f"Une nouvelle proposition de scrutin a été soumise : {vote_title}"
    html_body = render_email_layout(
        title="Nouveau Scrutin en Attente d'Arbitrage",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Examiner et ouvrir le scrutin"
    )

    names = [coordinator_name] if coordinator_name else []
    email_entry = record_dispatched_email(
        trigger_action="vote_creation_pending",
        subject=subject,
        recipients=to_email,
        html_content=html_body,
        recipients_names=names,
        status="sent" if (actually_send and not is_email_disabled() and not is_test_mode()) else "simulated"
    )

    if actually_send and not is_email_disabled() and not is_test_mode():
        res = send_email(to_email=to_email, subject=subject, html_content=html_body)
    else:
        res = {"status": "simulated", "id": email_entry["id"]}

    if isinstance(res, dict):
        res["_email_dispatched"] = email_entry
    return res


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
    Template: SCRUTIN EN ATTENTE D'ARBITRAGE D'ARCHIVAGE (Annotation 8)
    Notifies coordinators when a vote reaches quorum (7/7) or REPORT_AG and is in PENDING_VALIDATION.
    """
    import html as html_lib
    greeting = f"Bonjour {coordinator_name}," if coordinator_name else "Bonjour,"
    action_url = f"{APP_BASE_URL}/#votes"

    summary_text = ""
    if isinstance(votes_summary, dict):
        summary_text = f"Pour : {votes_summary.get('pour', 0)} | Contre : {votes_summary.get('contre', 0)} | Abstention : {votes_summary.get('abstention', 0)} | Report AG : {votes_summary.get('report_prochaine_ag', 0)}"
    else:
        summary_text = str(votes_summary)

    safe_description = html_lib.escape(description or "").replace("\n", "<br>") if description else ""

    content_html = f"""
    <p>{greeting}</p>
    <p>Le scrutin <strong>« {vote_title} »</strong> vient d'atteindre le quorum complet (ou une demande de report) et est désormais <strong>en attente d'arbitrage de validation et d'archivage</strong> par la coordination :</p>

    <div style="background-color: #faf5ff; border: 1px solid #e9d5ff; border-left: 4px solid #9333ea; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: #581c87; margin-bottom: 12px;">
            ⚖️ {vote_title}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8;">
            <tr>
                <td style="color: #6b7280; width: 150px;">📊 Statut provisoire :</td>
                <td style="font-weight: 700; color: #581c87;">{decision}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">🗳️ Synthèse des voix :</td>
                <td style="font-weight: 600; color: #1f2937;">{summary_text}</td>
            </tr>
        </table>
        {f'<div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e9d5ff; color: #4b5563; font-size: 13.5px;"><strong>Description du scrutin :</strong><br><div style="margin-top: 6px;">{safe_description}</div></div>' if safe_description else ''}
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        En tant que coordinateur, il vous appartient d'arbitrer formellement ce scrutin afin de valider son archivage définitif ou de demander un nouvel examen :
    </p>
    """

    subject = f"[SCI Hellenvilliers] ⚖️ Scrutin en attente d'arbitrage d'archivage : {vote_title}"
    preheader = f"Arbitrage requis : le quorum est atteint sur {vote_title} ({decision})"
    html_body = render_email_layout(
        title="Scrutin en Attente d'Arbitrage d'Archivage",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Arbitrer et archiver le scrutin"
    )

    names = [coordinator_name] if coordinator_name else []
    email_entry = record_dispatched_email(
        trigger_action="vote_arbitration_pending",
        subject=subject,
        recipients=to_email,
        html_content=html_body,
        recipients_names=names,
        status="sent" if (actually_send and not is_email_disabled() and not is_test_mode()) else "simulated"
    )

    if actually_send and not is_email_disabled() and not is_test_mode():
        res = send_email(to_email=to_email, subject=subject, html_content=html_body)
    else:
        res = {"status": "simulated", "id": email_entry["id"]}

    if isinstance(res, dict):
        res["_email_dispatched"] = email_entry
    return res


def send_vote_closed_email(
    to_email: Union[str, List[str]],
    vote_title: str,
    decision: str,
    votes_summary: Dict[str, int],
    total_votes: int = 7,
    project_id: Optional[Union[int, str]] = None,
    estimated_cost: Optional[float] = None
) -> dict:
    """
    Template 3: DÉCISION FINALE DE VOTE
    Notifies all members of the final result once all 7 associates have voted.
    """
    # Pare-feu et coupe-circuit hermétiques gérés de façon centrale dans send_email
    is_adopted = "adopt" in decision.lower() or "approuv" in decision.lower()
    is_report = "report" in decision.lower()

    if is_adopted:
        badge_bg, badge_text, badge_border = "#dcfce7", "#166534", "#22c55e"
        status_label = "✅ ADOPTÉ"
    elif is_report:
        badge_bg, badge_text, badge_border = "#fef3c7", "#92400e", "#f59e0b"
        status_label = "⚠️ REPORTÉ PROCHAINE AG"
    else:
        badge_bg, badge_text, badge_border = "#fee2e2", "#991b1b", "#ef4444"
        status_label = "❌ REJETÉ"

    pour_cnt = votes_summary.get("pour", 0) + votes_summary.get("oui", 0)
    contre_cnt = votes_summary.get("contre", 0) + votes_summary.get("non", 0)
    abst_cnt = votes_summary.get("abstention", 0)
    report_cnt = votes_summary.get("report_prochaine_ag", 0) + votes_summary.get("report_ag", 0)

    cost_row = ""
    if estimated_cost and estimated_cost > 0:
        cost_row = f"""
        <tr>
            <td style="color: #6b7280;">💶 Montant engagé :</td>
            <td style="font-weight: 700; color: #1e3a2f;">{estimated_cost:,.2f} €</td>
        </tr>
        """.replace(",", " ")

    action_url = f"{APP_BASE_URL}/#votes"

    content_html = f"""
    <p>Bonjour,</p>
    <p>Le scrutin concernant le projet ci-dessous est désormais clos suite au vote de tous les associés :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-radius: 6px; padding: 20px; margin: 20px 0;">
        <div style="font-size: 18px; font-weight: bold; color: #1e3a2f; margin-bottom: 12px;">
            {vote_title}
        </div>
        
        <div style="margin-bottom: 16px;">
            <span style="display: inline-block; background-color: {badge_bg}; color: {badge_text}; border: 1px solid {badge_border}; padding: 6px 16px; border-radius: 9999px; font-size: 14px; font-weight: bold; text-transform: uppercase;">
                {status_label}
            </span>
        </div>

        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8; margin-top: 10px;">
            <tr>
                <td style="color: #6b7280; width: 140px;">📊 Participation :</td>
                <td style="font-weight: 600; color: #1f2937;">{total_votes} votes exprimés sur 7 associés</td>
            </tr>
            {cost_row}
        </table>

        <div style="background-color: #ffffff; border: 1px solid #e5e3dc; border-radius: 6px; padding: 12px 16px; margin-top: 14px;">
            <div style="font-size: 13px; font-weight: bold; color: #4b5563; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                Dépouillement des suffrages :
            </div>
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px;">
                <tr>
                    <td style="padding: 3px 0;">🟢 Pour : <strong>{pour_cnt}</strong></td>
                    <td style="padding: 3px 0;">🔴 Contre : <strong>{contre_cnt}</strong></td>
                    <td style="padding: 3px 0;">⚪ Abstention : <strong>{abst_cnt}</strong></td>
                    <td style="padding: 3px 0;">🟡 Report AG : <strong>{report_cnt}</strong></td>
                </tr>
            </table>
        </div>
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Le résultat complet ainsi que les éventuelles réserves et commentaires d'associés sont archivés sur l'application.
    </p>
    """

    subject = f"[SCI Hellenvilliers] ⚖️ Résultat du scrutin : {vote_title} ({status_label})"
    preheader = f"Décision finale : le projet {vote_title} est {status_label} ({pour_cnt} Pour / {contre_cnt} Contre)"
    html_body = render_email_layout(
        title="Décision Finale de Vote",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter les détails du vote"
    )

    names = ["Tous les associés"]
    email_entry = record_dispatched_email(
        trigger_action="vote_closed",
        subject=subject,
        recipients=to_email,
        html_content=html_body,
        recipients_names=names,
        status="simulated" if (is_email_disabled() or is_test_mode()) else "sent"
    )

    res = send_email(to_email=to_email, subject=subject, html_content=html_body)
    if isinstance(res, dict):
        res["_email_dispatched"] = email_entry
    return res


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
    # Pare-feu et coupe-circuit hermétiques gérés de façon centrale dans send_email
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

    action_url = f"{APP_BASE_URL}/#calendar"

    content_html = f"""
    <p>Bonjour,</p>
    <p>Un nouveau séjour vient d'être planifié au Domaine d'Hellenvilliers :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #2d5a47; border-radius: 6px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 17px; font-weight: bold; color: #1e3a2f; margin-bottom: 12px;">
            🏡 Séjour de {member_name}
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; line-height: 1.8;">
            <tr>
                <td style="color: #6b7280; width: 140px;">🏛️ Demeure :</td>
                <td style="font-weight: 700; color: #1e3a2f;">{property_name or 'Domaine d\'Hellenvilliers'}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">📅 Dates :</td>
                <td style="font-weight: 600; color: #1f2937;">Du <strong>{start_date}</strong> au <strong>{end_date}</strong></td>
            </tr>
            <tr>
                <td style="color: #6b7280;">👥 Personnes :</td>
                <td style="font-weight: 600; color: #1f2937;">{guest_count or 1} occupant(s)</td>
            </tr>
            {f'<tr><td style="color: #6b7280;">🛏️ Chambres :</td><td style="font-weight: 600; color: #1f2937;">{rooms_display}</td></tr>' if rooms_display else ''}
        </table>
        {f'<div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #d1cfc7; font-style: italic; color: #4b5563; font-size: 13.5px;">Remarques : {notes}</div>' if notes else ''}
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Retrouvez le calendrier partagé, les présences croisées et les consignes du vademecum sur l'espace séjours :
    </p>
    """

    subject = f"[SCI Hellenvilliers] 🏡 Nouveau séjour réservé : {member_name} ({start_date} ➔ {end_date})"
    preheader = f"{member_name} a réservé à {property_name} du {start_date} au {end_date}"
    html_body = render_email_layout(
        title="Nouveau Séjour Planifié",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter le calendrier des séjours"
    )

    names = ["Famille Hellenvilliers"]
    email_entry = record_dispatched_email(
        trigger_action="stay_booked",
        subject=subject,
        recipients=to_email,
        html_content=html_body,
        recipients_names=names,
        status="simulated" if (is_email_disabled() or is_test_mode()) else "sent"
    )

    res = send_email(to_email=to_email, subject=subject, html_content=html_body)
    if isinstance(res, dict):
        res["_email_dispatched"] = email_entry
    return res


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
    greeting = f"Bonjour {member_name}," if member_name else "Bonjour,"
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
            {new_temporary_password}
        </div>
    </div>
    
    <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-top: 16px;">
        🔒 <strong>Conseil de sécurité :</strong> Pour des raisons de confidentialité, nous vous recommandons vivement de modifier ce mot de passe dès votre première connexion en vous rendant dans l'onglet <strong>Paramètres</strong> du portail.
    </p>
    
    <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin-top: 12px;">
        Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail ou contacter le gérant de la SCI.
    </p>
    """

    subject = "[SCI Hellenvilliers] Réinitialisation de votre mot de passe"
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
    Enforces the strict hermetic family firewall (only hellenvillierssci@gmail.com is allowed).
    """
    # Pare-feu et coupe-circuit hermétiques gérés de façon centrale dans send_email

    subject = f"[Domaine d'Hellenvilliers] Modification des consignes thermiques — {equipment_type}"
    preheader = f"Consignes modifiées par {author_name} pour {equipment_type} : {details}"
    action_url = f"{APP_BASE_URL}/sejour"

    content_html = f"""
    <p>Bonjour,</p>
    <p>Une modification des consignes thermiques a été enregistrée par <strong>{author_name}</strong> :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-radius: 6px; padding: 20px; margin: 20px 0;">
        <div style="font-size: 16px; font-weight: bold; color: #1e3a2f; margin-bottom: 8px;">
            {equipment_type}
        </div>
        <div style="font-size: 14px; color: #1f2937; margin-bottom: 12px; line-height: 1.6;">
            <strong>Détails de la modification :</strong> {details}
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
        title=f"Consignes Thermiques — {equipment_type}",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter l'espace Séjour & Énergie"
    )

    names = ["Associés abonnés énergie"]
    email_entry = record_dispatched_email(
        trigger_action="thermal_change",
        subject=subject,
        recipients=target_emails,
        html_content=html_body,
        recipients_names=names,
        status="simulated" if (is_email_disabled() or is_test_mode()) else "sent"
    )

    res = send_email(to_email=target_emails, subject=subject, html_content=html_body)
    if isinstance(res, dict):
        res["_email_dispatched"] = email_entry
    return res


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
    return send_notification_email(
        to_email=to_email,
        subject="[Domaine d'Hellenvilliers] Bienvenue sur votre espace associé",
        content_html=f"<p>Bonjour {member_name},</p><p>Votre accès au portail de la SCI d'Hellenvilliers est prêt.</p>",
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
    Garde-fous Resend & Anti-Spam :
    - Ne pas envoyer d'email si l'auteur du message se mentionne lui-même.
    - Ne pas envoyer d'email si notify_mentions (ou notify_mention_all) == False.
    - Respecter le commutateur global DISABLE_ALL_EMAILS, EMAIL_TEST_MODE et le pare-feu.
    Returns True if sent/simulated/dispatched successfully, False otherwise.
    """
    if not mentioned_member:
        return False

    member_name = getattr(mentioned_member, "name", "") or ""
    member_prenom = getattr(mentioned_member, "prenom", "") or member_name
    to_email = getattr(mentioned_member, "email", None)

    # 1. Garde-fou Anti-auto-mention (s'applique uniquement aux mentions directes individuelles, JAMAIS à @all)
    author_clean = (author_name or "").strip().lower()
    name_clean = member_name.strip().lower()
    prenom_clean = member_prenom.strip().lower()

    if not is_collective and author_clean and (
        author_clean == name_clean
        or author_clean == prenom_clean
        or (len(author_clean) >= 3 and (author_clean in name_clean or name_clean in author_clean))
        or (len(prenom_clean) >= 3 and (prenom_clean in author_clean or author_clean in prenom_clean))
    ):
        logger.info(f"[MENTION] Anti-auto-mention ignorée : '{author_name}' s'est mentionné(e) lui-même ({member_name}). Aucun email.")
        return False

    # 2. Préférence d'envoi d'e-mail physique du membre (directe ou collective @all)
    pref_enabled = getattr(mentioned_member, "notify_mention_all", True) if is_collective else getattr(mentioned_member, "notify_mentions", True)
    if not pref_enabled:
        logger.info(f"[MENTION] Envoi e-mail physique désactivé par préférence pour {member_name} (is_collective={is_collective}). L'e-mail reste simulé pour la cloche.")
        actually_send = False

    # 3. Construction du message HTML selon la charte de la SCI Hellenvilliers
    import html as html_lib
    safe_message = html_lib.escape(message_text or "").replace("\n", "<br>")
    safe_author = html_lib.escape(author_name or "Un associé")
    safe_title = html_lib.escape(context_title or "Discussion")

    greeting_name = member_prenom or member_name or "associé(e)"

    if is_collective:
        subject = f'[Hellenvilliers SCI] 📢 {author_name} a mentionné tous les associés dans "{context_title}"'
        preheader = f"{author_name} a adressé un message à tous les associés dans {context_title}"
        email_title = "Mention collective dans une discussion"
        intro_text = f"<strong>{safe_author}</strong> a adressé un message à <strong>l'ensemble des associés (@all)</strong> dans la discussion de <strong>{safe_title}</strong> :"
    else:
        subject = f'[Hellenvilliers SCI] {author_name} vous a mentionné(e) dans "{context_title}"'
        preheader = f"{author_name} vous a mentionné(e) dans la discussion de {context_title}"
        email_title = "Mention dans une discussion"
        intro_text = f"<strong>{safe_author}</strong> vous a mentionné(e) dans la discussion de <strong>{safe_title}</strong> :"

    content_html = f"""
    <p>Bonjour {greeting_name},</p>
    <p>{intro_text}</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #1e3a2f; border-radius: 6px; padding: 16px 20px; margin: 20px 0; font-style: italic; color: #1f2937; font-size: 15px; line-height: 1.6;">
        « {safe_message} »
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Vous pouvez accéder directement à la discussion pour prendre connaissance de l'échange et y répondre :
    </p>
    <p style="font-size: 12px; color: #6b7280; margin-top: 24px; padding-top: 12px; border-top: 1px solid #eee;">
        💡 <em>Vous pouvez désactiver cette notification à tout moment dans vos <a href="{APP_BASE_URL}/#settings" style="color: #2d5a47; text-decoration: underline;">Paramètres &amp; Préférences</a>.</em>
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

    # 4. Enregistrement systématique de l'email dispatché pour la cloche et aperçu modale
    email_entry = record_dispatched_email(
        trigger_action="mention_all" if is_collective else "mention",
        subject=subject,
        recipients=to_email or "famille@sci-familiale.fr",
        html_content=html_body,
        recipients_names=[greeting_name],
        status="sent" if (actually_send and not is_email_disabled() and not is_test_mode() and to_email and "@" in str(to_email)) else "simulated"
    )
    setattr(send_mention_notification, "last_dispatched_email", email_entry)

    # 5. Vérification de l'adresse e-mail & coupe-circuit pour envoi réel
    if not pref_enabled:
        return False

    if not actually_send or not to_email or "@" not in str(to_email) or is_email_disabled():
        return True

    # 6. Envoi de l'e-mail via Resend
    res = send_email(to_email=to_email, subject=subject, html_content=html_body)

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
    import html as html_lib
    safe_message = html_lib.escape(message_text or "").replace("\n", "<br>")
    safe_author = html_lib.escape(author_name or "Un associé")
    safe_title = html_lib.escape(task_title or "Tâche")
    greeting_name = recipient_name or "associé(e)"

    subject = f'[Hellenvilliers SCI] 💬 Nouveau message sur votre tâche : {task_title}'
    preheader = f"{author_name} a publié un message sur votre tâche {task_title}"
    action_url = f"{APP_BASE_URL}/taches?task_id={task_id}"

    content_html = f"""
    <p>Bonjour {greeting_name},</p>
    <p><strong>{safe_author}</strong> a publié un nouveau message sur une tâche que vous avez créée ou proposée (<strong>{safe_title}</strong>) :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #1e3a2f; border-radius: 6px; padding: 16px 20px; margin: 20px 0; font-style: italic; color: #1f2937; font-size: 15px; line-height: 1.6;">
        « {safe_message} »
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Vous pouvez accéder directement à la tâche pour lire l'échange et y répondre :
    </p>
    <p style="font-size: 12px; color: #6b7280; margin-top: 24px; padding-top: 12px; border-top: 1px solid #eee;">
        💡 <em>Vous pouvez désactiver cette notification à tout moment dans vos <a href="{APP_BASE_URL}/#settings" style="color: #2d5a47; text-decoration: underline;">Paramètres &amp; Préférences</a>.</em>
    </p>
    """

    html_body = render_email_layout(
        title="Nouveau message sur votre tâche",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter la tâche"
    )

    names = [greeting_name]
    email_entry = record_dispatched_email(
        trigger_action="task_chat_activity",
        subject=subject,
        recipients=to_email,
        html_content=html_body,
        recipients_names=names,
        status="sent" if (actually_send and not is_email_disabled() and not is_test_mode()) else "simulated"
    )

    if actually_send and not is_email_disabled() and not is_test_mode():
        res = send_email(to_email=to_email, subject=subject, html_content=html_body)
    else:
        res = {"status": "simulated", "id": email_entry["id"]}

    if isinstance(res, dict):
        res["_email_dispatched"] = email_entry
    return res


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
    import html as html_lib
    safe_message = html_lib.escape(message_text or "").replace("\n", "<br>")
    safe_author = html_lib.escape(author_name or "Un associé")
    safe_title = html_lib.escape(vote_title or "Scrutin")
    greeting_name = recipient_name or "associé(e)"

    subject = f'[Hellenvilliers SCI] 💬 Nouveau message sur votre vote : {vote_title}'
    preheader = f"{author_name} a publié un message sur votre scrutin {vote_title}"
    action_url = f"{APP_BASE_URL}/taches?project_id={project_id}"

    content_html = f"""
    <p>Bonjour {greeting_name},</p>
    <p><strong>{safe_author}</strong> a publié un nouveau message sur un scrutin que vous avez proposé (<strong>{safe_title}</strong>) :</p>

    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #1e3a2f; border-radius: 6px; padding: 16px 20px; margin: 20px 0; font-style: italic; color: #1f2937; font-size: 15px; line-height: 1.6;">
        « {safe_message} »
    </div>

    <p style="color: #4b5563; font-size: 14px;">
        Vous pouvez accéder directement au scrutin pour lire l'échange et y répondre :
    </p>
    <p style="font-size: 12px; color: #6b7280; margin-top: 24px; padding-top: 12px; border-top: 1px solid #eee;">
        💡 <em>Vous pouvez désactiver cette notification à tout moment dans vos <a href="{APP_BASE_URL}/#settings" style="color: #2d5a47; text-decoration: underline;">Paramètres &amp; Préférences</a>.</em>
    </p>
    """

    html_body = render_email_layout(
        title="Nouveau message sur votre vote",
        preheader=preheader,
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter le scrutin"
    )

    names = [greeting_name]
    email_entry = record_dispatched_email(
        trigger_action="vote_chat_activity",
        subject=subject,
        recipients=to_email,
        html_content=html_body,
        recipients_names=names,
        status="sent" if (actually_send and not is_email_disabled() and not is_test_mode()) else "simulated"
    )

    if actually_send and not is_email_disabled() and not is_test_mode():
        res = send_email(to_email=to_email, subject=subject, html_content=html_body)
    else:
        res = {"status": "simulated", "id": email_entry["id"]}

    if isinstance(res, dict):
        res["_email_dispatched"] = email_entry
    return res



import os
import json
import logging
import urllib.request
import urllib.error
from typing import List, Optional, Union, Set

logger = logging.getLogger("email_service")

# Load .env file if present
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")

# Circuit Breaker / Test Mode Configuration
EMAIL_TEST_MODE: bool = os.getenv("EMAIL_TEST_MODE", "true").lower() in ("true", "1", "yes")
EMAIL_TEST_REDIRECT_TO: str = os.getenv("EMAIL_TEST_REDIRECT_TO", "henri.jamet.ch@gmail.com").strip()

ALLOWED_TEST_RECIPIENTS: Set[str] = {
    "henri.jamet.ch@gmail.com",
    "hellenvillierssci@gmail.com"
}
_env_allowed = os.getenv("EMAIL_ALLOWED_RECIPIENTS", "")
if _env_allowed:
    for item in _env_allowed.split(","):
        cleaned = item.strip().lower()
        if cleaned:
            ALLOWED_TEST_RECIPIENTS.add(cleaned)

DEFAULT_MEMBER_EMAILS: List[str] = [
    "henri@sci-familiale.fr",
    "hortense@sci-familiale.fr",
    "marguerite@sci-familiale.fr",
    "eugenie@sci-familiale.fr",
    "josephine@sci-familiale.fr",
    "maman@sci-familiale.fr",
    "frederic@sci-familiale.fr"
]

def send_email(
    to_email: Union[str, List[str]],
    subject: str,
    html_content: str,
    from_email: str = "onboarding@resend.dev"
) -> dict:
    """
    Sends an email using Resend HTTP API client.
    Enforces a strict hermetic circuit breaker when EMAIL_TEST_MODE is True:
    - Intercepts any recipient not present in ALLOWED_TEST_RECIPIENTS.
    - Redirects them to EMAIL_TEST_REDIRECT_TO (henri.jamet.ch@gmail.com).
    - Prefixes the subject with [TEST - Destinataire intercepté: {original}].
    - Injects a red warning banner into the HTML body.
    - Deduplicates recipients to avoid multiple sends.
    - Executes completely before any HTTP network call to api.resend.com.
    """
    # Normalize input recipients
    if isinstance(to_email, str):
        raw_recipients = [to_email]
    elif isinstance(to_email, (list, tuple, set)):
        raw_recipients = list(to_email)
    else:
        raw_recipients = [str(to_email)]

    # Check effective test mode dynamically
    test_mode = os.getenv("EMAIL_TEST_MODE", str(EMAIL_TEST_MODE)).lower() in ("true", "1", "yes")
    redirect_target = os.getenv("EMAIL_TEST_REDIRECT_TO", EMAIL_TEST_REDIRECT_TO).strip()

    # Refresh allowed recipients from environment if dynamically modified
    allowed_recipients = set(ALLOWED_TEST_RECIPIENTS)
    dyn_allowed = os.getenv("EMAIL_ALLOWED_RECIPIENTS", "")
    if dyn_allowed:
        for item in dyn_allowed.split(","):
            cleaned = item.strip().lower()
            if cleaned:
                allowed_recipients.add(cleaned)

    final_recipients: List[str] = []
    seen: Set[str] = set()
    intercepted_recipients: List[str] = []

    if test_mode:
        for r in raw_recipients:
            clean_r = str(r).strip()
            if not clean_r:
                continue
            if clean_r.lower() in allowed_recipients:
                if clean_r.lower() not in seen:
                    seen.add(clean_r.lower())
                    final_recipients.append(clean_r)
            else:
                intercepted_recipients.append(clean_r)
                logger.warning(
                    f"[EMAIL CIRCUIT BREAKER] Intercepted recipient '{clean_r}' (not in ALLOWED_TEST_RECIPIENTS). "
                    f"Redirecting to '{redirect_target}'."
                )
                print(
                    f"[EMAIL CIRCUIT BREAKER] Intercepted recipient '{clean_r}' (not in ALLOWED_TEST_RECIPIENTS). "
                    f"Redirecting to '{redirect_target}'."
                )
                if redirect_target.lower() not in seen:
                    seen.add(redirect_target.lower())
                    final_recipients.append(redirect_target)

        # Update subject and body if any recipients were intercepted
        if intercepted_recipients:
            intercepted_display = ", ".join(intercepted_recipients)
            subject_prefix = f"[TEST - Destinataire intercepté: {intercepted_display}]"
            if not subject.startswith(subject_prefix):
                subject = f"{subject_prefix} {subject}"

            warning_banner = (
                f'<div style="background-color: #fee2e2; border: 2px solid #ef4444; color: #991b1b; '
                f'padding: 14px 18px; border-radius: 8px; margin-bottom: 24px; font-family: Arial, sans-serif;">\n'
                f'    <div style="font-weight: bold; font-size: 15px; margin-bottom: 6px;">'
                f'⚠️ [MODE TEST - COUPE-CIRCUIT EMAIL ACTIVÉ]</div>\n'
                f'    <div style="font-size: 13px; line-height: 1.5;">\n'
                f'        Cet email était initialement destiné à : <strong>{intercepted_display}</strong>.<br/>\n'
                f'        En raison du mode hermétique de test (EMAIL_TEST_MODE=true), il a été intercepté '
                f'et redirigé en toute sécurité vers : <strong>{redirect_target}</strong>.<br/>\n'
                f'        <em>Aucun destinataire non autorisé n\'a reçu cet email.</em>\n'
                f'    </div>\n'
                f'</div>\n'
            )
            html_content = warning_banner + html_content
    else:
        for r in raw_recipients:
            clean_r = str(r).strip()
            if clean_r and clean_r.lower() not in seen:
                seen.add(clean_r.lower())
                final_recipients.append(clean_r)

    if not final_recipients:
        msg = "[EMAIL SERVICE] No valid recipients to send to."
        logger.warning(msg)
        print(msg)
        return {"warning": msg}

    api_key = os.environ.get("RESEND_API_KEY", RESEND_API_KEY)
    if not api_key:
        logger.warning("[EMAIL SERVICE] RESEND_API_KEY is not configured. Email simulated.")
        print("[EMAIL SERVICE] RESEND_API_KEY is not configured. Email simulated.")
        return {
            "simulated": True,
            "to": final_recipients,
            "subject": subject,
            "html": html_content,
            "intercepted": intercepted_recipients
        }

    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "from": from_email,
        "to": final_recipients,
        "subject": subject,
        "html": html_content
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read().decode("utf-8")
            result = json.loads(resp_body)
            logger.info(f"[EMAIL SERVICE] Email successfully sent to {final_recipients}: {result}")
            return result
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        logger.error(f"[EMAIL SERVICE] Resend HTTP Error {e.code}: {err_body}")
        print(f"[EMAIL SERVICE] Resend HTTP Error {e.code}: {err_body}")
        return {"error": err_body, "status_code": e.code}
    except Exception as e:
        logger.error(f"[EMAIL SERVICE] Resend Error: {str(e)}")
        print(f"[EMAIL SERVICE] Resend Error: {str(e)}")
        return {"error": str(e)}



def notify_coordinator_new_issue(
    issue_title: str,
    created_by: str,
    description: str,
    category: str = "SIGNALEMENT",
    priority: str = "Moyenne",
    coordinator_email: str = "henri@sci-familiale.fr"
) -> dict:
    """
    Trigger 1: Email notification to coordinator (henri@sci-familiale.fr) upon new issue/signalement submission.
    """
    subject = f"[SCI Familiale] Nouveau signalement : {issue_title}"
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #0f172a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">🔔 Nouveau Signalement Soumis</h2>
        <p><strong>Signalé par :</strong> {created_by}</p>
        <p><strong>Titre :</strong> {issue_title}</p>
        <p><strong>Catégorie :</strong> {category}</p>
        <p><strong>Priorité :</strong> <span style="color: #ef4444; font-weight: bold;">{priority}</span></p>
        <div style="background-color: #f8fafc; padding: 12px; border-left: 4px solid #3b82f6; margin: 15px 0;">
            <p style="margin: 0; font-style: italic;">"{description}"</p>
        </div>
        <p style="color: #64748b; font-size: 14px;">Connectez-vous sur l'application SCI Familiale pour traiter ce signalement.</p>
    </div>
    """
    return send_email(to_email=coordinator_email, subject=subject, html_content=html_content)


def notify_all_members_project_vote(
    project_title: str,
    submitted_by: str,
    description: str,
    estimated_cost: float = 0.0,
    project_id: Optional[int] = None,
    member_emails: Optional[List[str]] = None
) -> dict:
    """
    Trigger 2: Email notification to all 7 family members when a project is opened for voting.
    """
    recipients = member_emails or DEFAULT_MEMBER_EMAILS
    subject = f"[SCI Familiale] Nouveau projet ouvert au vote : {project_title}"
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #0f172a; border-bottom: 2px solid #10b981; padding-bottom: 10px;">🗳️ Nouveau Projet Ouvert au Vote</h2>
        <p>Un nouveau projet d'initiative a été soumis et nécessite le vote de tous les associés de la SCI Familiale.</p>
        <p><strong>Proposé par :</strong> {submitted_by}</p>
        <p><strong>Intitulé du Projet :</strong> {project_title}</p>
        <p><strong>Coût Estimé :</strong> {estimated_cost:.2f} €</p>
        <div style="background-color: #f8fafc; padding: 12px; border-left: 4px solid #10b981; margin: 15px 0;">
            <p style="margin: 0; font-style: italic;">"{description}"</p>
        </div>
        <p style="margin-top: 20px;">
            <a href="https://sci-familiale.fr" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Accéder à l'Espace Vote</a>
        </p>
        <p style="color: #64748b; font-size: 14px; margin-top: 20px;">1 associé = 1 vote. Merci de donner votre avis (Pour / Contre / Abstention).</p>
    </div>
    """
    return send_email(to_email=recipients, subject=subject, html_content=html_content)

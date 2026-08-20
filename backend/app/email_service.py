import os
import json
import urllib.request
import urllib.error
from typing import List, Optional, Union

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

DEFAULT_MEMBER_EMAILS = [
    "henri@sci-familiale.fr",
    "hortense@sci-familiale.fr",
    "marguerite@sci-familiale.fr",
    "eugenie@sci-familiale.fr",
    "josephine@sci-familiale.fr",
    "elisabeth@sci-familiale.fr",
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
    """
    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json"
    }
    recipients = [to_email] if isinstance(to_email, str) else to_email
    payload = {
        "from": from_email,
        "to": recipients,
        "subject": subject,
        "html": html_content
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read().decode("utf-8")
            return json.loads(resp_body)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"Resend Email HTTP Error {e.code}: {err_body}")
        return {"error": err_body, "status_code": e.code}
    except Exception as e:
        print(f"Resend Email Error: {str(e)}")
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

import os
import hashlib
import mimetypes
import json
import shutil
import uuid
import logging
import secrets
import string
import re
import unicodedata
from datetime import datetime, timedelta
from typing import List, Optional, Any, Dict
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form, status, Request, BackgroundTasks, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, RedirectResponse
from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy import func, or_, and_
from sqlalchemy.exc import IntegrityError

from .database import engine, Base, get_db
from .models import (
    Property, User, Member, Issue, Comment, IssueComment, Reservation, Project,
    ProjectVote, ProjectComment, AdminDocument, DocumentCategory, MemberAvailability,
    VademecumItem, MaintenanceTask, StayTaskAssignment, Task, TaskComment, Log,
    BankAccount, BankTransaction, BankAuthSession, MemberSettings, ThermalSettings,
    Notification
)
from .schemas import (
    LoginRequest, PropertyResponse, UserResponse, MemberResponse, TokenResponse,
    IssueCreate, IssueUpdate, IssueResponse,
    CommentCreate, CommentResponse, IssueCommentCreate, IssueCommentResponse,
    ReservationCreate, ReservationUpdate, ReservationResponse,
    ProjectCreate, ProjectReview, ProjectApprove, ProjectVoteCreate, ProjectVoteResponse, ProjectResponse, VoteEnum,
    ProjectCommentCreate, ProjectCommentResponse,
    AdminDocumentCreate, AdminDocumentUpdate, AdminDocumentResponse, DocumentAttachRequest,
    DocumentCategoryCreate, DocumentCategoryUpdate, DocumentCategoryResponse,
    ClassificationEnum, TaskWeightEnum,
    AvailabilitySet, AvailabilityBatchCreate, AvailabilityResponse, SmartMatchItem,
    VademecumItemCreate, VademecumItemUpdate, VademecumItemResponse,
    MaintenanceTaskCreate, MaintenanceTaskResponse, StayTaskAssignmentResponse, TaskCompletionSubmit,
    StatsResponse, UserWorkloadStats, WorkloadSummaryResponse,
    HeatingStatusResponse, HeatingModeRequest, HeatingTemperatureRequest,
    HeatingSettingsRequest, HeatingSettingsResponse, PoolSettingsRequest, PoolSettingsResponse,
    PoolPumpModeRequest, PoolHeatingModeRequest,
    DhwModeRequest, DhwTemperatureRequest,
    PiscineStatusResponse, StayBalanceResponse, StayBalanceMember,
    TaskCreate, TaskUpdate, TaskResponse, TaskCommentCreate, TaskCommentResponse, TaskCommentReactRequest, TaskCloseRequest,
    ALLOWED_REACTION_EMOJIS,
    BankAuthStartRequest, BankAuthStartResponse, BankAuthCallbackRequest,
    BankAccountResponse, BankTransactionResponse, BankSyncResponse, BankStatusResponse,
    ProfileUpdateRequest, ChangePasswordRequest, MemberSettingsResponse, MemberSettingsUpdate,
    VoteSubmissionRequest, ForgotPasswordRequest, NotificationResponse
)
from .seed import seed_database
from .services.workload_balancer import calculate_workload_distribution, resolve_auto_assignment_by_workload, get_task_charge_points, TASK_CHARGE_WEIGHTS
from .services.vicare_service import ViCareService
from .services.klereo_service import KlereoService
from .services.banking import enable_banking_service
from .services.drive_service import drive_jail_service, SecurityException
from .security import (
    rate_limiter, verify_password, hash_password, create_access_token, decode_access_token, normalize_prenom, pwd_context
)
from .services.email_service import (
    send_email,
    send_task_assigned_email,
    send_task_creation_pending_email,
    send_vote_creation_pending_email,
    send_vote_arbitration_email,
    send_vote_required_email,
    send_vote_closed_email,
    send_stay_booked_email,
    send_thermal_change_email,
    send_password_reset_email,
    send_mention_notification,
    notify_coordinator_new_issue,
    notify_all_members_project_vote,
    record_dispatched_email,
    render_email_layout,
    RECENT_DISPATCHED_EMAILS,
    APP_BASE_URL
)
from .migrate_notifications import migrate_engine
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger("sci_api")


# Create DB tables & ensure seed data on startup (safe startup)
# Sur Vercel Serverless, la base PostgreSQL Supabase est déjà migrée et peuplée de façon pérenne.
# Ré-exécuter create_all et seed_database à chaque cold-start de lambda ajoutait 2 à 4 secondes de latence.
is_vercel = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
force_init = os.environ.get("FORCE_DB_RESET", "false").lower() == "true" or os.environ.get("RUN_DB_MIGRATION", "false").lower() == "true"

if not is_vercel or force_init:
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        logger.warning(f"Notice: Base.metadata.create_all could not complete on startup: {e}")

    try:
        with next(get_db()) as db:
            seed_database(db)
    except Exception as e:
        logger.warning(f"Notice: seed_database could not complete on startup: {e}")

app = FastAPI(
    title="SCI Familiale Management API",
    description="API pour la gestion des propriétés de la SCI Familiale, des projets & votes, du calendrier croisé et du vademecum.",
    version="2.0.0"
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

@app.get("/api/emails/recent", tags=["Emails"])
def get_recent_emails():
    """Retourne la liste des récents e-mails dispatchés ou simulés (max 20)."""
    return RECENT_DISPATCHED_EMAILS


# ==============================================================================
# UNIFIED NOTIFICATIONS SERVICE & API (Annotation 13)
# ==============================================================================

def synthesize_email_entry_for_notification(
    title: str,
    description: str,
    notif_type: str = "info",
    link_path: Optional[str] = None,
    member: Optional[Member] = None
) -> dict:
    """
    Annotation 13:
    Génère un objet e-mail riche et canonique conforme pour toute notification qui n'en a pas.
    Garantit que le bouton ✉️ est TOUJOURS présent et cliquable dans la cloche.
    """
    subject = f"[SCI Hellenvilliers] {title}"
    action_url = f"{APP_BASE_URL}{link_path}" if link_path else f"{APP_BASE_URL}/"
    greeting = f"Bonjour {member.prenom}," if (member and getattr(member, 'prenom', None)) else "Bonjour,"

    import html as html_lib
    safe_desc = html_lib.escape(description or title).replace("\n", "<br>")

    content_html = f"""
    <p>{greeting}</p>
    <p>Une nouvelle notification a été enregistrée au Domaine d'Hellenvilliers :</p>
    <div style="background-color: #f9f8f6; border: 1px solid #e5e3dc; border-left: 4px solid #1e3a2f; border-radius: 6px; padding: 16px 20px; margin: 20px 0;">
        <div style="font-size: 16px; font-weight: bold; color: #1e3a2f; margin-bottom: 8px;">
            {title}
        </div>
        <p style="color: #374151; font-size: 14px; margin: 0; line-height: 1.6;">
            {safe_desc}
        </p>
    </div>
    <p style="color: #4b5563; font-size: 14px;">
        Retrouvez tous les détails et gérez vos actions directement depuis le portail de la SCI.
    </p>
    """
    html_body = render_email_layout(
        title=title,
        preheader=(description or title)[:120],
        content_html=content_html,
        action_url=action_url,
        action_label="Consulter sur le portail"
    )
    recips = [member.email] if (member and getattr(member, 'email', None)) else ["hellenvillierssci@gmail.com"]
    names = [member.name or member.prenom] if (member and (getattr(member, 'name', None) or getattr(member, 'prenom', None))) else ["Famille Hellenvilliers"]

    return {
        "id": str(uuid.uuid4()),
        "created_at": datetime.utcnow().isoformat() + "Z",
        "trigger_action": notif_type or "notification",
        "subject": subject,
        "recipients": recips,
        "to": recips,
        "recipients_names": names,
        "html_content": html_body,
        "status": "simulated",
        "is_simulated": True
    }


def create_internal_notification(
    db: Session,
    title: str,
    description: str,
    notif_type: str = "info",
    member_id: Optional[int] = None,
    link_path: Optional[str] = None,
    link_id: Optional[str] = None,
    email_entry: Optional[dict] = None
) -> Optional[Notification]:
    """
    Règle unifiée de notification (Annotation 13) :
    Tout événement générant un email DOIT obligatoirement publier une notification interne
    dans la cloche en haut à droite (NotificationBell / table notifications).
    Toute notification dans la cloche a OBLIGATOIREMENT un courriel formaté associé.
    """
    try:
        if not email_entry or not isinstance(email_entry, dict) or not email_entry.get("html_content"):
            target_m = None
            if member_id:
                try:
                    target_m = db.query(Member).filter(Member.id == member_id).first()
                except Exception:
                    pass
            email_entry = synthesize_email_entry_for_notification(title, description, notif_type, link_path, target_m)

        raw_email_str = json.dumps(email_entry) if email_entry else None
        notif = Notification(
            member_id=member_id,
            title=title,
            description=description,
            type=notif_type,
            link_path=link_path,
            link_id=str(link_id) if link_id is not None else None,
            email_entry=raw_email_str,
            is_read=False,
            created_at=datetime.utcnow()
        )
        db.expire_on_commit = False
        db.add(notif)
        db.commit()
        db.refresh(notif)
        return notif
    except Exception as e:
        logger.error(f"[NOTIFICATION ERROR] Échec création notification interne: {e}")
        try:
            db.rollback()
        except Exception:
            pass
        return None


def format_notification_response(notif: Notification) -> dict:
    """Formate une notification avec son objet e-mail complet dé-sérialisé pour le frontend."""
    email_data = None
    if getattr(notif, "email_entry", None):
        try:
            email_data = json.loads(notif.email_entry) if isinstance(notif.email_entry, str) else notif.email_entry
        except Exception:
            email_data = None

    if not email_data or not isinstance(email_data, dict) or not email_data.get("html_content"):
        email_data = synthesize_email_entry_for_notification(
            title=notif.title,
            description=notif.description or "",
            notif_type=notif.type or "info",
            link_path=notif.link_path,
            member=getattr(notif, "member", None)
        )

    # Assure la présence de to / recipients et du flag is_simulated
    if isinstance(email_data, dict):
        if "to" not in email_data and "recipients" in email_data:
            email_data["to"] = email_data["recipients"]
        if "recipients" not in email_data and "to" in email_data:
            email_data["recipients"] = email_data["to"]
        if "is_simulated" not in email_data:
            email_data["is_simulated"] = (email_data.get("status") == "simulated")

    return {
        "id": notif.id,
        "member_id": notif.member_id,
        "title": notif.title,
        "description": notif.description,
        "type": notif.type or "info",
        "link_path": notif.link_path,
        "link_id": notif.link_id,
        "email_entry": email_data,
        "email": email_data,  # Alias direct pour consultation modale EmailPreviewModal
        "is_read": bool(notif.is_read),
        "created_at": notif.created_at.isoformat() if notif.created_at else None
    }


# --- Auth & Users Dependencies ---

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Dependency to retrieve the currently authenticated User from JWT token."""
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    elif "token" in request.query_params:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="[Auth Error] Jeton d'authentification manquant."
        )

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="[Auth Error] Jeton d'authentification invalide ou expiré."
        )

    user_id = payload.get("user_id")
    prenom = payload.get("sub")
    user = None
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
    if not user and prenom:
        user = db.query(User).filter(func.lower(User.prenom) == prenom.strip().lower()).first()
        if not user:
            input_norm = normalize_prenom(prenom)
            for u in db.query(User).all():
                u_norm = normalize_prenom(u.prenom)
                if u_norm == input_norm or (input_norm in ["elisabeth", "maman"] and u_norm in ["elisabeth", "maman"]):
                    user = u
                    break

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="[Auth Error] Utilisateur non trouvé pour ce jeton."
        )

    return user


def get_optional_current_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    """Optional user dependency that returns None if authentication header is absent or invalid."""
    try:
        return get_current_user(request, db)
    except HTTPException:
        return None


@app.get("/api/notifications", tags=["Notifications"])
def list_notifications(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Retourne la liste des notifications internes pour la cloche :
    - Diffusion globale (member_id IS NULL)
    - Diffusion ciblée pour l'utilisateur connecté (member_id == current_user.id)
    """
    try:
        query = db.query(Notification)
        if current_user:
            query = query.filter(or_(Notification.member_id.is_(None), Notification.member_id == current_user.id))
        else:
            query = query.filter(Notification.member_id.is_(None))
        
        notifs = query.order_by(Notification.created_at.desc()).limit(60).all()
        return [format_notification_response(n) for n in notifs]
    except Exception as e:
        logger.error(f"[NOTIFICATION API ERROR] Erreur listing notifications: {e}")
        return []


@app.post("/api/notifications/{notif_id}/read", tags=["Notifications"])
@app.patch("/api/notifications/{notif_id}/read", tags=["Notifications"])
def mark_single_notification_read(notif_id: int, db: Session = Depends(get_db)):
    """Marque une notification individuelle comme lue."""
    notif = db.query(Notification).filter(Notification.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification non trouvée")
    notif.is_read = True
    db.commit()
    return {"status": "ok", "id": notif_id, "is_read": True}


@app.post("/api/notifications/read-all", tags=["Notifications"])
@app.patch("/api/notifications/read-all", tags=["Notifications"])
def mark_all_notifications_as_read(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """Marque toutes les notifications non lues comme lues pour l'utilisateur."""
    query = db.query(Notification).filter(Notification.is_read == False)
    if current_user:
        query = query.filter(or_(Notification.member_id.is_(None), Notification.member_id == current_user.id))
    else:
        query = query.filter(Notification.member_id.is_(None))
    
    query.update({Notification.is_read: True}, synchronize_session=False)
    db.commit()
    return {"status": "ok", "message": "Toutes les notifications ont été marquées comme lues"}


@app.delete("/api/notifications/{notif_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Notifications"])
def delete_single_notification(notif_id: int, db: Session = Depends(get_db)):
    """Supprime une notification de la liste."""
    notif = db.query(Notification).filter(Notification.id == notif_id).first()
    if notif:
        db.delete(notif)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Security Headers & Anti-DDoS Rate Limiting Middleware
@app.middleware("http")
async def security_and_rate_limit_middleware(request: Request, call_next):
    ip = rate_limiter.get_client_ip(request)
    if request.url.path.startswith("/api/"):
        rate_limiter.check_general_rate_limit(ip)

    response = await call_next(request)
    
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response

# Static Uploads directory (Vercel Serverless Read-Only Filesystem Fix F10)
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
DOCUMENTS_DIR = os.path.join(UPLOAD_DIR, "documents")
try:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(DOCUMENTS_DIR, exist_ok=True)
except OSError as e:
    logger.warning(f"Notice: Upload directories could not be created on read-only serverless filesystem: {e}")

if os.path.exists(UPLOAD_DIR):
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Automatic column migration safeguard for Project table in SQLite and PostgreSQL
def run_project_migrations():
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            if engine.dialect.name == "sqlite":
                inspector_query = text("PRAGMA table_info(projects)")
                result = conn.execute(inspector_query).fetchall()
                column_names = [row[1] for row in result]
                if column_names:
                    if "document_urls" not in column_names:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN document_urls TEXT"))
                    if "task_weight" not in column_names:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN task_weight VARCHAR DEFAULT 'MOYEN'"))
                    if "options" not in column_names:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN options TEXT"))
                    if "allow_multiple_choices" not in column_names:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN allow_multiple_choices BOOLEAN DEFAULT 0"))
                    if "external_links" not in column_names:
                        conn.execute(text("ALTER TABLE projects ADD COLUMN external_links TEXT"))
                    conn.commit()
            else:
                conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS document_urls TEXT;"))
                conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS task_weight VARCHAR DEFAULT 'MOYEN';"))
                conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS options TEXT;"))
                conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS allow_multiple_choices BOOLEAN DEFAULT FALSE;"))
                conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS external_links TEXT;"))
                conn.commit()
    except Exception as e:
        logger.warning(f"Notice: run_project_migrations: {e}")

def run_reservation_migrations():
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            if engine.dialect.name == "sqlite":
                inspector_query = text("PRAGMA table_info(reservations)")
                result = conn.execute(inspector_query).fetchall()
                column_names = [row[1] for row in result]
                if column_names:
                    if "cohabitation_type" not in column_names:
                        conn.execute(text("ALTER TABLE reservations ADD COLUMN cohabitation_type VARCHAR(50) DEFAULT 'total'"))
                    conn.commit()
            else:
                conn.execute(text("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cohabitation_type VARCHAR(50) DEFAULT 'total';"))
                conn.commit()
    except Exception as e:
        logger.warning(f"Notice: run_reservation_migrations: {e}")

def run_task_migrations():
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            if engine.dialect.name == "sqlite":
                inspector_query = text("PRAGMA table_info(stay_task_assignments)")
                result = conn.execute(inspector_query).fetchall()
                column_names = [row[1] for row in result]
                if column_names:
                    if "status" not in column_names:
                        conn.execute(text("ALTER TABLE stay_task_assignments ADD COLUMN status VARCHAR DEFAULT 'A_FAIRE'"))
                    if "completion_notes" not in column_names:
                        conn.execute(text("ALTER TABLE stay_task_assignments ADD COLUMN completion_notes TEXT"))
                    if "completion_docs" not in column_names:
                        conn.execute(text("ALTER TABLE stay_task_assignments ADD COLUMN completion_docs TEXT"))
                    conn.commit()

                # Migration pour la table unifiée tasks
                tasks_query = text("PRAGMA table_info(tasks)")
                t_result = conn.execute(tasks_query).fetchall()
                t_columns = [row[1] for row in t_result]
                if t_columns:
                    if "is_recurring" not in t_columns:
                        conn.execute(text("ALTER TABLE tasks ADD COLUMN is_recurring BOOLEAN DEFAULT 0"))
                    if "last_completed_at" not in t_columns:
                        conn.execute(text("ALTER TABLE tasks ADD COLUMN last_completed_at DATETIME"))
                    if "external_links" not in t_columns:
                        conn.execute(text("ALTER TABLE tasks ADD COLUMN external_links TEXT"))
                    if "charge_points" not in t_columns:
                        conn.execute(text("ALTER TABLE tasks ADD COLUMN charge_points INTEGER DEFAULT 3"))
                        conn.execute(text("UPDATE tasks SET charge_points = 3 WHERE charge_points IS NULL"))
                    conn.commit()
            else:
                conn.execute(text("ALTER TABLE stay_task_assignments ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'A_FAIRE';"))
                conn.execute(text("ALTER TABLE stay_task_assignments ADD COLUMN IF NOT EXISTS completion_notes TEXT;"))
                conn.execute(text("ALTER TABLE stay_task_assignments ADD COLUMN IF NOT EXISTS completion_docs TEXT;"))
                conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE;"))
                conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_completed_at TIMESTAMP;"))
                conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS external_links TEXT;"))
                conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS charge_points INTEGER DEFAULT 3;"))
                conn.execute(text("UPDATE tasks SET charge_points = 3 WHERE charge_points IS NULL;"))
                conn.commit()
    except Exception as e:
        logger.warning(f"Notice: run_task_migrations: {e}")

def run_document_migrations():
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            if engine.dialect.name == "sqlite":
                inspector_query = text("PRAGMA table_info(admin_documents)")
                result = conn.execute(inspector_query).fetchall()
                column_names = [row[1] for row in result]
                if column_names:
                    if "drive_file_id" not in column_names:
                        conn.execute(text("ALTER TABLE admin_documents ADD COLUMN drive_file_id VARCHAR(255)"))
                    if "file_data" not in column_names:
                        conn.execute(text("ALTER TABLE admin_documents ADD COLUMN file_data BLOB"))
                    if "task_id" not in column_names:
                        conn.execute(text("ALTER TABLE admin_documents ADD COLUMN task_id INTEGER"))
                    if "file_hash" not in column_names:
                        conn.execute(text("ALTER TABLE admin_documents ADD COLUMN file_hash VARCHAR(64)"))
                    conn.commit()
            else:
                conn.execute(text("ALTER TABLE admin_documents ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(255);"))
                conn.execute(text("ALTER TABLE admin_documents ADD COLUMN IF NOT EXISTS file_data BYTEA;"))
                conn.execute(text("ALTER TABLE admin_documents ADD COLUMN IF NOT EXISTS task_id INTEGER;"))
                conn.execute(text("ALTER TABLE admin_documents ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);"))
                conn.commit()
    except Exception as e:
        logger.warning(f"Notice: run_document_migrations: {e}")

def run_member_migrations():
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            if engine.dialect.name == "sqlite":
                inspector_query = text("PRAGMA table_info(members)")
                result = conn.execute(inspector_query).fetchall()
                column_names = [row[1] for row in result]
                if column_names:
                    if "notify_mentions" not in column_names:
                        conn.execute(text("ALTER TABLE members ADD COLUMN notify_mentions BOOLEAN DEFAULT 1"))
                    if "is_coordinator" not in column_names:
                        conn.execute(text("ALTER TABLE members ADD COLUMN is_coordinator BOOLEAN DEFAULT 0"))
                    if "notify_task_creation" not in column_names:
                        conn.execute(text("ALTER TABLE members ADD COLUMN notify_task_creation BOOLEAN DEFAULT 0"))
                    if "notif_task_completed" not in column_names:
                        conn.execute(text("ALTER TABLE members ADD COLUMN notif_task_completed BOOLEAN DEFAULT 1"))
                    if "notif_stay_confirmation" not in column_names:
                        conn.execute(text("ALTER TABLE members ADD COLUMN notif_stay_confirmation BOOLEAN DEFAULT 1"))
                    if "notif_stay_reminder" not in column_names:
                        conn.execute(text("ALTER TABLE members ADD COLUMN notif_stay_reminder BOOLEAN DEFAULT 1"))
                    if "notif_heating_start" not in column_names:
                        conn.execute(text("ALTER TABLE members ADD COLUMN notif_heating_start BOOLEAN DEFAULT 1"))
                    if "notif_heating_stop" not in column_names:
                        conn.execute(text("ALTER TABLE members ADD COLUMN notif_heating_stop BOOLEAN DEFAULT 1"))
                    conn.execute(text("UPDATE members SET notify_mentions = 1 WHERE notify_mentions IS NULL"))
                    conn.execute(text("UPDATE members SET notify_task_creation = 0 WHERE notify_task_creation IS NULL"))
                    conn.execute(text("UPDATE members SET notif_task_completed = 1 WHERE notif_task_completed IS NULL"))
                    conn.execute(text("UPDATE members SET notif_stay_confirmation = 1 WHERE notif_stay_confirmation IS NULL"))
                    conn.execute(text("UPDATE members SET notif_stay_reminder = 1 WHERE notif_stay_reminder IS NULL"))
                    conn.execute(text("UPDATE members SET notif_heating_start = 1 WHERE notif_heating_start IS NULL"))
                    conn.execute(text("UPDATE members SET notif_heating_stop = 1 WHERE notif_heating_stop IS NULL"))
                    # Migration automatique : Henri Jamet et Joséphine Jamet = is_coordinator True, les autres False
                    conn.execute(text("""
                        UPDATE members 
                        SET is_coordinator = 1 
                        WHERE prenom IN ('Henri', 'Joséphine', 'Josephine') 
                           OR name LIKE '%Henri Jamet%' 
                           OR name LIKE '%Joséphine Jamet%' 
                           OR name LIKE '%Josephine Jamet%'
                           OR (id = 1 AND prenom = 'Henri')
                           OR (id = 2 AND prenom IN ('Joséphine', 'Josephine'))
                    """))
                    conn.execute(text("""
                        UPDATE members 
                        SET is_coordinator = 0 
                        WHERE prenom NOT IN ('Henri', 'Joséphine', 'Josephine') 
                          AND name NOT LIKE '%Henri Jamet%' 
                          AND name NOT LIKE '%Joséphine Jamet%' 
                          AND name NOT LIKE '%Josephine Jamet%'
                    """))
                    conn.commit()
            else:
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS notify_mentions BOOLEAN DEFAULT TRUE;"))
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS is_coordinator BOOLEAN DEFAULT FALSE;"))
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS notify_task_creation BOOLEAN DEFAULT FALSE;"))
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS notif_task_completed BOOLEAN DEFAULT TRUE;"))
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS notif_stay_confirmation BOOLEAN DEFAULT TRUE;"))
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS notif_stay_reminder BOOLEAN DEFAULT TRUE;"))
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS notif_heating_start BOOLEAN DEFAULT TRUE;"))
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS notif_heating_stop BOOLEAN DEFAULT TRUE;"))
                conn.execute(text("UPDATE members SET notify_mentions = TRUE WHERE notify_mentions IS NULL;"))
                conn.execute(text("UPDATE members SET notify_task_creation = FALSE WHERE notify_task_creation IS NULL;"))
                conn.execute(text("UPDATE members SET notif_task_completed = TRUE WHERE notif_task_completed IS NULL;"))
                conn.execute(text("UPDATE members SET notif_stay_confirmation = TRUE WHERE notif_stay_confirmation IS NULL;"))
                conn.execute(text("UPDATE members SET notif_stay_reminder = TRUE WHERE notif_stay_reminder IS NULL;"))
                conn.execute(text("UPDATE members SET notif_heating_start = TRUE WHERE notif_heating_start IS NULL;"))
                conn.execute(text("UPDATE members SET notif_heating_stop = TRUE WHERE notif_heating_stop IS NULL;"))
                conn.execute(text("""
                    UPDATE members 
                    SET is_coordinator = TRUE 
                    WHERE prenom IN ('Henri', 'Joséphine', 'Josephine') 
                       OR name ILIKE '%Henri Jamet%' 
                       OR name ILIKE '%Joséphine Jamet%' 
                       OR name ILIKE '%Josephine Jamet%'
                       OR (id = 1 AND prenom = 'Henri')
                       OR (id = 2 AND prenom IN ('Joséphine', 'Josephine'));
                """))
                conn.execute(text("""
                    UPDATE members 
                    SET is_coordinator = FALSE 
                    WHERE prenom NOT IN ('Henri', 'Joséphine', 'Josephine') 
                      AND name NOT ILIKE '%Henri Jamet%' 
                      AND name NOT ILIKE '%Joséphine Jamet%' 
                      AND name NOT ILIKE '%Josephine Jamet%';
                """))
                conn.commit()
    except Exception as e:
        logger.warning(f"Notice: run_member_migrations: {e}")

try:
    run_member_migrations()
    run_project_migrations()
    run_reservation_migrations()
    run_task_migrations()
    run_document_migrations()
    migrate_engine(engine)
except Exception as e:
    print(f"Migration notice: {e}")



# --- Helper functions ---

def normalize_text_for_matching(text: str) -> str:
    """Removes accents and converts to lowercase for case/accent-insensitive comparisons."""
    if not text:
        return ""
    nfkd = unicodedata.normalize('NFKD', text)
    ascii_text = nfkd.encode('ASCII', 'ignore').decode('utf-8')
    return ascii_text.strip().lower()

def find_mentioned_members(content: str, db: Session) -> List[Member]:
    r"""
    Extracts @mentions with regex r'@([A-Za-zÀ-ÿ0-9_\-]+)' and matches with Member records.
    Returns distinct matched members (case- and accent-insensitive).
    """
    if not content:
        return []
    raw_mentions = re.findall(r'@([A-Za-zÀ-ÿ0-9_\-]+)', content)
    if not raw_mentions:
        return []

    all_members = db.query(Member).all()
    matched_members = []
    seen_ids = set()

    for raw_mention in raw_mentions:
        m_norm = normalize_text_for_matching(raw_mention)
        if not m_norm:
            continue
        if m_norm in ["all", "tous"]:
            for member in all_members:
                if member.id not in seen_ids:
                    matched_members.append(member)
                    seen_ids.add(member.id)
            continue

        for member in all_members:
            if member.id in seen_ids:
                continue
            prenom_norm = normalize_text_for_matching(member.prenom or "")
            name_norm = normalize_text_for_matching(member.name or "")
            name_tokens = [t for t in re.split(r'[\s\(\)\-_]+', name_norm) if t]

            if (
                m_norm == prenom_norm
                or m_norm == name_norm
                or m_norm in name_tokens
                or (m_norm in ["maman", "elisabeth"] and prenom_norm in ["maman", "elisabeth"])
            ):
                matched_members.append(member)
                seen_ids.add(member.id)
                break

    return matched_members


def has_collective_mention(content: str) -> bool:
    """Détecte si un contenu comporte une mention collective @all ou @tous."""
    if not content:
        return False
    return bool(re.search(r'@(?:all|tous)\b', content, re.IGNORECASE))


def dispatch_chat_mentions(
    db: Session,
    content: str,
    author_name: str,
    context_title: str,
    target_url: str,
    link_path: str,
    link_id: Any,
    background_tasks: Optional[BackgroundTasks] = None
):
    """
    Annotation 10 & 13:
    Pipeline unifié de traitement des mentions (@membre et @all/@tous) :
    1. Détecte les mentions individuelles ou collectives (@all / @tous).
    2. Pour chaque membre mentionné (hors l'auteur lui-même) :
       - Vérifie la préférence appropriée (notify_mention_all si @all, sinon notify_mentions).
       - Envoie l'e-mail Resend (ou simulation) et enregistre l'objet e-mail.
       - Crée obligatoirement la notification interne liée dans la cloche avec son e-mail associé.
    """
    if not content or "@" not in content:
        return

    db.expire_on_commit = False
    is_all = has_collective_mention(content)
    all_members = db.query(Member).all()

    if is_all:
        target_members = all_members
    else:
        target_members = find_mentioned_members(content, db)

    for m in target_members:
        _ = (m.id, m.prenom, m.name, m.email)

    author_clean = (author_name or "").strip().lower()

    for member in target_members:
        # Anti-auto-mention
        m_name = (member.name or "").strip().lower()
        m_prenom = (member.prenom or "").strip().lower()
        if author_clean and (
            author_clean == m_name
            or author_clean == m_prenom
            or (len(author_clean) >= 3 and (author_clean in m_name or m_name in author_clean))
            or (len(m_prenom) >= 3 and (m_prenom in author_clean or author_clean in m_prenom))
        ):
            continue

        pref = getattr(member, "notify_mention_all", True) if is_all else getattr(member, "notify_mentions", True)

        dispatched_email = None
        try:
            # Envoi et enregistrement synchrone pour garantir l'association immédiate dans la cloche (Annotation 9)
            send_mention_notification(
                mentioned_member=member,
                author_name=author_name,
                context_title=context_title,
                message_text=content,
                target_url=target_url,
                is_collective=is_all,
                actually_send=bool(pref and member.email)
            )
            dispatched_email = getattr(send_mention_notification, "last_dispatched_email", None)
        except Exception as err:
            logger.error(f"[MENTIONS ERROR] Échec notification email pour {member.prenom}: {err}")

        # Notification interne systématique dans la cloche (Annotation 13 & 10)
        notif_title = f"📢 Mention @all dans {context_title}" if is_all else f"💬 Mention de {author_name}"
        snippet = content[:80] + ("..." if len(content) > 80 else "")
        notif_desc = f"{author_name} a mentionné la famille : « {snippet} »" if is_all else f"« {snippet} »"
        create_internal_notification(
            db=db,
            member_id=member.id,
            title=notif_title,
            description=notif_desc,
            notif_type="mention",
            link_path=link_path,
            link_id=str(link_id) if link_id is not None else None,
            email_entry=dispatched_email
        )

def get_week_dates(year: int, week_number: int):
    """Returns start_date (Monday) and end_date (Sunday) strings for ISO week number."""
    try:
        first_day = datetime.strptime(f"{year}-W{week_number:02d}-1", "%G-W%V-%u")
    except ValueError:
        # Fallback approximation if week calculations vary
        first_day = datetime(year, 1, 1) + timedelta(weeks=week_number - 1)
        first_day -= timedelta(days=first_day.weekday())
    last_day = first_day + timedelta(days=6)
    return first_day.strftime("%Y-%m-%d"), last_day.strftime("%Y-%m-%d")

def format_project_response(project: Project) -> dict:
    votes = project.votes
    total_votes = len(votes)
    pour = sum(1 for v in votes if str(v.vote).upper() in ["POUR", "OUI"])
    contre = sum(1 for v in votes if str(v.vote).upper() in ["CONTRE", "NON"])
    abstention = sum(1 for v in votes if str(v.vote).upper() == "ABSTENTION")
    report_ag = sum(1 for v in votes if str(v.vote).upper() == "REPORT_PROCHAINE_AG")

    pour_pct = round((pour / total_votes * 100)) if total_votes > 0 else 0
    contre_pct = round((contre / total_votes * 100)) if total_votes > 0 else 0
    abstention_pct = round((abstention / total_votes * 100)) if total_votes > 0 else 0

    raw_photo_urls = getattr(project, "photo_urls", None)
    urls_list = []
    if raw_photo_urls:
        urls_list = [u.strip() for u in raw_photo_urls.split(",") if u.strip()]
    if not urls_list and project.photo_url:
        urls_list = [project.photo_url]

    raw_doc_urls = getattr(project, "document_urls", None)
    doc_urls_list = []
    if raw_doc_urls:
        try:
            doc_urls_list = json.loads(raw_doc_urls)
        except Exception:
            doc_urls_list = [u.strip() for u in raw_doc_urls.split(",") if u.strip()]

    raw_options = getattr(project, "options", None)
    options_list = []
    if raw_options:
        try:
            options_list = json.loads(raw_options) if isinstance(raw_options, str) else list(raw_options)
        except Exception:
            options_list = [o.strip() for o in str(raw_options).split(",") if o.strip()]

    raw_external_links = getattr(project, "external_links", None)
    external_links_list = []
    if raw_external_links:
        try:
            external_links_list = json.loads(raw_external_links) if isinstance(raw_external_links, str) else list(raw_external_links)
        except Exception:
            external_links_list = []
    if not isinstance(external_links_list, list):
        external_links_list = []

    options_counts = {}
    for opt in options_list:
        count = 0
        if isinstance(opt, dict):
            opt_str = str(opt.get('label') or opt.get('title') or opt.get('name') or opt.get('value') or '').strip()
        elif isinstance(opt, str):
            opt_str = opt.strip()
        else:
            opt_str = str(opt or '').strip()

        if not opt_str:
            continue

        opt_lower = opt_str.lower()
        for v in votes:
            v_str = str(v.vote or "").strip()
            if v_str.startswith("[") and v_str.endswith("]"):
                try:
                    parsed_multi = json.loads(v_str)
                    if isinstance(parsed_multi, list):
                        matched_in_multi = False
                        for p in parsed_multi:
                            p_str = p.get('label') if isinstance(p, dict) else str(p)
                            if str(p_str).strip().lower() == opt_lower:
                                matched_in_multi = True
                                break
                        if matched_in_multi:
                            count += 1
                            continue
                except Exception:
                    pass
            if v_str.lower() == opt_lower:
                count += 1
        key = opt if isinstance(opt, str) else opt_str
        options_counts[key] = count

    return {
        "id": project.id,
        "property_id": project.property_id,
        "title": project.title,
        "description": project.description,
        "estimated_cost": project.estimated_cost,
        "category": project.category,
        "priority": getattr(project, "priority", "MOYENNE") or "MOYENNE",
        "classification": getattr(project, "classification", "SIGNALEMENT") or "SIGNALEMENT",
        "task_weight": getattr(project, "task_weight", "MOYEN") or "MOYEN",
        "charge": getattr(project, "charge", 1) or 1,
        "add_to_ag_agenda": getattr(project, "add_to_ag_agenda", False) or False,
        "linked_documents": getattr(project, "linked_documents", None),
        "document_urls": doc_urls_list,
        "external_links": external_links_list,
        "supplier_info": getattr(project, "supplier_info", None),
        "submitted_by": project.submitted_by,
        "responsible": project.responsible,
        "photo_url": project.photo_url,
        "photo_urls": urls_list,
        "status": project.status,
        "decision_mode": project.decision_mode,
        "options": options_list,
        "allow_multiple_choices": bool(getattr(project, "allow_multiple_choices", False) or False),
        "coordinator_notes": project.coordinator_notes,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "property": project.property,
        "votes": votes,
        "comments": [
            {
                "id": c.id,
                "project_id": c.project_id,
                "author_name": c.author_name,
                "content": c.content,
                "created_at": c.created_at.isoformat() if c.created_at else None
            }
            for c in (project.comments or [])
        ] if hasattr(project, "comments") and project.comments else [],
        "vote_summary": {

            "total_votes": total_votes,
            "pour": pour,
            "contre": contre,
            "abstention": abstention,
            "report_prochaine_ag": report_ag,
            "pour_pct": pour_pct,
            "contre_pct": contre_pct,
            "abstention_pct": abstention_pct,
            "options_counts": options_counts,
        }
    }


# --- Auth & Users ---




@app.post("/api/auth/login", response_model=TokenResponse)
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = rate_limiter.get_client_ip(request)

    # 1. Anti-Brute Force Rate Limiter check (5 failed attempts -> 15 min lock)
    rate_limiter.check_login_rate_limit(ip)

    prenom_input = req.prenom if req.prenom else None
    email_input = req.email if req.email else None
    name_input = req.name if req.name else None
    user_input = req.username if req.username else None
    ident_input = req.identifier if req.identifier else None

    raw_ident = prenom_input or email_input or name_input or user_input or ident_input or ""
    identifier_clean = raw_ident.strip()
    password_clean = req.password.strip() if req.password else ""

    if not identifier_clean:
        rate_limiter.record_login_failure(ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="[Auth Error] L'identifiant (prénom, nom complet ou email) ne peut pas être vide."
        )

    # 2. Case-insensitive & accent-insensitive lookup across prenom, email, nom/name, full name
    input_norm = normalize_prenom(identifier_clean)
    val_clean = identifier_clean
    val_lower = identifier_clean.lower()

    # Robust multi-criteria query in DB:
    # Member.prenom.ilike(val) OR Member.email.ilike(val) OR Member.nom.ilike(val) OR (prenom || ' ' || nom).ilike(val)
    user = db.query(Member).filter(
        or_(
            Member.prenom.ilike(val_clean),
            Member.email.ilike(val_clean),
            Member.name.ilike(val_clean),
            Member.nom.ilike(val_clean),
            (Member.prenom + ' ' + Member.nom).ilike(val_clean),
            func.lower(Member.prenom) == val_lower,
            func.lower(Member.name) == val_lower,
            func.lower(Member.email) == val_lower
        )
    ).first()

    if not user:
        # Fallback loop using accent-insensitivity (normalize_prenom), email, tokens
        all_users = db.query(Member).all()
        first_token_norm = input_norm.split()[0] if input_norm else ""
        for u in all_users:
            u_norm = normalize_prenom(u.prenom or "")
            u_name_norm = normalize_prenom(u.name or "")
            u_email_clean = (u.email or "").strip().lower()
            u_full_norm = f"{u_norm} {u_name_norm}".strip()

            # Exact match (normalized or lowercase)
            if input_norm in [u_norm, u_name_norm, u_full_norm] or val_lower in [u_norm, u_name_norm, u_email_clean]:
                user = u
                break
            # Token matches (e.g. "Henri Jamet" matches "Henri")
            if first_token_norm and (u_norm == first_token_norm or (first_token_norm in ["elisabeth", "maman"] and u_norm in ["elisabeth", "maman"])):
                user = u
                break
            # Maman / Élisabeth equivalence
            if input_norm in ["elisabeth", "maman"] and u_norm in ["elisabeth", "maman"]:
                user = u
                break
            # Partial match startswith (e.g. "Henri Jamet" starts with "Henri")
            if u_name_norm and (input_norm.startswith(u_norm) or u_name_norm.startswith(input_norm)):
                user = u
                break

    if not user:
        rate_limiter.record_login_failure(ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"[Auth Error] Identifiant '{identifier_clean}' inconnu. Prénoms valides des 7 membres SCI : Henri, Marguerite, Hortense, Joséphine, Eugénie, Frédéric, Maman."
        )

    # 3. Bcrypt Password Verification
    if not verify_password(password_clean, user.password):
        rate_limiter.record_login_failure(ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="[Auth Error] Mot de passe incorrect."
        )

    # Success: Clear failed attempts for IP
    rate_limiter.record_login_success(ip)

    # Generate JWT Token
    access_token = create_access_token(data={"sub": user.prenom, "user_id": user.id})

    user_resp = UserResponse.from_orm(user)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_resp,
        "id": user.id,
        "prenom": user.prenom,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "is_coordinator": bool(getattr(user, "is_coordinator", False)),
        "avatar_color": user.avatar_color,
        "notif_task_assigned": getattr(user, "notif_task_assigned", True),
        "notif_vote_needed": getattr(user, "notif_vote_needed", True),
        "notif_vote_closed": getattr(user, "notif_vote_closed", True),
        "notif_stay_booked": getattr(user, "notif_stay_booked", True),
        "notif_thermal_changes": getattr(user, "notif_thermal_changes", False),
        "notify_mentions": getattr(user, "notify_mentions", True),
        "notify_task_creation": getattr(user, "notify_task_creation", False),
    }

@app.post("/api/auth/forgot-password")
def forgot_password(
    req: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Réinitialise le mot de passe d'un associé et lui expédie un nouveau mot de passe temporaire par email.
    Accepte soit {"prenom": str}, soit {"member_id": int}.
    """
    ip = rate_limiter.get_client_ip(request)
    rate_limiter.check_general_rate_limit(ip)

    # 1. Recherche du membre en base (SQLite et Supabase)
    member = None
    if req.member_id:
        member = db.query(Member).filter(Member.id == req.member_id).first()

    if not member and req.prenom and req.prenom.strip():
        prenom_clean = req.prenom.strip()
        # Direct lookup (case-insensitive)
        member = db.query(Member).filter(func.lower(Member.prenom) == prenom_clean.lower()).first()
        if not member:
            input_norm = normalize_prenom(prenom_clean)
            all_members = db.query(Member).all()
            first_token_norm = input_norm.split()[0] if input_norm else ""
            for m in all_members:
                m_norm = normalize_prenom(m.prenom)
                m_name_norm = normalize_prenom(m.name) if getattr(m, 'name', None) else ""
                if m_norm == input_norm or m_name_norm == input_norm:
                    member = m
                    break
                if first_token_norm and (m_norm == first_token_norm or (first_token_norm in ["elisabeth", "maman"] and m_norm in ["elisabeth", "maman"])):
                    member = m
                    break
                if input_norm in ["elisabeth", "maman"] and m_norm in ["elisabeth", "maman"]:
                    member = m
                    break

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membre introuvable. Veuillez vérifier le prénom ou l'identifiant."
        )

    # Vérification de l'adresse email
    if not member.email or not member.email.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Aucune adresse e-mail n'est renseignée pour {member.prenom}. Veuillez contacter le gérant."
        )

    # 2. Génération d'un mot de passe aléatoire hautement sécurisé de 16 caractères (majuscules, minuscules, chiffres)
    chars = string.ascii_letters + string.digits
    while True:
        new_password = "".join(secrets.choice(chars) for _ in range(16))
        if (any(c.islower() for c in new_password) and
            any(c.isupper() for c in new_password) and
            any(c.isdigit() for c in new_password)):
            break

    # 3. Hachage avec pwd_context.hash(...)
    hashed_password = pwd_context.hash(new_password)

    # 4. Mise à jour hashed_password dans members (et users si répliquée)
    member.password = hashed_password
    if hasattr(member, "hashed_password"):
        setattr(member, "hashed_password", hashed_password)

    # Synchronisation de la table users répliquée si présente
    try:
        from sqlalchemy import text
        db.execute(
            text("UPDATE users SET password = :pwd WHERE id = :id OR lower(prenom) = :prenom"),
            {"pwd": hashed_password, "id": member.id, "prenom": member.prenom.lower()}
        )
    except Exception as e:
        logger.debug(f"Notice synchronisation table users: {e}")

    try:
        log_entry = Log(
            action="FORGOT_PASSWORD_RESET",
            user_name=member.prenom,
            details=f"Nouveau mot de passe temporaire généré et envoyé par e-mail pour {member.prenom}"
        )
        db.add(log_entry)
    except Exception:
        pass

    db.commit()
    db.refresh(member)

    # 5. Envoi de l'email via Resend
    email_res = send_password_reset_email(
        to_email=member.email,
        member_name=member.prenom,
        new_temporary_password=new_password
    )
    logger.info(f"[FORGOT PASSWORD] Reset email envoyé pour {member.prenom} ({member.email}): {email_res}")

    # 6. Réponse standardisée
    return {
        "status": "ok",
        "message": "Un nouveau mot de passe a été envoyé par e-mail."
    }

@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Returns profile info for currently logged in user."""
    return current_user

@app.get("/api/auth/profile", response_model=MemberSettingsResponse)
def get_auth_profile(current_user: User = Depends(get_current_user)):
    """Returns email, identity, and the notification toggles for currently logged in user."""
    return {
        "id": current_user.id,
        "member_id": current_user.id,
        "prenom": current_user.prenom,
        "name": current_user.name,
        "email": current_user.email,
        "notif_task_assigned": getattr(current_user, "notif_task_assigned", True),
        "notif_task_completed": getattr(current_user, "notif_task_completed", True),
        "notif_vote_needed": getattr(current_user, "notif_vote_needed", True),
        "notif_vote_required": getattr(current_user, "notif_vote_needed", True),
        "notif_vote_closed": getattr(current_user, "notif_vote_closed", True),
        "notif_stay_booked": getattr(current_user, "notif_stay_booked", True),
        "notif_stay_confirmation": getattr(current_user, "notif_stay_confirmation", True),
        "notif_stay_reminder": getattr(current_user, "notif_stay_reminder", True),
        "notif_heating_start": getattr(current_user, "notif_heating_start", True),
        "notif_heating_stop": getattr(current_user, "notif_heating_stop", True),
        "notif_thermal_changes": getattr(current_user, "notif_thermal_changes", False),
        "notify_mentions": getattr(current_user, "notify_mentions", True),
        "notify_new_task": getattr(current_user, "notif_task_assigned", True),
        "notify_pending_vote": getattr(current_user, "notif_vote_needed", True),
        "notify_final_decision": getattr(current_user, "notif_vote_closed", True),
        "notify_new_stay": getattr(current_user, "notif_stay_booked", True),
        "notify_thermal_changes": getattr(current_user, "notif_thermal_changes", False),
        "notify_task_creation": getattr(current_user, "notify_task_creation", False),
        "notify_vote_creation": getattr(current_user, "notify_vote_creation", False),
        "notify_vote_arbitration": getattr(current_user, "notify_vote_arbitration", False),
        "notify_mention_all": getattr(current_user, "notify_mention_all", True),
        "is_coordinator": getattr(current_user, "is_coordinator", False),
    }

@app.patch("/api/auth/profile", response_model=MemberSettingsResponse)
@app.put("/api/auth/profile", response_model=MemberSettingsResponse)
def update_auth_profile(
    data: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Updates email and notification preferences for currently logged in user."""
    if data.email is not None:
        email_clean = data.email.strip().lower()
        if email_clean and "@" not in email_clean:
            raise HTTPException(status_code=400, detail="Adresse e-mail invalide.")
        if email_clean and email_clean != (current_user.email or "").lower():
            existing = db.query(User).filter(func.lower(User.email) == email_clean).first()
            if existing and existing.id != current_user.id:
                raise HTTPException(status_code=400, detail="Cette adresse e-mail est déjà utilisée par un autre associé.")
        current_user.email = email_clean or None
    if data.name is not None and data.name.strip():
        current_user.name = data.name.strip()

    # Notification preferences on Member table
    if data.notif_task_assigned is not None:
        current_user.notif_task_assigned = data.notif_task_assigned
    elif data.notify_new_task is not None:
        current_user.notif_task_assigned = data.notify_new_task

    if data.notif_task_completed is not None:
        current_user.notif_task_completed = data.notif_task_completed

    if data.notif_vote_needed is not None:
        current_user.notif_vote_needed = data.notif_vote_needed
    elif data.notif_vote_required is not None:
        current_user.notif_vote_needed = data.notif_vote_required
    elif data.notify_pending_vote is not None:
        current_user.notif_vote_needed = data.notify_pending_vote

    if data.notif_vote_closed is not None:
        current_user.notif_vote_closed = data.notif_vote_closed
    elif data.notify_final_decision is not None:
        current_user.notif_vote_closed = data.notify_final_decision

    if data.notif_stay_booked is not None:
        current_user.notif_stay_booked = data.notif_stay_booked
    elif data.notify_new_stay is not None:
        current_user.notif_stay_booked = data.notify_new_stay

    if data.notif_stay_confirmation is not None:
        current_user.notif_stay_confirmation = data.notif_stay_confirmation

    if data.notif_stay_reminder is not None:
        current_user.notif_stay_reminder = data.notif_stay_reminder

    if data.notif_heating_start is not None:
        current_user.notif_heating_start = data.notif_heating_start

    if data.notif_heating_stop is not None:
        current_user.notif_heating_stop = data.notif_heating_stop

    if data.notif_thermal_changes is not None:
        current_user.notif_thermal_changes = data.notif_thermal_changes
    elif data.notify_thermal_changes is not None:
        current_user.notif_thermal_changes = data.notify_thermal_changes

    if data.notify_mentions is not None:
        current_user.notify_mentions = data.notify_mentions

    if data.notify_task_creation is not None:
        current_user.notify_task_creation = data.notify_task_creation

    if data.notify_vote_creation is not None:
        current_user.notify_vote_creation = data.notify_vote_creation

    if data.notify_vote_arbitration is not None:
        current_user.notify_vote_arbitration = data.notify_vote_arbitration

    if data.notify_mention_all is not None:
        current_user.notify_mention_all = data.notify_mention_all

    db.commit()
    db.refresh(current_user)

    return {
        "id": current_user.id,
        "member_id": current_user.id,
        "prenom": current_user.prenom,
        "name": current_user.name,
        "email": current_user.email,
        "notif_task_assigned": getattr(current_user, "notif_task_assigned", True),
        "notif_task_completed": getattr(current_user, "notif_task_completed", True),
        "notif_vote_needed": getattr(current_user, "notif_vote_needed", True),
        "notif_vote_required": getattr(current_user, "notif_vote_needed", True),
        "notif_vote_closed": getattr(current_user, "notif_vote_closed", True),
        "notif_stay_booked": getattr(current_user, "notif_stay_booked", True),
        "notif_stay_confirmation": getattr(current_user, "notif_stay_confirmation", True),
        "notif_stay_reminder": getattr(current_user, "notif_stay_reminder", True),
        "notif_heating_start": getattr(current_user, "notif_heating_start", True),
        "notif_heating_stop": getattr(current_user, "notif_heating_stop", True),
        "notif_thermal_changes": getattr(current_user, "notif_thermal_changes", False),
        "notify_mentions": getattr(current_user, "notify_mentions", True),
        "notify_new_task": getattr(current_user, "notif_task_assigned", True),
        "notify_pending_vote": getattr(current_user, "notif_vote_needed", True),
        "notify_final_decision": getattr(current_user, "notif_vote_closed", True),
        "notify_new_stay": getattr(current_user, "notif_stay_booked", True),
        "notify_thermal_changes": getattr(current_user, "notif_thermal_changes", False),
        "notify_task_creation": getattr(current_user, "notify_task_creation", False),
        "notify_vote_creation": getattr(current_user, "notify_vote_creation", False),
        "notify_vote_arbitration": getattr(current_user, "notify_vote_arbitration", False),
        "notify_mention_all": getattr(current_user, "notify_mention_all", True),
        "is_coordinator": getattr(current_user, "is_coordinator", False),
    }

@app.post("/api/auth/change-password")
def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Changes password for the currently logged in user directly in-app."""
    old_pw = data.old_password or data.current_password
    if old_pw and not verify_password(old_pw.strip(), current_user.password):
        raise HTTPException(status_code=400, detail="Le mot de passe actuel est incorrect.")
    if not data.new_password:
        raise HTTPException(status_code=400, detail="Veuillez saisir votre nouveau mot de passe.")
    if data.confirm_password is not None and data.confirm_password != data.new_password:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe et sa confirmation ne correspondent pas.")
    if len(data.new_password.strip()) < 4:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit comporter au moins 4 caractères.")

    hashed_pwd = hash_password(data.new_password.strip())
    current_user.password = hashed_pwd
    if hasattr(current_user, "hashed_password"):
        setattr(current_user, "hashed_password", hashed_pwd)

    member = db.query(Member).filter(Member.id == current_user.id).first()
    if not member:
        member = db.query(Member).filter(func.lower(Member.prenom) == current_user.prenom.lower()).first()
    if member:
        member.password = hashed_pwd
        if hasattr(member, "hashed_password"):
            setattr(member, "hashed_password", hashed_pwd)

    try:
        from sqlalchemy import text
        db.execute(
            text("UPDATE users SET password = :pwd WHERE id = :id OR lower(prenom) = :prenom"),
            {"pwd": hashed_pwd, "id": current_user.id, "prenom": current_user.prenom.lower()}
        )
    except Exception as e:
        logger.debug(f"Notice synchronisation table users: {e}")

    try:
        log_entry = Log(
            action="CHANGE_PASSWORD",
            user_name=current_user.prenom,
            details=f"Mot de passe mis à jour pour {current_user.prenom}"
        )
        db.add(log_entry)
    except Exception:
        pass

    db.commit()
    return {"message": "Mot de passe modifié avec succès.", "success": True}

@app.get("/api/members/{member_id}/settings", response_model=MemberSettingsResponse)
def get_member_settings(
    member_id: int,
    db: Session = Depends(get_db)
):
    """Returns email and the notification toggles for specified member."""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Membre introuvable.")
    return {
        "id": member.id,
        "member_id": member.id,
        "prenom": member.prenom,
        "name": member.name,
        "email": member.email,
        "notif_task_assigned": getattr(member, "notif_task_assigned", True),
        "notif_task_completed": getattr(member, "notif_task_completed", True),
        "notif_vote_needed": getattr(member, "notif_vote_needed", True),
        "notif_vote_required": getattr(member, "notif_vote_needed", True),
        "notif_vote_closed": getattr(member, "notif_vote_closed", True),
        "notif_stay_booked": getattr(member, "notif_stay_booked", True),
        "notif_stay_confirmation": getattr(member, "notif_stay_confirmation", True),
        "notif_stay_reminder": getattr(member, "notif_stay_reminder", True),
        "notif_heating_start": getattr(member, "notif_heating_start", True),
        "notif_heating_stop": getattr(member, "notif_heating_stop", True),
        "notif_thermal_changes": getattr(member, "notif_thermal_changes", False),
        "notify_mentions": getattr(member, "notify_mentions", True),
        "notify_new_task": getattr(member, "notif_task_assigned", True),
        "notify_pending_vote": getattr(member, "notif_vote_needed", True),
        "notify_final_decision": getattr(member, "notif_vote_closed", True),
        "notify_new_stay": getattr(member, "notif_stay_booked", True),
        "notify_thermal_changes": getattr(member, "notif_thermal_changes", False),
        "notify_task_creation": getattr(member, "notify_task_creation", False),
        "notify_vote_creation": getattr(member, "notify_vote_creation", False),
        "notify_vote_arbitration": getattr(member, "notify_vote_arbitration", False),
        "notify_mention_all": getattr(member, "notify_mention_all", True),
        "is_coordinator": getattr(member, "is_coordinator", False),
    }

@app.get("/api/members/me/settings", response_model=MemberSettingsResponse)
def get_members_me_settings(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    member_id = current_user.id if current_user else 1
    return get_member_settings(member_id, db)

@app.put("/api/members/me/settings", response_model=MemberSettingsResponse)
@app.patch("/api/members/me/settings", response_model=MemberSettingsResponse)
def update_members_me_settings(
    data: MemberSettingsUpdate,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    member_id = current_user.id if current_user else 1
    return update_member_settings(member_id, data, db)

@app.put("/api/members/{member_id}/settings", response_model=MemberSettingsResponse)
@app.patch("/api/members/{member_id}/settings", response_model=MemberSettingsResponse)
def update_member_settings(
    member_id: int,
    data: MemberSettingsUpdate,
    db: Session = Depends(get_db)
):
    """Updates email and notification preferences for specified member."""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Membre introuvable.")

    if data.email is not None:
        email_clean = data.email.strip().lower()
        if email_clean and "@" not in email_clean:
            raise HTTPException(status_code=400, detail="Adresse e-mail invalide.")
        if email_clean and email_clean != (member.email or "").lower():
            existing = db.query(Member).filter(func.lower(Member.email) == email_clean).first()
            if existing and existing.id != member.id:
                raise HTTPException(status_code=400, detail="Cette adresse e-mail est déjà utilisée.")
        member.email = email_clean or None

    if data.notif_task_assigned is not None:
        member.notif_task_assigned = data.notif_task_assigned
    elif data.notify_new_task is not None:
        member.notif_task_assigned = data.notify_new_task

    if data.notif_task_completed is not None:
        member.notif_task_completed = data.notif_task_completed

    if data.notif_vote_needed is not None:
        member.notif_vote_needed = data.notif_vote_needed
    elif data.notif_vote_required is not None:
        member.notif_vote_needed = data.notif_vote_required
    elif data.notify_pending_vote is not None:
        member.notif_vote_needed = data.notify_pending_vote

    if data.notif_vote_closed is not None:
        member.notif_vote_closed = data.notif_vote_closed
    elif data.notify_final_decision is not None:
        member.notif_vote_closed = data.notify_final_decision

    if data.notif_stay_booked is not None:
        member.notif_stay_booked = data.notif_stay_booked
    elif data.notify_new_stay is not None:
        member.notif_stay_booked = data.notify_new_stay

    if data.notif_stay_confirmation is not None:
        member.notif_stay_confirmation = data.notif_stay_confirmation

    if data.notif_stay_reminder is not None:
        member.notif_stay_reminder = data.notif_stay_reminder

    if data.notif_heating_start is not None:
        member.notif_heating_start = data.notif_heating_start

    if data.notif_heating_stop is not None:
        member.notif_heating_stop = data.notif_heating_stop

    if data.notif_thermal_changes is not None:
        member.notif_thermal_changes = data.notif_thermal_changes
    elif data.notify_thermal_changes is not None:
        member.notif_thermal_changes = data.notify_thermal_changes

    if data.notify_mentions is not None:
        member.notify_mentions = data.notify_mentions

    if data.notify_task_creation is not None:
        member.notify_task_creation = data.notify_task_creation

    if data.notify_vote_creation is not None:
        member.notify_vote_creation = data.notify_vote_creation

    if data.notify_vote_arbitration is not None:
        member.notify_vote_arbitration = data.notify_vote_arbitration

    if data.notify_mention_all is not None:
        member.notify_mention_all = data.notify_mention_all

    # Sync MemberSettings table if present
    try:
        ms = db.query(MemberSettings).filter(MemberSettings.member_id == member.id).first()
        if ms:
            if data.notify_task_creation is not None:
                ms.notify_task_creation = data.notify_task_creation
            if data.notif_task_completed is not None:
                ms.notif_task_completed = data.notif_task_completed
            if data.notify_vote_creation is not None:
                ms.notify_vote_creation = data.notify_vote_creation
            if data.notify_vote_arbitration is not None:
                ms.notify_vote_arbitration = data.notify_vote_arbitration
            if data.notify_mention_all is not None:
                ms.notify_mention_all = data.notify_mention_all
            if data.notify_mentions is not None:
                ms.notify_mentions = data.notify_mentions
            if data.notif_stay_confirmation is not None:
                ms.notif_stay_confirmation = data.notif_stay_confirmation
            if data.notif_stay_reminder is not None:
                ms.notif_stay_reminder = data.notif_stay_reminder
            if data.notif_heating_start is not None:
                ms.notif_heating_start = data.notif_heating_start
            if data.notif_heating_stop is not None:
                ms.notif_heating_stop = data.notif_heating_stop
    except Exception:
        pass

    db.commit()
    db.refresh(member)
    return {
        "id": member.id,
        "member_id": member.id,
        "prenom": member.prenom,
        "name": member.name,
        "email": member.email,
        "notif_task_assigned": getattr(member, "notif_task_assigned", True),
        "notif_task_completed": getattr(member, "notif_task_completed", True),
        "notif_vote_needed": getattr(member, "notif_vote_needed", True),
        "notif_vote_required": getattr(member, "notif_vote_needed", True),
        "notif_vote_closed": getattr(member, "notif_vote_closed", True),
        "notif_stay_booked": getattr(member, "notif_stay_booked", True),
        "notif_stay_confirmation": getattr(member, "notif_stay_confirmation", True),
        "notif_stay_reminder": getattr(member, "notif_stay_reminder", True),
        "notif_heating_start": getattr(member, "notif_heating_start", True),
        "notif_heating_stop": getattr(member, "notif_heating_stop", True),
        "notif_thermal_changes": getattr(member, "notif_thermal_changes", False),
        "notify_mentions": getattr(member, "notify_mentions", True),
        "notify_task_creation": getattr(member, "notify_task_creation", False),
        "notify_vote_creation": getattr(member, "notify_vote_creation", False),
        "notify_vote_arbitration": getattr(member, "notify_vote_arbitration", False),
        "notify_mention_all": getattr(member, "notify_mention_all", True),
        "notify_new_task": getattr(member, "notif_task_assigned", True),
        "notify_pending_vote": getattr(member, "notif_vote_needed", True),
        "notify_final_decision": getattr(member, "notif_vote_closed", True),
        "notify_new_stay": getattr(member, "notif_stay_booked", True),
        "notify_thermal_changes": getattr(member, "notif_thermal_changes", False),
        "is_coordinator": getattr(member, "is_coordinator", False),
    }

@app.get("/api/auth/settings", response_model=MemberSettingsResponse)
def get_current_user_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_member_settings(current_user.id, db)

@app.put("/api/auth/settings", response_model=MemberSettingsResponse)
def update_current_user_settings(
    data: MemberSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return update_member_settings(current_user.id, data, db)

@app.get("/api/settings/notifications", response_model=MemberSettingsResponse)
def get_settings_notifications(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    member_id = current_user.id if current_user else 1
    return get_member_settings(member_id, db)

@app.put("/api/settings/notifications", response_model=MemberSettingsResponse)
@app.patch("/api/settings/notifications", response_model=MemberSettingsResponse)
def update_settings_notifications(
    data: MemberSettingsUpdate,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    member_id = current_user.id if current_user else 1
    return update_member_settings(member_id, data, db)

@app.get("/api/members", response_model=List[MemberResponse])
@app.get("/api/users", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db)):
    return db.query(Member).order_by(Member.id.asc()).all()

ALL_SCI_ROOMS = [
    # Le Presbytère (5 chambres)
    {"id": "presbytere_1", "name": "Suite parentale Presbytère", "property": "Le Presbytère", "property_id": 2},
    {"id": "presbytere_2", "name": "Chambre Henri Presbytère", "property": "Le Presbytère", "property_id": 2},
    {"id": "presbytere_3", "name": "Chambre Hortense Presbytère", "property": "Le Presbytère", "property_id": 2},
    {"id": "presbytere_4", "name": "Chambre Joséphine Presbytère", "property": "Le Presbytère", "property_id": 2},
    {"id": "presbytere_5", "name": "Chambre Eugénie et Alexandre Presbytère", "property": "Le Presbytère", "property_id": 2},
    # Rosings (2 chambres)
    {"id": "rosing_1", "name": "Chambre Marguerite Rosings", "property": "Rosings", "property_id": 1},
    {"id": "rosing_2", "name": "Chambre Hortense Rosings", "property": "Rosings", "property_id": 1},
]

@app.get("/api/properties", response_model=List[PropertyResponse])
def get_properties(db: Session = Depends(get_db)):
    return db.query(Property).all()

@app.get("/api/rooms")
def get_rooms():
    """Returns the exact 7 rooms across Le Presbytère (5) and Rosings (2)."""
    return ALL_SCI_ROOMS


# --- Issues Endpoints ---

@app.get("/api/issues", response_model=List[IssueResponse])
def list_issues(
    status_filter: Optional[str] = Query(None, alias="status"),
    priority_filter: Optional[str] = Query(None, alias="priority"),
    category_filter: Optional[str] = Query(None, alias="category"),
    property_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(Issue)
    if status_filter and status_filter != "Tous":
        query = query.filter(Issue.status == status_filter)
    if priority_filter and priority_filter != "Toutes":
        query = query.filter(Issue.priority == priority_filter)
    if category_filter and category_filter != "Toutes":
        query = query.filter(Issue.category == category_filter)
    if property_id:
        query = query.filter(Issue.property_id == property_id)
    
    return query.order_by(Issue.created_at.desc()).all()

@app.post("/api/issues", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
def create_issue(issue: IssueCreate, db: Session = Depends(get_db)):
    prop = db.query(Property).filter(Property.id == issue.property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Propriété non trouvée")

    photo_urls_str = ",".join(issue.photo_urls) if issue.photo_urls else None

    db_issue = Issue(
        property_id=issue.property_id,
        title=issue.title,
        description=issue.description,
        category=issue.category or "🐛 Corrections / Réparations",
        priority=issue.priority,
        status="Ouvert",
        classification=issue.classification or "SIGNALEMENT",
        charge=issue.charge if issue.charge is not None else 1,
        add_to_ag_agenda=issue.add_to_ag_agenda if issue.add_to_ag_agenda is not None else False,
        linked_documents=issue.linked_documents,
        supplier_info=issue.supplier_info,
        created_by=issue.created_by,
        photo_url=issue.photo_url or (issue.photo_urls[0] if issue.photo_urls else None),
        photo_urls=photo_urls_str
    )
    db.add(db_issue)
    db.commit()
    db.refresh(db_issue)

    # Email notification trigger: notify coordinator of new issue (non-blocking)
    try:
        coordinator = db.query(User).filter(User.role.like("%Coordinateur%")).first()
        coord_email = coordinator.email if (coordinator and coordinator.email) else "hellenvillierssci@gmail.com"
        notify_coordinator_new_issue(
            issue_title=db_issue.title,
            created_by=db_issue.created_by or "Membre SCI",
            description=db_issue.description or "",
            category=db_issue.category or "SIGNALEMENT",
            priority=db_issue.priority or "Moyenne",
            coordinator_email=coord_email
        )
    except Exception as e:
        logger.error(f"[EMAIL ERROR] Failed to send new issue notification: {e}")
        print(f"[EMAIL ERROR] Failed to send new issue notification: {e}")

    return db_issue

@app.post("/api/issues/upload-photo")
async def upload_photo(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1]
    if not ext:
        ext = ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"photo_url": f"/uploads/{filename}"}

@app.post("/api/issues/upload-photos")
async def upload_photos(files: List[UploadFile] = File(...)):
    uploaded_urls = []
    for file in files:
        ext = os.path.splitext(file.filename)[1]
        if not ext:
            ext = ".jpg"
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)

        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        uploaded_urls.append(f"/uploads/{filename}")

    return {"photo_urls": uploaded_urls}

@app.patch("/api/issues/{issue_id}", response_model=IssueResponse)
def update_issue(issue_id: int, issue_update: IssueUpdate, db: Session = Depends(get_db)):
    db_issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not db_issue:
        raise HTTPException(status_code=404, detail="Problème non trouvé")

    if issue_update.status is not None:
        db_issue.status = issue_update.status
    if issue_update.priority is not None:
        db_issue.priority = issue_update.priority
    if issue_update.assigned_to is not None:
        db_issue.assigned_to = issue_update.assigned_to
    if issue_update.category is not None:
        db_issue.category = issue_update.category
    if issue_update.classification is not None:
        db_issue.classification = issue_update.classification
    if issue_update.charge is not None:
        db_issue.charge = issue_update.charge
    if issue_update.add_to_ag_agenda is not None:
        db_issue.add_to_ag_agenda = issue_update.add_to_ag_agenda
    if issue_update.linked_documents is not None:
        db_issue.linked_documents = issue_update.linked_documents
    if issue_update.supplier_info is not None:
        db_issue.supplier_info = issue_update.supplier_info
    if issue_update.estimated_cost is not None:
        db_issue.estimated_cost = issue_update.estimated_cost

    db.commit()
    db.refresh(db_issue)
    return db_issue

@app.post("/api/issues/{issue_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
def add_comment(
    issue_id: int,
    comment: CommentCreate,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    db_issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not db_issue:
        raise HTTPException(status_code=404, detail="Problème non trouvé")

    author_name = comment.author_name or "Henri Jamet"
    content_text = (comment.content or "").strip()

    db_comment = Comment(
        issue_id=issue_id,
        author_name=author_name,
        content=content_text
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)

    # Traitement unifié des mentions (@membre et @all/@tous - Annotations 10 & 13)
    try:
        dispatch_chat_mentions(
            db=db,
            content=db_comment.content,
            author_name=author_name,
            context_title=db_issue.title,
            target_url=f"{APP_BASE_URL}/admin?issue_id={db_issue.id}",
            link_path="/admin",
            link_id=db_issue.id,
            background_tasks=background_tasks
        )
    except Exception as e:
        logger.error(f"[MENTIONS ERROR] Issue comment mention notification failed: {e}")

    return db_comment

@app.post("/api/issues/{issue_id}/issue-comments", response_model=IssueCommentResponse, status_code=status.HTTP_201_CREATED)
def add_issue_comment(
    issue_id: int,
    comment: IssueCommentCreate,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    db_issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not db_issue:
        raise HTTPException(status_code=404, detail="Problème non trouvé")

    author_name = comment.author_name or "Henri Jamet"
    comment_text = (comment.comment_text or "").strip()

    db_comment = IssueComment(
        issue_id=issue_id,
        author_id=comment.author_id,
        author_name=author_name,
        comment_text=comment_text,
        is_vote_comment=comment.is_vote_comment or False
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)

    # Traitement unifié des mentions (@membre et @all/@tous - Annotations 10 & 13)
    try:
        dispatch_chat_mentions(
            db=db,
            content=db_comment.comment_text,
            author_name=author_name,
            context_title=db_issue.title,
            target_url=f"{APP_BASE_URL}/admin?issue_id={db_issue.id}",
            link_path="/admin",
            link_id=db_issue.id,
            background_tasks=background_tasks
        )
    except Exception as e:
        logger.error(f"[MENTIONS ERROR] Issue comment mention notification failed: {e}")

    return db_comment


# --- Reservations Endpoints ---

@app.get("/api/reservations/balance", response_model=StayBalanceResponse)
@app.get("/api/reservations/stay-balance", response_model=StayBalanceResponse)
def get_stay_balance(
    year: Optional[int] = Query(2026),
    db: Session = Depends(get_db)
):
    """
    Stay Balance calculation for Stitch Stay Balance Component.
    Computes total days booked per associate, stays count, and relative percentage.
    """
    MEMBERS_INFO = [
        {"prenom": "Henri", "name": "Henri Jamet", "role": "Coordinateur", "color": "cyan"},
        {"prenom": "Marguerite", "name": "Marguerite Jamet", "role": "Membre Associé", "color": "purple"},
        {"prenom": "Hortense", "name": "Hortense Jamet", "role": "Membre Associé", "color": "rose"},
        {"prenom": "Joséphine", "name": "Joséphine Jamet", "role": "Membre Associé", "color": "emerald"},
        {"prenom": "Eugénie", "name": "Eugénie Jamet", "role": "Membre Associé", "color": "amber"},
        {"prenom": "Élisabeth", "name": "Élisabeth Jamet", "role": "Membre Associé", "color": "teal"},
        {"prenom": "Frédéric", "name": "Frédéric Jamet", "role": "Membre Associé", "color": "blue"},
    ]

    query = db.query(Reservation)
    if year:
        query = query.filter(Reservation.year == year)
    reservations = query.all()

    member_days = {m["prenom"]: 0 for m in MEMBERS_INFO}
    member_stays = {m["prenom"]: 0 for m in MEMBERS_INFO}

    for r in reservations:
        if r.status in ["Confirmée", "Demande en attente"]:
            try:
                d1 = datetime.strptime(r.start_date, "%Y-%m-%d")
                d2 = datetime.strptime(r.end_date, "%Y-%m-%d")
                days = max(1, (d2 - d1).days + 1)
            except Exception:
                days = 7

            norm_r_user = normalize_prenom(r.user_name)
            matched = False
            for m in MEMBERS_INFO:
                norm_m = normalize_prenom(m["prenom"])
                if norm_r_user == norm_m or (norm_r_user in ["elisabeth", "maman"] and norm_m in ["elisabeth", "maman"]):
                    member_days[m["prenom"]] += days
                    member_stays[m["prenom"]] += 1
                    matched = True
                    break
            if not matched and r.user_name:
                member_days[r.user_name] = member_days.get(r.user_name, 0) + days
                member_stays[r.user_name] = member_stays.get(r.user_name, 0) + 1

    max_days = max(list(member_days.values()) + [14])
    total_days = sum(member_days.values())

    result_members = []
    for m in MEMBERS_INFO:
        p = m["prenom"]
        d = member_days.get(p, 0)
        s = member_stays.get(p, 0)
        pct = min(100, round((d / max_days) * 100)) if max_days > 0 else 0
        result_members.append(StayBalanceMember(
            prenom=p,
            name=m["name"],
            role=m["role"],
            avatar_color=m["color"],
            days=d,
            stays_count=s,
            percentage=pct
        ))

    return StayBalanceResponse(
        year=year or 2026,
        total_days=total_days,
        max_days=max_days,
        members=result_members
    )

@app.get("/api/reservations", response_model=List[ReservationResponse])
def list_reservations(
    property_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db)
):
    # Purge automatique des séjours passés (directive Henri)
    today_str = datetime.utcnow().strftime('%Y-%m-%d')
    try:
        past_reservations = db.query(Reservation).filter(Reservation.end_date < today_str).all()
        if past_reservations:
            for p_res in past_reservations:
                db.delete(p_res)
            db.commit()
    except Exception as purge_err:
        logger.warning(f"[PURGE RESERVATIONS] Erreur purge des réservations passées: {purge_err}")
        db.rollback()

    query = db.query(Reservation)
    if property_id:
        query = query.filter(Reservation.property_id == property_id)
    if year:
        query = query.filter(Reservation.year == year)
    if status_filter and status_filter != "Tous":
        query = query.filter(Reservation.status == status_filter)

    return query.options(joinedload(Reservation.property)).order_by(Reservation.year.asc(), Reservation.week_number.asc()).all()

@app.get("/api/reservations/{reservation_id}", response_model=ReservationResponse)
def get_reservation(reservation_id: int, db: Session = Depends(get_db)):
    db_res = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not db_res:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    return db_res

CANCELLED_RESERVATION_STATUSES = [
    'Annulée', 'Refusée', 'cancelled', 'rejected',
    'annulée', 'refusée', 'Cancelled', 'Rejected',
    'Annulee', 'Refusee', 'annulee', 'refusee'
]


def validate_iso_date_string(date_str: str, field_name: str = "date") -> datetime:
    """Validate that date_str is a valid ISO date YYYY-MM-DD without whitespace."""
    if not isinstance(date_str, str):
        raise HTTPException(
            status_code=400,
            detail=f"Format de date invalide pour {field_name}. Format attendu : YYYY-MM-DD."
        )
    if len(date_str) != 10 or date_str != date_str.strip():
        raise HTTPException(
            status_code=400,
            detail=f"Format de date invalide pour {field_name} : '{date_str}'. Format attendu : YYYY-MM-DD sans espaces."
        )
    parts = date_str.split("-")
    if len(parts) != 3 or len(parts[0]) != 4 or len(parts[1]) != 2 or len(parts[2]) != 2 or not all(p.isdigit() for p in parts):
        raise HTTPException(
            status_code=400,
            detail=f"Format de date invalide pour {field_name} : '{date_str}'. Format attendu : YYYY-MM-DD."
        )
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Date invalide pour {field_name} : '{date_str}'. La date n'existe pas dans le calendrier."
        )


def dispatch_stay_confirmation(db_res: Reservation, db: Session, prop_name: Optional[str] = None) -> Optional[dict]:
    """
    Annotation 1:
    Lorsque la confirmation de séjour est déclenchée, si l'option est active (notif_stay_booked),
    envoyer un e-mail et une notification à TOUS les membres assignés/participants au séjour
    (y compris ceux n'ayant pas effectué la réservation eux-mêmes), et pas seulement au créateur.
    """
    dispatched_email = None
    try:
        booker_name = db_res.user_name or "Un associé"
        all_members = db.query(Member).filter(Member.email.isnot(None)).all()

        # Identifier les participants / assignés au séjour :
        # - Le créateur (booker_name)
        # - Les membres listés dans les notes [Membres: ...]
        # - Les membres assignés aux tâches de séjour (StayTaskAssignment)
        participant_names = set()
        participant_names.add(booker_name.strip().lower())

        if db_res.notes:
            match_membres = re.search(r'\[Membres:\s*([^\]]+)\]', str(db_res.notes), re.IGNORECASE)
            if match_membres:
                raw_names = match_membres.group(1).split(',')
                for rn in raw_names:
                    if rn.strip():
                        participant_names.add(rn.strip().lower())

        try:
            task_assignments = db.query(StayTaskAssignment).filter(StayTaskAssignment.reservation_id == db_res.id).all() if db_res.id else []
            for ta in task_assignments:
                if getattr(ta, 'assigned_member', None):
                    participant_names.add(str(ta.assigned_member).strip().lower())
        except Exception:
            pass

        def is_participant(m: Member) -> bool:
            m_name = (m.name or "").strip().lower()
            m_prenom = (m.prenom or "").strip().lower()
            return any(
                p == m_name or p == m_prenom or (len(p) >= 3 and (p in m_name or p in m_prenom or m_name in p or m_prenom in p))
                for p in participant_names
            )

        # Destinataires de l'e-mail : tous les membres participants et abonnés ayant l'option notif_stay_booked active
        stay_recipients = []
        for m in all_members:
            if not m.email:
                continue
            if getattr(m, 'notif_stay_booked', True):
                stay_recipients.append(m.email)

        # Déduplication en conservant l'ordre
        stay_recipients = list(dict.fromkeys(stay_recipients))

        effective_prop = db_res.property_name or prop_name or "Domaine d'Hellenvilliers"
        if stay_recipients:
            send_res = send_stay_booked_email(
                to_email=stay_recipients,
                member_name=booker_name,
                start_date=db_res.start_date,
                end_date=db_res.end_date,
                property_name=effective_prop,
                rooms=db_res.selected_rooms,
                guest_count=db_res.guest_count or 1,
                reservation_id=db_res.id,
                notes=db_res.notes
            )
            if isinstance(send_res, dict) and "_email_dispatched" in send_res:
                dispatched_email = send_res["_email_dispatched"]

        # Notification interne globale pour la cloche
        create_internal_notification(
            db=db,
            title=f"Nouveau séjour réservé : {booker_name}",
            description=f"Séjour au {effective_prop} du {db_res.start_date} au {db_res.end_date}.",
            notif_type="booking",
            link_path="/calendrier",
            link_id=str(db_res.id) if db_res.id else None,
            email_entry=dispatched_email
        )

        # Notifications internes ciblées pour CHAQUE participant assigné au séjour (Annotation 1)
        for m in all_members:
            if is_participant(m) and getattr(m, 'notif_stay_booked', True):
                create_internal_notification(
                    db=db,
                    member_id=m.id,
                    title=f"Confirmation de votre séjour au Domaine",
                    description=f"Séjour avec {booker_name} au {effective_prop} du {db_res.start_date} au {db_res.end_date}.",
                    notif_type="booking",
                    link_path="/calendrier",
                    link_id=str(db_res.id) if db_res.id else None,
                    email_entry=dispatched_email
                )
    except Exception as e:
        logger.error(f"[EMAIL ERROR] Failed to send stay booked notification: {e}")

    return dispatched_email


@app.post("/api/reservations", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
def create_reservation(res: ReservationCreate, response: Response, db: Session = Depends(get_db)):
    # 1. Enforce ISO date format and start_date <= end_date
    start_dt = validate_iso_date_string(res.start_date, "start_date")
    end_dt = validate_iso_date_string(res.end_date, "end_date")
    if start_dt > end_dt:
        raise HTTPException(
            status_code=400,
            detail="start_date must be before or equal to end_date"
        )
    norm_start_date = start_dt.strftime("%Y-%m-%d")
    norm_end_date = end_dt.strftime("%Y-%m-%d")
    res.start_date = norm_start_date
    res.end_date = norm_end_date

    prop_name = res.property_name
    if not prop_name and res.properties:
        prop_name = " & ".join(res.properties)
    if not prop_name and res.property_id:
        prop = db.query(Property).filter(Property.id == res.property_id).first()
        if prop:
            prop_name = prop.name

    target_prop_id = res.property_id or 1
    new_cohab = res.cohabitation_type or ("exclusive" if res.accepts_extra_family is False else "total")
    new_accepts = (new_cohab != "exclusive") if res.accepts_extra_family is None else res.accepts_extra_family
    if new_cohab == "exclusive":
        new_accepts = False

    # Overlap validation rule:
    # 1. If either the existing stay or the new booking is exclusive, the whole domain is privatized -> reject any overlapping stay.
    # 2. If either stay has other_building cohabitation, reject if both target the same building.
    # 3. If both allow cohabitation in the same building, reject if any selected rooms overlap.
    existing_stays = db.query(Reservation).filter(
        ~Reservation.status.in_(CANCELLED_RESERVATION_STATUSES)
    ).all()

    for stay in existing_stays:
        if stay.status and stay.status in CANCELLED_RESERVATION_STATUSES:
            continue
        if not stay.start_date or not stay.end_date:
            continue

        try:
            stay_start_dt = validate_iso_date_string(stay.start_date, "stay.start_date")
            stay_end_dt = validate_iso_date_string(stay.end_date, "stay.end_date")
        except Exception:
            try:
                stay_start_dt = datetime.strptime(str(stay.start_date).strip(), "%Y-%m-%d")
                stay_end_dt = datetime.strptime(str(stay.end_date).strip(), "%Y-%m-%d")
            except Exception:
                continue

        if start_dt < stay_end_dt and end_dt > stay_start_dt:
            stay_cohab = getattr(stay, "cohabitation_type", None) or ("exclusive" if stay.accepts_extra_family is False else "total")
            stay_accepts = (stay_cohab != "exclusive") if stay.accepts_extra_family is None else stay.accepts_extra_family
            stay_prop_id = stay.property_id or 1

            # Rule 1: Exclusive domain privatisation
            if stay_cohab == "exclusive" or new_cohab == "exclusive" or not stay_accepts or not new_accepts:
                detail_msg = (
                    f"Conflit de dates : La période du {norm_start_date} au {norm_end_date} chevauche le séjour "
                    f"de {stay.user_name} (du {stay.start_date} au {stay.end_date}). La cohabitation n'est pas autorisée "
                    f"car l'un des séjours a réservé le domaine en exclusivité."
                )
                raise HTTPException(status_code=400, detail=detail_msg)

            # Rule 2: other_building cohabitation
            if stay_cohab == "other_building" or new_cohab == "other_building":
                if stay_prop_id == target_prop_id:
                    detail_msg = (
                        f"Conflit de cohabitation : La période chevauche le séjour de {stay.user_name} "
                        f"(du {stay.start_date} au {stay.end_date}) dans le même bâtiment ({prop_name}). "
                        f"L'option « Cohabitation autre bâtiment » n'autorise des réservations simultanées que dans l'autre bâtiment."
                    )
                    raise HTTPException(status_code=400, detail=detail_msg)

            # Rule 3: Room collision if in the same property
            if stay_prop_id == target_prop_id and stay.selected_rooms and res.selected_rooms:
                try:
                    s_rooms = json.loads(stay.selected_rooms) if isinstance(stay.selected_rooms, str) else stay.selected_rooms
                    r_rooms = res.selected_rooms if isinstance(res.selected_rooms, list) else json.loads(res.selected_rooms)
                    colliding = set(s_rooms).intersection(set(r_rooms))
                    if colliding:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Conflit de chambre : La ou les chambres suivantes sont déjà occupées par {stay.user_name} sur cette période : {', '.join(colliding)}."
                        )
                except HTTPException:
                    raise
                except Exception:
                    pass

    sel_rooms_str = json.dumps(res.selected_rooms) if res.selected_rooms else None
    cnt = res.rooms_count or (len(res.selected_rooms) if res.selected_rooms else res.chambers_used or 1)

    db_res = Reservation(
        property_id=res.property_id or 1,
        property_name=prop_name,
        user_name=res.user_name,
        year=res.year,
        week_number=res.week_number,
        start_date=norm_start_date,
        end_date=norm_end_date,
        arrival_time=res.arrival_time or "15:00",
        departure_time=res.departure_time or "11:00",
        guest_count=res.guest_count if res.guest_count is not None else 1,
        chambers_used=cnt,
        selected_rooms=sel_rooms_str,
        rooms_count=cnt,
        accepts_extra_family=new_accepts,
        cohabitation_type=new_cohab,
        status="Confirmée",  # All bookings directly confirmed!
        notes=res.notes
    )
    db.add(db_res)
    db.commit()
    db.refresh(db_res)

    # Email Trigger 4 & Notification: Confirmation envoyée à TOUS les participants et abonnés (Annotation 1)
    dispatched_email = dispatch_stay_confirmation(db_res, db, prop_name=prop_name)

    if dispatched_email:
        setattr(db_res, "_email_dispatched", dispatched_email)
        setattr(db_res, "email_dispatched", dispatched_email)
        try:
            response.headers["X-Email-Dispatched"] = json.dumps(dispatched_email)
        except Exception:
            pass

    return db_res

@app.patch("/api/reservations/{reservation_id}", response_model=ReservationResponse)
@app.put("/api/reservations/{reservation_id}", response_model=ReservationResponse)
def update_reservation(reservation_id: int, update: ReservationUpdate, db: Session = Depends(get_db)):
    db_res = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not db_res:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    old_status = db_res.status

    # 1. Enforce ISO date format and start_date <= end_date
    if update.start_date is not None:
        validate_iso_date_string(update.start_date, "start_date")
    if update.end_date is not None:
        validate_iso_date_string(update.end_date, "end_date")

    new_start = update.start_date if update.start_date is not None else db_res.start_date
    new_end = update.end_date if update.end_date is not None else db_res.end_date

    # Validate combined date range
    start_dt = validate_iso_date_string(new_start, "start_date")
    end_dt = validate_iso_date_string(new_end, "end_date")
    if start_dt > end_dt:
        raise HTTPException(
            status_code=400,
            detail="start_date must be before or equal to end_date"
        )
    norm_new_start = start_dt.strftime("%Y-%m-%d")
    norm_new_end = end_dt.strftime("%Y-%m-%d")

    target_prop_id = update.property_id or db_res.property_id or 1
    new_status = update.status if update.status is not None else db_res.status

    updated_cohab = update.cohabitation_type if update.cohabitation_type is not None else getattr(db_res, "cohabitation_type", None)
    if updated_cohab is None:
        updated_cohab = "exclusive" if update.accepts_extra_family is False else "total"

    new_accepts = update.accepts_extra_family if update.accepts_extra_family is not None else db_res.accepts_extra_family
    if updated_cohab == "exclusive":
        new_accepts = False
    elif update.accepts_extra_family is None and update.cohabitation_type is not None:
        new_accepts = True

    # If updating dates, property, or cohabitation, validate bilateral cohabitation overlap against other stays
    # Only perform overlap check if the stay itself is active (not cancelled or rejected)
    if new_status not in CANCELLED_RESERVATION_STATUSES:
        if (update.start_date is not None or update.end_date is not None or 
            update.accepts_extra_family is not None or update.cohabitation_type is not None or update.property_id is not None or
            (update.status is not None and db_res.status in CANCELLED_RESERVATION_STATUSES)):
            
            other_stays = db.query(Reservation).filter(
                Reservation.id != reservation_id,
                ~Reservation.status.in_(CANCELLED_RESERVATION_STATUSES)
            ).all()

            for stay in other_stays:
                if stay.status and stay.status in CANCELLED_RESERVATION_STATUSES:
                    continue
                if not stay.start_date or not stay.end_date:
                    continue

                try:
                    stay_start_dt = validate_iso_date_string(stay.start_date, "stay.start_date")
                    stay_end_dt = validate_iso_date_string(stay.end_date, "stay.end_date")
                except Exception:
                    try:
                        stay_start_dt = datetime.strptime(str(stay.start_date).strip(), "%Y-%m-%d")
                        stay_end_dt = datetime.strptime(str(stay.end_date).strip(), "%Y-%m-%d")
                    except Exception:
                        continue

                if start_dt < stay_end_dt and end_dt > stay_start_dt:
                    stay_cohab = getattr(stay, "cohabitation_type", None) or ("exclusive" if stay.accepts_extra_family is False else "total")
                    stay_accepts = (stay_cohab != "exclusive") if stay.accepts_extra_family is None else stay.accepts_extra_family
                    stay_prop_id = stay.property_id or 1

                    if stay_cohab == "exclusive" or updated_cohab == "exclusive" or not stay_accepts or not new_accepts:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"Conflit de dates : La période du {norm_new_start} au {norm_new_end} chevauche le séjour "
                                f"de {stay.user_name} (du {stay.start_date} au {stay.end_date}). La cohabitation n'est pas autorisée "
                                f"car l'un des séjours a réservé le domaine en exclusivité."
                            )
                        )

                    if stay_cohab == "other_building" or updated_cohab == "other_building":
                        if stay_prop_id == target_prop_id:
                            raise HTTPException(
                                status_code=400,
                                detail=(
                                    f"Conflit de cohabitation : La période chevauche le séjour de {stay.user_name} "
                                    f"(du {stay.start_date} au {stay.end_date}) dans le même bâtiment. "
                                    f"L'option « Cohabitation autre bâtiment » n'autorise des réservations simultanées que dans l'autre bâtiment."
                                )
                            )

    if update.start_date is not None:
        db_res.start_date = norm_new_start
    if update.end_date is not None:
        db_res.end_date = norm_new_end
    if update.user_name is not None:
        db_res.user_name = update.user_name
    if update.year is not None:
        db_res.year = update.year
    if update.week_number is not None:
        db_res.week_number = update.week_number
    if update.property_id is not None:
        db_res.property_id = update.property_id
    if update.property_name is not None:
        db_res.property_name = update.property_name
    if update.status is not None:
        db_res.status = update.status
    if update.arrival_time is not None:
        db_res.arrival_time = update.arrival_time or "15:00"
    if update.departure_time is not None:
        db_res.departure_time = update.departure_time or "11:00"
    if update.guest_count is not None:
        db_res.guest_count = update.guest_count
    if update.accepts_extra_family is not None:
        db_res.accepts_extra_family = update.accepts_extra_family
        if not update.accepts_extra_family and update.cohabitation_type is None:
            db_res.cohabitation_type = "exclusive"
    if update.cohabitation_type is not None:
        db_res.cohabitation_type = update.cohabitation_type
        if update.cohabitation_type == "exclusive":
            db_res.accepts_extra_family = False
        elif update.accepts_extra_family is None:
            db_res.accepts_extra_family = True
    if update.notes is not None:
        db_res.notes = update.notes
    if update.selected_rooms is not None:
        db_res.selected_rooms = json.dumps(update.selected_rooms)
        cnt = len(update.selected_rooms)
        db_res.rooms_count = cnt
        db_res.chambers_used = cnt
    elif update.rooms_count is not None:
        db_res.rooms_count = update.rooms_count
        db_res.chambers_used = update.rooms_count

    db.commit()
    db.refresh(db_res)

    # Déclenchement de la confirmation si transition vers 'Confirmée' (Annotation 1)
    if db_res.status == "Confirmée" and old_status != "Confirmée":
        dispatch_stay_confirmation(db_res, db)

    return db_res

@app.delete("/api/reservations/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reservation(reservation_id: int, db: Session = Depends(get_db)):
    db_res = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not db_res:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    db.delete(db_res)
    db.commit()
    return None


# --- Projects & Voting Endpoints ---

@app.get("/api/projects")
def list_projects(
    response: Response,
    property_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db)
):
    response.headers["Cache-Control"] = "public, s-maxage=5, stale-while-revalidate=30"
    query = db.query(Project)
    if property_id:
        query = query.filter(Project.property_id == property_id)
    if status_filter and status_filter != "Tous":
        query = query.filter(Project.status == status_filter)

    projects = query.options(
        joinedload(Project.property),
        selectinload(Project.votes),
        selectinload(Project.comments)
    ).order_by(Project.created_at.desc()).all()
    return [format_project_response(p) for p in projects]

@app.post("/api/projects", status_code=status.HTTP_201_CREATED)
def create_project(proj: ProjectCreate, db: Session = Depends(get_db)):
    photo_urls_str = ",".join(proj.photo_urls) if proj.photo_urls else None
    first_photo = proj.photo_url or (proj.photo_urls[0] if proj.photo_urls else None)
    doc_urls_str = json.dumps(proj.document_urls) if proj.document_urls else None
    options_str = json.dumps(proj.options) if proj.options else None
    external_links_str = json.dumps(proj.external_links) if proj.external_links else None

    # Cycle de vie calqué sur les tâches (Annotations 8, 9 & 10) :
    # Si aucun statut n'est fourni ou s'il est par défaut ("SOUMIS"), initialiser impérativement status = "PROPOSED"
    status_str = (proj.status or "").strip().upper()
    if status_str and status_str != "SOUMIS":
        initial_status = status_str
    elif proj.decision_mode == "SOUMETTRE_AU_VOTE":
        initial_status = "OPEN"
    else:
        initial_status = "PROPOSED"

    db_proj = Project(
        property_id=proj.property_id,
        title=proj.title,
        description=proj.description,
        estimated_cost=proj.estimated_cost if proj.estimated_cost is not None else 0.0,
        category=proj.category or "Non classé",
        priority=proj.priority or "MOYENNE",
        classification=proj.classification or "SIGNALEMENT",
        task_weight=proj.task_weight or "MOYEN",
        charge=proj.charge if proj.charge is not None else 1,
        add_to_ag_agenda=proj.add_to_ag_agenda if proj.add_to_ag_agenda is not None else False,
        linked_documents=proj.linked_documents,
        document_urls=doc_urls_str,
        external_links=external_links_str,
        supplier_info=proj.supplier_info,
        submitted_by=proj.submitted_by,
        responsible=proj.responsible,
        photo_url=first_photo,
        photo_urls=photo_urls_str,
        status=initial_status,
        options=options_str,
        allow_multiple_choices=bool(proj.allow_multiple_choices) if proj.allow_multiple_choices is not None else False
    )
    db.add(db_proj)
    try:
        db.commit()
        db.refresh(db_proj)
    except Exception as exc:
        db.rollback()
        logger.error(f"[PROJECT ERROR] Echec création projet: {exc}")
        raise HTTPException(status_code=400, detail=f"Erreur lors de la création du projet: {str(exc)}")

    # Email notification trigger: notify members with notif_vote_needed=True if project is open for voting
    dispatched_email = None
    if db_proj.status in ["EN_VOTE", "OPEN"]:
        try:
            member_users = db.query(Member).filter(Member.email.isnot(None)).all()
            member_emails = [u.email for u in member_users if getattr(u, 'notif_vote_needed', True) and u.email]
            if member_emails:
                send_res = send_vote_required_email(
                    to_email=member_emails,
                    vote_title=db_proj.title,
                    submitted_by=db_proj.submitted_by or "Associé SCI",
                    description=db_proj.description or "",
                    estimated_cost=float(db_proj.estimated_cost or 0.0),
                    project_id=db_proj.id
                )
                if isinstance(send_res, dict) and "_email_dispatched" in send_res:
                    dispatched_email = send_res["_email_dispatched"]
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send project vote notification on creation: {e}")

        # Notification interne globale pour la cloche (Annotation 13)
        create_internal_notification(
            db=db,
            title=f"Nouveau scrutin ouvert : {db_proj.title}",
            description=f"Le scrutin « {db_proj.title} » est ouvert au vote de tous les associés.",
            notif_type="vote",
            link_path="/taches",
            link_id=db_proj.id,
            email_entry=dispatched_email
        )
    elif db_proj.status == "PROPOSED":
        try:
            coordinators = db.query(Member).filter(
                or_(
                    Member.is_coordinator == True,
                    func.lower(Member.prenom).in_(["henri", "joséphine", "josephine"])
                ),
                Member.email.isnot(None)
            ).all()

            coord_email_template = None
            for coord in coordinators:
                send_coord_res = send_vote_creation_pending_email(
                    to_email=coord.email,
                    vote_title=db_proj.title,
                    submitted_by=db_proj.submitted_by or "Associé SCI",
                    coordinator_name=coord.prenom,
                    description=db_proj.description or "",
                    project_id=db_proj.id,
                    actually_send=bool(getattr(coord, "notify_vote_creation", False))
                )
                if isinstance(send_coord_res, dict) and "_email_dispatched" in send_coord_res:
                    coord_email_template = send_coord_res["_email_dispatched"]

            if coord_email_template:
                dispatched_email = coord_email_template

            for coord in coordinators:
                create_internal_notification(
                    db=db,
                    member_id=coord.id,
                    title=f"Scrutin proposé : {db_proj.title}",
                    description=f"Le scrutin « {db_proj.title} » a été soumis et attend votre arbitrage pour ouverture.",
                    notif_type="vote",
                    link_path="/taches",
                    link_id=db_proj.id,
                    email_entry=coord_email_template
                )
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send coordinator vote proposal notification: {e}")

    proj_res_data = format_project_response(db_proj)
    if dispatched_email:
        proj_res_data["_email_dispatched"] = dispatched_email
        proj_res_data["email_dispatched"] = dispatched_email
    return proj_res_data

@app.post("/api/projects/upload-photos")
async def upload_project_photos(files: List[UploadFile] = File(...)):
    uploaded_urls = []
    for file in files:
        ext = os.path.splitext(file.filename)[1]
        if not ext:
            ext = ".jpg"
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)

        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        uploaded_urls.append(f"/uploads/{filename}")

    return {"photo_urls": uploaded_urls}

@app.post("/api/projects/upload-documents")
async def upload_project_documents(files: List[UploadFile] = File(...)):
    uploaded_urls = []
    for file in files:
        clean_name = os.path.basename(file.filename) if file.filename else "document"
        filename = f"{uuid.uuid4().hex}_{clean_name}"
        filepath = os.path.join(DOCUMENTS_DIR, filename)

        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        uploaded_urls.append(f"/uploads/documents/{filename}")

    return {"document_urls": uploaded_urls}

@app.post("/api/projects/{project_id}/approve")
def approve_project_by_coordinator(
    project_id: int,
    approval: ProjectApprove,
    db: Session = Depends(get_db)
):
    db_proj = db.query(Project).filter(Project.id == project_id).first()
    if not db_proj:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    old_status = db_proj.status

    if approval.estimated_cost is not None:
        db_proj.estimated_cost = approval.estimated_cost
    if approval.coordinator_notes is not None:
        db_proj.coordinator_notes = approval.coordinator_notes
    if approval.document_urls is not None:
        db_proj.document_urls = json.dumps(approval.document_urls)
    if approval.classification is not None:
        db_proj.classification = approval.classification.value if hasattr(approval.classification, 'value') else str(approval.classification)
    if approval.task_weight is not None:
        db_proj.task_weight = approval.task_weight.value if hasattr(approval.task_weight, 'value') else str(approval.task_weight)

    if approval.status:
        db_proj.status = approval.status
    else:
        db_proj.status = "APPROUVE"

    if approval.decision_mode:
        db_proj.decision_mode = approval.decision_mode
        if approval.decision_mode == "SOUMETTRE_AU_VOTE":
            db_proj.status = "EN_VOTE"
    if approval.responsible:
        db_proj.responsible = approval.responsible

    db_proj.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_proj)

    # Email & notification trigger: notify members when project enters voting (OPEN / EN_VOTE) or is archived
    dispatched_email = None
    if db_proj.status in ["EN_VOTE", "OPEN"] and old_status not in ["EN_VOTE", "OPEN"]:
        notif_msg = f"Le scrutin « {db_proj.title} » a été validé par la coordination et est désormais ouvert au vote de tous les associés."
        sys_comment = ProjectComment(
            project_id=project_id,
            author_name="Coordination SCI",
            content=notif_msg
        )
        db.add(sys_comment)
        try:
            db.commit()
            db.refresh(db_proj)
        except Exception:
            db.rollback()

        try:
            member_users = db.query(Member).filter(Member.email.isnot(None)).all()
            member_emails = [u.email for u in member_users if getattr(u, 'notif_vote_needed', True) and u.email]
            if member_emails:
                send_res = send_vote_required_email(
                    to_email=member_emails,
                    vote_title=db_proj.title,
                    submitted_by=db_proj.submitted_by or "Coordination SCI",
                    description=f"{notif_msg}\n\n{db_proj.description or ''}",
                    estimated_cost=float(db_proj.estimated_cost or 0.0),
                    project_id=db_proj.id
                )
                if isinstance(send_res, dict) and "_email_dispatched" in send_res:
                    dispatched_email = send_res["_email_dispatched"]
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send project vote notification from approve: {e}")
            print(f"[EMAIL ERROR] Failed to send project vote notification from approve: {e}")

        # Notification interne globale pour la cloche (Annotation 11 & 13)
        create_internal_notification(
            db=db,
            title=f"Scrutin ouvert : {db_proj.title}",
            description=f"Le scrutin « {db_proj.title} » a été validé par la coordination et est ouvert au vote de tous les associés.",
            notif_type="vote",
            link_path="/taches",
            link_id=db_proj.id,
            email_entry=dispatched_email
        )

    elif db_proj.status in ["ARCHIVED", "ARCHIVE", "ARCHIVEE", "CLOSED"] and old_status not in ["ARCHIVED", "ARCHIVE", "ARCHIVEE", "CLOSED"]:
        notif_msg = f"Le scrutin « {db_proj.title} » a été validé et archivé définitivement par la coordination."
        sys_comment = ProjectComment(
            project_id=project_id,
            author_name="Coordination SCI",
            content=notif_msg
        )
        db.add(sys_comment)
        try:
            db.commit()
            db.refresh(db_proj)
        except Exception:
            db.rollback()

        decision = "ARCHIVÉ"
        votes_summary = "Résultats validés"
        try:
            member_users = db.query(Member).filter(Member.email.isnot(None)).all()
            closed_recipients = [
                m.email for m in member_users
                if getattr(m, 'notif_vote_closed', True) and m.email
            ]
            if closed_recipients:
                all_project_votes = db.query(ProjectVote).filter(ProjectVote.project_id == db_proj.id).all()
                total_v = len(all_project_votes)
                pour_cnt = sum(1 for v in all_project_votes if v.vote and str(v.vote).upper() in ["POUR", "OUI", "APPROUVER"])
                contre_cnt = sum(1 for v in all_project_votes if v.vote and str(v.vote).upper() in ["CONTRE", "NON", "REJETER"])
                abs_cnt = sum(1 for v in all_project_votes if v.vote and str(v.vote).upper() in ["ABSTENTION", "BLANC"])

                if pour_cnt > contre_cnt:
                    decision = "ADOPTÉ À LA MAJORITÉ"
                elif contre_cnt > pour_cnt:
                    decision = "REJETÉ"
                else:
                    decision = "ARCHIVÉ / ÉGALITÉ"

                votes_summary = f"{pour_cnt} Pour, {contre_cnt} Contre, {abs_cnt} Abstention"

                send_res = send_vote_closed_email(
                    to_email=closed_recipients,
                    vote_title=db_proj.title,
                    decision=decision,
                    votes_summary=votes_summary,
                    total_votes=total_v,
                    project_id=db_proj.id,
                    estimated_cost=float(db_proj.estimated_cost or 0.0)
                )
                if isinstance(send_res, dict) and "_email_dispatched" in send_res:
                    dispatched_email = send_res["_email_dispatched"]
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send vote closed notification on approve archive: {e}")

        # Notification interne globale pour la cloche (Annotation 12 & 13)
        create_internal_notification(
            db=db,
            title=f"Scrutin archivé : {db_proj.title}",
            description=f"Le scrutin « {db_proj.title} » a été validé et archivé par la coordination. Résultat : {decision} ({votes_summary}).",
            notif_type="vote",
            link_path="/taches",
            link_id=db_proj.id,
            email_entry=dispatched_email
        )

    proj_res = format_project_response(db_proj)
    if dispatched_email:
        proj_res["_email_dispatched"] = dispatched_email
        proj_res["email_dispatched"] = dispatched_email
    return proj_res

@app.patch("/api/projects/{project_id}/review")
def review_project(project_id: int, review: ProjectReview, db: Session = Depends(get_db)):
    db_proj = db.query(Project).filter(Project.id == project_id).first()
    if not db_proj:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    old_status = db_proj.status

    # Détection étendue d'invalidation des votes (Annotation 6) :
    # Toute modification du texte (titre, description), du vote (options, multi-choix) ou des documents associés

    # 1. Titre
    old_title = (db_proj.title or "").strip()
    title_was_modified = False
    if review.title is not None and review.title.strip() != old_title:
        title_was_modified = True

    # 2. Description
    old_description = (db_proj.description or "").strip()
    desc_was_modified = False
    if review.description is not None and review.description.strip() != old_description:
        desc_was_modified = True

    # 3. Options de vote
    old_raw_options = db_proj.options
    old_options_list = []
    if old_raw_options:
        try:
            old_options_list = json.loads(old_raw_options) if isinstance(old_raw_options, str) else list(old_raw_options)
        except Exception:
            old_options_list = [o.strip() for o in str(old_raw_options).split(",") if o.strip()]
    if not isinstance(old_options_list, list):
        old_options_list = []

    new_options_list = None
    if review.options is not None:
        new_options_list = [str(o).strip() for o in review.options if str(o).strip()]

    options_were_modified = False
    if new_options_list is not None and new_options_list != old_options_list:
        options_were_modified = True

    # 4. Mode choix multiples
    old_allow_multiple = bool(getattr(db_proj, "allow_multiple_choices", False) or False)
    multi_was_modified = False
    if review.allow_multiple_choices is not None and bool(review.allow_multiple_choices) != old_allow_multiple:
        multi_was_modified = True

    # 5. Documents associés (document_urls, document_ids, documents, linked_documents)
    def extract_doc_signatures(docs):
        if not docs:
            return []
        if isinstance(docs, str):
            try:
                parsed = json.loads(docs)
                return extract_doc_signatures(parsed)
            except Exception:
                return [d.strip() for d in docs.split(",") if d.strip()]
        if isinstance(docs, list):
            res = []
            for d in docs:
                if isinstance(d, dict):
                    sig = str(d.get("id") or d.get("url") or d.get("file_url") or d.get("filename") or d.get("name") or "").strip()
                    if sig:
                        res.append(sig)
                elif d:
                    res.append(str(d).strip())
            return sorted(res)
        return []

    old_docs_sig = extract_doc_signatures(db_proj.document_urls)
    docs_were_modified = False

    incoming_docs = review.document_urls if review.document_urls is not None else (getattr(review, 'documents', None) or None)
    if incoming_docs is not None:
        new_docs_sig = extract_doc_signatures(incoming_docs)
        if new_docs_sig != old_docs_sig:
            docs_were_modified = True

    incoming_doc_ids = getattr(review, 'document_ids', None)
    if incoming_doc_ids is not None:
        new_doc_ids_sig = sorted([str(x).strip() for x in incoming_doc_ids if str(x).strip()])
        old_ids_sig = []
        if db_proj.document_urls and isinstance(db_proj.document_urls, str) and db_proj.document_urls.startswith('['):
            try:
                old_ids_sig = sorted([str(d.get('id')).strip() for d in json.loads(db_proj.document_urls) if isinstance(d, dict) and d.get('id')])
            except Exception:
                old_ids_sig = []
        if new_doc_ids_sig != old_ids_sig:
            docs_were_modified = True

    if review.linked_documents is not None and (review.linked_documents or "").strip() != (db_proj.linked_documents or "").strip():
        docs_were_modified = True

    # Détection modification liens externes (Annotation 6 & 12)
    old_raw_ext = db_proj.external_links
    old_ext_sig = []
    if old_raw_ext:
        try:
            parsed_ext = json.loads(old_raw_ext) if isinstance(old_raw_ext, str) else list(old_raw_ext)
            if isinstance(parsed_ext, list):
                old_ext_sig = sorted([str(x.get("url") or x.get("title") or x).strip() for x in parsed_ext if x])
        except Exception:
            old_ext_sig = [str(old_raw_ext).strip()]

    ext_were_modified = False
    if review.external_links is not None:
        new_ext_sig = []
        if isinstance(review.external_links, list):
            new_ext_sig = sorted([str(x.get("url") or x.get("title") or x).strip() for x in review.external_links if x])
        elif isinstance(review.external_links, str):
            try:
                parsed_new = json.loads(review.external_links)
                if isinstance(parsed_new, list):
                    new_ext_sig = sorted([str(x.get("url") or x.get("title") or x).strip() for x in parsed_new if x])
                else:
                    new_ext_sig = [review.external_links.strip()]
            except Exception:
                new_ext_sig = [review.external_links.strip()]
        if new_ext_sig != old_ext_sig:
            ext_were_modified = True

    should_reset_votes = (
        title_was_modified or
        desc_was_modified or
        options_were_modified or
        multi_was_modified or
        docs_were_modified or
        ext_were_modified
    )

    if review.title is not None and review.title.strip():
        db_proj.title = review.title.strip()
    if review.description is not None:
        db_proj.description = review.description.strip()
    if review.status is not None:
        db_proj.status = review.status
    if review.decision_mode is not None:
        db_proj.decision_mode = review.decision_mode
        if review.decision_mode == "SOUMETTRE_AU_VOTE":
            db_proj.status = "OPEN" if review.status is None else review.status
        elif review.decision_mode == "VALIDER_DIRECTEMENT":
            db_proj.status = "EN_COURS" if review.status is None else review.status
    if review.classification is not None:
        db_proj.classification = review.classification
    if review.task_weight is not None:
        db_proj.task_weight = review.task_weight
    if review.charge is not None:
        db_proj.charge = review.charge
    if review.add_to_ag_agenda is not None:
        db_proj.add_to_ag_agenda = review.add_to_ag_agenda
    if review.linked_documents is not None:
        db_proj.linked_documents = review.linked_documents
    if review.document_urls is not None:
        db_proj.document_urls = json.dumps(review.document_urls) if not isinstance(review.document_urls, str) else review.document_urls
    if review.supplier_info is not None:
        db_proj.supplier_info = review.supplier_info
    if review.coordinator_notes is not None:
        db_proj.coordinator_notes = review.coordinator_notes
    if review.estimated_cost is not None:
        db_proj.estimated_cost = review.estimated_cost
    if review.category is not None:
        db_proj.category = review.category
    if review.priority is not None:
        db_proj.priority = review.priority
    if review.responsible is not None:
        db_proj.responsible = review.responsible
    if review.options is not None:
        db_proj.options = json.dumps(review.options) if not isinstance(review.options, str) else review.options
    if review.allow_multiple_choices is not None:
        db_proj.allow_multiple_choices = bool(review.allow_multiple_choices)
    if review.external_links is not None:
        db_proj.external_links = json.dumps(review.external_links) if not isinstance(review.external_links, str) else review.external_links

    # Invalidation étendue et réinitialisation des votes si titre, description, options, multi ou docs modifiés (Annotation 6)
    votes_count = db.query(ProjectVote).filter(ProjectVote.project_id == project_id).count()
    if should_reset_votes and votes_count > 0:
        db.query(ProjectVote).filter(ProjectVote.project_id == project_id).delete()
        if hasattr(db_proj, 'votes') and isinstance(db_proj.votes, list):
            db_proj.votes.clear()
        db.expire(db_proj, ['votes'])
        if db_proj.status in ["REPORT_AG", "PENDING_VALIDATION"]:
            db_proj.status = "OPEN" if getattr(db_proj, "decision_mode", None) == "SOUMETTRE_AU_VOTE" else "EN_VOTE"

        notif_msg = f"Le scrutin « {db_proj.title} » a été modifié. Les votes précédents ont été réinitialisés. Merci d'exprimer à nouveau votre voix."
        sys_comment = ProjectComment(
            project_id=project_id,
            author_name="Système",
            content=notif_msg
        )
        db.add(sys_comment)

        try:
            member_users = db.query(Member).filter(Member.email.isnot(None)).all()
            member_emails = [u.email for u in member_users if getattr(u, 'notif_vote_needed', True) and u.email]
            if member_emails:
                send_vote_required_email(
                    to_email=member_emails,
                    vote_title=db_proj.title,
                    submitted_by="Coordination SCI",
                    description=f"{notif_msg}\n\n{db_proj.description or ''}",
                    estimated_cost=float(db_proj.estimated_cost or 0.0),
                    project_id=db_proj.id
                )
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send vote reset notification: {e}")

    try:
        db_proj.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_proj)
    except Exception as exc:
        db.rollback()
        logger.error(f"[PROJECT REVIEW ERROR] Echec commit review: {exc}")
        raise HTTPException(status_code=400, detail=f"Erreur lors de la mise à jour du projet: {str(exc)}")

    dispatched_email = None
    # Email & notification trigger: passage en mode En cours (OPEN / EN_VOTE)
    if db_proj.status in ["EN_VOTE", "OPEN"] and (old_status not in ["EN_VOTE", "OPEN"] or review.decision_mode == "SOUMETTRE_AU_VOTE"):
        notif_msg = f"Le scrutin « {db_proj.title} » a été validé par la coordination et est désormais ouvert au vote de tous les associés."
        sys_comment = ProjectComment(
            project_id=project_id,
            author_name="Coordination SCI",
            content=notif_msg
        )
        db.add(sys_comment)
        try:
            db.commit()
            db.refresh(db_proj)
        except Exception:
            db.rollback()

        try:
            member_users = db.query(Member).filter(Member.email.isnot(None)).all()
            member_emails = [u.email for u in member_users if getattr(u, 'notif_vote_needed', True) and u.email]
            if member_emails:
                send_res = send_vote_required_email(
                    to_email=member_emails,
                    vote_title=db_proj.title,
                    submitted_by=db_proj.submitted_by or "Coordination SCI",
                    description=f"{notif_msg}\n\n{db_proj.description or ''}",
                    estimated_cost=float(db_proj.estimated_cost or 0.0),
                    project_id=db_proj.id
                )
                if isinstance(send_res, dict) and "_email_dispatched" in send_res:
                    dispatched_email = send_res["_email_dispatched"]
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send project vote notification from review: {e}")
            print(f"[EMAIL ERROR] Failed to send project vote notification from review: {e}")

        # Notification interne globale pour la cloche (Annotation 11 & 13)
        create_internal_notification(
            db=db,
            title=f"Scrutin ouvert : {db_proj.title}",
            description=f"Le scrutin « {db_proj.title} » a été validé par la coordination et est ouvert au vote de tous les associés.",
            notif_type="vote",
            link_path="/taches",
            link_id=db_proj.id,
            email_entry=dispatched_email
        )

    # Email & notification trigger: passage en mode Archivé (ARCHIVED / ARCHIVE / ARCHIVEE / CLOSED)
    elif db_proj.status in ["ARCHIVED", "ARCHIVE", "ARCHIVEE", "CLOSED"] and old_status not in ["ARCHIVED", "ARCHIVE", "ARCHIVEE", "CLOSED"]:
        notif_msg = f"Le scrutin « {db_proj.title} » a été validé et archivé définitivement par la coordination."
        sys_comment = ProjectComment(
            project_id=project_id,
            author_name="Coordination SCI",
            content=notif_msg
        )
        db.add(sys_comment)
        try:
            db.commit()
            db.refresh(db_proj)
        except Exception:
            db.rollback()

        decision = "ARCHIVÉ"
        votes_summary = "Résultats validés"
        try:
            member_users = db.query(Member).filter(Member.email.isnot(None)).all()
            closed_recipients = [
                m.email for m in member_users
                if getattr(m, 'notif_vote_closed', True) and m.email
            ]
            if closed_recipients:
                all_project_votes = db.query(ProjectVote).filter(ProjectVote.project_id == db_proj.id).all()
                total_v = len(all_project_votes)
                pour_cnt = sum(1 for v in all_project_votes if v.vote and str(v.vote).upper() in ["POUR", "OUI", "APPROUVER"])
                contre_cnt = sum(1 for v in all_project_votes if v.vote and str(v.vote).upper() in ["CONTRE", "NON", "REJETER"])
                abs_cnt = sum(1 for v in all_project_votes if v.vote and str(v.vote).upper() in ["ABSTENTION", "BLANC"])

                if pour_cnt > contre_cnt:
                    decision = "ADOPTÉ À LA MAJORITÉ"
                elif contre_cnt > pour_cnt:
                    decision = "REJETÉ"
                else:
                    decision = "ARCHIVÉ / ÉGALITÉ"

                votes_summary = f"{pour_cnt} Pour, {contre_cnt} Contre, {abs_cnt} Abstention"

                send_res = send_vote_closed_email(
                    to_email=closed_recipients,
                    vote_title=db_proj.title,
                    decision=decision,
                    votes_summary=votes_summary,
                    total_votes=total_v,
                    project_id=db_proj.id,
                    estimated_cost=float(db_proj.estimated_cost or 0.0)
                )
                if isinstance(send_res, dict) and "_email_dispatched" in send_res:
                    dispatched_email = send_res["_email_dispatched"]
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send vote closed notification on archive: {e}")

        # Notification interne globale pour la cloche (Annotation 12 & 13)
        create_internal_notification(
            db=db,
            title=f"Scrutin archivé : {db_proj.title}",
            description=f"Le scrutin « {db_proj.title} » a été validé et archivé par la coordination. Résultat : {decision} ({votes_summary}).",
            notif_type="vote",
            link_path="/taches",
            link_id=db_proj.id,
            email_entry=dispatched_email
        )

    proj_res = format_project_response(db_proj)
    if dispatched_email:
        proj_res["_email_dispatched"] = dispatched_email
        proj_res["email_dispatched"] = dispatched_email
    return proj_res


@app.put("/api/projects/{project_id}")
@app.patch("/api/projects/{project_id}")
def update_project(project_id: int, review: ProjectReview, db: Session = Depends(get_db)):
    """Mise à jour d'un projet / scrutin (alias complet vers review_project avec sauvegarde external_links)."""
    return review_project(project_id, review, db)


@app.patch("/api/projects/{project_id}/cost")
def update_project_cost(project_id: int, payload: dict, db: Session = Depends(get_db)):
    db_proj = db.query(Project).filter(Project.id == project_id).first()
    if not db_proj:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    if "estimated_cost" in payload:
        db_proj.estimated_cost = float(payload["estimated_cost"])
    if "coordinator_notes" in payload:
        db_proj.coordinator_notes = payload["coordinator_notes"]

    db.commit()
    db.refresh(db_proj)
    return format_project_response(db_proj)


def process_vote_submission(
    project_id: int,
    user_name: str,
    vote_val: Any,
    comment: Optional[str],
    db: Session
) -> dict:
    db_proj = db.query(Project).filter(Project.id == project_id).first()
    if not db_proj:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    clean_name = (user_name or "").strip()
    norm_clean = normalize_text_for_matching(clean_name)
    norm_first = norm_clean.split()[0] if norm_clean else ""

    all_project_votes = db.query(ProjectVote).filter(ProjectVote.project_id == project_id).all()
    existing_vote = None
    for pv in all_project_votes:
        pv_name = (pv.user_name or "").strip()
        norm_pv = normalize_text_for_matching(pv_name)
        norm_pv_first = norm_pv.split()[0] if norm_pv else ""
        if norm_pv == norm_clean or (norm_first and norm_pv_first == norm_first):
            existing_vote = pv
            break

    if existing_vote is None and clean_name:
        existing_vote = db.query(ProjectVote).filter(
            ProjectVote.project_id == project_id,
            func.lower(ProjectVote.user_name) == clean_name.lower()
        ).first()

    proj_status = (db_proj.status or "").strip().upper()
    if proj_status in ["PROPOSED", "PENDING_CREATION", "EN_ATTENTE_CREATION"]:
        raise HTTPException(
            status_code=400,
            detail="Ce scrutin est en attente de validation de création par les coordinateurs. Les votes ne sont pas encore ouverts."
        )

    closed_or_archived = ["ARCHIVE", "ARCHIVEE", "ANNULE", "ANNULEE", "ARCHIVED", "CLOSED"]

    allowed_vote_statuses = [
        "EN_VOTE", "SOUMIS", "VOTE_EN_COURS", "OUVERT", "OUVERTE", "OPEN",
        "EN_COURS", "REPORT_AG", "APPROUVE", "REFUSE", "EN_ATTENTE_VALIDATION", "PENDING_VALIDATION",
        "VALIDE", "VALIDEE"
    ]
    if proj_status in closed_or_archived or (not existing_vote and proj_status not in allowed_vote_statuses):
        raise HTTPException(status_code=400, detail="Ce projet n'est pas ouvert au vote actuellement.")

    # Support choix unique vs choix multiples (Annotation 11)
    is_multi_vote = False
    multi_vote_choices = []

    if isinstance(vote_val, list):
        is_multi_vote = True
        multi_vote_choices = [str(x).strip() for x in vote_val if str(x).strip()]
    elif hasattr(vote_val, 'value') and isinstance(vote_val.value, list):
        is_multi_vote = True
        multi_vote_choices = [str(x).strip() for x in vote_val.value if str(x).strip()]
    elif isinstance(vote_val, str) and vote_val.strip().startswith("[") and vote_val.strip().endswith("]"):
        try:
            parsed = json.loads(vote_val)
            if isinstance(parsed, list):
                is_multi_vote = True
                multi_vote_choices = [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass

    valid_votes = ["OUI", "NON", "ABSTENTION", "BLANC", "REPORT_PROCHAINE_AG", "REPORT_AG", "POUR", "CONTRE"]

    project_options = []
    if getattr(db_proj, "options", None):
        try:
            raw_opts = json.loads(db_proj.options) if isinstance(db_proj.options, str) else db_proj.options
            if isinstance(raw_opts, list):
                project_options = [str(o).strip() for o in raw_opts if str(o).strip()]
        except Exception:
            pass

    # Détection retrait ou annulation de vote (Annotations 9 & 10)
    is_withdrawal = False
    if vote_val is None:
        is_withdrawal = True
    elif is_multi_vote and not multi_vote_choices:
        is_withdrawal = True
    elif not is_multi_vote:
        raw_vote = vote_val.value if hasattr(vote_val, 'value') else str(vote_val)
        vote_upper = raw_vote.upper().strip()
        if vote_upper in ('', 'EN_ATTENTE', 'RETIRER'):
            is_withdrawal = True

    if is_withdrawal:
        if existing_vote:
            try:
                db.delete(existing_vote)
                db.commit()
                db.refresh(db_proj)
            except Exception as exc:
                db.rollback()
                logger.error(f"[VOTE ERROR] Erreur suppression vote lors du retrait: {exc}")
                raise HTTPException(status_code=400, detail="Erreur lors de la réinitialisation du vote.")
    else:
        if is_multi_vote:
            validated_choices = []
            has_ag_report = False
            for choice in multi_vote_choices:
                choice_upper = choice.upper()
                matched = next((opt for opt in project_options if choice_upper == opt.upper()), None)
                if matched:
                    validated_choices.append(matched)
                elif choice_upper in valid_votes:
                    validated_choices.append(choice_upper)
                    if choice_upper in ("REPORT_PROCHAINE_AG", "REPORT_AG"):
                        has_ag_report = True
                else:
                    accepted_list = (project_options + ["BLANC", "REPORT_AG"]) if project_options else valid_votes
                    raise HTTPException(status_code=400, detail=f"Choix « {choice} » invalide. Doit être l'un de : {', '.join(accepted_list)}.")

            if has_ag_report:
                db_proj.status = "REPORT_AG"
                db_proj.add_to_ag_agenda = True

            vote_to_store = json.dumps(validated_choices)
        else:
            raw_vote = vote_val.value if hasattr(vote_val, 'value') else str(vote_val)
            vote_upper = raw_vote.upper().strip()

            is_custom_option = any(vote_upper == opt.upper() for opt in project_options)
            matched_custom_option = next((opt for opt in project_options if vote_upper == opt.upper()), None)

            if vote_upper not in valid_votes and not is_custom_option:
                accepted_list = (project_options + ["BLANC", "REPORT_AG"]) if project_options else valid_votes
                raise HTTPException(status_code=400, detail=f"Le vote doit être l'un de : {', '.join(accepted_list)}.")

            vote_str = matched_custom_option if is_custom_option else vote_upper

            if vote_str in ("REPORT_PROCHAINE_AG", "REPORT_AG"):
                db_proj.status = "REPORT_AG"
                db_proj.add_to_ag_agenda = True

            # Sécurisation défensive : tronquer à 50 caractères si chaîne brute (Annotation 7)
            vote_to_store = vote_str[:50] if isinstance(vote_str, str) else str(vote_str)[:50]

        if existing_vote:
            existing_vote.vote = vote_to_store
            existing_vote.comment = comment
            existing_vote.voted_at = datetime.utcnow()
        else:
            new_vote = ProjectVote(
                project_id=project_id,
                user_name=clean_name,
                vote=vote_to_store,
                comment=comment
            )
            db.add(new_vote)

        try:
            db.commit()
            db.refresh(db_proj)
        except IntegrityError:
            db.rollback()
            # Conflit d'unicité détecté : récupérer le vote existant avec ce user_name
            fallback_vote = db.query(ProjectVote).filter(
                ProjectVote.project_id == project_id,
                func.lower(ProjectVote.user_name) == clean_name.lower()
            ).first()
            if fallback_vote:
                fallback_vote.vote = vote_to_store
                fallback_vote.comment = comment
                fallback_vote.voted_at = datetime.utcnow()
                try:
                    db.commit()
                    db.refresh(db_proj)
                except Exception as exc_inner:
                    db.rollback()
                    logger.error(f"[VOTE ERROR] Echec fallback commit vote: {exc_inner}")
                    raise HTTPException(status_code=400, detail="Erreur d'intégrité lors de l'enregistrement du vote.")
            else:
                logger.error("[VOTE ERROR] Conflit d'intégrité sans vote existant trouvé")
                raise HTTPException(status_code=400, detail="Conflit d'intégrité lors de l'enregistrement du vote.")
        except Exception as exc:
            db.rollback()
            logger.error(f"[VOTE ERROR] Echec commit vote: {exc}")
            raise HTTPException(status_code=400, detail=f"Erreur lors de l'enregistrement du vote: {str(exc)}")

    # Check if ALL associates have voted (7 associates in SCI Familiale)
    all_project_votes = db.query(ProjectVote).filter(ProjectVote.project_id == project_id).all()
    distinct_voters = {
        normalize_text_for_matching(v.user_name).split()[0]
        for v in all_project_votes if v.user_name and normalize_text_for_matching(v.user_name)
    }
    total_associates = db.query(Member).count() or 7

    # Check if any vote requests report to AG
    has_report_ag_vote = any(
        (v.vote or "").upper() in ("REPORT_PROCHAINE_AG", "REPORT_AG", "DEMANDE_AG")
        for v in all_project_votes
    )
    if not has_report_ag_vote and db_proj.status == "REPORT_AG":
        db_proj.status = "OPEN" if getattr(db_proj, "decision_mode", None) == "SOUMETTRE_AU_VOTE" else "EN_VOTE"
        db_proj.add_to_ag_agenda = False

    # Annotation 8 : Cycle de vie des votes calqué sur les tâches
    # Lorsque le total des voix exprimées atteint le quorum complet (7 voix), basculer automatiquement
    # le statut du projet en PENDING_VALIDATION (au lieu de clore directement), pour permettre l'arbitrage formel par les coordinateurs.
    dispatched_email = None
    quorum_reached = len(distinct_voters) >= 7 or (total_associates > 0 and len(distinct_voters) >= total_associates)
    if quorum_reached and db_proj.status in [
        "EN_VOTE", "OPEN", "SOUMIS", "PROPOSED", "REPORT_AG", "APPROUVE", "REFUSE", "PENDING_VALIDATION"
    ]:
        votes_summary = {"pour": 0, "contre": 0, "abstention": 0, "report_prochaine_ag": 0}
        for v in all_project_votes:
            v_s = (v.vote or "").upper()
            if v_s in ("POUR", "OUI"):
                votes_summary["pour"] += 1
            elif v_s in ("CONTRE", "NON"):
                votes_summary["contre"] += 1
            elif v_s == "ABSTENTION":
                votes_summary["abstention"] += 1
            elif "REPORT" in v_s:
                votes_summary["report_prochaine_ag"] += 1

        if votes_summary["report_prochaine_ag"] > 0:
            db_proj.status = "REPORT_AG"
            db_proj.add_to_ag_agenda = True
            decision = "REPORTÉ PROCHAINE AG"
        else:
            db_proj.status = "PENDING_VALIDATION"
            decision = "QUORUM ATTEINT (7/7) - EN ATTENTE DE VALIDATION COORDINATEURS"

        try:
            db_proj.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(db_proj)
        except Exception as exc:
            db.rollback()
            logger.error(f"[VOTE ERROR] Echec commit mise à jour statut quorum: {exc}")

        # Email Trigger 3: Send final decision email if notif_vote_closed is True
        try:
            members_to_notify = db.query(Member).filter(Member.email.isnot(None)).all()
            closed_recipients = [
                m.email for m in members_to_notify
                if getattr(m, 'notif_vote_closed', True) and m.email
            ]
            if closed_recipients:
                send_res = send_vote_closed_email(
                    to_email=closed_recipients,
                    vote_title=db_proj.title,
                    decision=decision,
                    votes_summary=votes_summary,
                    total_votes=len(all_project_votes),
                    project_id=db_proj.id,
                    estimated_cost=float(db_proj.estimated_cost or 0.0)
                )
                if isinstance(send_res, dict) and "_email_dispatched" in send_res:
                    dispatched_email = send_res["_email_dispatched"]
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send vote closed notification: {e}")

        # Notification des coordinateurs pour arbitrage (Annotation 8)
        coord_email_template = None
        try:
            coordinators = db.query(Member).filter(
                or_(
                    Member.is_coordinator == True,
                    func.lower(Member.prenom).in_(["henri", "joséphine", "josephine"])
                ),
                Member.email.isnot(None)
            ).all()

            for coord in coordinators:
                send_coord_res = send_vote_arbitration_email(
                    to_email=coord.email,
                    vote_title=db_proj.title,
                    decision=decision,
                    votes_summary=votes_summary,
                    coordinator_name=coord.prenom,
                    project_id=db_proj.id,
                    description=db_proj.description or "",
                    actually_send=bool(getattr(coord, "notify_vote_arbitration", False))
                )
                if isinstance(send_coord_res, dict) and "_email_dispatched" in send_coord_res:
                    coord_email_template = send_coord_res["_email_dispatched"]

            for coord in coordinators:
                create_internal_notification(
                    db=db,
                    member_id=coord.id,
                    title=f"Arbitrage requis : {db_proj.title}",
                    description=f"Le scrutin « {db_proj.title} » est en attente d'arbitrage par la coordination ({decision}).",
                    notif_type="vote",
                    link_path="/taches",
                    link_id=db_proj.id,
                    email_entry=coord_email_template
                )
        except Exception as coord_err:
            logger.error(f"[EMAIL ERROR] Failed to send coordinator vote arbitration notification: {coord_err}")

        # Notification interne globale pour la cloche (Annotation 13)
        create_internal_notification(
            db=db,
            title=f"Scrutin en attente d'arbitrage : {db_proj.title}",
            description=f"Le quorum (7/7) a été atteint sur « {db_proj.title} ». Statut : {decision}.",
            notif_type="vote",
            link_path="/taches",
            link_id=db_proj.id,
            email_entry=dispatched_email or coord_email_template
        )

    elif not quorum_reached and db_proj.status == "PENDING_VALIDATION":
        # Annotation 10 : Si le total des votants repasse sous 7 (suite à un retrait), réverser automatiquement le statut à OPEN !
        db_proj.status = "OPEN"
        try:
            db_proj.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(db_proj)
        except Exception as exc:
            db.rollback()
            logger.error(f"[VOTE ERROR] Echec réversion statut vers OPEN: {exc}")

    proj_res_data = format_project_response(db_proj)
    if dispatched_email:
        proj_res_data["_email_dispatched"] = dispatched_email
        proj_res_data["email_dispatched"] = dispatched_email
    return proj_res_data


@app.post("/api/projects/{project_id}/vote")
def cast_vote(project_id: int, vote_in: ProjectVoteCreate, db: Session = Depends(get_db)):
    return process_vote_submission(project_id, vote_in.user_name, vote_in.vote, vote_in.comment, db)


@app.post("/api/votes")
def submit_vote_endpoint(vote_req: VoteSubmissionRequest, db: Session = Depends(get_db)):
    return process_vote_submission(vote_req.project_id, vote_req.user_name, vote_req.vote, vote_req.comment, db)



@app.get("/api/projects/{project_id}/comments", response_model=List[ProjectCommentResponse])
def get_project_comments(project_id: int, db: Session = Depends(get_db)):
    db_proj = db.query(Project).filter(Project.id == project_id).first()
    if not db_proj:
        raise HTTPException(status_code=404, detail="Projet non trouvé")
    return db.query(ProjectComment).filter(ProjectComment.project_id == project_id).order_by(ProjectComment.created_at.asc()).all()

@app.get("/api/projects/{project_id}/messages", response_model=List[ProjectCommentResponse])
def get_project_messages_alias(project_id: int, db: Session = Depends(get_db)):
    return get_project_comments(project_id, db)

@app.post("/api/projects/{project_id}/comments", response_model=ProjectCommentResponse, status_code=status.HTTP_201_CREATED)
def add_project_comment(
    project_id: int,
    comment: ProjectCommentCreate,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    db_proj = db.query(Project).filter(Project.id == project_id).first()
    if not db_proj:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    author_name = comment.author_name or "Henri Jamet"
    content_text = (comment.content or "").strip()

    db_comment = ProjectComment(
        project_id=project_id,
        author_name=author_name,
        content=content_text
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)

    # Traitement unifié des mentions (@membre et @all/@tous - Annotations 10 & 13)
    try:
        dispatch_chat_mentions(
            db=db,
            content=db_comment.content,
            author_name=author_name,
            context_title=db_proj.title,
            target_url=f"{APP_BASE_URL}/taches?project_id={db_proj.id}",
            link_path="/taches",
            link_id=db_proj.id,
            background_tasks=background_tasks
        )
    except Exception as e:
        logger.error(f"[MENTIONS ERROR] Project comment mention notification failed: {e}")

    return db_comment

@app.post("/api/projects/{project_id}/messages", response_model=ProjectCommentResponse, status_code=status.HTTP_201_CREATED)
def add_project_message_alias(
    project_id: int,
    comment: ProjectCommentCreate,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    return add_project_comment(project_id, comment, background_tasks, db)

@app.post("/api/projects/{project_id}/reject-and-reopen")
def reject_and_reopen_project(project_id: int, db: Session = Depends(get_db)):
    db_proj = db.query(Project).filter(Project.id == project_id).first()
    if not db_proj:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    # 1. Annulation / suppression de tous les votes enregistrés
    db.query(ProjectVote).filter(ProjectVote.project_id == project_id).delete()
    if hasattr(db_proj, 'votes') and isinstance(db_proj.votes, list):
        db_proj.votes.clear()
    db.expire(db_proj, ['votes'])

    # 2. Réouverture du scrutin
    db_proj.status = "OPEN"
    db_proj.add_to_ag_agenda = False
    db_proj.updated_at = datetime.utcnow()

    # 3. Commentaire système dans le chat familial
    notif_msg = "Suite à un problème lors de l'arbitrage, le scrutin a été annulé par la coordination et réouvert. Merci d'exprimer à nouveau votre vote."
    comment_text = f"La coordination a refusé la clôture du scrutin « {db_proj.title} ». L'ensemble des votes précédents a été annulé et le scrutin est rouvert. {notif_msg}"
    sys_comment = ProjectComment(
        project_id=project_id,
        author_name="Coordination SCI",
        content=comment_text
    )
    db.add(sys_comment)

    # 4. Envoi email de notification (avec try/except silencieux)
    dispatched_email = None
    try:
        member_users = db.query(Member).filter(Member.email.isnot(None)).all()
        member_emails = [u.email for u in member_users if getattr(u, 'notif_vote_needed', True) and u.email]
        if member_emails:
            send_res = send_vote_required_email(
                to_email=member_emails,
                vote_title=db_proj.title,
                submitted_by="Coordination SCI",
                description=f"{notif_msg}\n\n{db_proj.description or ''}",
                estimated_cost=float(db_proj.estimated_cost or 0.0),
                project_id=db_proj.id
            )
            if isinstance(send_res, dict) and "_email_dispatched" in send_res:
                dispatched_email = send_res["_email_dispatched"]
    except Exception as e:
        logger.error(f"[EMAIL ERROR] Failed to send vote reset notification: {e}")

    # 5. Notification interne systématique dans la cloche (Annotation 9 & 13)
    create_internal_notification(
        db=db,
        title=f"Scrutin réouvert : {db_proj.title}",
        description=notif_msg,
        notif_type="vote",
        link_path="/taches",
        link_id=db_proj.id,
        email_entry=dispatched_email
    )

    db.commit()
    db.refresh(db_proj)
    proj_res = format_project_response(db_proj)
    if dispatched_email:
        proj_res["_email_dispatched"] = dispatched_email
        proj_res["email_dispatched"] = dispatched_email
    return proj_res

@app.delete("/api/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    db_proj = db.query(Project).filter(Project.id == project_id).first()
    if not db_proj:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    db.query(ProjectVote).filter(ProjectVote.project_id == project_id).delete()
    db.query(ProjectComment).filter(ProjectComment.project_id == project_id).delete()
    db.delete(db_proj)
    db.commit()
    return None



# --- Member Availabilities & Smart Match (Crossed Calendar) ---


@app.get("/api/availabilities", response_model=List[AvailabilityResponse])
def get_availabilities(
    property_id: int = Query(...),
    year: int = Query(2026),
    db: Session = Depends(get_db)
):
    return db.query(MemberAvailability).filter(
        MemberAvailability.property_id == property_id,
        MemberAvailability.year == year
    ).all()

@app.post("/api/availabilities", response_model=AvailabilityResponse)
def set_availability(avail: AvailabilitySet, db: Session = Depends(get_db)):
    existing = db.query(MemberAvailability).filter(
        MemberAvailability.property_id == avail.property_id,
        MemberAvailability.year == avail.year,
        MemberAvailability.week_number == avail.week_number,
        MemberAvailability.user_name == avail.user_name
    ).first()

    if existing:
        existing.status = avail.status
        existing.notes = avail.notes
        existing.updated_at = datetime.utcnow()
        db_avail = existing
    else:
        db_avail = MemberAvailability(
            property_id=avail.property_id,
            year=avail.year,
            week_number=avail.week_number,
            user_name=avail.user_name,
            status=avail.status,
            notes=avail.notes
        )
        db.add(db_avail)

    db.commit()
    db.refresh(db_avail)
    return db_avail

@app.post("/api/availabilities/batch", response_model=List[AvailabilityResponse])
def set_availabilities_batch(batch: AvailabilityBatchCreate, db: Session = Depends(get_db)):
    results = []
    for item in batch.availabilities:
        existing = db.query(MemberAvailability).filter(
            MemberAvailability.property_id == batch.property_id,
            MemberAvailability.year == batch.year,
            MemberAvailability.week_number == item.week_number,
            MemberAvailability.user_name == batch.user_name
        ).first()

        if existing:
            existing.status = item.status
            existing.notes = item.notes
            existing.updated_at = datetime.utcnow()
            results.append(existing)
        else:
            db_avail = MemberAvailability(
                property_id=batch.property_id,
                year=batch.year,
                week_number=item.week_number,
                user_name=batch.user_name,
                status=item.status,
                notes=item.notes
            )
            db.add(db_avail)
            results.append(db_avail)

    db.commit()
    for r in results:
        db.refresh(r)
    return results

@app.get("/api/availabilities/smart-match", response_model=List[SmartMatchItem])
def smart_match_meetups(
    property_id: int = Query(...),
    year: int = Query(2026),
    db: Session = Depends(get_db)
):
    availabilities = db.query(MemberAvailability).filter(
        MemberAvailability.property_id == property_id,
        MemberAvailability.year == year
    ).all()

    # Group by week number
    week_map = {}
    for avail in availabilities:
        wn = avail.week_number
        if wn not in week_map:
            week_map[wn] = {"present": [], "optionnel": [], "impossible": []}
        
        st = avail.status.upper()
        if st == "PRESENT":
            week_map[wn]["present"].append(avail.user_name)
        elif st == "OPTIONNEL":
            week_map[wn]["optionnel"].append(avail.user_name)
        elif st == "IMPOSSIBLE":
            week_map[wn]["impossible"].append(avail.user_name)

    matches = []
    for wn, data in week_map.items():
        start_dt, end_dt = get_week_dates(year, wn)
        p_count = len(data["present"])
        o_count = len(data["optionnel"])
        i_count = len(data["impossible"])

        # Score formula: (present * 2) + (optionnel * 1) - (impossible * 2)
        score = (p_count * 2) + (o_count * 1) - (i_count * 2)

        matches.append(SmartMatchItem(
            year=year,
            week_number=wn,
            start_date=start_dt,
            end_date=end_dt,
            score=score,
            total_present=p_count,
            total_optionnel=o_count,
            total_impossible=i_count,
            present_members=data["present"],
            optionnel_members=data["optionnel"],
            impossible_members=data["impossible"]
        ))

    # Sort descending by score, then by total_present
    matches.sort(key=lambda x: (x.score, x.total_present), reverse=True)
    return matches


# --- Vademecum Centralisé Endpoints ---

@app.get("/api/vademecum", response_model=List[VademecumItemResponse])
def list_vademecum_items(
    property_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(VademecumItem)
    if property_id:
        query = query.filter(VademecumItem.property_id == property_id)
    if category and category != "Toutes":
        query = query.filter(VademecumItem.category == category)

    return query.order_by(VademecumItem.importance.desc(), VademecumItem.category.asc()).all()

@app.post("/api/vademecum", response_model=VademecumItemResponse, status_code=status.HTTP_201_CREATED)
def create_vademecum_item(item: VademecumItemCreate, db: Session = Depends(get_db)):
    db_item = VademecumItem(
        property_id=item.property_id,
        category=item.category,
        title=item.title,
        content=item.content,
        code_to_copy=item.code_to_copy,
        importance=item.importance or "INFO"
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@app.patch("/api/vademecum/{item_id}", response_model=VademecumItemResponse)
def update_vademecum_item(item_id: int, update: VademecumItemUpdate, db: Session = Depends(get_db)):
    db_item = db.query(VademecumItem).filter(VademecumItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Fiche Vademecum non trouvée")

    if update.category is not None:
        db_item.category = update.category
    if update.title is not None:
        db_item.title = update.title
    if update.content is not None:
        db_item.content = update.content
    if update.code_to_copy is not None:
        db_item.code_to_copy = update.code_to_copy
    if update.importance is not None:
        db_item.importance = update.importance

    db.commit()
    db.refresh(db_item)
    return db_item

@app.delete("/api/vademecum/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vademecum_item(item_id: int, db: Session = Depends(get_db)):
    db_item = db.query(VademecumItem).filter(VademecumItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Fiche Vademecum non trouvée")

    db.delete(db_item)
    db.commit()
    return None


# --- Unified Tasks & Comments Endpoints (Stitch Screens F06) ---

def compute_task_progress(task: Task):
    checklist = []
    if task.checklist:
        try:
            checklist = json.loads(task.checklist) if isinstance(task.checklist, str) else task.checklist
        except Exception:
            checklist = []
    total_steps = len(checklist) if isinstance(checklist, list) else 0
    completed_steps = sum(1 for step in checklist if isinstance(step, dict) and (step.get("completed") or step.get("done") or step.get("status") in ["done", "completed"])) if total_steps > 0 else 0
    if total_steps > 0:
        pct = round((completed_steps / total_steps) * 100)
    else:
        st = str(task.status or "").upper()
        if st in ["TERMINE", "ARCHIVEE", "VALIDE"]:
            pct = 100
        else:
            pct = 0
    return pct, completed_steps, total_steps


def format_comment_response(comment: TaskComment) -> dict:
    raw_reactions = {}
    if comment.reactions:
        try:
            raw_reactions = json.loads(comment.reactions) if isinstance(comment.reactions, str) else comment.reactions
        except Exception:
            raw_reactions = {}

    counts: Dict[str, int] = {}
    if isinstance(raw_reactions, dict):
        for k, v in raw_reactions.items():
            if isinstance(v, list):
                counts[k] = len(v)
            elif isinstance(v, int):
                counts[k] = v
            else:
                try:
                    counts[k] = int(v)
                except Exception:
                    counts[k] = 1

    return {
        "id": comment.id,
        "task_id": comment.task_id,
        "author_id": comment.author_id,
        "author_name": comment.author_name,
        "author_role": comment.author_role,
        "content": comment.content,
        "reactions": counts,
        "created_at": comment.created_at
    }


def format_task_response(task: Task, include_comments: bool = False) -> dict:
    progress_pct, completed_steps, total_steps = compute_task_progress(task)

    assigned_members = []
    if task.assigned_members:
        try:
            assigned_members = json.loads(task.assigned_members) if isinstance(task.assigned_members, str) else task.assigned_members
        except Exception:
            assigned_members = [task.assigned_members]

    checklist = []
    if task.checklist:
        try:
            checklist = json.loads(task.checklist) if isinstance(task.checklist, str) else task.checklist
        except Exception:
            checklist = []

    documents = []
    if task.documents:
        try:
            documents = json.loads(task.documents) if isinstance(task.documents, str) else task.documents
        except Exception:
            documents = []
    if not isinstance(documents, list):
        documents = []

    # Fusion avec les documents certifiés rattachés via admin_documents (Annotation 10 & 11)
    admin_docs = getattr(task, "admin_documents", None)
    if admin_docs:
        seen_ids = {d.get("id") for d in documents if isinstance(d, dict) and "id" in d}
        seen_urls = {d.get("url") or d.get("file_url") for d in documents if isinstance(d, dict)}
        for ad in admin_docs:
            doc_url = ad.file_url or f"/api/documents/{ad.id}/download"
            if ad.id not in seen_ids and doc_url not in seen_urls:
                documents.append({
                    "id": ad.id,
                    "name": ad.title,
                    "title": ad.title,
                    "filename": ad.file_name or ad.title,
                    "file_url": doc_url,
                    "url": doc_url,
                    "type": "PDF" if (ad.file_name or "").lower().endswith(".pdf") else "Image" if (ad.file_type or "").startswith("image/") else "Document",
                    "file_type": ad.file_type,
                    "size": f"{round((ad.file_size or 0) / 1024, 1)} Ko" if ad.file_size else "",
                    "category": ad.category,
                    "uploaded_by": ad.uploaded_by,
                    "created_at": ad.created_at.isoformat() if hasattr(ad.created_at, "isoformat") else str(ad.created_at)
                })

    completion_docs = []
    if task.completion_docs:
        try:
            completion_docs = json.loads(task.completion_docs) if isinstance(task.completion_docs, str) else task.completion_docs
        except Exception:
            completion_docs = [task.completion_docs]

    external_links = []
    if getattr(task, "external_links", None):
        try:
            external_links = json.loads(task.external_links) if isinstance(task.external_links, str) else list(task.external_links)
        except Exception:
            external_links = []
    if not isinstance(external_links, list):
        external_links = []

    comments_list = [format_comment_response(c) for c in task.comments] if task.comments else []

    data = {
        "id": task.id,
        "ref": task.ref,
        "title": task.title,
        "description": task.description,
        "subject": task.subject,
        "category": task.category,
        "priority": task.priority,
        "status": task.status,
        "is_recurring": bool(getattr(task, "is_recurring", False)),
        "recurrence_interval": getattr(task, "recurrence_interval", 1) or 1,
        "recurrence_unit": getattr(task, "recurrence_unit", "semaines") or "semaines",
        "auto_assign_by_workload": bool(getattr(task, "auto_assign_by_workload", False)),
        "last_completed_at": task.last_completed_at,
        "complexity": task.complexity,
        "charge_points": getattr(task, "charge_points", None) or get_task_charge_points(task.complexity),
        "budget": task.budget,
        "budget_notes": task.budget_notes,
        "assignee_id": task.assignee_id,
        "assigned_members": assigned_members,
        "deadline": task.deadline,
        "checklist": checklist,
        "documents": documents,
        "external_links": external_links,
        "completion_notes": task.completion_notes,
        "completion_docs": completion_docs,
        "created_by": task.created_by,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "comments_count": len(comments_list),
        "progress_percent": progress_pct,
        "completed_steps": completed_steps,
        "total_steps": total_steps,
        "comments": comments_list
    }
    return data


def resolve_task_by_id_or_ref(task_id: str, db: Session) -> Task:
    task = None
    task_query = db.query(Task).options(
        selectinload(Task.comments),
        selectinload(Task.assignee),
        selectinload(Task.admin_documents)
    )
    if str(task_id).isdigit():
        task = task_query.filter(Task.id == int(task_id)).first()
    if not task:
        task = task_query.filter(Task.ref == str(task_id)).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Tâche '{task_id}' non trouvée.")
    return task


@app.get("/api/tasks")
def list_tasks(
    response: Response,
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    subject: Optional[str] = Query(None),
    assignee_id: Optional[int] = Query(None),
    assigned_members: Optional[str] = Query(None),
    user_name: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    property_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    query = db.query(Task)

    if priority and priority not in ["Toutes", "ALL"]:
        query = query.filter(func.lower(Task.priority) == priority.lower())
    if category and category not in ["Toutes", "ALL"]:
        query = query.filter(Task.category.ilike(f"%{category}%"))
    if status_filter and status_filter not in ["Tous", "ALL"]:
        query = query.filter(Task.status.ilike(f"%{status_filter}%"))
    if subject and subject not in ["Tous", "ALL"]:
        query = query.filter(Task.subject.ilike(f"%{subject}%"))
    if property_id:
        if property_id == 1:
            query = query.filter(Task.subject.in_(["Rosings", "Rosing", "Piscine", "Jardin", "Jardin & Espaces Verts", "Petites cabanes", "Hangar à meuble", "SCI", "SCI & Administratif"]))
        elif property_id == 2:
            query = query.filter(Task.subject.in_(["Presbytère", "Jardin", "Jardin & Espaces Verts", "Petites cabanes", "Hangar à meuble", "SCI", "SCI & Administratif"]))
    if assignee_id:
        query = query.filter(Task.assignee_id == assignee_id)
    if assigned_members:
        query = query.filter(Task.assigned_members.ilike(f"%{assigned_members}%"))
    if user_name:
        query = query.filter(
            (Task.assigned_members.ilike(f"%{user_name}%")) |
            (Task.created_by.ilike(f"%{user_name}%"))
        )
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            Task.title.ilike(s) |
            Task.description.ilike(s) |
            Task.ref.ilike(s) |
            Task.category.ilike(s) |
            Task.subject.ilike(s)
        )

    tasks = query.options(
        selectinload(Task.comments),
        selectinload(Task.assignee),
        selectinload(Task.admin_documents)
    ).order_by(Task.id.asc()).all()
    return [format_task_response(t) for t in tasks]


@app.post("/api/tasks", status_code=status.HTTP_201_CREATED)
def create_task(
    payload: dict,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    title = payload.get("title")
    if not title:
        raise HTTPException(status_code=400, detail="Titre de la tâche obligatoire")

    description = payload.get("description", "")
    subject = payload.get("subject", "SCI")
    category = payload.get("category", "Général")
    priority = payload.get("priority", "Normale")
    is_recurring = bool(payload.get("is_recurring", False))
    recurrence_interval = int(payload.get("recurrence_interval", 1)) if payload.get("recurrence_interval") else 1
    recurrence_unit = str(payload.get("recurrence_unit", "semaines") or "semaines")
    auto_assign_by_workload = bool(payload.get("auto_assign_by_workload", False))
    complexity = payload.get("complexity", "Modérée")
    raw_charge_pts = payload.get("charge_points")
    if raw_charge_pts is not None:
        try:
            charge_points = int(raw_charge_pts)
        except Exception:
            charge_points = get_task_charge_points(complexity)
    else:
        charge_points = get_task_charge_points(complexity)

    # Neutralisation / purge du champ budget (100% optionnel et tolérant)
    raw_budget = payload.get("budget")
    try:
        budget = float(raw_budget) if raw_budget is not None and str(raw_budget).strip() != "" else 0.0
    except (ValueError, TypeError):
        budget = 0.0

    budget_notes = payload.get("budget_notes")
    assignee_id = payload.get("assignee_id")
    assigned_members = payload.get("assigned_members")
    deadline = payload.get("deadline")
    checklist = payload.get("checklist")
    documents = payload.get("documents")

    # Auteur
    if current_user:
        created_by = payload.get("created_by") or current_user.prenom
    else:
        created_by = payload.get("created_by", "Henri")

    # Détection statut coordinateur
    is_coord = False
    if current_user:
        is_coord = bool(getattr(current_user, "is_coordinator", False))
    else:
        cb_clean = str(created_by).strip()
        m = db.query(Member).filter(
            or_(
                func.lower(Member.prenom) == cb_clean.lower(),
                func.lower(Member.name) == cb_clean.lower(),
                Member.prenom.ilike(f"{cb_clean.split()[0]}%"),
                Member.name.ilike(f"%{cb_clean}%")
            )
        ).first()
        if m:
            is_coord = bool(getattr(m, "is_coordinator", False))
        elif cb_clean.lower() in ["henri", "henri jamet", "joséphine", "josephine", "joséphine jamet", "josephine jamet"]:
            is_coord = True

    # Règle formelle Henri (Annotation 3 & 4) : À la création, le statut par défaut obligatoire est STRICTEMENT 'PROPOSED' (En attente de validation).
    # La tâche ne doit pas être pré-assignée au créateur ; seul un coordinateur peut spécifier un statut actif explicite.
    explicit_status = payload.get("status")
    if is_coord and explicit_status:
        task_status = explicit_status
    else:
        task_status = "PROPOSED"

    if auto_assign_by_workload and (not assigned_members or assigned_members == [] or assigned_members == "[]"):
        try:
            all_members = db.query(Member).all()
            all_reservations = db.query(Reservation).all()
            all_tasks = db.query(Task).all()
            selected_member = resolve_auto_assignment_by_workload(all_members, all_reservations, all_tasks)
            if selected_member:
                assigned_members = [selected_member]
        except Exception as auto_err:
            logger.warning(f"Erreur calcul auto-attribution selon score d'usage: {auto_err}")

    if isinstance(assigned_members, list):
        assigned_members = json.dumps(assigned_members)
    elif assigned_members is None:
        assigned_members = json.dumps([])

    if isinstance(checklist, list):
        checklist = json.dumps(checklist)
    elif checklist is None:
        checklist = json.dumps([])

    # Prise en charge des documents, document_ids et attachments
    documents_list = []
    if isinstance(documents, list):
        documents_list.extend(documents)
    elif isinstance(documents, str) and documents.strip():
        try:
            documents_list.extend(json.loads(documents))
        except Exception:
            pass

    raw_attachments = payload.get("attachments")
    if isinstance(raw_attachments, list):
        for att in raw_attachments:
            if isinstance(att, dict):
                documents_list.append(att)
            elif isinstance(att, str):
                documents_list.append({"name": os.path.basename(att), "url": att, "type": "FILE"})

    raw_doc_ids = payload.get("document_ids")
    if isinstance(raw_doc_ids, list) and raw_doc_ids:
        int_ids = [int(i) for i in raw_doc_ids if str(i).isdigit()]
        if int_ids:
            admin_docs = db.query(AdminDocument).filter(AdminDocument.id.in_(int_ids)).all()
            for d in admin_docs:
                documents_list.append({
                    "id": d.id,
                    "name": d.title or d.file_name or f"Document #{d.id}",
                    "url": d.file_url,
                    "type": d.file_type or "PDF",
                    "size": f"{(d.file_size or 0) / 1024:.1f} Ko" if d.file_size else "0 Ko"
                })

    documents_json = json.dumps(documents_list)

    raw_external_links = payload.get("external_links")
    external_links_json = json.dumps(raw_external_links) if isinstance(raw_external_links, list) else (str(raw_external_links) if raw_external_links else None)

    ref = payload.get("ref")
    if not ref:
        last_task = db.query(Task).order_by(Task.id.desc()).first()
        next_num = (last_task.id + 100) if (last_task and last_task.id) else (db.query(Task).count() + 101)
        candidate = f"T-2026-{next_num:03d}"
        while db.query(Task).filter(Task.ref == candidate).first():
            next_num += 1
            candidate = f"T-2026-{next_num:03d}"
        ref = candidate

    db_task = Task(
        ref=ref,
        title=title,
        description=description,
        subject=subject,
        category=category,
        priority=priority,
        status=task_status,
        is_recurring=is_recurring,
        recurrence_interval=recurrence_interval,
        recurrence_unit=recurrence_unit,
        auto_assign_by_workload=auto_assign_by_workload,
        complexity=complexity,
        charge_points=charge_points,
        budget=budget,
        budget_notes=budget_notes,
        assignee_id=assignee_id,
        assigned_members=assigned_members,
        deadline=deadline,
        checklist=checklist,
        documents=documents_json,
        external_links=external_links_json,
        created_by=created_by
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)

    # Email Trigger 1: Notify assignee if notif_task_assigned is True
    dispatched_email = None
    try:
        assignee = None
        if db_task.assignee_id:
            assignee = db.query(Member).filter(Member.id == db_task.assignee_id).first()
        elif db_task.assigned_members:
            try:
                assigned_list = json.loads(db_task.assigned_members)
                if assigned_list and isinstance(assigned_list, list):
                    first_name = str(assigned_list[0]).strip().split()[0].lower()
                    assignee = db.query(Member).filter(func.lower(Member.prenom) == first_name).first()
            except Exception:
                pass

        if assignee and assignee.email and getattr(assignee, 'notif_task_assigned', True):
            send_res = send_task_assigned_email(
                to_email=assignee.email,
                task_title=db_task.title,
                domain=db_task.subject or db_task.category or "SCI Familiale",
                location=db_task.category or "Domaine d'Hellenvilliers",
                priority=db_task.priority or "Normale",
                charge=db_task.complexity or "Modérée",
                task_id=db_task.id,
                assignee_name=assignee.prenom,
                description=db_task.description
            )
            if isinstance(send_res, dict) and "_email_dispatched" in send_res:
                dispatched_email = send_res["_email_dispatched"]

        if assignee:
            create_internal_notification(
                db=db,
                member_id=assignee.id,
                title=f"Nouvelle tâche assignée : {db_task.title}",
                description=f"Une mission vous a été attribuée : {db_task.title}.",
                notif_type="task",
                link_path="/taches",
                link_id=db_task.id,
                email_entry=dispatched_email
            )
    except Exception as e:
        logger.error(f"[EMAIL ERROR] Failed to send task assignment notification: {e}")

    # Email Trigger 2: Notify subscribed members on new task proposal if notify_task_creation is True (Annotation 5 & 16)
    if db_task.status == "PROPOSED":
        try:
            subscribed_members = db.query(Member).filter(
                Member.notify_task_creation == True,
                Member.email.isnot(None)
            ).all()

            # Garantit un objet e-mail virtuel prêt à afficher dans la cloche
            coord_email_template = None
            for member in subscribed_members:
                send_coord_res = send_task_creation_pending_email(
                    to_email=member.email,
                    task_title=db_task.title,
                    created_by=created_by or "Un associé",
                    domain=db_task.subject or db_task.category or "SCI Familiale",
                    location=db_task.category or "Domaine d'Hellenvilliers",
                    priority=db_task.priority or "Normale",
                    complexity=db_task.complexity or "Modérée",
                    task_id=db_task.id,
                    coordinator_name=member.prenom,
                    description=db_task.description
                )
                if isinstance(send_coord_res, dict) and "_email_dispatched" in send_coord_res:
                    coord_email_template = send_coord_res["_email_dispatched"]

            if coord_email_template:
                dispatched_email = coord_email_template

            for member in subscribed_members:
                create_internal_notification(
                    db=db,
                    member_id=member.id,
                    title=f"Nouvelle tâche en attente : {db_task.title}",
                    description=f"Soumise par {created_by or 'un associé'} et en attente d'arbitrage par la coordination.",
                    notif_type="task",
                    link_path="/taches",
                    link_id=db_task.id,
                    email_entry=coord_email_template
                )
        except Exception as coord_err:
            logger.error(f"[EMAIL ERROR] Failed to send task proposal notification to subscribed members: {coord_err}")

    task_res_data = format_task_response(db_task, include_comments=True)
    if dispatched_email:
        task_res_data["_email_dispatched"] = dispatched_email
        task_res_data["email_dispatched"] = dispatched_email
    return task_res_data


@app.get("/api/tasks/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db)):
    task = resolve_task_by_id_or_ref(task_id, db)
    return format_task_response(task, include_comments=True)


@app.patch("/api/tasks/{task_id}")
@app.put("/api/tasks/{task_id}")
def update_task(
    task_id: str,
    payload: dict,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    task = resolve_task_by_id_or_ref(task_id, db)
    old_assignee_id = task.assignee_id

    is_coord = bool(getattr(current_user, "is_coordinator", False)) if current_user else False
    is_creator = False
    if current_user:
        cb = (task.created_by or "").strip().lower()
        u_prenom = (current_user.prenom or "").strip().lower()
        u_name = (current_user.name or "").strip().lower()
        is_creator = bool((u_prenom and u_prenom in cb) or (u_name and u_name in cb))

    # Contrôle d'habilitation : coordinateur, créateur ou membre assigné
    if current_user and not is_coord and not is_creator:
        is_assigned = False
        if task.assignee_id and task.assignee_id == current_user.id:
            is_assigned = True
        elif task.assigned_members:
            try:
                assigned_list = json.loads(task.assigned_members) if isinstance(task.assigned_members, str) else task.assigned_members
                u_p = (current_user.prenom or "").lower()
                u_n = (current_user.name or "").lower()
                if any(u_p in str(a).lower() or u_n in str(a).lower() for a in assigned_list):
                    is_assigned = True
            except Exception:
                pass
        if not is_assigned:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Modification réservée au coordinateur, au créateur ou aux membres assignés de la tâche."
            )

    if "title" in payload and payload["title"] is not None:
        task.title = payload["title"]
    if "description" in payload and payload["description"] is not None:
        task.description = payload["description"]
    if "subject" in payload and payload["subject"] is not None:
        task.subject = payload["subject"]
    if "category" in payload and payload["category"] is not None:
        task.category = payload["category"]
    if "priority" in payload and payload["priority"] is not None:
        task.priority = payload["priority"]
    if "status" in payload and payload["status"] is not None:
        new_st = str(payload["status"]).strip()
        # Seul un coordinateur peut faire passer directement une tâche PROPOSED en statut actif via PUT/PATCH
        if task.status == "PROPOSED" and new_st not in ["PROPOSED", "A_REVOIR", "REJECTED"]:
            if current_user and not is_coord:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Action réservée aux coordinateurs : l'activation d'une tâche proposée requiert le rôle coordinateur ou l'arbitrage via /accept."
                )
        task.status = new_st
    if "is_recurring" in payload and payload["is_recurring"] is not None:
        task.is_recurring = bool(payload["is_recurring"])
    if "recurrence_interval" in payload and payload["recurrence_interval"] is not None:
        task.recurrence_interval = int(payload["recurrence_interval"]) if payload["recurrence_interval"] else 1
    if "recurrence_unit" in payload and payload["recurrence_unit"] is not None:
        task.recurrence_unit = str(payload["recurrence_unit"] or "semaines")
    if "auto_assign_by_workload" in payload and payload["auto_assign_by_workload"] is not None:
        task.auto_assign_by_workload = bool(payload["auto_assign_by_workload"])
        if task.auto_assign_by_workload:
            existing_assigned = []
            if task.assigned_members:
                try:
                    existing_assigned = json.loads(task.assigned_members) if isinstance(task.assigned_members, str) else list(task.assigned_members)
                except Exception:
                    existing_assigned = []
            if not existing_assigned:
                try:
                    all_members = db.query(Member).all()
                    all_reservations = db.query(Reservation).all()
                    all_tasks = db.query(Task).all()
                    selected_member = resolve_auto_assignment_by_workload(all_members, all_reservations, all_tasks)
                    if selected_member:
                        task.assigned_members = json.dumps([selected_member])
                except Exception as auto_err:
                    logger.warning(f"Erreur calcul auto-attribution lors de update_task: {auto_err}")
    if "last_completed_at" in payload and payload["last_completed_at"] is not None:
        task.last_completed_at = payload["last_completed_at"]
    if "complexity" in payload and payload["complexity"] is not None:
        task.complexity = payload["complexity"]
        task.charge_points = get_task_charge_points(task.complexity)
    if "charge_points" in payload and payload["charge_points"] is not None:
        try:
            task.charge_points = int(payload["charge_points"])
        except Exception:
            task.charge_points = get_task_charge_points(task.complexity)
    if "budget" in payload:
        raw_budget = payload["budget"]
        try:
            task.budget = float(raw_budget) if raw_budget is not None and str(raw_budget).strip() != "" else 0.0
        except (ValueError, TypeError):
            task.budget = 0.0
    if "budget_notes" in payload and payload["budget_notes"] is not None:
        task.budget_notes = payload["budget_notes"]
    if "assignee_id" in payload:
        task.assignee_id = payload["assignee_id"]
    if "assigned_members" in payload and payload["assigned_members"] is not None:
        val = payload["assigned_members"]
        task.assigned_members = json.dumps(val) if isinstance(val, list) else str(val)
    if "deadline" in payload and payload["deadline"] is not None:
        task.deadline = payload["deadline"]
    if "checklist" in payload and payload["checklist"] is not None:
        val = payload["checklist"]
        task.checklist = json.dumps(val) if isinstance(val, list) else str(val)

    # Documents existants
    existing_docs = []
    if task.documents:
        try:
            existing_docs = json.loads(task.documents) if isinstance(task.documents, str) else list(task.documents)
        except Exception:
            existing_docs = []

    # Modification directe de documents si passée
    if "documents" in payload and payload["documents"] is not None:
        val = payload["documents"]
        existing_docs = val if isinstance(val, list) else json.loads(val)

    # Attachement direct de documents via document_ids (AdminDocument)
    if "document_ids" in payload and payload["document_ids"] is not None:
        doc_ids = payload["document_ids"]
        if isinstance(doc_ids, list) and doc_ids:
            int_ids = [int(i) for i in doc_ids if str(i).isdigit()]
            if int_ids:
                admin_docs = db.query(AdminDocument).filter(AdminDocument.id.in_(int_ids)).all()
                existing_urls = {d.get("url") for d in existing_docs if isinstance(d, dict) and d.get("url")}
                existing_ids = {d.get("id") for d in existing_docs if isinstance(d, dict) and d.get("id")}
                for d in admin_docs:
                    if d.file_url not in existing_urls and d.id not in existing_ids:
                        existing_docs.append({
                            "id": d.id,
                            "name": d.title or d.file_name or f"Document #{d.id}",
                            "url": d.file_url,
                            "type": d.file_type or "PDF",
                            "size": f"{(d.file_size or 0) / 1024:.1f} Ko" if d.file_size else "0 Ko"
                        })

    # Attachement direct via attachments
    if "attachments" in payload and payload["attachments"] is not None:
        atts = payload["attachments"]
        if isinstance(atts, list):
            existing_urls = {d.get("url") for d in existing_docs if isinstance(d, dict) and d.get("url")}
            for att in atts:
                if isinstance(att, dict):
                    if att.get("url") not in existing_urls:
                        existing_docs.append(att)
                elif isinstance(att, str) and att not in existing_urls:
                    existing_docs.append({"name": os.path.basename(att), "url": att, "type": "FILE"})

    task.documents = json.dumps(existing_docs)

    if "external_links" in payload and payload["external_links"] is not None:
        val = payload["external_links"]
        task.external_links = json.dumps(val) if isinstance(val, list) else str(val)

    if "completion_notes" in payload and payload["completion_notes"] is not None:
        task.completion_notes = payload["completion_notes"]
    if "completion_docs" in payload and payload["completion_docs"] is not None:
        val = payload["completion_docs"]
        task.completion_docs = json.dumps(val) if isinstance(val, list) else str(val)

    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)

    # Email Trigger 1 (Reassignment): If newly assigned to a member, notify if notif_task_assigned is True
    dispatched_email = None
    if "assignee_id" in payload and payload["assignee_id"] and payload["assignee_id"] != old_assignee_id:
        try:
            assignee = db.query(Member).filter(Member.id == payload["assignee_id"]).first()
            if assignee and assignee.email and getattr(assignee, 'notif_task_assigned', True):
                send_res = send_task_assigned_email(
                    to_email=assignee.email,
                    task_title=task.title,
                    domain=task.subject or task.category or "SCI Familiale",
                    location=task.category or "Domaine d'Hellenvilliers",
                    priority=task.priority or "Normale",
                    charge=task.complexity or "Modérée",
                    task_id=task.id,
                    assignee_name=assignee.prenom,
                    description=task.description
                )
                if isinstance(send_res, dict) and "_email_dispatched" in send_res:
                    dispatched_email = send_res["_email_dispatched"]
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send task assignment notification on update: {e}")

    task_res_data = format_task_response(task, include_comments=True)
    if dispatched_email:
        task_res_data["_email_dispatched"] = dispatched_email
        task_res_data["email_dispatched"] = dispatched_email
    return task_res_data


@app.delete("/api/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: str, db: Session = Depends(get_db)):
    task = resolve_task_by_id_or_ref(task_id, db)
    # Suppression en cascade explicite des commentaires pour éviter tout conflit FK
    db.query(TaskComment).filter(TaskComment.task_id == task.id).delete()
    db.delete(task)
    db.commit()
    return None


@app.post("/api/tasks/{task_id}/close")
def close_task(task_id: str, req: TaskCloseRequest, db: Session = Depends(get_db)):
    task = resolve_task_by_id_or_ref(task_id, db)
    task.status = "ARCHIVEE"
    task.completion_notes = req.completion_notes
    if req.completion_docs:
        task.completion_docs = json.dumps(req.completion_docs)
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return format_task_response(task, include_comments=True)


@app.post("/api/tasks/{task_id}/validate")
def validate_task_unified(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not getattr(current_user, "is_coordinator", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action réservée aux coordinateurs (is_coordinator requis)."
        )
    task = resolve_task_by_id_or_ref(task_id, db)
    if getattr(task, "is_recurring", False):
        task.last_completed_at = datetime.utcnow()
        task.status = "A_FAIRE"
    else:
        task.status = "TERMINEE"
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return format_task_response(task, include_comments=True)


@app.post("/api/tasks/{task_id}/invalidate")
def invalidate_task_unified(
    task_id: str,
    payload: Optional[dict] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not getattr(current_user, "is_coordinator", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action réservée aux coordinateurs (is_coordinator requis)."
        )
    task = resolve_task_by_id_or_ref(task_id, db)
    task.status = "A_FAIRE"
    task.updated_at = datetime.utcnow()

    # Si message explicatif fourni, ajout au chat FamilyChat via TaskComment
    explanation = None
    if payload:
        explanation = payload.get("explanation") or payload.get("message") or payload.get("comment")
    if explanation and str(explanation).strip():
        comment = TaskComment(
            task_id=task.id,
            author_id=current_user.id,
            author_name=f"{current_user.prenom} (Coordination)",
            author_role="Coordinateur",
            content=f"[Demande de révision] {str(explanation).strip()}",
            reactions="{}"
        )
        db.add(comment)

    db.commit()
    db.refresh(task)
    return format_task_response(task, include_comments=True)


@app.post("/api/tasks/{task_id}/accept")
def accept_task_proposal(
    task_id: str,
    payload: Optional[dict] = Body(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not getattr(current_user, "is_coordinator", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action réservée aux coordinateurs (is_coordinator requis)."
        )
    task = resolve_task_by_id_or_ref(task_id, db)

    # 1. Mise à jour préalable des assignés si fournis dans le payload
    if payload:
        if payload.get("assignee_id"):
            task.assignee_id = payload.get("assignee_id")
        if payload.get("assigned_members") is not None:
            raw_members = payload.get("assigned_members")
            task.assigned_members = json.dumps(raw_members) if isinstance(raw_members, list) else str(raw_members)

    # 2. Vérification obligatoire de l'assignation (Annotation 17)
    has_assignee = False
    if task.assignee_id:
        has_assignee = True
    elif task.assigned_members:
        try:
            parsed = json.loads(task.assigned_members) if isinstance(task.assigned_members, str) else task.assigned_members
            if isinstance(parsed, list) and len([m for m in parsed if m and str(m).strip()]) > 0:
                has_assignee = True
            elif isinstance(parsed, str) and parsed.strip() and parsed.strip() not in ("[]", ""):
                has_assignee = True
        except Exception:
            if str(task.assigned_members).strip() not in ("[]", ""):
                has_assignee = True

    if not has_assignee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignation obligatoire : vous devez assigner au moins un associé à la tâche avant de pouvoir accepter sa création."
        )

    # Bascule le statut de la tâche de PROPOSED à TODO (ou EN_COURS)
    target_status = "TODO"
    if payload and (payload.get("status") or payload.get("target_status")):
        target_status = payload.get("status") or payload.get("target_status")
    task.status = target_status
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return format_task_response(task, include_comments=True)


@app.post("/api/tasks/{task_id}/reject")
def reject_task_proposal(
    task_id: str,
    payload: Optional[dict] = Body(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not getattr(current_user, "is_coordinator", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action réservée aux coordinateurs (is_coordinator requis)."
        )
    task = resolve_task_by_id_or_ref(task_id, db)

    # Action optionnelle : suppression définitive si demandée explicitement
    action = payload.get("action") if payload else None
    if action == "delete":
        db.query(TaskComment).filter(TaskComment.task_id == task.id).delete()
        db.delete(task)
        db.commit()
        return {"deleted": True, "task_id": task_id}

    task.status = "REJECTED"
    task.updated_at = datetime.utcnow()

    # Si motif fourni, ajout au fil de discussion FamilyChat
    reason = None
    if payload:
        reason = payload.get("reason") or payload.get("explanation") or payload.get("message")
    if reason and str(reason).strip():
        comment = TaskComment(
            task_id=task.id,
            author_id=current_user.id,
            author_name=f"{current_user.prenom} (Coordination)",
            author_role="Coordinateur",
            content=f"[Proposition refusée] {str(reason).strip()}",
            reactions="{}"
        )
        db.add(comment)

    db.commit()
    db.refresh(task)
    return format_task_response(task, include_comments=True)



@app.post("/api/tasks/{task_id}/submit-completion")
def submit_task_done(
    task_id: str,
    payload: Optional[dict] = None,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    task = resolve_task_by_id_or_ref(task_id, db)
    task.status = "PENDING_VALIDATION"
    task.updated_at = datetime.utcnow()
    if payload and payload.get("completion_notes"):
        task.completion_notes = payload["completion_notes"]
    if payload and payload.get("completion_docs"):
        val = payload["completion_docs"]
        task.completion_docs = json.dumps(val) if isinstance(val, list) else str(val)
    db.commit()
    db.refresh(task)
    return format_task_response(task, include_comments=True)


@app.get("/api/tasks/{task_id}/comments")
def get_task_comments(task_id: str, db: Session = Depends(get_db)):
    task = resolve_task_by_id_or_ref(task_id, db)
    comments = db.query(TaskComment).filter(TaskComment.task_id == task.id).order_by(TaskComment.created_at.asc()).all()
    return [format_comment_response(c) for c in comments]


@app.get("/api/tasks/{task_id}/messages")
def get_task_messages_alias(task_id: str, db: Session = Depends(get_db)):
    return get_task_comments(task_id, db)


@app.post("/api/tasks/{task_id}/comments", status_code=status.HTTP_201_CREATED)
def create_task_comment(
    task_id: str,
    req: TaskCommentCreate,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    task = resolve_task_by_id_or_ref(task_id, db)
    if not req.content or not req.content.strip():
        raise HTTPException(status_code=400, detail="Le contenu du message ne peut pas être vide.")

    author_name = req.author_name or "Henri Jamet"
    author_role = req.author_role or "Membre Associé"

    db_comment = TaskComment(
        task_id=task.id,
        author_id=req.author_id,
        author_name=author_name,
        author_role=author_role,
        content=req.content.strip(),
        reactions="{}"
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)

    # Traitement unifié des mentions (@membre et @all/@tous - Annotations 10 & 13)
    try:
        dispatch_chat_mentions(
            db=db,
            content=db_comment.content,
            author_name=author_name,
            context_title=task.title,
            target_url=f"{APP_BASE_URL}/taches?id={task.id}",
            link_path="/taches",
            link_id=task.id,
            background_tasks=background_tasks
        )
    except Exception as e:
        logger.error(f"[MENTIONS ERROR] Task comment mention notification failed: {e}")

    return format_comment_response(db_comment)


@app.post("/api/tasks/{task_id}/messages", status_code=status.HTTP_201_CREATED)
def create_task_message_alias(
    task_id: str,
    req: TaskCommentCreate,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    return create_task_comment(task_id, req, background_tasks, db)


@app.post("/api/tasks/{task_id}/comments/{comment_id}/react")
def react_to_task_comment(task_id: str, comment_id: int, req: TaskCommentReactRequest, db: Session = Depends(get_db)):
    task = resolve_task_by_id_or_ref(task_id, db)
    comment = db.query(TaskComment).filter(TaskComment.id == comment_id, TaskComment.task_id == task.id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Commentaire non trouvé pour cette tâche.")

    raw_emoji = req.emoji.strip() if req.emoji else ""
    if not raw_emoji:
        raise HTTPException(status_code=400, detail="Emoji de réaction requis.")

    # Validate against allowed emoji whitelist: 👍, ❤️, 👏, 💡, 🌸
    allowed_set = set(ALLOWED_REACTION_EMOJIS) | {'\u2764'}
    if raw_emoji not in allowed_set:
        raise HTTPException(
            status_code=400,
            detail="Invalid emoji. Allowed: 👍, ❤️, 👏, 💡, 🌸"
        )

    # Normalize red heart
    emoji = '❤️' if raw_emoji in ('❤️', '\u2764') else raw_emoji

    user = (req.user_name or "Henri").strip()

    curr_data = {}
    if comment.reactions:
        try:
            curr_data = json.loads(comment.reactions) if isinstance(comment.reactions, str) else comment.reactions
        except Exception:
            curr_data = {}

    normalized_reactions = {}
    if isinstance(curr_data, dict):
        for em, val in curr_data.items():
            if isinstance(val, list):
                normalized_reactions[em] = list(val)
            elif isinstance(val, int):
                normalized_reactions[em] = [f"User_{i+1}" for i in range(val)]
            else:
                normalized_reactions[em] = []

    user_list = normalized_reactions.get(emoji, [])
    if user in user_list:
        user_list.remove(user)
    else:
        user_list.append(user)

    if user_list:
        normalized_reactions[emoji] = user_list
    else:
        normalized_reactions.pop(emoji, None)

    comment.reactions = json.dumps(normalized_reactions)
    db.commit()
    db.refresh(comment)

    return format_comment_response(comment)

@app.get("/api/maintenance-tasks", response_model=List[MaintenanceTaskResponse])
def list_maintenance_tasks(
    property_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(MaintenanceTask)
    if property_id:
        query = query.filter(MaintenanceTask.property_id == property_id)
    if category and category != "Toutes":
        query = query.filter(MaintenanceTask.category == category)
    return query.order_by(MaintenanceTask.category.asc(), MaintenanceTask.id.asc()).all()

@app.post("/api/maintenance-tasks", response_model=MaintenanceTaskResponse, status_code=status.HTTP_201_CREATED)
def create_maintenance_task(task: MaintenanceTaskCreate, db: Session = Depends(get_db)):
    db_task = MaintenanceTask(
        property_id=task.property_id,
        title=task.title,
        category=task.category,
        frequency=task.frequency or "Chaque séjour",
        description=task.description
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@app.delete("/api/maintenance-tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_maintenance_task(task_id: int, db: Session = Depends(get_db)):
    db_task = db.query(MaintenanceTask).filter(MaintenanceTask.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Tâche non trouvée")
    db.delete(db_task)
    db.commit()
    return None

@app.get("/api/reservations/{reservation_id}/tasks", response_model=List[StayTaskAssignmentResponse])
def get_reservation_tasks(reservation_id: int, db: Session = Depends(get_db)):
    res = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not res:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    tasks = db.query(StayTaskAssignment).filter(StayTaskAssignment.reservation_id == reservation_id).all()
    if not tasks:
        # Automatically attribute tasks from templates for this property
        m_templates = db.query(MaintenanceTask).filter(MaintenanceTask.property_id == res.property_id).all()
        new_tasks = []
        for t in m_templates:
            assignment = StayTaskAssignment(
                reservation_id=res.id,
                task_id=t.id,
                title=t.title,
                category=t.category,
                frequency=t.frequency,
                description=t.description,
                completed=0
            )
            db.add(assignment)
            new_tasks.append(assignment)
        db.commit()
        for nt in new_tasks:
            db.refresh(nt)
        tasks = new_tasks
    else:
        # Ensure description is populated if missing
        updated_any = False
        for task in tasks:
            if not task.description and task.task_id:
                mt = db.query(MaintenanceTask).filter(MaintenanceTask.id == task.task_id).first()
                if mt and mt.description:
                    task.description = mt.description
                    updated_any = True
        if updated_any:
            db.commit()

    return tasks

@app.patch("/api/reservations/{reservation_id}/tasks/{assignment_id}/toggle", response_model=StayTaskAssignmentResponse)
def toggle_stay_task(reservation_id: int, assignment_id: int, db: Session = Depends(get_db)):
    task = db.query(StayTaskAssignment).filter(
        StayTaskAssignment.id == assignment_id,
        StayTaskAssignment.reservation_id == reservation_id
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Tâche de séjour non trouvée")

    task.completed = 1 if task.completed == 0 else 0
    task.completed_at = datetime.utcnow() if task.completed == 1 else None

    db.commit()
    db.refresh(task)
    return task

@app.post("/api/tasks/upload-documents", tags=["Tasks"])
async def upload_task_documents(
    files: List[UploadFile] = File(...),
    task_id: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Endpoint de téléversement pour tâches : indexe également chaque fichier dans AdminDocument
    pour unifier le système documentaire administratif de la SCI sans crasher en HTTP 500.
    """
    os.makedirs(DOCUMENTS_DIR, exist_ok=True)
    uploaded_urls = []
    created_docs = []

    now = datetime.utcnow()
    mmaaaa = now.strftime("%m%Y")

    for file in files:
        original_name = file.filename or "document.pdf"
        clean_name = os.path.basename(original_name)
        _, ext = os.path.splitext(clean_name)
        if not ext:
            ext = ".pdf"
        base_title = os.path.splitext(clean_name)[0]
        canonical_filename = f"SCI {mmaaaa} {base_title}{ext}"

        file_bytes = await file.read()
        file_size = len(file_bytes)
        mimetype = file.content_type or "application/pdf"

        # Sauvegarde locale
        filepath = os.path.join(DOCUMENTS_DIR, canonical_filename)
        try:
            with open(filepath, "wb") as buffer:
                buffer.write(file_bytes)
        except Exception as e:
            logger.warning(f"Erreur écriture fichier {filepath}: {e}")

        # Enregistrement dans AdminDocument pour indexation automatique dans l'onglet administratif
        db_doc = AdminDocument(
            title=base_title,
            category="Travaux & Chantiers",
            file_url=f"/api/documents/temp",
            file_name=canonical_filename,
            file_type=mimetype,
            file_size=file_size,
            file_data=file_bytes,
            source_type="TASK",
            source_id=task_id,
            task_id=task_id,
            uploaded_by="Henri Jamet",
            notes="Tâche"
        )
        db.add(db_doc)
        db.commit()
        db.refresh(db_doc)

        download_url = f"/api/documents/{db_doc.id}/download"
        db_doc.file_url = download_url
        db.commit()
        db.refresh(db_doc)

        uploaded_urls.append(download_url)
        created_docs.append({
            "id": db_doc.id,
            "title": db_doc.title,
            "name": db_doc.title,
            "filename": db_doc.file_name,
            "file_url": download_url,
            "url": download_url,
            "type": "PDF" if canonical_filename.lower().endswith(".pdf") else "Document",
            "size": f"{round(file_size / 1024, 1)} Ko",
            "category": db_doc.category
        })

    # Si task_id est fourni, synchroniser la tâche
    if task_id:
        target_task = db.query(Task).filter(Task.id == task_id).first()
        if target_task:
            existing_docs = []
            if target_task.documents:
                try:
                    existing_docs = json.loads(target_task.documents) if isinstance(target_task.documents, str) else target_task.documents
                except Exception:
                    existing_docs = []
            if not isinstance(existing_docs, list):
                existing_docs = []
            existing_docs.extend(created_docs)
            target_task.documents = json.dumps(existing_docs)
            db.commit()

    return {
        "document_urls": uploaded_urls,
        "documents": created_docs
    }

@app.post("/api/tasks/{assignment_id}/complete", response_model=StayTaskAssignmentResponse)
@app.post("/api/reservations/{reservation_id}/tasks/{assignment_id}/complete", response_model=StayTaskAssignmentResponse)
def submit_task_completion(assignment_id: int, payload: TaskCompletionSubmit, db: Session = Depends(get_db)):
    task = db.query(StayTaskAssignment).filter(StayTaskAssignment.id == assignment_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tâche de séjour non trouvée")

    task.completed = 1
    task.completed_at = datetime.utcnow()
    task.status = "EN_ATTENTE_VALIDATION"
    if payload.completion_notes is not None:
        task.completion_notes = payload.completion_notes
    if payload.completion_docs is not None:
        task.completion_docs = json.dumps(payload.completion_docs)

    db.commit()
    db.refresh(task)
    return task

@app.post("/api/tasks/{task_id}/validate-completion")
@app.post("/api/tasks/{assignment_id}/validate-completion-legacy")
@app.post("/api/reservations/{reservation_id}/tasks/{assignment_id}/validate-completion")
def validate_task_completion(
    task_id: Optional[int] = None,
    assignment_id: Optional[int] = None,
    reservation_id: Optional[int] = None,
    validated_by: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    target_id = task_id or assignment_id
    if not target_id:
        raise HTTPException(status_code=400, detail="ID de tâche manquant")

    validator = validated_by or "Henri"
    if normalize_prenom(validator) not in ["henri", "coordinateur"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Validation réservée au Coordinateur (Henri).")

    task = db.query(StayTaskAssignment).filter(StayTaskAssignment.id == target_id).first()
    title = ""
    notes = ""
    completion_docs_str = None

    if task:
        task.status = "ARCHIVEE"
        task.completed = 1
        if not task.completed_at:
            task.completed_at = datetime.utcnow()
        title = task.title
        notes = task.completion_notes or task.notes or f"Validation fin de tâche par {validator}"
        completion_docs_str = task.completion_docs
    else:
        issue = db.query(Issue).filter(Issue.id == target_id).first()
        if issue:
            issue.status = "ARCHIVEE"
            issue.updated_at = datetime.utcnow()
            title = issue.title
            notes = issue.completion_notes or issue.description or f"Validation fin d'issue par {validator}"
            completion_docs_str = issue.completion_docs
        else:
            proj = db.query(Project).filter(Project.id == target_id).first()
            if proj:
                proj.status = "ARCHIVEE"
                proj.updated_at = datetime.utcnow()
                title = proj.title
                notes = proj.completion_notes or proj.description or f"Validation fin de projet par {validator}"
                completion_docs_str = proj.completion_docs
            else:
                raise HTTPException(status_code=404, detail="Tâche non trouvée")

    db.commit()

    # Automatically create record in AdminDocument
    doc_urls = []
    if completion_docs_str:
        try:
            doc_urls = json.loads(completion_docs_str)
        except Exception:
            doc_urls = [d.strip() for d in completion_docs_str.split(",") if d.strip()]

    if not doc_urls:
        doc_urls = [f"/uploads/documents/task_{target_id}_validation.pdf"]

    created_docs = []
    for doc_url in doc_urls:
        fname = os.path.basename(doc_url)
        ftype = os.path.splitext(fname)[1].lstrip(".").upper() or "PDF"
        admin_doc = AdminDocument(
            title=f"Document Fin de Tâche - {title}",
            category="Documents de Fin de Tâche / Réparation",
            file_url=doc_url,
            file_name=fname,
            file_type=ftype,
            file_size=0,
            source_type="TASK",
            source_id=target_id,
            uploaded_by=validator,
            notes=notes,
            created_at=datetime.utcnow()
        )
        db.add(admin_doc)
        created_docs.append(admin_doc)

    db.commit()
    for d in created_docs:
        db.refresh(d)

    return {
        "message": f"Tâche '{title}' validée et archivée avec succès.",
        "task_id": target_id,
        "status": "ARCHIVEE",
        "admin_document": created_docs[0] if created_docs else None
    }

# --- Document Categories (Annotation 5) ---
DEFAULT_DOCUMENT_CATEGORIES = [
    {"name": "Actes & Statuts", "emoji": "🏛️", "color": "slate"},
    {"name": "Banque & Finances", "emoji": "💶", "color": "emerald"},
    {"name": "Travaux & Factures", "emoji": "🔧", "color": "amber"},
    {"name": "Fiscalité & Impôts", "emoji": "⚖️", "color": "purple"},
    {"name": "Assurances & Police", "emoji": "🛡️", "color": "sky"},
    {"name": "Procès-Verbaux AG", "emoji": "📜", "color": "rose"},
]

@app.get("/api/documents/categories", response_model=List[DocumentCategoryResponse], tags=["Documents"])
def get_document_categories(db: Session = Depends(get_db)):
    """Retourne la liste des catégories de documents triées par nom, avec auto-seed si vide."""
    cats = db.query(DocumentCategory).order_by(DocumentCategory.name.asc()).all()
    if not cats:
        for item in DEFAULT_DOCUMENT_CATEGORIES:
            new_cat = DocumentCategory(name=item["name"], emoji=item["emoji"], color=item["color"])
            db.add(new_cat)
        db.commit()
        cats = db.query(DocumentCategory).order_by(DocumentCategory.name.asc()).all()
    return cats

@app.post("/api/documents/categories", response_model=DocumentCategoryResponse, status_code=status.HTTP_201_CREATED, tags=["Documents"])
def create_document_category(payload: DocumentCategoryCreate, db: Session = Depends(get_db)):
    """Crée une nouvelle catégorie de document personnalisée."""
    clean_name = payload.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Le nom de la catégorie ne peut être vide.")
    
    existing = db.query(DocumentCategory).filter(DocumentCategory.name.ilike(clean_name)).first()
    if existing:
        return existing
    
    new_cat = DocumentCategory(
        name=clean_name,
        emoji=payload.emoji.strip() if payload.emoji else "📁",
        color=payload.color.strip() if payload.color else "slate"
    )
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)
    return new_cat

@app.put("/api/documents/categories/{category_id}", response_model=DocumentCategoryResponse, tags=["Documents"])
def update_document_category(category_id: int, payload: DocumentCategoryUpdate, db: Session = Depends(get_db)):
    """Met à jour une catégorie de document existante (nom, emoji, couleur) et propage le renommage dans les documents."""
    cat = db.query(DocumentCategory).filter(DocumentCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée.")
    
    old_name = cat.name
    if payload.name is not None:
        clean_name = payload.name.strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="Le nom de la catégorie ne peut être vide.")
        
        # Vérifier unicité du nom si modifié
        if clean_name.lower() != old_name.lower():
            existing = db.query(DocumentCategory).filter(
                DocumentCategory.name.ilike(clean_name),
                DocumentCategory.id != category_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Une catégorie avec ce nom existe déjà.")
        
        cat.name = clean_name
        # Propager la mise à jour aux documents associés
        try:
            db.query(AdminDocument).filter(AdminDocument.category == old_name).update(
                {AdminDocument.category: clean_name},
                synchronize_session=False
            )
        except Exception as e:
            logger.warning(f"Erreur propagation renommage catégorie documents: {e}")

    if payload.emoji is not None:
        cat.emoji = payload.emoji.strip() if payload.emoji else "📁"
    
    if payload.color is not None:
        cat.color = payload.color.strip() if payload.color else "slate"
        
    db.commit()
    db.refresh(cat)
    return cat

@app.delete("/api/documents/categories/{category_id}", tags=["Documents"])
def delete_document_category(category_id: int, db: Session = Depends(get_db)):
    """Supprime une catégorie de document de manière sécurisée et réassigne les documents liés vers 'Autre'."""
    cat = db.query(DocumentCategory).filter(DocumentCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée.")
    
    cat_name = cat.name
    try:
        db.query(AdminDocument).filter(AdminDocument.category == cat_name).update(
            {AdminDocument.category: "Autre"},
            synchronize_session=False
        )
    except Exception as e:
        logger.warning(f"Erreur réassignation catégorie documents: {e}")

    db.delete(cat)
    db.commit()
    return {"message": f"Catégorie '{cat_name}' supprimée avec succès.", "id": category_id}


# --- Real Documents Endpoints avec Intégration Google Drive Complète (Strict Jail) ---

@app.get("/api/admin-documents", tags=["Documents"])
@app.get("/api/documents", tags=["Documents"])
def list_documents(
    category: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Retourne la liste des documents avec résilience absolue Zero-Crash :
    - Tente la récupération et synchronisation depuis Google Drive (confinement Strict Jail).
    - En cas d'indisponibilité ou absence de credentials Drive, repli gracieux sans 500.
    - Interroge la table AdminDocument avec auto-migration en cas de colonne ou table manquante.
    - Format JSON garanti compatible frontend AdminInfoPage.jsx : [{ id, title, name, category, created_at, size, mime_type, drive_file_id, ... }].
    """
    # 1. Récupération Google Drive avec repli gracieux
    drive_docs = []
    try:
        drive_docs = drive_jail_service.list_files()
    except Exception as drive_err:
        logger.warning(f"Google Drive non disponible, repli sur base locale : {drive_err}")
        drive_docs = []

    # 2. Interrogation sécurisée de la base de données avec rattrapage automatique
    db_docs = []
    try:
        query = db.query(AdminDocument)
        if category and category not in ("Toutes", "all"):
            query = query.filter(AdminDocument.category == category)
        if source_type:
            query = query.filter(AdminDocument.source_type == source_type)
        db_docs = query.order_by(AdminDocument.created_at.desc()).all()
    except Exception as db_err:
        logger.warning(f"Erreur requête AdminDocument en base ({db_err}), tentative de rattrapage / auto-migration...")
        try:
            db.rollback()
        except Exception:
            pass

        # Tentative d'auto-création de la table et de la colonne manquante
        try:
            from sqlalchemy import text
            with engine.connect() as conn:
                AdminDocument.__table__.create(bind=engine, checkfirst=True)
                if engine.dialect.name == "sqlite":
                    inspector_query = text("PRAGMA table_info(admin_documents)")
                    result = conn.execute(inspector_query).fetchall()
                    column_names = [row[1] for row in result]
                    if column_names:
                        if "drive_file_id" not in column_names:
                            conn.execute(text("ALTER TABLE admin_documents ADD COLUMN drive_file_id VARCHAR(255)"))
                        if "file_data" not in column_names:
                            conn.execute(text("ALTER TABLE admin_documents ADD COLUMN file_data BLOB"))
                        conn.commit()
                else:
                    conn.execute(text("ALTER TABLE admin_documents ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(255);"))
                    conn.execute(text("ALTER TABLE admin_documents ADD COLUMN IF NOT EXISTS file_data BYTEA;"))
                    conn.commit()

            # Seconde tentative de requête
            query = db.query(AdminDocument)
            if category and category not in ("Toutes", "all"):
                query = query.filter(AdminDocument.category == category)
            if source_type:
                query = query.filter(AdminDocument.source_type == source_type)
            db_docs = query.order_by(AdminDocument.created_at.desc()).all()
        except Exception as retry_err:
            logger.warning(f"Repli gracieux : base de données indisponible ({retry_err}), bascule en mémoire.")
            try:
                db.rollback()
            except Exception:
                pass
            db_docs = []

    # 3. Synchronisation & Fusion intelligente Drive <-> DB
    existing_drive_ids = {doc.drive_file_id for doc in db_docs if getattr(doc, "drive_file_id", None)}
    existing_names = {doc.file_name for doc in db_docs if getattr(doc, "file_name", None)}
    existing_titles = {doc.title for doc in db_docs if getattr(doc, "title", None)}

    for df in drive_docs:
        df_id = df.get("id")
        if not df_id:
            continue
        df_name = df.get("name") or f"document_{df_id}.pdf"
        df_size = int(df.get("size")) if df.get("size") else 0
        df_mime = df.get("mimeType") or "application/pdf"
        df_created = df.get("createdTime")

        if df_id in existing_drive_ids:
            continue

        # Si le fichier existe en base sous le même nom, on associe le drive_file_id
        matched_doc = None
        for doc in db_docs:
            if not getattr(doc, "drive_file_id", None) and (doc.file_name == df_name or doc.title == os.path.splitext(df_name)[0]):
                matched_doc = doc
                break

        if matched_doc:
            matched_doc.drive_file_id = df_id
            existing_drive_ids.add(df_id)
            try:
                db.commit()
            except Exception:
                try:
                    db.rollback()
                except Exception:
                    pass
            continue

        # Déduire la catégorie canonique depuis le nom du fichier
        lower_name = df_name.lower()
        cat = "Actes & Statuts"
        if any(k in lower_name for k in ["facture", "devis", "travaux", "artisan", "edf", "eau", "gaz", "toiture", "maconnerie"]):
            cat = "Travaux & Factures"
        elif any(k in lower_name for k in ["releve", "banque", "rib", "virement", "compte", "emprunt", "credit", "swan"]):
            cat = "Banque & Finances"
        elif any(k in lower_name for k in ["impot", "taxe", "foncier", "cfe", "declaration", "cerfa"]):
            cat = "Fiscalité & Impôts"

        # Filtrage par catégorie demandée
        if category and category not in ("Toutes", "all") and cat != category:
            continue

        clean_title = os.path.splitext(df_name)[0] if "." in df_name else df_name
        created_dt = datetime.utcnow()
        if df_created:
            try:
                created_dt = datetime.fromisoformat(df_created.replace("Z", "+00:00"))
            except Exception:
                pass

        new_doc = AdminDocument(
            title=clean_title,
            category=cat,
            file_url=f"/api/documents/drive/{df_id}",
            file_name=df_name,
            file_type=df_mime,
            file_size=df_size,
            drive_file_id=df_id,
            source_type="DRIVE_SYNC",
            source_id=None,
            uploaded_by="Google Drive",
            notes="Synchronisé depuis Google Drive",
            created_at=created_dt
        )

        try:
            db.add(new_doc)
            db.commit()
            db.refresh(new_doc)
            new_doc.file_url = f"/api/documents/{new_doc.id}/download"
            db.commit()
            db_docs.append(new_doc)
            existing_drive_ids.add(df_id)
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
            # Conservé en mémoire si écriture impossible
            db_docs.append(new_doc)
            existing_drive_ids.add(df_id)

    # 4. Formatage de la réponse strictement conforme au frontend
    results = []
    for doc in db_docs:
        doc_id = getattr(doc, "id", None)
        drive_id = getattr(doc, "drive_file_id", None)
        effective_id = doc_id or drive_id or "doc"

        # Route sécurisée de téléchargement Drive ou locale
        if doc_id:
            download_url = f"/api/documents/{doc_id}/download"
        elif drive_id:
            download_url = f"/api/documents/{drive_id}/download"
        else:
            download_url = getattr(doc, "file_url", "") or ""

        file_size = getattr(doc, "file_size", 0) or 0
        created_at = getattr(doc, "created_at", None) or datetime.utcnow()
        if hasattr(created_at, "strftime"):
            upload_date_str = created_at.strftime("%d/%m/%Y")
        else:
            upload_date_str = ""

        created_at_iso = created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at)
        doc_title = getattr(doc, "title", "Document") or "Document"
        doc_filename = getattr(doc, "file_name", None) or (os.path.basename(doc.file_url) if getattr(doc, "file_url", None) else doc_title)
        doc_cat = getattr(doc, "category", "Actes & Statuts") or "Actes & Statuts"
        doc_type = getattr(doc, "file_type", None)
        if not doc_type or doc_type in ("application/pdf", "application/octet-stream"):
            guessed_type, _ = mimetypes.guess_type(doc_filename)
            doc_type = guessed_type or doc_type or "application/pdf"

        results.append({
            "id": effective_id,
            "title": doc_title,
            "name": doc_title,
            "category": doc_cat,
            "file_url": download_url,
            "url": download_url,
            "file_name": doc_filename,
            "filename": doc_filename,
            "file_type": doc_type,
            "type": doc_type,
            "mime_type": doc_type,
            "file_size": file_size,
            "size": f"{round(file_size / 1024, 1)} Ko" if file_size else "—",
            "drive_file_id": drive_id,
            "source_type": getattr(doc, "source_type", "MANUAL") or "MANUAL",
            "source_id": getattr(doc, "source_id", None),
            "uploaded_by": getattr(doc, "uploaded_by", "Henri Jamet") or "Henri Jamet",
            "notes": getattr(doc, "notes", None),
            "created_at": created_at_iso,
            "upload_date": upload_date_str,
            "source": doc_cat
        })

    return results

@app.post("/api/documents/upload", status_code=status.HTTP_201_CREATED, tags=["Documents"])
async def upload_document_canonical(
    file: UploadFile = File(...),
    organisme: str = Form(...),
    title: str = Form(...),
    category: str = Form(...),
    task_id: Optional[int] = Form(None),
    project_id: Optional[int] = Form(None),
    uploaded_by: Optional[str] = Form("Henri Jamet"),
    db: Session = Depends(get_db)
):
    """
    Téléversement d'un document selon la convention de nommage canonique officielle :
    [ORGANISME] [MMAAAA actuel] [Titre du document].[ext]
    Téléversement DIRECT dans Google Drive (dossier Hellenvilliers SCI 14RcQbUF7WQb5kmVlfhdHmieV1OA0Pk-J).
    Support de l'association universelle à une tâche via task_id et à un scrutin/projet via project_id.
    """
    clean_org = organisme.strip()
    clean_title = title.strip()
    if not clean_org:
        clean_org = "SCI"
    if not clean_title:
        clean_title = "Document"

    # Date MMAAAA d'aujourd'hui (Mois 2 chiffres, Année 4 chiffres)
    now = datetime.utcnow()
    mmaaaa = now.strftime("%m%Y")

    # Extension du fichier
    original_name = file.filename or "document.pdf"
    _, ext = os.path.splitext(original_name)
    if not ext:
        ext = ".pdf"

    # Format canonique strict : séparateurs = espaces simples, aucun tiret ni underscore
    canonical_filename = f"{clean_org} {mmaaaa} {clean_title}{ext}"

    # Lecture du contenu binaire
    file_bytes = await file.read()
    file_size = len(file_bytes)
    guessed_mime, _ = mimetypes.guess_type(canonical_filename)
    mimetype = (file.content_type if (file.content_type and file.content_type != "application/octet-stream") else None) or guessed_mime or "application/pdf"

    # Déduplication Intelligente par Empreinte SHA-256 (Annotation 4)
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    existing_doc = db.query(AdminDocument).filter(AdminDocument.file_hash == file_hash).first()
    if not existing_doc:
        # Recherche défensive si documents antérieurs sans file_hash
        existing_doc = db.query(AdminDocument).filter(AdminDocument.file_data == file_bytes).first()
        if existing_doc and not existing_doc.file_hash:
            existing_doc.file_hash = file_hash
            db.commit()

    is_reused = False
    drive_file_id = None

    if existing_doc:
        # Document physique existant détecté : réutilisation immédiate sans ré-upload physique
        is_reused = True
        drive_file_id = existing_doc.drive_file_id
        canonical_filename = existing_doc.file_name or canonical_filename
        mimetype = existing_doc.file_type or mimetype
        file_size = existing_doc.file_size or file_size
        logger.info(f"[DEDUPLICATION SHA-256] Document existant réutilisé (hash={file_hash[:12]}..., id_source={existing_doc.id})")
    else:
        # 1. Téléversement DIRECT dans Google Drive avec Strict Drive Jail (si configuré)
        try:
            if drive_jail_service.is_configured():
                drive_file = drive_jail_service.upload_file(
                    filename=canonical_filename,
                    content=file_bytes,
                    mimetype=mimetype,
                    description=f"SCI Hellenvilliers - {category} - Déposé par {uploaded_by}"
                )
                drive_file_id = drive_file.get("id") if drive_file else None
            else:
                logger.warning("Google Drive non configuré sur cet environnement, persistance documentaire locale/base assurée")
        except Exception as drive_err:
            logger.warning(
                f"Google Drive non configuré sur cet environnement, persistance documentaire locale/base assurée ({drive_err})"
            )
            drive_file_id = None

        # 2. Sauvegarde de secours / cache local
        dest_path = os.path.join(DOCUMENTS_DIR, canonical_filename)
        try:
            with open(dest_path, "wb") as f:
                f.write(file_bytes)
        except Exception as e:
            logger.warning(f"Erreur écriture cache local {canonical_filename}: {e}")

    # 3. Enregistrement en base de données du nouveau référencement
    effective_source_type = "PROJECT" if project_id else ("TASK" if task_id else "MANUAL")
    effective_source_id = project_id if project_id else task_id

    db_doc = AdminDocument(
        title=clean_title,
        category=category,
        file_url=f"/api/documents/drive/{drive_file_id}" if drive_file_id else "/api/documents/temp",
        file_name=canonical_filename,
        file_type=mimetype,
        file_size=file_size,
        file_data=existing_doc.file_data if (is_reused and existing_doc.file_data) else file_bytes,
        file_hash=file_hash,
        drive_file_id=drive_file_id,
        source_type=effective_source_type,
        source_id=effective_source_id,
        task_id=task_id,
        uploaded_by=uploaded_by or "Henri Jamet",
        notes=clean_org
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    # Définition de l'URL pérenne de téléchargement
    download_url = f"/api/documents/{db_doc.id}/download"
    db_doc.file_url = download_url
    db.commit()
    db.refresh(db_doc)

    # Si rattaché à une tâche, synchroniser le champ JSON task.documents
    if task_id:
        try:
            target_task = db.query(Task).filter(Task.id == task_id).first()
            if target_task:
                existing_docs = []
                if target_task.documents:
                    try:
                        existing_docs = json.loads(target_task.documents) if isinstance(target_task.documents, str) else target_task.documents
                    except Exception:
                        existing_docs = []
                if not isinstance(existing_docs, list):
                    existing_docs = []

                doc_entry = {
                    "id": db_doc.id,
                    "name": db_doc.title,
                    "title": db_doc.title,
                    "filename": db_doc.file_name,
                    "file_url": download_url,
                    "url": download_url,
                    "type": "PDF" if (db_doc.file_name or "").lower().endswith(".pdf") else "Image" if (db_doc.file_type or "").startswith("image/") else "Document",
                    "file_type": db_doc.file_type,
                    "size": f"{round(file_size / 1024, 1)} Ko",
                    "category": category,
                    "uploaded_by": db_doc.uploaded_by,
                    "created_at": db_doc.created_at.isoformat() if hasattr(db_doc.created_at, "isoformat") else str(db_doc.created_at)
                }

                if not any(d.get("id") == db_doc.id or d.get("url") == download_url for d in existing_docs if isinstance(d, dict)):
                    existing_docs.append(doc_entry)
                    target_task.documents = json.dumps(existing_docs)
                    db.commit()
        except Exception as sync_err:
            logger.warning(f"Notice: Erreur synchronisation task.documents: {sync_err}")

    # Si rattaché à un projet / scrutin, synchroniser le champ JSON project.document_urls
    if project_id:
        try:
            target_proj = db.query(Project).filter(Project.id == project_id).first()
            if target_proj:
                existing_proj_docs = []
                if target_proj.document_urls:
                    try:
                        existing_proj_docs = json.loads(target_proj.document_urls) if isinstance(target_proj.document_urls, str) else target_proj.document_urls
                    except Exception:
                        existing_proj_docs = []
                if not isinstance(existing_proj_docs, list):
                    existing_proj_docs = []

                proj_doc_entry = {
                    "id": db_doc.id,
                    "name": db_doc.title,
                    "title": db_doc.title,
                    "filename": db_doc.file_name,
                    "file_url": download_url,
                    "url": download_url,
                    "type": "PDF" if (db_doc.file_name or "").lower().endswith(".pdf") else "Image" if (db_doc.file_type or "").startswith("image/") else "Document",
                    "file_type": db_doc.file_type,
                    "size": f"{round(file_size / 1024, 1)} Ko",
                    "category": category,
                    "uploaded_by": db_doc.uploaded_by,
                    "created_at": db_doc.created_at.isoformat() if hasattr(db_doc.created_at, "isoformat") else str(db_doc.created_at)
                }

                if not any(d.get("id") == db_doc.id or d.get("url") == download_url for d in existing_proj_docs if isinstance(d, dict)):
                    existing_proj_docs.append(proj_doc_entry)
                    target_proj.document_urls = json.dumps(existing_proj_docs)
                    db.commit()
        except Exception as sync_proj_err:
            logger.warning(f"Notice: Erreur synchronisation project.document_urls: {sync_proj_err}")

    return {
        "id": db_doc.id,
        "title": db_doc.title,
        "category": db_doc.category,
        "file_url": download_url,
        "file_name": db_doc.file_name,
        "file_type": db_doc.file_type,
        "file_size": db_doc.file_size,
        "file_hash": db_doc.file_hash,
        "reused": is_reused,
        "drive_file_id": db_doc.drive_file_id,
        "source_type": db_doc.source_type,
        "source_id": db_doc.source_id,
        "task_id": db_doc.task_id,
        "uploaded_by": db_doc.uploaded_by,
        "notes": db_doc.notes,
        "created_at": db_doc.created_at,
        "name": db_doc.title,
        "filename": db_doc.file_name,
        "url": download_url,
        "type": db_doc.file_type,
        "mime_type": db_doc.file_type,
        "size": f"{round(file_size / 1024, 1)} Ko",
        "upload_date": db_doc.created_at.strftime("%d/%m/%Y")
    }

@app.get("/api/tasks/{task_id}/documents", tags=["Tasks"])
def get_task_documents(task_id: str, db: Session = Depends(get_db)):
    """
    Récupère l'ensemble des documents rattachés à une tâche, tant depuis les documents administratifs certifiés
    que depuis le champ documents de la tâche (Annotation 10 & 11).
    """
    task = resolve_task_by_id_or_ref(task_id, db)
    
    admin_docs = db.query(AdminDocument).filter(
        or_(
            AdminDocument.task_id == task.id,
            and_(AdminDocument.source_type == "TASK", AdminDocument.source_id == task.id)
        )
    ).order_by(AdminDocument.created_at.desc()).all()
    
    task_docs = []
    if task.documents:
        try:
            task_docs = json.loads(task.documents) if isinstance(task.documents, str) else task.documents
        except Exception:
            task_docs = []
    if not isinstance(task_docs, list):
        task_docs = []
        
    formatted_docs = []
    seen_ids = set()
    seen_urls = set()

    for ad in admin_docs:
        doc_url = ad.file_url or f"/api/documents/{ad.id}/download"
        seen_ids.add(ad.id)
        seen_urls.add(doc_url)
        formatted_docs.append({
            "id": ad.id,
            "title": ad.title,
            "name": ad.title,
            "filename": ad.file_name or ad.title,
            "file_url": doc_url,
            "url": doc_url,
            "type": "PDF" if (ad.file_name or "").lower().endswith(".pdf") else "Image" if (ad.file_type or "").startswith("image/") else "Document",
            "file_type": ad.file_type,
            "size": f"{round((ad.file_size or 0) / 1024, 1)} Ko" if ad.file_size else "",
            "category": ad.category,
            "uploaded_by": ad.uploaded_by,
            "created_at": ad.created_at.isoformat() if hasattr(ad.created_at, "isoformat") else str(ad.created_at)
        })

    for td in task_docs:
        if isinstance(td, dict):
            td_id = td.get("id")
            td_url = td.get("file_url") or td.get("url")
            if td_id and td_id in seen_ids:
                continue
            if td_url and td_url in seen_urls:
                continue
            formatted_docs.append(td)
        elif isinstance(td, str):
            if td not in seen_urls:
                formatted_docs.append({
                    "id": td,
                    "name": td.split("/")[-1],
                    "filename": td.split("/")[-1],
                    "url": td,
                    "file_url": td,
                    "type": "PDF" if td.lower().endswith(".pdf") else "Document"
                })

    return formatted_docs

@app.post("/api/tasks/{task_id}/documents/attach", tags=["Tasks"])
def attach_documents_to_task(
    task_id: str,
    payload: DocumentAttachRequest,
    db: Session = Depends(get_db)
):
    """
    Associe un ou plusieurs documents administratifs existants à une tâche (Annotation 6).
    """
    task = resolve_task_by_id_or_ref(task_id, db)
    existing_docs = []
    if task.documents:
        try:
            existing_docs = json.loads(task.documents) if isinstance(task.documents, str) else task.documents
        except Exception:
            existing_docs = []
    if not isinstance(existing_docs, list):
        existing_docs = []

    attached = []
    for doc_id in payload.document_ids:
        doc = db.query(AdminDocument).filter(AdminDocument.id == doc_id).first()
        if not doc:
            continue
        download_url = doc.file_url or f"/api/documents/{doc.id}/download"
        doc_entry = {
            "id": doc.id,
            "name": doc.title,
            "title": doc.title,
            "filename": doc.file_name or doc.title,
            "file_url": download_url,
            "url": download_url,
            "type": "PDF" if (doc.file_name or "").lower().endswith(".pdf") else "Image" if (doc.file_type or "").startswith("image/") else "Document",
            "file_type": doc.file_type,
            "size": f"{round((doc.file_size or 0) / 1024, 1)} Ko" if doc.file_size else "",
            "category": doc.category,
            "uploaded_by": doc.uploaded_by,
            "created_at": doc.created_at.isoformat() if hasattr(doc.created_at, "isoformat") else str(doc.created_at)
        }
        if not any(d.get("id") == doc.id or d.get("url") == download_url for d in existing_docs if isinstance(d, dict)):
            existing_docs.append(doc_entry)
            attached.append(doc_entry)

    task.documents = json.dumps(existing_docs)
    db.commit()
    db.refresh(task)
    return {
        "success": True,
        "task_id": task.id,
        "attached_count": len(attached),
        "documents": existing_docs
    }

@app.post("/api/projects/{project_id}/documents/attach", tags=["Projects"])
def attach_documents_to_project(
    project_id: int,
    payload: DocumentAttachRequest,
    db: Session = Depends(get_db)
):
    """
    Associe un ou plusieurs documents administratifs existants à un projet / scrutin (Annotation 6).
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")
    existing_docs = []
    if project.document_urls:
        try:
            existing_docs = json.loads(project.document_urls) if isinstance(project.document_urls, str) else project.document_urls
        except Exception:
            existing_docs = []
    if not isinstance(existing_docs, list):
        existing_docs = []

    attached = []
    for doc_id in payload.document_ids:
        doc = db.query(AdminDocument).filter(AdminDocument.id == doc_id).first()
        if not doc:
            continue
        download_url = doc.file_url or f"/api/documents/{doc.id}/download"
        doc_entry = {
            "id": doc.id,
            "name": doc.title,
            "title": doc.title,
            "filename": doc.file_name or doc.title,
            "file_url": download_url,
            "url": download_url,
            "type": "PDF" if (doc.file_name or "").lower().endswith(".pdf") else "Image" if (doc.file_type or "").startswith("image/") else "Document",
            "file_type": doc.file_type,
            "size": f"{round((doc.file_size or 0) / 1024, 1)} Ko" if doc.file_size else "",
            "category": doc.category,
            "uploaded_by": doc.uploaded_by,
            "created_at": doc.created_at.isoformat() if hasattr(doc.created_at, "isoformat") else str(doc.created_at)
        }
        if not any(d.get("id") == doc.id or d.get("url") == download_url for d in existing_docs if isinstance(d, dict)):
            existing_docs.append(doc_entry)
            attached.append(doc_entry)

    project.document_urls = json.dumps(existing_docs)

    # Invalidation étendue : réinitialisation des votes si nouveaux documents rattachés et votes existants (Annotation 6)
    if len(attached) > 0:
        votes_count = db.query(ProjectVote).filter(ProjectVote.project_id == project_id).count()
        if votes_count > 0:
            db.query(ProjectVote).filter(ProjectVote.project_id == project_id).delete()
            if hasattr(project, 'votes') and isinstance(project.votes, list):
                project.votes.clear()
            db.expire(project, ['votes'])
            if project.status == "REPORT_AG":
                project.status = "EN_VOTE"

            notif_msg = f"Le scrutin « {project.title} » a été modifié. Les votes précédents ont été réinitialisés. Merci d'exprimer à nouveau votre voix."
            sys_comment = ProjectComment(
                project_id=project_id,
                author_name="Système",
                content=notif_msg
            )
            db.add(sys_comment)

    db.commit()
    db.refresh(project)
    return {
        "success": True,
        "project_id": project.id,
        "attached_count": len(attached),
        "documents": existing_docs
    }

@app.get("/api/documents/{doc_id}/download", tags=["Documents"])
@app.get("/api/admin-documents/{doc_id}/download", tags=["Documents"])
def download_document(doc_id: str, db: Session = Depends(get_db)):
    """
    Télécharge un document en extrayant directement le binaire depuis Google Drive via drive_service.py.
    Applique le confinement strict (Strict Drive Jail) : HTTP 403 immédiat si hors du dossier Hellenvilliers SCI.
    Secours transparent : Si Google Drive est indisponible ou non configuré, sert le binaire depuis la base de données ou le cache local.
    """
    doc = None
    if doc_id.isdigit():
        doc = db.query(AdminDocument).filter(AdminDocument.id == int(doc_id)).first()
    if not doc:
        doc = db.query(AdminDocument).filter(
            or_(AdminDocument.drive_file_id == doc_id, AdminDocument.file_name == doc_id)
        ).first()

    target_drive_id = doc.drive_file_id if (doc and doc.drive_file_id) else (doc_id if not doc_id.isdigit() else None)

    # 1. Extraction binaire prioritaire depuis Google Drive (avec vérification Strict Jail 403)
    if target_drive_id:
        try:
            content, metadata = drive_jail_service.download_file(target_drive_id)
            filename = (doc.file_name if doc else None) or metadata.get("name") or f"document_{doc_id}.pdf"
            guessed_type, _ = mimetypes.guess_type(filename)
            drive_mime = metadata.get("mimeType")
            mimetype = guessed_type or (drive_mime if drive_mime and drive_mime != "application/octet-stream" else None) or (doc.file_type if doc and doc.file_type != "application/octet-stream" else None) or "application/octet-stream"
            return Response(
                content=content,
                media_type=mimetype,
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
        except Exception as e:
            logger.warning(f"Téléchargement Google Drive échoué pour {target_drive_id} ({e}), tentative depuis la base ou le cache local")

    # 2. Secours base de données si contenu binaire présent
    if doc and getattr(doc, "file_data", None):
        filename = doc.file_name or f"document_{doc_id}.pdf"
        guessed_type, _ = mimetypes.guess_type(filename)
        mimetype = guessed_type or (doc.file_type if doc.file_type != "application/octet-stream" else None) or "application/octet-stream"
        return Response(
            content=doc.file_data,
            media_type=mimetype,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    # 3. Secours cache local si fichier présent sans drive_id
    if doc and doc.file_name:
        fpath = os.path.join(DOCUMENTS_DIR, doc.file_name)
        if os.path.exists(fpath):
            guessed_type, _ = mimetypes.guess_type(fpath)
            media_type = guessed_type or (doc.file_type if doc.file_type != "application/octet-stream" else None) or "application/octet-stream"
            return FileResponse(
                path=fpath,
                filename=doc.file_name,
                media_type=media_type
            )

    raise HTTPException(status_code=404, detail="Document non trouvé ou indisponible.")

@app.put("/api/documents/{doc_id}", tags=["Documents"])
@app.patch("/api/documents/{doc_id}", tags=["Documents"])
@app.put("/api/admin-documents/{doc_id}", tags=["Documents"])
@app.patch("/api/admin-documents/{doc_id}", tags=["Documents"])
def rename_document(
    doc_id: str,
    payload: AdminDocumentUpdate,
    db: Session = Depends(get_db)
):
    """
    Renomme un document sur Google Drive via drive_service.py ET dans la base de données.
    Applique le confinement strict (Strict Drive Jail) : HTTP 403 immédiat si hors du dossier Hellenvilliers SCI.
    """
    doc = None
    if doc_id.isdigit():
        doc = db.query(AdminDocument).filter(AdminDocument.id == int(doc_id)).first()
    if not doc:
        doc = db.query(AdminDocument).filter(
            or_(AdminDocument.drive_file_id == doc_id, AdminDocument.file_name == doc_id)
        ).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Document non trouvé.")

    new_title = (payload.title or payload.name or "").strip()
    if not new_title:
        raise HTTPException(status_code=400, detail="Le nouveau titre ne peut être vide.")

    # Conserver ou ajuster l'extension de fichier
    old_ext = os.path.splitext(doc.file_name or "")[1] or ".pdf"
    if not new_title.lower().endswith(old_ext.lower()):
        new_filename = f"{new_title}{old_ext}"
    else:
        new_filename = new_title
        new_title = os.path.splitext(new_title)[0]

    # 1. Renommage sur Google Drive si drive_file_id présent
    if doc.drive_file_id:
        drive_res = drive_jail_service.rename_file(doc.drive_file_id, new_filename)
        logger.info(f"Document renommé sur Google Drive: {drive_res.get('name')}")

    # 2. Renommage fichier local dans DOCUMENTS_DIR si existant
    if doc.file_name:
        old_fpath = os.path.join(DOCUMENTS_DIR, doc.file_name)
        new_fpath = os.path.join(DOCUMENTS_DIR, new_filename)
        if os.path.exists(old_fpath) and old_fpath != new_fpath:
            try:
                os.rename(old_fpath, new_fpath)
            except Exception as e:
                logger.warning(f"Erreur renommage fichier local: {e}")

    # 3. Mise à jour en base de données
    doc.title = new_title
    doc.file_name = new_filename
    if payload.category:
        doc.category = payload.category
    if payload.notes:
        doc.notes = payload.notes

    db.commit()
    db.refresh(doc)

    download_url = f"/api/documents/{doc.id}/download"
    return {
        "id": doc.id,
        "title": doc.title,
        "name": doc.title,
        "category": doc.category,
        "file_url": download_url,
        "url": download_url,
        "file_name": doc.file_name,
        "filename": doc.file_name,
        "file_type": doc.file_type,
        "mime_type": doc.file_type,
        "file_size": doc.file_size,
        "size": f"{round((doc.file_size or 0) / 1024, 1)} Ko" if doc.file_size else "—",
        "drive_file_id": doc.drive_file_id,
        "uploaded_by": doc.uploaded_by,
        "notes": doc.notes,
        "created_at": doc.created_at,
        "upload_date": doc.created_at.strftime("%d/%m/%Y") if doc.created_at else "",
        "message": "Document renommé avec succès sur Google Drive et en base de données."
    }

@app.post("/api/admin-documents", response_model=AdminDocumentResponse, status_code=status.HTTP_201_CREATED, tags=["Documents"])
@app.post("/api/documents", response_model=AdminDocumentResponse, status_code=status.HTTP_201_CREATED, tags=["Documents"])
def create_admin_document(doc: AdminDocumentCreate, db: Session = Depends(get_db)):
    db_doc = AdminDocument(
        title=doc.title,
        category=doc.category or "Actes & Statuts",
        file_url=doc.file_url,
        file_name=doc.file_name or os.path.basename(doc.file_url),
        file_type=doc.file_type or "application/pdf",
        file_size=doc.file_size or 0,
        drive_file_id=doc.drive_file_id,
        source_type=doc.source_type or "MANUAL",
        source_id=doc.source_id,
        uploaded_by=doc.uploaded_by or "Henri Jamet",
        notes=doc.notes
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc

@app.delete("/api/admin-documents/{doc_id}", tags=["Documents"])
@app.delete("/api/documents/{doc_id}", tags=["Documents"])
def delete_admin_document(doc_id: str, db: Session = Depends(get_db)):
    """
    Supprime un document sur Google Drive (avec vérification stricte du parent ALLOWED_FOLDER_ID)
    ET dans la table de base de données.
    """
    doc = None
    if doc_id.isdigit():
        doc = db.query(AdminDocument).filter(AdminDocument.id == int(doc_id)).first()
    if not doc:
        doc = db.query(AdminDocument).filter(
            or_(AdminDocument.drive_file_id == doc_id, AdminDocument.file_name == doc_id)
        ).first()

    if doc:
        # 1. Suppression sur Google Drive avec Strict Jail
        if doc.drive_file_id:
            try:
                drive_jail_service.delete_file(doc.drive_file_id)
            except Exception as e:
                logger.warning(f"Erreur/Notice suppression Drive {doc.drive_file_id}: {e}")
                if isinstance(e, SecurityException):
                    raise e

        # 2. Suppression locale si présent
        if doc.file_name:
            fpath = os.path.join(DOCUMENTS_DIR, doc.file_name)
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except Exception:
                    pass
        elif doc.file_url and doc.file_url.startswith("/uploads/documents/"):
            fname = os.path.basename(doc.file_url)
            fpath = os.path.join(DOCUMENTS_DIR, fname)
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except Exception:
                    pass

        # 3. Suppression en base
        db.delete(doc)
        db.commit()
        return {"message": f"Document {doc_id} supprimé avec succès de Google Drive et de la base."}

    # Si doc non trouvé en base mais doc_id est un identifiant de fichier Drive direct
    if not doc_id.isdigit():
        try:
            drive_jail_service.delete_file(doc_id)
            return {"message": f"Fichier {doc_id} supprimé avec succès de Google Drive."}
        except Exception as e:
            if isinstance(e, SecurityException):
                raise e

    fpath = os.path.join(DOCUMENTS_DIR, doc_id)
    if os.path.exists(fpath):
        try:
            os.remove(fpath)
        except Exception:
            pass
        return {"message": f"Fichier {doc_id} supprimé avec succès."}

    raise HTTPException(status_code=404, detail="Document non trouvé.")


# --- Google Drive Confined Storage (Strict Drive Jail) ---
@app.get("/api/drive/files", tags=["Google Drive"])
def list_drive_files(query: Optional[str] = None, page_size: int = 100):
    """Liste exclusivement les fichiers situés dans le dossier confiné Hellenvilliers SCI."""
    files = drive_jail_service.list_files(query_filter=query, page_size=page_size)
    return {"files": files, "count": len(files), "folder_id": drive_jail_service.folder_id}


@app.post("/api/drive/upload", status_code=status.HTTP_201_CREATED, tags=["Google Drive"])
async def upload_drive_file(file: UploadFile = File(...), description: Optional[str] = Form(None)):
    """Téléverse un fichier strictement confiné dans le dossier Hellenvilliers SCI."""
    content = await file.read()
    mimetype = file.content_type or "application/octet-stream"
    result = drive_jail_service.upload_file(
        filename=file.filename or "document.bin",
        content=content,
        mimetype=mimetype,
        description=description
    )
    return {"file": result, "message": "Fichier téléversé avec succès dans le dossier sécurisé."}


@app.get("/api/drive/files/{file_id}/metadata", tags=["Google Drive"])
def get_drive_file_metadata(file_id: str):
    """Récupère les métadonnées d'un fichier avec vérification de confinement strict."""
    return drive_jail_service.get_file_metadata(file_id)


@app.get("/api/drive/files/{file_id}/download", tags=["Google Drive"])
def download_drive_file(file_id: str):
    """Télécharge un fichier avec contrôle de sécurité infranchissable (Strict Drive Jail)."""
    content, metadata = drive_jail_service.download_file(file_id)
    filename = metadata.get("name", f"file_{file_id}")
    guessed_type, _ = mimetypes.guess_type(filename)
    mimetype = guessed_type or metadata.get("mimeType", "application/octet-stream")
    return Response(
        content=content,
        media_type=mimetype,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.delete("/api/drive/files/{file_id}", tags=["Google Drive"])
def delete_drive_file(file_id: str):
    """Supprime un fichier après validation de son appartenance au dossier autorisé."""
    drive_jail_service.delete_file(file_id)
    return {"message": f"Fichier {file_id} supprimé avec succès de Google Drive."}

@app.get("/api/members/{user_name}/current-stay-tasks")
def get_member_current_stay_tasks(user_name: str, db: Session = Depends(get_db)):
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    norm_user = normalize_prenom(user_name)

    all_reservations = db.query(Reservation).order_by(Reservation.start_date.asc()).all()

    # 1. Look for member's NEXT upcoming (or current) stay (accent-insensitive)
    res = next(
        (r for r in all_reservations if normalize_prenom(r.user_name) == norm_user and r.end_date >= today_str),
        None
    )

    # 2. If no upcoming stay for member, get their most recent / any stay
    if not res:
        res = next(
            (r for r in all_reservations if normalize_prenom(r.user_name) == norm_user),
            None
        )

    # 3. If still no stay for member, fallback to next upcoming stay overall
    if not res:
        res = next(
            (r for r in all_reservations if r.end_date >= today_str),
            all_reservations[0] if all_reservations else None
        )

    if not res:
        return {"reservation": None, "tasks": []}

    tasks = get_reservation_tasks(res.id, db)
    return {
        "reservation": res,
        "tasks": tasks
    }



# --- Coordinator Stats Endpoint ---

@app.get("/api/stats", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    urgent_issues = db.query(Issue).filter(
        Issue.priority.in_(["Urgent", "Haute"]),
        Issue.status.in_(["Ouvert", "En cours"])
    ).count()

    pending_reservations = db.query(Reservation).filter(
        Reservation.status == "Demande en attente"
    ).count()

    total_open_issues = db.query(Issue).filter(Issue.status == "Ouvert").count()
    in_progress_issues = db.query(Issue).filter(Issue.status == "En cours").count()
    resolved_issues = db.query(Issue).filter(Issue.status == "Résolu").count()
    confirmed_reservations = db.query(Reservation).filter(Reservation.status == "Confirmée").count()
    active_properties = db.query(Property).count()
    pending_projects = db.query(Project).filter(Project.status == "SOUMIS").count()
    active_votes = db.query(Project).filter(Project.status == "EN_VOTE").count()

    return StatsResponse(
        urgent_issues_count=urgent_issues,
        pending_reservations_count=pending_reservations,
        total_open_issues=total_open_issues,
        in_progress_issues=in_progress_issues,
        resolved_issues=resolved_issues,
        confirmed_reservations=confirmed_reservations,
        active_properties_count=active_properties,
        pending_projects_count=pending_projects,
        active_votes_count=active_votes
    )

@app.get("/api/stats/leaderboard")
def get_stats_leaderboard(year: Optional[int] = Query(2026), db: Session = Depends(get_db)):
    """Retourne le podium annuel calculé strictement à partir des séjours réels (vide [] si aucun séjour)."""
    query = db.query(Reservation).filter(Reservation.status.in_(["Confirmée", "Demande en attente"]))
    if year:
        query = query.filter(Reservation.year == year)
    reservations = query.all()
    if not reservations:
        return []
    
    user_days = {}
    for r in reservations:
        try:
            d1 = datetime.strptime(r.start_date, "%Y-%m-%d")
            d2 = datetime.strptime(r.end_date, "%Y-%m-%d")
            days = max(1, (d2 - d1).days + 1)
        except Exception:
            days = 7
        user_days[r.user_name] = user_days.get(r.user_name, 0) + days

    sorted_users = sorted(user_days.items(), key=lambda x: x[1], reverse=True)
    return [{"rank": idx + 1, "name": name, "days": days} for idx, (name, days) in enumerate(sorted_users[:3])]

@app.get("/api/calendar/ics")
def export_calendar_ics(db: Session = Depends(get_db)):
    reservations = db.query(Reservation).filter(Reservation.status == "Confirmée").all()
    
    ics_lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//SCI Familiale Hellenvilliers//FR",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Séjours SCI Familiale Hellenvilliers"
    ]

    now_str = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    for res in reservations:
        try:
            dt_start = datetime.strptime(res.start_date, "%Y-%m-%d").strftime("%Y%m%d")
            dt_end = (datetime.strptime(res.end_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y%m%d")
        except Exception:
            continue
        
        prop_name = res.property.name if res.property else "Maison d'Hellenvilliers"
        notes_str = f" - {res.notes}" if res.notes else ""

        ics_lines.extend([
            "BEGIN:VEVENT",
            f"UID:reservation-{res.id}@sci-familiale.fr",
            f"DTSTAMP:{now_str}",
            f"DTSTART;VALUE=DATE:{dt_start}",
            f"DTEND;VALUE=DATE:{dt_end}",
            f"SUMMARY:Séjour {res.user_name} - {prop_name}",
            f"DESCRIPTION:Séjour de {res.user_name} (Semaine {res.week_number}){notes_str}",
            "STATUS:CONFIRMED",
            "END:VEVENT"
        ])

    ics_lines.append("END:VCALENDAR")
    ics_content = "\r\n".join(ics_lines)

    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={"Content-Disposition": "attachment; filename=sci_familiale_calendar.ics"}
    )

@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "SCI Familiale API v2.0"}


# --- Henri's Proportional Usage Workload Model ---

@app.get("/api/workload/summary", response_model=WorkloadSummaryResponse)
def get_workload_summary(
    property_id: Optional[int] = Query(None),
    year: Optional[int] = Query(2026),
    total_charge_points: float = Query(100.0),
    db: Session = Depends(get_db)
):
    """
    Henri's Proportional Usage Workload Model:
    - User occupation score: O_u = sum(days * rooms_count)
    - Exclusive booking penalty: if accepts_extra_family == False, rooms_count = 7 (100% capacity penalty across all 7 rooms in the SCI).
    - Proportional Target Charge: C_u^target = (O_u / sum(O_v)) * total_charge_points
    """
    query = db.query(Reservation).filter(Reservation.status == "Confirmée")
    if property_id:
        query = query.filter(Reservation.property_id == property_id)
    if year:
        query = query.filter(Reservation.year == year)

    reservations = query.all()
    all_tasks = db.query(Task).all()

    dist = calculate_workload_distribution(reservations, total_charge_points=total_charge_points, tasks=all_tasks)

    user_stats = [
        UserWorkloadStats(
            user_name=stat["user_name"],
            total_days=stat["total_days"],
            occupation_score=stat["occupation_score"],
            target_charge_points=stat["target_charge_points"],
            performed_charge_points=stat.get("performed_charge_points", 0.0),
            charge_percentage=stat["charge_percentage"]
        ) for stat in dist["user_stats"]
    ]

    return WorkloadSummaryResponse(
        total_charge_points=dist["total_charge_points"],
        total_occupation_score=dist["total_occupation_score"],
        user_stats=user_stats
    )


# --- Heating & ViCare System Endpoints (Passive Telemetry F07) ---

@app.get("/api/vicare/status", response_model=HeatingStatusResponse)
@app.get("/api/heating/status", response_model=HeatingStatusResponse)
@app.get("/api/heating/vicare/status", response_model=HeatingStatusResponse)
def get_heating_status(
    property_id: Optional[int] = Query(None),
    refresh: bool = Query(False),
    force_refresh: bool = Query(False)
):
    is_refresh = refresh or force_refresh
    return ViCareService.get_status(property_id=property_id, force_refresh=is_refresh)

@app.post("/api/vicare/mode", response_model=HeatingStatusResponse)
@app.post("/api/heating/mode", response_model=HeatingStatusResponse)
@app.post("/api/heating/set-mode", response_model=HeatingStatusResponse)
@app.post("/api/heating/vicare/mode", response_model=HeatingStatusResponse)
def set_heating_mode(req: HeatingModeRequest):
    return ViCareService.set_mode(req.mode)

@app.post("/api/vicare/temperature", response_model=HeatingStatusResponse)
@app.post("/api/heating/temperature", response_model=HeatingStatusResponse)
@app.post("/api/heating/set-temperature", response_model=HeatingStatusResponse)
@app.post("/api/heating/vicare/temperature", response_model=HeatingStatusResponse)
def set_heating_temperature(req: HeatingTemperatureRequest):
    program = req.program or "comfort"
    return ViCareService.set_temperature(req.target_temperature, program=program)

@app.post("/api/heating/dhw/mode", response_model=HeatingStatusResponse)
@app.post("/api/heating/dhw-mode", response_model=HeatingStatusResponse)
@app.post("/api/vicare/dhw/mode", response_model=HeatingStatusResponse)
def set_dhw_mode(req: DhwModeRequest):
    return ViCareService.set_dhw_mode(req.is_active)

@app.post("/api/heating/dhw/temperature", response_model=HeatingStatusResponse)
@app.post("/api/heating/dhw-temperature", response_model=HeatingStatusResponse)
@app.post("/api/vicare/dhw/temperature", response_model=HeatingStatusResponse)
def set_dhw_temperature(req: DhwTemperatureRequest):
    temp = req.get_temperature()
    return ViCareService.set_dhw_temperature(temp, target=req.target)


# --- Piscine Rosing Telemetry & Controls Endpoints (PAC Rosing F08) ---

@app.get("/api/pool/status", response_model=PiscineStatusResponse, tags=["Pool"])
@app.get("/api/klereo/status", response_model=PiscineStatusResponse, tags=["Pool"])
def get_klereo_pool_status(refresh: bool = Query(False), force_refresh: bool = Query(False)):
    """Returns Klereo Connect live passive telemetry without simulation."""
    is_refresh = refresh or force_refresh
    telemetry = KlereoService.get_pool_status(force_refresh=is_refresh)
    return PiscineStatusResponse(**telemetry)

@app.get("/api/piscine/status", response_model=PiscineStatusResponse, tags=["Pool"])
def get_piscine_status(live: bool = True, refresh: bool = Query(False), force_refresh: bool = Query(False)):
    """Returns PAC Rosing passive telemetry directly from live Klereo Connect API."""
    is_refresh = refresh or force_refresh
    telemetry = KlereoService.get_pool_status(force_refresh=is_refresh)
    return PiscineStatusResponse(**telemetry)

@app.post("/api/pool/pump/mode", response_model=PiscineStatusResponse, tags=["Pool"])
@app.post("/api/piscine/pump/mode", response_model=PiscineStatusResponse, tags=["Pool"])
def set_pool_pump_mode(req: PoolPumpModeRequest, db: Session = Depends(get_db)):
    """
    Arbitrage et contrôle de la pompe de filtration piscine Klereo.
    Payload: {"mode": "auto" | "on" | "off"} ou {"active": bool}.
    """
    active_input = req.active if req.active is not None else req.is_active
    result = KlereoService.set_pump_mode(mode=req.mode, active=active_input)
    try:
        active_val = result.get("is_pump_active", False)
        mode_val = result.get("pump_mode") or req.mode or ("on" if active_val else "off")
        db.add(Log(
            action="POOL_PUMP_MODE_UPDATE",
            user_name=req.author_name or "Système",
            details=f"Pompe filtration piscine réglée sur : {mode_val} (active={active_val})"
        ))
        setting = db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "pool").first()
        if not setting:
            setting = ThermalSettings(equipment_type="pool")
            db.add(setting)
        setting.filtration_mode = "marche" if active_val else "arret"
        setting.updated_by = req.author_name or "Système"
        setting.updated_at = datetime.utcnow()
        db.commit()
    except Exception as e:
        logger.warning(f"[POOL] Log DB pompe non bloquant: {e}")
    return PiscineStatusResponse(**result)

@app.post("/api/pool/heating/mode", response_model=PiscineStatusResponse, tags=["Pool"])
@app.post("/api/pool/pac/mode", response_model=PiscineStatusResponse, tags=["Pool"])
@app.post("/api/piscine/heating/mode", response_model=PiscineStatusResponse, tags=["Pool"])
@app.post("/api/piscine/pac/mode", response_model=PiscineStatusResponse, tags=["Pool"])
def set_pool_heating_mode(req: PoolHeatingModeRequest, db: Session = Depends(get_db)):
    """
    Arbitrage et contrôle du chauffage PAC Inopac 20 kW piscine Klereo.
    Payload: {"mode": "auto" | "on" | "off"} ou {"active": bool}.
    """
    active_input = req.active if req.active is not None else req.is_active
    result = KlereoService.set_heating_mode(mode=req.mode, active=active_input)
    try:
        active_val = result.get("is_heating_active", False)
        mode_val = result.get("heating_mode") or req.mode or ("on" if active_val else "off")
        db.add(Log(
            action="POOL_HEATING_MODE_UPDATE",
            user_name=req.author_name or "Système",
            details=f"Chauffage PAC piscine réglé sur : {mode_val} (active={active_val})"
        ))
        setting = db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "pool").first()
        if not setting:
            setting = ThermalSettings(equipment_type="pool")
            db.add(setting)
        setting.mode = "confort" if active_val else "standby"
        setting.updated_by = req.author_name or "Système"
        setting.updated_at = datetime.utcnow()
        db.commit()
    except Exception as e:
        logger.warning(f"[POOL] Log DB PAC non bloquant: {e}")
    return PiscineStatusResponse(**result)

@app.post("/api/piscine/mode", tags=["Pool"])
@app.post("/api/piscine/temperature", tags=["Pool"])
@app.post("/api/pool/mode", tags=["Pool"])
@app.post("/api/pool/temperature", tags=["Pool"])
@app.post("/api/klereo/mode", tags=["Pool"])
@app.post("/api/klereo/temperature", tags=["Pool"])
def set_piscine_control_interlock():
    """
    IMMUTABLE SOFTWARE INTERLOCK (Garde-fou Impératif Henri #1).
    Strictly forbids sending actuator or temperature commands to pool equipment.
    Always raises HTTP 403 Forbidden.
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "error": "Garde-fou de sécurité inviolable actif (Garde-fou Henri #1) : Mode lecture seule obligatoire pour la piscine. Toute modification de consigne ou commande actionneur est formellement interdite.",
            "type": "SecurityInterlockError"
        }
    )


# --- Heating & Pool Settings Endpoints (Thermal Changes & Email Triggers) ---

@app.get("/api/heating/settings", response_model=HeatingSettingsResponse, tags=["Heating"])
def get_heating_settings(db: Session = Depends(get_db)):
    """Returns currently saved heating consigne and mode."""
    setting = db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "heating").first()
    if not setting:
        return HeatingSettingsResponse(
            target_temperature=19.0,
            mode="dhwAndHeating",
            updated_by="Système",
            updated_at=datetime.utcnow()
        )
    return HeatingSettingsResponse(
        target_temperature=setting.target_temperature if setting.target_temperature is not None else 19.0,
        mode=setting.mode or "dhwAndHeating",
        updated_by=setting.updated_by or "Coordinateur",
        updated_at=setting.updated_at
    )


@app.post("/api/heating/settings", response_model=HeatingSettingsResponse, tags=["Heating"])
def update_heating_settings(
    req: HeatingSettingsRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Enregistre les consignes de température et mode de chauffage ViCare (Presbytère),
    et déclenche l'envoi d'un e-mail d'alerte à tous les membres ayant notif_thermal_changes == True.
    """
    author = req.author_name or (current_user.name if current_user else "Henri Jamet (Coordinateur)")

    # 1. Update or create row in thermal_settings for heating
    setting = db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "heating").first()
    if not setting:
        setting = ThermalSettings(equipment_type="heating")
        db.add(setting)

    if req.target_temperature is not None:
        setting.target_temperature = req.target_temperature
    elif setting.target_temperature is None:
        setting.target_temperature = 19.0

    if req.is_heating_active is not None:
        setting.mode = "dhwAndHeating" if req.is_heating_active else "dhw"
    elif req.mode is not None:
        setting.mode = req.mode
    elif setting.mode is None:
        setting.mode = "dhwAndHeating"

    setting.updated_by = author
    setting.updated_at = datetime.utcnow()

    # 1b. Support frost / standby temperature
    frost_setting = db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "heating_frost").first()
    if req.frost_temperature is not None:
        if not frost_setting:
            frost_setting = ThermalSettings(equipment_type="heating_frost")
            db.add(frost_setting)
        frost_setting.target_temperature = req.frost_temperature
        frost_setting.updated_by = author
        frost_setting.updated_at = datetime.utcnow()

    # 1c. Support DHW settings
    dhw_setting = db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "dhw").first()
    if req.is_dhw_active is not None or req.dhw_target_temperature is not None:
        if not dhw_setting:
            dhw_setting = ThermalSettings(equipment_type="dhw")
            db.add(dhw_setting)
        if req.is_dhw_active is not None:
            dhw_setting.mode = "on" if req.is_dhw_active else "off"
        if req.dhw_target_temperature is not None:
            dhw_setting.target_temperature = req.dhw_target_temperature
        dhw_setting.updated_by = author
        dhw_setting.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(setting)

    # 2. Build human-readable details
    temp_str = f"{setting.target_temperature:.1f}°C" if setting.target_temperature is not None else "19.0°C"
    mode_str = setting.mode or "dhwAndHeating"
    details = req.details or f"Température de consigne passée à {temp_str} (Mode: {mode_str})"

    # 3. Log action
    db.add(Log(
        action="HEATING_SETTINGS_UPDATE",
        user_name=author,
        details=details
    ))
    db.commit()

    # 4. Trigger email to members with notif_thermal_changes == True
    subscribed_members = db.query(Member).filter(
        Member.notif_thermal_changes == True,
        Member.email.isnot(None)
    ).all()
    target_emails = [m.email for m in subscribed_members if m.email]

    dispatched_thermal_email = None
    if target_emails:
        try:
            send_res = send_thermal_change_email(
                target_emails=target_emails,
                author_name=author,
                equipment_type="Chauffage & Eau Chaude ViCare (Presbytère)",
                details=details
            )
            if isinstance(send_res, dict) and "_email_dispatched" in send_res:
                dispatched_thermal_email = send_res["_email_dispatched"]
        except Exception as email_err:
            logger.error(f"[HEATING SETTINGS] Erreur lors de l'envoi d'e-mail: {email_err}")

    # Notification interne globale pour la cloche (Annotation 13)
    create_internal_notification(
        db=db,
        title="Consignes thermiques modifiées : Presbytère",
        description=f"{details} (par {author})",
        notif_type="thermal",
        link_path="/energie",
        email_entry=dispatched_thermal_email
    )

    return HeatingSettingsResponse(
        target_temperature=setting.target_temperature,
        frost_temperature=frost_setting.target_temperature if frost_setting else 5.0,
        is_heating_active=setting.mode != "dhw" and setting.mode != "standby",
        is_dhw_active=(dhw_setting.mode == "on") if dhw_setting else None,
        dhw_target_temperature=dhw_setting.target_temperature if dhw_setting else None,
        mode=setting.mode,
        updated_by=setting.updated_by,
        updated_at=setting.updated_at,
        message=f"Consignes thermiques enregistrées ({temp_str}) et notification transmise aux associés.",
        status="ok"
    )


@app.get("/api/pool/settings", response_model=PoolSettingsResponse, tags=["Pool"])
@app.get("/api/piscine/settings", response_model=PoolSettingsResponse, tags=["Pool"])
def get_pool_settings(db: Session = Depends(get_db)):
    """Returns currently saved pool consigne and filtration mode."""
    setting = db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "pool").first()
    if not setting:
        return PoolSettingsResponse(
            target_temperature=14.0,
            filtration_mode="auto",
            mode="standby",
            updated_by="Système",
            updated_at=datetime.utcnow()
        )
    return PoolSettingsResponse(
        target_temperature=setting.target_temperature if setting.target_temperature is not None else 14.0,
        filtration_mode=setting.filtration_mode or "auto",
        mode=setting.mode or "standby",
        updated_by=setting.updated_by or "Coordinateur",
        updated_at=setting.updated_at
    )


@app.post("/api/pool/settings", response_model=PoolSettingsResponse, tags=["Pool"])
@app.post("/api/piscine/settings", response_model=PoolSettingsResponse, tags=["Pool"])
def update_pool_settings(
    req: PoolSettingsRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Enregistre les consignes de température et filtration piscine Klereo (Villa Rosing),
    et déclenche l'envoi d'un e-mail d'alerte à tous les membres ayant notif_thermal_changes == True.
    """
    author = req.author_name or (current_user.name if current_user else "Henri Jamet (Coordinateur)")

    # 1. Update or create row in thermal_settings
    setting = db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "pool").first()
    if not setting:
        setting = ThermalSettings(equipment_type="pool")
        db.add(setting)

    if req.target_temperature is not None:
        setting.target_temperature = req.target_temperature
    elif setting.target_temperature is None:
        setting.target_temperature = 14.0

    if req.filtration_mode is not None:
        setting.filtration_mode = req.filtration_mode
    elif setting.filtration_mode is None:
        setting.filtration_mode = "auto"

    if req.mode is not None:
        setting.mode = req.mode
    elif setting.mode is None:
        setting.mode = "standby"

    setting.updated_by = author
    setting.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(setting)

    # 2. Build human-readable details
    temp_str = f"{setting.target_temperature:.1f}°C" if setting.target_temperature is not None else "14.0°C"
    filt_str = setting.filtration_mode or "auto"
    details = req.details or f"Filtration piscine réglée sur '{filt_str}' (Consigne: {temp_str}, Mode: {setting.mode})"

    # 3. Log action
    db.add(Log(
        action="POOL_SETTINGS_UPDATE",
        user_name=author,
        details=details
    ))
    db.commit()

    # 4. Trigger email to members with notif_thermal_changes == True
    subscribed_members = db.query(Member).filter(
        Member.notif_thermal_changes == True,
        Member.email.isnot(None)
    ).all()
    target_emails = [m.email for m in subscribed_members if m.email]

    dispatched_pool_email = None
    if target_emails:
        try:
            send_res = send_thermal_change_email(
                target_emails=target_emails,
                author_name=author,
                equipment_type="Piscine Klereo (Villa Rosing)",
                details=details
            )
            if isinstance(send_res, dict) and "_email_dispatched" in send_res:
                dispatched_pool_email = send_res["_email_dispatched"]
        except Exception as email_err:
            logger.error(f"[POOL SETTINGS] Erreur lors de l'envoi d'e-mail: {email_err}")

    # Notification interne globale pour la cloche (Annotation 13)
    create_internal_notification(
        db=db,
        title="Consignes piscine modifiées : Klereo",
        description=f"{details} (par {author})",
        notif_type="thermal",
        link_path="/sejour",
        email_entry=dispatched_pool_email
    )

    return PoolSettingsResponse(
        target_temperature=setting.target_temperature,
        filtration_mode=setting.filtration_mode,
        mode=setting.mode,
        updated_by=setting.updated_by,
        updated_at=setting.updated_at,
        message=f"Réglages piscine enregistrés ({filt_str}) et notification transmise aux associés abonnés.",
        status="ok"
    )


# --- Open Banking DSP2 (Enable Banking & Swan France) Endpoints ---

@app.get("/api/banking/status", response_model=BankStatusResponse, tags=["Banking"])
def get_banking_status(
    refresh: bool = Query(False),
    force_refresh: bool = Query(False),
    db: Session = Depends(get_db)
):
    """Retourne l'état réactif de l'intégration Open Banking DSP2 et les soldes consolidés de la SCI.
    
    Garantit une sécurité Zero-Crash : ne lève JAMAIS d'erreur HTTP 500 non gérée,
    et expose fidèlement l'erreur brute, le code d'erreur et les détails pour diagnostic.
    """
    is_refresh = refresh or force_refresh
    try:
        status_data = enable_banking_service.check_connection_status(db=db, force_refresh=is_refresh)
    except Exception as e:
        logger.error(f"Erreur inattendue check_connection_status : {e}", exc_info=True)
        status_data = {
            "status": "interrupted",
            "is_connected": False,
            "needs_reauth": True,
            "raw_error": str(e),
            "error_code": "INTERNAL_CHECK_ERROR",
            "error_details": {"exception": str(e), "type": type(e).__name__},
            "last_sync_attempt": datetime.utcnow().isoformat(),
            "message": f"Erreur de communication bancaire : {str(e)}",
            "active_accounts_count": 0,
            "total_balance": 0.0,
            "last_synced_at": None,
            "last_successful_sync": None,
            "reauth_url": None
        }

    return BankStatusResponse(
        application_id=enable_banking_service.app_id,
        aspsp_name=enable_banking_service.aspsp_name,
        aspsp_bic=enable_banking_service.aspsp_bic,
        aspsp_country=enable_banking_service.aspsp_country,
        active_accounts_count=status_data.get("active_accounts_count", 0),
        total_balance=status_data.get("total_balance", 0.0),
        currency="EUR",
        last_synced_at=status_data.get("last_synced_at"),
        last_successful_sync=status_data.get("last_successful_sync"),
        status=status_data.get("status", "ok"),
        is_connected=status_data.get("is_connected", status_data.get("status") == "ok" and not status_data.get("needs_reauth")),
        needs_reauth=status_data.get("needs_reauth", False),
        days_left=status_data.get("days_left"),
        valid_until=status_data.get("valid_until"),
        message=status_data.get("message"),
        reauth_url=status_data.get("reauth_url"),
        raw_error=status_data.get("raw_error"),
        error_code=status_data.get("error_code"),
        error_details=status_data.get("error_details"),
        last_sync_attempt=status_data.get("last_sync_attempt")
    )


@app.get("/api/banking/aspsps", tags=["Banking"])
def list_banking_aspsps(country: str = Query("FR", description="Code pays ISO")):
    """Liste les banques disponibles via Enable Banking pour le pays demandé."""
    try:
        aspsps = enable_banking_service.get_aspsps(country=country)
        return {"country": country, "count": len(aspsps), "aspsps": aspsps}
    except Exception as e:
        logger.error(f"Erreur récupération ASPSPs : {e}")
        return {
            "country": country,
            "count": 1,
            "aspsps": [{
                "name": enable_banking_service.aspsp_name,
                "country": enable_banking_service.aspsp_country,
                "bic": enable_banking_service.aspsp_bic,
                "note": "Configuration locale active"
            }]
        }


@app.post("/api/banking/auth/start", response_model=BankAuthStartResponse, tags=["Banking"])
def start_banking_auth(payload: BankAuthStartRequest = None, db: Session = Depends(get_db)):
    """Démarre le flux d'autorisation DSP2 pour Swan et retourne le lien de consentement bancaire."""
    req_payload = payload or BankAuthStartRequest()
    try:
        auth_data = enable_banking_service.create_auth_session(
            aspsp_name=req_payload.aspsp_name,
            psu_type=req_payload.psu_type or "business",
            redirect_url=req_payload.redirect_url
        )

        valid_until_dt = None
        if auth_data.get("valid_until"):
            try:
                valid_until_dt = datetime.fromisoformat(auth_data["valid_until"].replace("Z", "+00:00"))
            except Exception:
                pass

        # Enregistrement de la session d'autorisation en base
        new_session = BankAuthSession(
            session_id=auth_data["session_id"] or auth_data["state"],
            aspsp_name=auth_data["aspsp_name"],
            psu_type=req_payload.psu_type or "business",
            status="INITIATED",
            auth_url=auth_data["url"],
            redirect_url=req_payload.redirect_url or enable_banking_service.redirect_url,
            expires_at=valid_until_dt
        )
        db.add(new_session)
        db.commit()

        return BankAuthStartResponse(
            url=auth_data["url"],
            session_id=auth_data["session_id"] or auth_data["state"],
            state=auth_data["state"],
            aspsp_name=auth_data["aspsp_name"],
            valid_until=auth_data["valid_until"]
        )
    except Exception as e:
        logger.error(f"Échec démarrage auth Enable Banking : {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erreur de communication avec Enable Banking : {str(e)}"
        )


@app.get("/api/banking/callback", tags=["Banking"])
def banking_callback_redirect(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Callback de redirection bancaire suite au consentement de l'associé."""
    import urllib.parse
    if error:
        logger.warning(f"Retour d'erreur lors du consentement bancaire : {error}")
        err_msg = urllib.parse.quote(str(error))
        return RedirectResponse(url=f"/admin?banking=error&msg={err_msg}")

    if not code:
        raise HTTPException(status_code=400, detail="Code d'autorisation manquant dans le callback bancaire")

    try:
        session_info = enable_banking_service.authorize_session(code=code)
        session_id = session_info.get("session_id") if isinstance(session_info, dict) else None

        # Mise à jour de la session en base
        db_sess = db.query(BankAuthSession).filter(BankAuthSession.session_id == (state or session_id)).first()
        if not db_sess and session_id:
            db_sess = db.query(BankAuthSession).filter(BankAuthSession.session_id == session_id).first()

        if db_sess:
            if session_id and db_sess.session_id != session_id:
                db_sess.session_id = session_id
            db_sess.status = "AUTHORIZED"
            db_sess.authorized_at = datetime.utcnow()
            db_sess.expires_at = datetime.utcnow() + timedelta(days=180)
            raw_accs = session_info.get("accounts", []) if isinstance(session_info, dict) else []
            db_sess.accounts_data = json.dumps(raw_accs)
            db.commit()

        # Synchronisation immédiate des soldes et transactions
        enable_banking_service.sync_database(db=db, session_id=session_id)
        enable_banking_service.clear_status_cache()

        return RedirectResponse(url="/admin?banking=success")
    except Exception as e:
        logger.error(f"Échec finalisation callback bancaire : {e}", exc_info=True)
        err_msg = urllib.parse.quote(str(e))
        return RedirectResponse(url=f"/admin?banking=error&msg={err_msg}")


@app.post("/api/banking/callback", tags=["Banking"])
def banking_callback_post(payload: BankAuthCallbackRequest, db: Session = Depends(get_db)):
    """Validation programmatique du code d'autorisation."""
    try:
        session_info = enable_banking_service.authorize_session(code=payload.code)
        sync_result = enable_banking_service.sync_database(db=db, session_id=payload.session_id)
        enable_banking_service.clear_status_cache()
        return {
            "success": True,
            "session": session_info,
            "sync": sync_result
        }
    except Exception as e:
        logger.error(f"Échec callback post : {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/banking/accounts", response_model=List[BankAccountResponse], tags=["Banking"])
def get_banking_accounts(db: Session = Depends(get_db)):
    """Retourne la liste des comptes bancaires de la SCI avec soldes et transactions."""
    accounts = db.query(BankAccount).all()
    return accounts


@app.get("/api/banking/transactions", response_model=List[BankTransactionResponse], tags=["Banking"])
def get_banking_transactions(
    category: Optional[str] = Query(None, description="Filtrer par catégorie"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """Retourne les transactions bancaires enregistrées, triées par date décroissante."""
    query = db.query(BankTransaction)
    if category:
        query = query.filter(BankTransaction.category == category)
    transactions = query.order_by(BankTransaction.booking_date.desc()).limit(limit).all()
    return transactions


@app.post("/api/banking/sync", response_model=BankSyncResponse, tags=["Banking"])
def trigger_banking_sync(db: Session = Depends(get_db)):
    """Déclenche la synchronisation manuelle des comptes et transactions bancaires."""
    try:
        result = enable_banking_service.sync_database(db=db)
        enable_banking_service.clear_status_cache()
        return BankSyncResponse(
            success=result.get("success", True),
            accounts_synced=result.get("accounts_synced", 0),
            transactions_synced=result.get("transactions_synced", 0),
            timestamp=result.get("timestamp", datetime.utcnow().isoformat())
        )
    except Exception as e:
        logger.error(f"Erreur synchronisation bancaire : {e}")
        raise HTTPException(status_code=500, detail=f"Échec de la synchronisation : {str(e)}")


@app.post("/api/accounting/transactions", status_code=status.HTTP_201_CREATED, tags=["Accounting", "Banking"])
@app.post("/api/banking/transactions", status_code=status.HTTP_201_CREATED, tags=["Accounting", "Banking"])
async def create_accounting_transaction(
    file: Optional[UploadFile] = File(None, description="Justificatif ou facture obligatoire si aucun document existant rattaché"),
    document_id: Optional[int] = Form(None, description="ID d'un document existant dans admin_documents"),
    justification: str = Form(..., description="Justification de paiement obligatoire"),
    amount: float = Form(..., description="Montant de la dépense"),
    booking_date: Optional[str] = Form(None, description="Date de valeur YYYY-MM-DD"),
    type: Optional[str] = Form("out", description="Type d'opération (forcé à dépense / sortie)"),
    uploaded_by: Optional[str] = Form("Henri Jamet"),
    db: Session = Depends(get_db)
):
    """
    Enregistre une dépense déductible pour la SCI et archive obligatoirement le justificatif associé.
    Annotations 5, 6, 7 & 16 :
    - 100% sorties déductibles (type='out' ou 'expense'). Zéro entrée permise.
    - Justification de paiement obligatoire.
    - Fichier justificatif / facture strictement obligatoire (soit via document_id existant, soit via upload canonique).
    """
    # 1. Validation du montant (> 0)
    try:
        amount_val = float(amount)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le montant de la dépense doit être un nombre valide supérieur à 0."
        )
    if amount_val <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le montant de la dépense doit être strictement supérieur à 0."
        )

    # 2. Validation de la justification de paiement (obligatoire)
    clean_justification = (justification or "").strip()
    if not clean_justification:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La justification de paiement est obligatoire."
        )

    # 3. Validation et association du justificatif / facture (obligatoire)
    now = datetime.utcnow()
    mmaaaa = now.strftime("%m%Y")
    db_doc = None
    canonical_filename = ""

    if document_id:
        db_doc = db.query(AdminDocument).filter(AdminDocument.id == document_id).first()
        if not db_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document justificatif #{document_id} introuvable."
            )
        canonical_filename = db_doc.file_name or db_doc.title or f"Document-{db_doc.id}"
    elif file and file.filename:
        # Traitement et archivage canonique du fichier justificatif téléversé
        original_name = file.filename or "justificatif.pdf"
        _, ext = os.path.splitext(original_name)
        if not ext:
            ext = ".pdf"

        # Nettoyage du titre pour la convention canonique
        safe_title = re.sub(r'[^\w\s-]', '', clean_justification).strip()
        if not safe_title:
            safe_title = "Justificatif Depense"
        canonical_filename = f"SCI {mmaaaa} {safe_title}{ext}"

        file_bytes = await file.read()
        file_size = len(file_bytes)
        mimetype = file.content_type or "application/pdf"

        # Téléversement Drive sécurisé (si configuré)
        drive_file_id = None
        try:
            if drive_jail_service.is_configured():
                drive_file = drive_jail_service.upload_file(
                    filename=canonical_filename,
                    content=file_bytes,
                    mimetype=mimetype,
                    description=f"SCI Hellenvilliers - Dépense Déductible : {clean_justification} ({amount_val:.2f} €) - Déposé par {uploaded_by}"
                )
                drive_file_id = drive_file.get("id") if drive_file else None
        except Exception as drive_err:
            logger.warning(f"Google Drive upload fallback notice: {drive_err}")

        # Sauvegarde locale de secours
        dest_path = os.path.join(DOCUMENTS_DIR, canonical_filename)
        try:
            with open(dest_path, "wb") as f:
                f.write(file_bytes)
        except Exception as e:
            logger.warning(f"Erreur écriture cache local {canonical_filename}: {e}")

        # Enregistrement du document dans admin_documents
        db_doc = AdminDocument(
            title=clean_justification,
            category="Travaux & Factures",
            file_url=f"/api/documents/drive/{drive_file_id}" if drive_file_id else "/api/documents/temp",
            file_name=canonical_filename,
            file_type=mimetype,
            file_size=file_size,
            file_data=file_bytes,
            drive_file_id=drive_file_id,
            source_type="EXPENSE",
            uploaded_by=uploaded_by or "Henri Jamet",
            notes=f"Dépense déductible : {amount_val:.2f} €"
        )
        db.add(db_doc)
        db.commit()
        db.refresh(db_doc)

        db_doc.file_url = f"/api/documents/{db_doc.id}/download"
        db.commit()
        db.refresh(db_doc)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Veuillez joindre une facture ou un justificatif de paiement pour valider la dépense."
        )

    # 5. Enregistrement bancaire immuable en sortie / débit (montant négatif)
    account = db.query(BankAccount).first()
    if not account:
        account = BankAccount(
            account_id="INDY-SWAN-HELLENVILLIERS",
            name="Compte Pro Indy SCI Hellenvilliers",
            iban="FR76 1690 6000 1234 5678 9012 345",
            balance=0.0,
            currency="EUR",
            aspsp_name="Indy (Swan France)"
        )
        db.add(account)
        db.commit()
        db.refresh(account)

    expense_amount = -abs(amount_val)  # STRICTEMENT UNE SORTIE (Montant négatif)
    clean_date = (booking_date or "").strip() or now.strftime("%Y-%m-%d")
    tx_id = f"EXP-{int(now.timestamp())}-{uuid.uuid4().hex[:6].upper()}"

    new_tx = BankTransaction(
        transaction_id=tx_id,
        account_id=account.id,
        booking_date=clean_date,
        value_date=clean_date,
        amount=expense_amount,
        currency="EUR",
        remittance_information=clean_justification,
        creditor_name="Fournisseur / Débit",
        debtor_name="SCI Hellenvilliers",
        category="Dépense Déductible",
        raw_json=json.dumps({
            "source": "manual_expense",
            "document_id": db_doc.id,
            "document_filename": canonical_filename,
            "uploaded_by": uploaded_by or "Henri Jamet",
            "deductible": True
        })
    )
    db.add(new_tx)
    account.balance = (account.balance or 0.0) + expense_amount
    db.commit()
    db.refresh(new_tx)

    return {
        "success": True,
        "message": "Dépense enregistrée et justificatif archivé avec succès.",
        "transaction": {
            "id": new_tx.id,
            "transaction_id": new_tx.transaction_id,
            "account_id": new_tx.account_id,
            "booking_date": new_tx.booking_date,
            "amount": new_tx.amount,
            "currency": new_tx.currency,
            "remittance_information": new_tx.remittance_information,
            "category": new_tx.category,
            "creditor_name": new_tx.creditor_name,
            "debtor_name": new_tx.debtor_name
        },
        "document": {
            "id": db_doc.id,
            "title": db_doc.title,
            "filename": db_doc.file_name,
            "file_url": db_doc.file_url,
            "file_size": db_doc.file_size
        }
    }


# --- Serve Frontend Production Build (Single Combined FastAPI server) ---
FRONTEND_DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))

if os.path.exists(FRONTEND_DIST_DIR):
    assets_dir = os.path.join(FRONTEND_DIST_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't intercept API or uploads routes
        if full_path.startswith("api/") or full_path.startswith("uploads/"):
            raise HTTPException(status_code=404, detail="Not Found")
        
        file_path = os.path.join(FRONTEND_DIST_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST_DIR, "index.html"))


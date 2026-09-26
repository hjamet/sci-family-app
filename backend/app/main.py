import os
import json
import shutil
import uuid
import logging
import secrets
import string
from datetime import datetime, timedelta
from typing import List, Optional, Any, Dict
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from .database import engine, Base, get_db
from .models import (
    Property, User, Member, Issue, Comment, IssueComment, Reservation, Project,
    ProjectVote, ProjectComment, AdminDocument, MemberAvailability,
    VademecumItem, MaintenanceTask, StayTaskAssignment, Task, TaskComment, Log,
    BankAccount, BankTransaction, BankAuthSession, MemberSettings, ThermalSettings
)
from .schemas import (
    LoginRequest, PropertyResponse, UserResponse, TokenResponse,
    IssueCreate, IssueUpdate, IssueResponse,
    CommentCreate, CommentResponse, IssueCommentCreate, IssueCommentResponse,
    ReservationCreate, ReservationUpdate, ReservationResponse,
    ProjectCreate, ProjectReview, ProjectApprove, ProjectVoteCreate, ProjectVoteResponse, ProjectResponse, VoteEnum,
    ProjectCommentCreate, ProjectCommentResponse,
    AdminDocumentCreate, AdminDocumentResponse,
    ClassificationEnum, TaskWeightEnum,
    AvailabilitySet, AvailabilityBatchCreate, AvailabilityResponse, SmartMatchItem,
    VademecumItemCreate, VademecumItemUpdate, VademecumItemResponse,
    MaintenanceTaskCreate, MaintenanceTaskResponse, StayTaskAssignmentResponse, TaskCompletionSubmit,
    StatsResponse, UserWorkloadStats, WorkloadSummaryResponse,
    HeatingStatusResponse, HeatingModeRequest, HeatingTemperatureRequest,
    HeatingSettingsRequest, HeatingSettingsResponse, PoolSettingsRequest, PoolSettingsResponse,
    PiscineStatusResponse, StayBalanceResponse, StayBalanceMember,
    TaskCreate, TaskUpdate, TaskResponse, TaskCommentCreate, TaskCommentResponse, TaskCommentReactRequest, TaskCloseRequest,
    ALLOWED_REACTION_EMOJIS,
    BankAuthStartRequest, BankAuthStartResponse, BankAuthCallbackRequest,
    BankAccountResponse, BankTransactionResponse, BankSyncResponse, BankStatusResponse,
    ProfileUpdateRequest, ChangePasswordRequest, MemberSettingsResponse, MemberSettingsUpdate,
    VoteSubmissionRequest, ForgotPasswordRequest
)
from .seed import seed_database
from .services.workload_balancer import calculate_workload_distribution
from .services.vicare_service import ViCareService
from .services.banking import enable_banking_service
from .security import (
    rate_limiter, verify_password, hash_password, create_access_token, decode_access_token, normalize_prenom, pwd_context
)
from .services.email_service import (
    send_email,
    send_task_assigned_email,
    send_vote_required_email,
    send_vote_closed_email,
    send_stay_booked_email,
    send_thermal_change_email,
    send_password_reset_email,
    notify_coordinator_new_issue,
    notify_all_members_project_vote
)
from .migrate_notifications import migrate_engine
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger("sci_api")


# Create DB tables
Base.metadata.create_all(bind=engine)

# Ensure seed data on startup
with next(get_db()) as db:
    seed_database(db)

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
)

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

# Automatic column migration safeguard for Project table in SQLite
def run_project_migrations():
    if engine.dialect.name != "sqlite":
        return
    from sqlalchemy import text
    with engine.connect() as conn:
        inspector_query = text("PRAGMA table_info(projects)")
        result = conn.execute(inspector_query).fetchall()
        column_names = [row[1] for row in result]
        if column_names:
            if "document_urls" not in column_names:
                conn.execute(text("ALTER TABLE projects ADD COLUMN document_urls TEXT"))
            if "task_weight" not in column_names:
                conn.execute(text("ALTER TABLE projects ADD COLUMN task_weight VARCHAR DEFAULT 'MOYEN'"))
            conn.commit()

def run_task_migrations():
    if engine.dialect.name != "sqlite":
        return
    from sqlalchemy import text
    with engine.connect() as conn:
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

try:
    run_project_migrations()
    run_task_migrations()
    migrate_engine(engine)
except Exception as e:
    print(f"Migration notice: {e}")


# --- Helper functions ---

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
        "supplier_info": getattr(project, "supplier_info", None),
        "submitted_by": project.submitted_by,
        "responsible": project.responsible,
        "photo_url": project.photo_url,
        "photo_urls": urls_list,
        "status": project.status,
        "decision_mode": project.decision_mode,
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
        }
    }


# --- Auth & Users ---

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
        "avatar_color": user.avatar_color
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
        "notif_vote_needed": getattr(current_user, "notif_vote_needed", True),
        "notif_vote_closed": getattr(current_user, "notif_vote_closed", True),
        "notif_stay_booked": getattr(current_user, "notif_stay_booked", True),
        "notif_thermal_changes": getattr(current_user, "notif_thermal_changes", False),
        "notify_new_task": getattr(current_user, "notif_task_assigned", True),
        "notify_pending_vote": getattr(current_user, "notif_vote_needed", True),
        "notify_final_decision": getattr(current_user, "notif_vote_closed", True),
        "notify_new_stay": getattr(current_user, "notif_stay_booked", True),
        "notify_thermal_changes": getattr(current_user, "notif_thermal_changes", False),
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

    if data.notif_vote_needed is not None:
        current_user.notif_vote_needed = data.notif_vote_needed
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

    if data.notif_thermal_changes is not None:
        current_user.notif_thermal_changes = data.notif_thermal_changes
    elif data.notify_thermal_changes is not None:
        current_user.notif_thermal_changes = data.notify_thermal_changes

    db.commit()
    db.refresh(current_user)

    return {
        "id": current_user.id,
        "member_id": current_user.id,
        "prenom": current_user.prenom,
        "name": current_user.name,
        "email": current_user.email,
        "notif_task_assigned": getattr(current_user, "notif_task_assigned", True),
        "notif_vote_needed": getattr(current_user, "notif_vote_needed", True),
        "notif_vote_closed": getattr(current_user, "notif_vote_closed", True),
        "notif_stay_booked": getattr(current_user, "notif_stay_booked", True),
        "notif_thermal_changes": getattr(current_user, "notif_thermal_changes", False),
        "notify_new_task": getattr(current_user, "notif_task_assigned", True),
        "notify_pending_vote": getattr(current_user, "notif_vote_needed", True),
        "notify_final_decision": getattr(current_user, "notif_vote_closed", True),
        "notify_new_stay": getattr(current_user, "notif_stay_booked", True),
        "notify_thermal_changes": getattr(current_user, "notif_thermal_changes", False),
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
        "notif_vote_needed": getattr(member, "notif_vote_needed", True),
        "notif_vote_closed": getattr(member, "notif_vote_closed", True),
        "notif_stay_booked": getattr(member, "notif_stay_booked", True),
        "notif_thermal_changes": getattr(member, "notif_thermal_changes", False),
        "notify_new_task": getattr(member, "notif_task_assigned", True),
        "notify_pending_vote": getattr(member, "notif_vote_needed", True),
        "notify_final_decision": getattr(member, "notif_vote_closed", True),
        "notify_new_stay": getattr(member, "notif_stay_booked", True),
        "notify_thermal_changes": getattr(member, "notif_thermal_changes", False),
    }

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

    if data.notif_vote_needed is not None:
        member.notif_vote_needed = data.notif_vote_needed
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

    if data.notif_thermal_changes is not None:
        member.notif_thermal_changes = data.notif_thermal_changes
    elif data.notify_thermal_changes is not None:
        member.notif_thermal_changes = data.notify_thermal_changes

    db.commit()
    db.refresh(member)
    return {
        "id": member.id,
        "member_id": member.id,
        "prenom": member.prenom,
        "name": member.name,
        "email": member.email,
        "notif_task_assigned": getattr(member, "notif_task_assigned", True),
        "notif_vote_needed": getattr(member, "notif_vote_needed", True),
        "notif_vote_closed": getattr(member, "notif_vote_closed", True),
        "notif_stay_booked": getattr(member, "notif_stay_booked", True),
        "notif_thermal_changes": getattr(member, "notif_thermal_changes", False),
        "notify_new_task": getattr(member, "notif_task_assigned", True),
        "notify_pending_vote": getattr(member, "notif_vote_needed", True),
        "notify_final_decision": getattr(member, "notif_vote_closed", True),
        "notify_new_stay": getattr(member, "notif_stay_booked", True),
        "notify_thermal_changes": getattr(member, "notif_thermal_changes", False),
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

@app.get("/api/users", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()

ALL_SCI_ROOMS = [
    # Le Presbytère (5 chambres)
    {"id": "presbytere_1", "name": "Suite parentale Presbytère", "property": "Le Presbytère", "property_id": 2},
    {"id": "presbytere_2", "name": "Chambre Henri Presbytère", "property": "Le Presbytère", "property_id": 2},
    {"id": "presbytere_3", "name": "Chambre Hortense Presbytère", "property": "Le Presbytère", "property_id": 2},
    {"id": "presbytere_4", "name": "Chambre Joséphine Presbytère", "property": "Le Presbytère", "property_id": 2},
    {"id": "presbytere_5", "name": "Chambre Eugénie et Alexandre Presbytère", "property": "Le Presbytère", "property_id": 2},
    # Villa Rosing (2 chambres)
    {"id": "rosing_1", "name": "Chambre Marguerite Rosings", "property": "Villa Rosing", "property_id": 1},
    {"id": "rosing_2", "name": "Chambre Hortense Rosings", "property": "Villa Rosing", "property_id": 1},
]

@app.get("/api/properties", response_model=List[PropertyResponse])
def get_properties(db: Session = Depends(get_db)):
    return db.query(Property).all()

@app.get("/api/rooms")
def get_rooms():
    """Returns the exact 7 rooms across Le Presbytère (5) and Villa Rosing (2)."""
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
def add_comment(issue_id: int, comment: CommentCreate, db: Session = Depends(get_db)):
    db_issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not db_issue:
        raise HTTPException(status_code=404, detail="Problème non trouvé")

    db_comment = Comment(
        issue_id=issue_id,
        author_name=comment.author_name,
        content=comment.content
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    return db_comment

@app.post("/api/issues/{issue_id}/issue-comments", response_model=IssueCommentResponse, status_code=status.HTTP_201_CREATED)
def add_issue_comment(issue_id: int, comment: IssueCommentCreate, db: Session = Depends(get_db)):
    db_issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not db_issue:
        raise HTTPException(status_code=404, detail="Problème non trouvé")

    db_comment = IssueComment(
        issue_id=issue_id,
        author_id=comment.author_id,
        author_name=comment.author_name,
        comment_text=comment.comment_text,
        is_vote_comment=comment.is_vote_comment or False
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
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
    query = db.query(Reservation)
    if property_id:
        query = query.filter(Reservation.property_id == property_id)
    if year:
        query = query.filter(Reservation.year == year)
    if status_filter and status_filter != "Tous":
        query = query.filter(Reservation.status == status_filter)

    return query.order_by(Reservation.year.asc(), Reservation.week_number.asc()).all()

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


@app.post("/api/reservations", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
def create_reservation(res: ReservationCreate, db: Session = Depends(get_db)):
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

    # Overlap validation rule: Prevent booking overlapping dates with an existing stay,
    # UNLESS BOTH the existing stay and the new booking accept extra family guests.
    # Exclude cancelled/rejected reservations and isolate strictly by property_id.
    query = db.query(Reservation).filter(
        ~Reservation.status.in_(CANCELLED_RESERVATION_STATUSES)
    )
    if target_prop_id == 1:
        query = query.filter((Reservation.property_id == 1) | (Reservation.property_id == None))
    else:
        query = query.filter(Reservation.property_id == target_prop_id)

    existing_stays = query.all()

    for stay in existing_stays:
        if stay.status and stay.status in CANCELLED_RESERVATION_STATUSES:
            continue
        stay_prop_id = stay.property_id or 1
        if stay_prop_id != target_prop_id:
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
            existing_accepts = stay.accepts_extra_family if stay.accepts_extra_family is not None else True
            new_accepts = res.accepts_extra_family if res.accepts_extra_family is not None else True

            # If EITHER stay refuses extra family cohabitation, the booking is rejected
            if not existing_accepts or not new_accepts:
                detail_msg = (
                    f"Conflit de dates : La période du {norm_start_date} au {norm_end_date} chevauche le séjour "
                    f"de {stay.user_name} (du {stay.start_date} au {stay.end_date}). La cohabitation n'est pas autorisée "
                    f"car l'un des séjours refuse la présence d'autres familles."
                )
                raise HTTPException(
                    status_code=400,
                    detail=detail_msg
                )

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
        accepts_extra_family=res.accepts_extra_family if res.accepts_extra_family is not None else True,
        status="Confirmée",  # All bookings directly confirmed!
        notes=res.notes
    )
    db.add(db_res)
    db.commit()
    db.refresh(db_res)

    # Email Trigger 4: Notify other family members if notif_stay_booked is True
    try:
        booker_name = db_res.user_name or "Un associé"
        booker_first = booker_name.strip().split()[0].lower()
        other_members = db.query(Member).filter(Member.email.isnot(None)).all()
        stay_recipients = [
            m.email for m in other_members
            if getattr(m, 'notif_stay_booked', True) and m.email and m.prenom.strip().lower() != booker_first
        ]
        if stay_recipients:
            send_stay_booked_email(
                to_email=stay_recipients,
                member_name=booker_name,
                start_date=db_res.start_date,
                end_date=db_res.end_date,
                property_name=db_res.property_name or prop_name or "Domaine d'Hellenvilliers",
                rooms=db_res.selected_rooms,
                guest_count=db_res.guest_count or 1,
                reservation_id=db_res.id,
                notes=db_res.notes
            )
    except Exception as e:
        logger.error(f"[EMAIL ERROR] Failed to send stay booked notification: {e}")

    return db_res

@app.patch("/api/reservations/{reservation_id}", response_model=ReservationResponse)
@app.put("/api/reservations/{reservation_id}", response_model=ReservationResponse)
def update_reservation(reservation_id: int, update: ReservationUpdate, db: Session = Depends(get_db)):
    db_res = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not db_res:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

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
    new_accepts = update.accepts_extra_family if update.accepts_extra_family is not None else db_res.accepts_extra_family

    # If updating dates, property, or accepts_extra_family, validate bilateral cohabitation overlap against other stays
    # Only perform overlap check if the stay itself is active (not cancelled or rejected)
    if new_status not in CANCELLED_RESERVATION_STATUSES:
        if (update.start_date is not None or update.end_date is not None or 
            update.accepts_extra_family is not None or update.property_id is not None or
            (update.status is not None and db_res.status in CANCELLED_RESERVATION_STATUSES)):
            
            query = db.query(Reservation).filter(
                Reservation.id != reservation_id,
                ~Reservation.status.in_(CANCELLED_RESERVATION_STATUSES)
            )
            if target_prop_id == 1:
                query = query.filter((Reservation.property_id == 1) | (Reservation.property_id == None))
            else:
                query = query.filter(Reservation.property_id == target_prop_id)

            other_stays = query.all()

            for stay in other_stays:
                if stay.status and stay.status in CANCELLED_RESERVATION_STATUSES:
                    continue
                stay_prop_id = stay.property_id or 1
                if stay_prop_id != target_prop_id:
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
                    existing_accepts = stay.accepts_extra_family if stay.accepts_extra_family is not None else True
                    if not existing_accepts or not new_accepts:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"Conflit de dates : La période du {norm_new_start} au {norm_new_end} chevauche le séjour "
                                f"de {stay.user_name} (du {stay.start_date} au {stay.end_date}). La cohabitation n'est pas autorisée "
                                f"car l'un des séjours refuse la présence d'autres familles."
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
    property_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db)
):
    query = db.query(Project)
    if property_id:
        query = query.filter(Project.property_id == property_id)
    if status_filter and status_filter != "Tous":
        query = query.filter(Project.status == status_filter)

    projects = query.order_by(Project.created_at.desc()).all()
    return [format_project_response(p) for p in projects]

@app.post("/api/projects", status_code=status.HTTP_201_CREATED)
def create_project(proj: ProjectCreate, db: Session = Depends(get_db)):
    photo_urls_str = ",".join(proj.photo_urls) if proj.photo_urls else None
    first_photo = proj.photo_url or (proj.photo_urls[0] if proj.photo_urls else None)
    doc_urls_str = json.dumps(proj.document_urls) if proj.document_urls else None

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
        supplier_info=proj.supplier_info,
        submitted_by=proj.submitted_by,
        responsible=proj.responsible,
        photo_url=first_photo,
        photo_urls=photo_urls_str,
        status="EN_VOTE" if proj.decision_mode == "SOUMETTRE_AU_VOTE" else "SOUMIS"
    )
    db.add(db_proj)
    db.commit()
    db.refresh(db_proj)

    # Email notification trigger: notify members with notif_vote_needed=True if project is open for voting
    if db_proj.status == "EN_VOTE":
        try:
            member_users = db.query(Member).filter(Member.email.isnot(None)).all()
            member_emails = [u.email for u in member_users if getattr(u, 'notif_vote_needed', True) and u.email]
            if member_emails:
                send_vote_required_email(
                    to_email=member_emails,
                    vote_title=db_proj.title,
                    submitted_by=db_proj.submitted_by or "Associé SCI",
                    description=db_proj.description or "",
                    estimated_cost=float(db_proj.estimated_cost or 0.0),
                    project_id=db_proj.id
                )
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send project vote notification on creation: {e}")

    return format_project_response(db_proj)

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

    # Email notification trigger: notify members with notif_vote_needed=True when project enters voting
    if db_proj.status == "EN_VOTE" and old_status != "EN_VOTE":
        try:
            member_users = db.query(Member).filter(Member.email.isnot(None)).all()
            member_emails = [u.email for u in member_users if getattr(u, 'notif_vote_needed', True) and u.email]
            if member_emails:
                send_vote_required_email(
                    to_email=member_emails,
                    vote_title=db_proj.title,
                    submitted_by=db_proj.submitted_by or "Associé SCI",
                    description=db_proj.description or "",
                    estimated_cost=float(db_proj.estimated_cost or 0.0),
                    project_id=db_proj.id
                )
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send project vote notification from approve: {e}")
            print(f"[EMAIL ERROR] Failed to send project vote notification from approve: {e}")

    return format_project_response(db_proj)

@app.patch("/api/projects/{project_id}/review")
def review_project(project_id: int, review: ProjectReview, db: Session = Depends(get_db)):
    db_proj = db.query(Project).filter(Project.id == project_id).first()
    if not db_proj:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    old_status = db_proj.status

    if review.status is not None:
        db_proj.status = review.status
    if review.decision_mode is not None:
        db_proj.decision_mode = review.decision_mode
        if review.decision_mode == "SOUMETTRE_AU_VOTE":
            db_proj.status = "EN_VOTE"
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
        db_proj.document_urls = json.dumps(review.document_urls)
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

    db_proj.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_proj)

    # Email notification trigger: notify members with notif_vote_needed=True when project enters voting
    if db_proj.status == "EN_VOTE" and (old_status != "EN_VOTE" or review.decision_mode == "SOUMETTRE_AU_VOTE"):
        try:
            member_users = db.query(Member).filter(Member.email.isnot(None)).all()
            member_emails = [u.email for u in member_users if getattr(u, 'notif_vote_needed', True) and u.email]
            if member_emails:
                send_vote_required_email(
                    to_email=member_emails,
                    vote_title=db_proj.title,
                    submitted_by=db_proj.submitted_by or "Associé SCI",
                    description=db_proj.description or "",
                    estimated_cost=float(db_proj.estimated_cost or 0.0),
                    project_id=db_proj.id
                )
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send project vote notification from review: {e}")
            print(f"[EMAIL ERROR] Failed to send project vote notification from review: {e}")

    return format_project_response(db_proj)


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

    if db_proj.status not in ["EN_VOTE", "SOUMIS"]:
        raise HTTPException(status_code=400, detail="Ce projet n'est pas ouvert au vote actuellement.")

    vote_str = vote_val.value.upper() if hasattr(vote_val, 'value') else str(vote_val).upper()
    valid_votes = ["OUI", "NON", "ABSTENTION", "REPORT_PROCHAINE_AG", "POUR", "CONTRE"]
    if vote_str not in valid_votes:
        raise HTTPException(status_code=400, detail=f"Le vote doit être l'un de : {', '.join(valid_votes)}.")

    # Single-Veto AG Rule: If vote is REPORT_PROCHAINE_AG, status updates to REPORT_AG and add_to_ag_agenda = True
    if vote_str == "REPORT_PROCHAINE_AG":
        db_proj.status = "REPORT_AG"
        db_proj.add_to_ag_agenda = True

    existing_vote = db.query(ProjectVote).filter(
        ProjectVote.project_id == project_id,
        ProjectVote.user_name == user_name
    ).first()

    if existing_vote:
        existing_vote.vote = vote_str
        existing_vote.comment = comment
        existing_vote.voted_at = datetime.utcnow()
    else:
        new_vote = ProjectVote(
            project_id=project_id,
            user_name=user_name,
            vote=vote_str,
            comment=comment
        )
        db.add(new_vote)

    db.commit()
    db.refresh(db_proj)

    # Check if ALL associates have voted (7 associates in SCI Familiale)
    all_project_votes = db.query(ProjectVote).filter(ProjectVote.project_id == project_id).all()
    distinct_voters = {v.user_name.strip().lower() for v in all_project_votes if v.user_name}
    total_associates = db.query(Member).count() or 7

    # If all members have expressed their vote, finalize decision and trigger final email
    if len(distinct_voters) >= total_associates and db_proj.status in ["EN_VOTE", "SOUMIS", "REPORT_AG"]:
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
        elif votes_summary["pour"] > votes_summary["contre"]:
            db_proj.status = "APPROUVE"
            decision = "ADOPTÉ"
        else:
            db_proj.status = "REFUSE"
            decision = "REJETÉ"

        db_proj.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_proj)

        # Email Trigger 3: Send final decision email if notif_vote_closed is True
        try:
            members_to_notify = db.query(Member).filter(Member.email.isnot(None)).all()
            closed_recipients = [
                m.email for m in members_to_notify
                if getattr(m, 'notif_vote_closed', True) and m.email
            ]
            if closed_recipients:
                send_vote_closed_email(
                    to_email=closed_recipients,
                    vote_title=db_proj.title,
                    decision=decision,
                    votes_summary=votes_summary,
                    total_votes=len(all_project_votes),
                    project_id=db_proj.id,
                    estimated_cost=float(db_proj.estimated_cost or 0.0)
                )
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send vote closed notification: {e}")

    return format_project_response(db_proj)


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

@app.post("/api/projects/{project_id}/comments", response_model=ProjectCommentResponse, status_code=status.HTTP_201_CREATED)
def add_project_comment(project_id: int, comment: ProjectCommentCreate, db: Session = Depends(get_db)):
    db_proj = db.query(Project).filter(Project.id == project_id).first()
    if not db_proj:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    db_comment = ProjectComment(
        project_id=project_id,
        author_name=comment.author_name,
        content=comment.content
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    return db_comment

@app.delete("/api/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    db_proj = db.query(Project).filter(Project.id == project_id).first()
    if not db_proj:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

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
    completed_steps = sum(1 for step in checklist if isinstance(step, dict) and step.get("completed")) if total_steps > 0 else 0
    if total_steps > 0:
        pct = round((completed_steps / total_steps) * 100)
    else:
        st = str(task.status or "").upper()
        if st in ["TERMINE", "ARCHIVEE"]:
            pct = 100
        elif st in ["EN_COURS"]:
            pct = 50
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

    completion_docs = []
    if task.completion_docs:
        try:
            completion_docs = json.loads(task.completion_docs) if isinstance(task.completion_docs, str) else task.completion_docs
        except Exception:
            completion_docs = [task.completion_docs]

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
        "complexity": task.complexity,
        "budget": task.budget,
        "budget_notes": task.budget_notes,
        "assignee_id": task.assignee_id,
        "assigned_members": assigned_members,
        "deadline": task.deadline,
        "checklist": checklist,
        "documents": documents,
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
    if str(task_id).isdigit():
        task = db.query(Task).filter(Task.id == int(task_id)).first()
    if not task:
        task = db.query(Task).filter(Task.ref == str(task_id)).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Tâche '{task_id}' non trouvée.")
    return task


@app.get("/api/tasks")
def list_tasks(
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
            query = query.filter(Task.subject.in_(["Rosing", "Piscine", "Jardin", "SCI"]))
        elif property_id == 2:
            query = query.filter(Task.subject.in_(["Presbytère", "Jardin", "SCI"]))
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

    tasks = query.order_by(Task.id.asc()).all()
    return [format_task_response(t) for t in tasks]


@app.post("/api/tasks", status_code=status.HTTP_201_CREATED)
def create_task(payload: dict, db: Session = Depends(get_db)):
    title = payload.get("title")
    if not title:
        raise HTTPException(status_code=400, detail="Titre de la tâche obligatoire")

    description = payload.get("description", "")
    subject = payload.get("subject", "SCI")
    category = payload.get("category", "Général")
    priority = payload.get("priority", "Normale")
    task_status = payload.get("status", "EN_COURS")
    complexity = payload.get("complexity", "Modérée")
    budget = float(payload.get("budget", 0.0) or 0.0)
    budget_notes = payload.get("budget_notes")
    assignee_id = payload.get("assignee_id")
    assigned_members = payload.get("assigned_members")
    deadline = payload.get("deadline")
    checklist = payload.get("checklist")
    documents = payload.get("documents")
    created_by = payload.get("created_by", "Henri")

    if isinstance(assigned_members, list):
        assigned_members = json.dumps(assigned_members)
    elif assigned_members is None:
        assigned_members = json.dumps([])

    if isinstance(checklist, list):
        checklist = json.dumps(checklist)
    elif checklist is None:
        checklist = json.dumps([])

    if isinstance(documents, list):
        documents = json.dumps(documents)
    elif documents is None:
        documents = json.dumps([])

    ref = payload.get("ref")
    if not ref:
        count = db.query(Task).count()
        ref = f"T-2026-{100 + count:03d}"

    db_task = Task(
        ref=ref,
        title=title,
        description=description,
        subject=subject,
        category=category,
        priority=priority,
        status=task_status,
        complexity=complexity,
        budget=budget,
        budget_notes=budget_notes,
        assignee_id=assignee_id,
        assigned_members=assigned_members,
        deadline=deadline,
        checklist=checklist,
        documents=documents,
        created_by=created_by
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)

    # Email Trigger 1: Notify assignee if notif_task_assigned is True
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
            send_task_assigned_email(
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
    except Exception as e:
        logger.error(f"[EMAIL ERROR] Failed to send task assignment notification: {e}")

    return format_task_response(db_task, include_comments=True)


@app.get("/api/tasks/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db)):
    task = resolve_task_by_id_or_ref(task_id, db)
    return format_task_response(task, include_comments=True)


@app.patch("/api/tasks/{task_id}")
@app.put("/api/tasks/{task_id}")
def update_task(task_id: str, payload: dict, db: Session = Depends(get_db)):
    task = resolve_task_by_id_or_ref(task_id, db)
    old_assignee_id = task.assignee_id

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
        task.status = payload["status"]
    if "complexity" in payload and payload["complexity"] is not None:
        task.complexity = payload["complexity"]
    if "budget" in payload and payload["budget"] is not None:
        task.budget = float(payload["budget"])
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
    if "documents" in payload and payload["documents"] is not None:
        val = payload["documents"]
        task.documents = json.dumps(val) if isinstance(val, list) else str(val)
    if "completion_notes" in payload and payload["completion_notes"] is not None:
        task.completion_notes = payload["completion_notes"]
    if "completion_docs" in payload and payload["completion_docs"] is not None:
        val = payload["completion_docs"]
        task.completion_docs = json.dumps(val) if isinstance(val, list) else str(val)

    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)

    # Email Trigger 1 (Reassignment): If newly assigned to a member, notify if notif_task_assigned is True
    if "assignee_id" in payload and payload["assignee_id"] and payload["assignee_id"] != old_assignee_id:
        try:
            assignee = db.query(Member).filter(Member.id == payload["assignee_id"]).first()
            if assignee and assignee.email and getattr(assignee, 'notif_task_assigned', True):
                send_task_assigned_email(
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
        except Exception as e:
            logger.error(f"[EMAIL ERROR] Failed to send task assignment notification on update: {e}")

    return format_task_response(task, include_comments=True)


@app.delete("/api/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: str, db: Session = Depends(get_db)):
    task = resolve_task_by_id_or_ref(task_id, db)
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


@app.get("/api/tasks/{task_id}/comments")
def get_task_comments(task_id: str, db: Session = Depends(get_db)):
    task = resolve_task_by_id_or_ref(task_id, db)
    comments = db.query(TaskComment).filter(TaskComment.task_id == task.id).order_by(TaskComment.created_at.asc()).all()
    return [format_comment_response(c) for c in comments]


@app.post("/api/tasks/{task_id}/comments", status_code=status.HTTP_201_CREATED)
def create_task_comment(task_id: str, req: TaskCommentCreate, db: Session = Depends(get_db)):
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
    return format_comment_response(db_comment)


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

@app.post("/api/tasks/upload-documents")
async def upload_task_documents(files: List[UploadFile] = File(...)):
    uploaded_urls = []
    for file in files:
        clean_name = os.path.basename(file.filename) if file.filename else "document"
        filename = f"{uuid.uuid4().hex}_{clean_name}"
        filepath = os.path.join(DOCUMENTS_DIR, filename)

        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        uploaded_urls.append(f"/uploads/documents/{filename}")

    return {"document_urls": uploaded_urls}

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

@app.get("/api/admin-documents")
def list_admin_documents(
    category: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(AdminDocument)
    if category and category != "Toutes":
        query = query.filter(AdminDocument.category == category)
    if source_type:
        query = query.filter(AdminDocument.source_type == source_type)

    db_docs = query.order_by(AdminDocument.created_at.desc()).all()

    results = []
    seen_urls = set()

    for doc in db_docs:
        seen_urls.add(doc.file_url)
        results.append({
            "id": doc.id,
            "title": doc.title,
            "category": doc.category,
            "file_url": doc.file_url,
            "file_name": doc.file_name,
            "file_type": doc.file_type,
            "file_size": doc.file_size,
            "source_type": doc.source_type,
            "source_id": doc.source_id,
            "uploaded_by": doc.uploaded_by,
            "notes": doc.notes,
            "created_at": doc.created_at,
            "name": doc.title,
            "filename": doc.file_name or os.path.basename(doc.file_url),
            "url": doc.file_url,
            "type": doc.file_type or "PDF",
            "size": f"{doc.file_size or 0} B",
            "upload_date": doc.created_at.strftime("%d/%m/%Y") if doc.created_at else "",
            "source": doc.category
        })

    if os.path.exists(DOCUMENTS_DIR):
        for fname in os.listdir(DOCUMENTS_DIR):
            fpath = os.path.join(DOCUMENTS_DIR, fname)
            if os.path.isfile(fpath):
                url = f"/uploads/documents/{fname}"
                if url not in seen_urls:
                    stat = os.stat(fpath)
                    ext = os.path.splitext(fname)[1].lstrip(".").upper() or "FILE"
                    mtime = datetime.fromtimestamp(stat.st_mtime)
                    display_name = fname.split("_", 1)[-1] if "_" in fname else fname
                    results.append({
                        "id": fname,
                        "title": display_name,
                        "category": "Documents de Fin de Tâche / Réparation",
                        "file_url": url,
                        "file_name": fname,
                        "file_type": ext,
                        "file_size": stat.st_size,
                        "source_type": "FILE",
                        "source_id": None,
                        "uploaded_by": "Système",
                        "notes": "Fichier stocké dans /uploads/documents/",
                        "created_at": mtime,
                        "name": display_name,
                        "filename": fname,
                        "url": url,
                        "type": ext,
                        "size": f"{round(stat.st_size / 1024, 1)} KB",
                        "upload_date": mtime.strftime("%d/%m/%Y"),
                        "source": "Fin de Tâche / Réparation"
                    })

    return results

@app.post("/api/admin-documents", response_model=AdminDocumentResponse, status_code=status.HTTP_201_CREATED)
def create_admin_document(doc: AdminDocumentCreate, db: Session = Depends(get_db)):
    db_doc = AdminDocument(
        title=doc.title,
        category=doc.category or "Documents de Fin de Tâche / Réparation",
        file_url=doc.file_url,
        file_name=doc.file_name or os.path.basename(doc.file_url),
        file_type=doc.file_type or "application/pdf",
        file_size=doc.file_size or 0,
        source_type=doc.source_type or "MANUAL",
        source_id=doc.source_id,
        uploaded_by=doc.uploaded_by or "Henri",
        notes=doc.notes
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc

@app.delete("/api/admin-documents/{doc_id}")
def delete_admin_document(doc_id: str, db: Session = Depends(get_db)):
    doc = None
    if doc_id.isdigit():
        doc = db.query(AdminDocument).filter(AdminDocument.id == int(doc_id)).first()

    if doc:
        if doc.file_url and doc.file_url.startswith("/uploads/documents/"):
            fname = os.path.basename(doc.file_url)
            fpath = os.path.join(DOCUMENTS_DIR, fname)
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except Exception:
                    pass
        db.delete(doc)
        db.commit()
        return {"message": f"Document {doc_id} supprimé avec succès."}

    fpath = os.path.join(DOCUMENTS_DIR, doc_id)
    if os.path.exists(fpath):
        try:
            os.remove(fpath)
        except Exception:
            pass
        return {"message": f"Fichier {doc_id} supprimé avec succès."}

    raise HTTPException(status_code=404, detail="Document non trouvé.")

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

    dist = calculate_workload_distribution(reservations, total_charge_points=total_charge_points)

    user_stats = [
        UserWorkloadStats(
            user_name=stat["user_name"],
            total_days=stat["total_days"],
            occupation_score=stat["occupation_score"],
            target_charge_points=stat["target_charge_points"],
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
def get_heating_status(property_id: Optional[int] = Query(None)):
    return ViCareService.get_status(property_id=property_id)

@app.post("/api/vicare/mode", response_model=HeatingStatusResponse)
@app.post("/api/heating/mode", response_model=HeatingStatusResponse)
@app.post("/api/heating/vicare/mode", response_model=HeatingStatusResponse)
def set_heating_mode(req: HeatingModeRequest):
    return ViCareService.set_mode(req.mode)

@app.post("/api/vicare/temperature", response_model=HeatingStatusResponse)
@app.post("/api/heating/temperature", response_model=HeatingStatusResponse)
@app.post("/api/heating/vicare/temperature", response_model=HeatingStatusResponse)
def set_heating_temperature(req: HeatingTemperatureRequest):
    return ViCareService.set_temperature(req.target_temperature)


# --- Piscine Rosing Telemetry Endpoints (PAC Rosing F08) ---

@app.get("/api/piscine/status", response_model=PiscineStatusResponse)
def get_piscine_status():
    """Returns PAC Rosing passive telemetry and Frédéric Jamet agreement status."""
    return PiscineStatusResponse()

@app.post("/api/piscine/mode")
@app.post("/api/piscine/temperature")
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

    # 1. Update or create row in thermal_settings
    setting = db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "heating").first()
    if not setting:
        setting = ThermalSettings(equipment_type="heating")
        db.add(setting)

    if req.target_temperature is not None:
        setting.target_temperature = req.target_temperature
    elif setting.target_temperature is None:
        setting.target_temperature = 19.0

    if req.mode is not None:
        setting.mode = req.mode
    elif setting.mode is None:
        setting.mode = "dhwAndHeating"

    setting.updated_by = author
    setting.updated_at = datetime.utcnow()
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

    if target_emails:
        try:
            send_thermal_change_email(
                target_emails=target_emails,
                author_name=author,
                equipment_type="Chauffage ViCare (Presbytère)",
                details=details
            )
        except Exception as email_err:
            logger.error(f"[HEATING SETTINGS] Erreur lors de l'envoi d'e-mail: {email_err}")

    return HeatingSettingsResponse(
        target_temperature=setting.target_temperature,
        mode=setting.mode,
        updated_by=setting.updated_by,
        updated_at=setting.updated_at,
        message=f"Consigne de chauffage enregistrée ({temp_str}) et notification transmise aux associés abonnés.",
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

    if target_emails:
        try:
            send_thermal_change_email(
                target_emails=target_emails,
                author_name=author,
                equipment_type="Piscine Klereo (Villa Rosing)",
                details=details
            )
        except Exception as email_err:
            logger.error(f"[POOL SETTINGS] Erreur lors de l'envoi d'e-mail: {email_err}")

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
def get_banking_status(db: Session = Depends(get_db)):
    """Retourne l'état réactif de l'intégration Open Banking DSP2 et les soldes consolidés de la SCI."""
    status_data = enable_banking_service.check_connection_status(db=db)

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
        needs_reauth=status_data.get("needs_reauth", False),
        days_left=status_data.get("days_left"),
        valid_until=status_data.get("valid_until"),
        message=status_data.get("message"),
        reauth_url=status_data.get("reauth_url")
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
    if error:
        logger.warning(f"Retour d'erreur lors du consentement bancaire : {error}")
        return RedirectResponse(url=f"/admin?banking=error&msg={error}")

    if not code:
        raise HTTPException(status_code=400, detail="Code d'autorisation manquant dans le callback bancaire")

    try:
        session_info = enable_banking_service.authorize_session(code=code)
        session_id = session_info.get("session_id")

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
            db_sess.accounts_data = json.dumps(session_info.get("accounts", []))
            db.commit()

        # Synchronisation immédiate des soldes et transactions
        enable_banking_service.sync_database(db=db, session_id=session_id)

        return RedirectResponse(url="/admin?banking=success")
    except Exception as e:
        logger.error(f"Échec finalisation callback bancaire : {e}")
        return RedirectResponse(url=f"/admin?banking=error&msg={str(e)}")


@app.post("/api/banking/callback", tags=["Banking"])
def banking_callback_post(payload: BankAuthCallbackRequest, db: Session = Depends(get_db)):
    """Validation programmatique du code d'autorisation."""
    try:
        session_info = enable_banking_service.authorize_session(code=payload.code)
        sync_result = enable_banking_service.sync_database(db=db, session_id=payload.session_id)
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
        return BankSyncResponse(
            success=result.get("success", True),
            accounts_synced=result.get("accounts_synced", 0),
            transactions_synced=result.get("transactions_synced", 0),
            timestamp=result.get("timestamp", datetime.utcnow().isoformat())
        )
    except Exception as e:
        logger.error(f"Erreur synchronisation bancaire : {e}")
        raise HTTPException(status_code=500, detail=f"Échec de la synchronisation : {str(e)}")


# --- Serve Frontend Production Build (Single Combined FastAPI server) ---
FRONTEND_DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))

if os.path.exists(FRONTEND_DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't intercept API or uploads routes
        if full_path.startswith("api/") or full_path.startswith("uploads/"):
            raise HTTPException(status_code=404, detail="Not Found")
        
        file_path = os.path.join(FRONTEND_DIST_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST_DIR, "index.html"))


import os
import json
import shutil
import uuid
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import func

from .database import engine, Base, get_db
from .models import Property, User, Issue, Comment, IssueComment, Reservation, Project, ProjectVote, ProjectComment, AdminDocument, MemberAvailability, VademecumItem, MaintenanceTask, StayTaskAssignment
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
    HeatingStatusResponse, HeatingModeRequest, HeatingTemperatureRequest
)
from .seed import seed_database
from .services.workload_balancer import calculate_workload_distribution
from .services.vicare_service import ViCareService
from .security import (
    rate_limiter, verify_password, create_access_token, decode_access_token, normalize_prenom
)
from dotenv import load_dotenv
load_dotenv()


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

# Static Uploads directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
DOCUMENTS_DIR = os.path.join(UPLOAD_DIR, "documents")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DOCUMENTS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Automatic column migration safeguard for Project table in SQLite
def run_project_migrations():
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

    prenom = payload.get("sub")
    user = db.query(User).filter(func.lower(User.prenom) == prenom.lower()).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="[Auth Error] Utilisateur non trouvé pour ce jeton."
        )

    return user


@app.post("/api/auth/login", response_model=TokenResponse)
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = rate_limiter.get_client_ip(request)

    # 1. Anti-Brute Force Rate Limiter check (5 failed attempts -> 15 min lock)
    rate_limiter.check_login_rate_limit(ip)

    prenom_clean = req.prenom.strip() if req.prenom else ""
    password_clean = req.password.strip() if req.password else ""

    if not prenom_clean:
        rate_limiter.record_login_failure(ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="[Auth Error] Le prénom d'utilisateur ne peut pas être vide."
        )

    # 2. Case-insensitive & accent-insensitive prenom lookup
    input_norm = normalize_prenom(prenom_clean)
    
    # Direct DB query with func.lower(User.prenom) == prenom.strip().lower()
    user = db.query(User).filter(func.lower(User.prenom) == prenom_clean.lower()).first()

    if not user:
        # Fallback loop using accent-insensitivity (normalize_prenom)
        all_users = db.query(User).all()
        for u in all_users:
            u_norm = normalize_prenom(u.prenom)
            if u_norm == input_norm:
                user = u
                break
            if input_norm in ["elisabeth", "maman"] and u_norm in ["elisabeth", "maman"]:
                user = u
                break

    if not user:
        rate_limiter.record_login_failure(ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"[Auth Error] Prénom '{prenom_clean}' inconnu. Prénoms valides des 7 membres SCI : Henri, Marguerite, Hortense, Joséphine, Eugénie, Frédéric, Maman."
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

@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Returns profile info for currently logged in user."""
    return current_user

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

@app.post("/api/reservations", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
def create_reservation(res: ReservationCreate, db: Session = Depends(get_db)):
    prop_name = res.property_name
    if not prop_name and res.properties:
        prop_name = " & ".join(res.properties)
    if not prop_name and res.property_id:
        prop = db.query(Property).filter(Property.id == res.property_id).first()
        if prop:
            prop_name = prop.name

    # Overlap validation rule: Prevent booking overlapping dates with an existing stay,
    # UNLESS the existing stay has accepts_extra_family = true OR the new booking accepts extra family guests.
    existing_stays = db.query(Reservation).all()

    for stay in existing_stays:
        if res.start_date < stay.end_date and res.end_date > stay.start_date:
            existing_accepts = stay.accepts_extra_family if stay.accepts_extra_family is not None else True
            new_accepts = res.accepts_extra_family if res.accepts_extra_family is not None else True

            if not existing_accepts and not new_accepts:
                raise HTTPException(
                    status_code=400,
                    detail=f"Conflit de dates : La période du {res.start_date} au {res.end_date} chevauche le séjour de {stay.user_name} (du {stay.start_date} au {stay.end_date}) qui n'accepte pas de famille supplémentaire."
                )

    sel_rooms_str = json.dumps(res.selected_rooms) if res.selected_rooms else None
    cnt = res.rooms_count or (len(res.selected_rooms) if res.selected_rooms else res.chambers_used or 1)

    db_res = Reservation(
        property_id=res.property_id or 1,
        property_name=prop_name,
        user_name=res.user_name,
        year=res.year,
        week_number=res.week_number,
        start_date=res.start_date,
        end_date=res.end_date,
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
    return db_res

@app.patch("/api/reservations/{reservation_id}", response_model=ReservationResponse)
def update_reservation(reservation_id: int, update: ReservationUpdate, db: Session = Depends(get_db)):
    db_res = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not db_res:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    if update.status is not None:
        db_res.status = update.status
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
        status="SOUMIS"
    )
    db.add(db_proj)
    db.commit()
    db.refresh(db_proj)
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
    if approval.responsible:
        db_proj.responsible = approval.responsible

    db_proj.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_proj)
    return format_project_response(db_proj)

@app.patch("/api/projects/{project_id}/review")
def review_project(project_id: int, review: ProjectReview, db: Session = Depends(get_db)):
    db_proj = db.query(Project).filter(Project.id == project_id).first()
    if not db_proj:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

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


@app.post("/api/projects/{project_id}/vote")
def cast_vote(project_id: int, vote_in: ProjectVoteCreate, db: Session = Depends(get_db)):
    db_proj = db.query(Project).filter(Project.id == project_id).first()
    if not db_proj:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    if db_proj.status not in ["EN_VOTE", "SOUMIS"]:
        raise HTTPException(status_code=400, detail="Ce projet n'est pas ouvert au vote actuellement.")

    vote_str = vote_in.vote.value.upper() if hasattr(vote_in.vote, 'value') else str(vote_in.vote).upper()
    valid_votes = ["OUI", "NON", "ABSTENTION", "REPORT_PROCHAINE_AG", "POUR", "CONTRE"]
    if vote_str not in valid_votes:
        raise HTTPException(status_code=400, detail=f"Le vote doit être l'un de : {', '.join(valid_votes)}.")

    # Single-Veto AG Rule: If vote is REPORT_PROCHAINE_AG, status updates to REPORT_AG and add_to_ag_agenda = True
    if vote_str == "REPORT_PROCHAINE_AG":
        db_proj.status = "REPORT_AG"
        db_proj.add_to_ag_agenda = True

    existing_vote = db.query(ProjectVote).filter(
        ProjectVote.project_id == project_id,
        ProjectVote.user_name == vote_in.user_name
    ).first()

    if existing_vote:
        existing_vote.vote = vote_str
        existing_vote.comment = vote_in.comment
        existing_vote.voted_at = datetime.utcnow()
    else:
        new_vote = ProjectVote(
            project_id=project_id,
            user_name=vote_in.user_name,
            vote=vote_str,
            comment=vote_in.comment
        )
        db.add(new_vote)

    db.commit()
    db.refresh(db_proj)
    return format_project_response(db_proj)


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


# --- Maintenance Tasks & Automatic Task Attribution Endpoints ---

@app.get("/api/tasks")
def list_tasks(
    user_name: Optional[str] = Query(None),
    property_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Returns tasks per member or property templates so tasks view is never empty.
    """
    query = db.query(StayTaskAssignment)
    if user_name:
        norm_user = normalize_prenom(user_name)
        user_res_ids = [r.id for r in db.query(Reservation).all() if normalize_prenom(r.user_name) == norm_user]
        query = query.filter(StayTaskAssignment.reservation_id.in_(user_res_ids))
    if property_id:
        prop_res_ids = [r.id for r in db.query(Reservation).filter(Reservation.property_id == property_id).all()]
        query = query.filter(StayTaskAssignment.reservation_id.in_(prop_res_ids))
    if category and category != "ALL" and category != "Toutes":
        query = query.filter(StayTaskAssignment.category == category)

    tasks = query.all()
    if not tasks:
        mt_query = db.query(MaintenanceTask)
        if property_id:
            mt_query = mt_query.filter(MaintenanceTask.property_id == property_id)
        if category and category != "ALL" and category != "Toutes":
            mt_query = mt_query.filter(MaintenanceTask.category == category)
        m_templates = mt_query.all()
        tasks = [
            {
                "id": 1000 + t.id,
                "reservation_id": None,
                "task_id": t.id,
                "title": t.title,
                "category": t.category or "Chaque séjour",
                "frequency": t.frequency or "Chaque séjour",
                "description": t.description or "",
                "completed": 0,
                "completed_at": None,
                "status": "A_FAIRE",
                "completion_notes": None,
                "completion_docs": None
            }
            for t in m_templates
        ]
    return tasks

@app.post("/api/tasks")
def create_custom_task(
    payload: dict,
    db: Session = Depends(get_db)
):
    """
    Creates and attributes a new task to a property template or active reservation.
    """
    title = payload.get("title")
    if not title:
        raise HTTPException(status_code=400, detail="Titre de la tâche obligatoire")
    
    category = payload.get("category", "Pendant le séjour")
    description = payload.get("description", "")
    frequency = payload.get("frequency", "Chaque séjour")
    property_id = payload.get("property_id", 1)
    assigned_user = payload.get("assigned_user")

    # 1. Create MaintenanceTask template
    m_task = MaintenanceTask(
        property_id=property_id,
        title=title,
        category=category,
        frequency=frequency,
        description=f"[Attribué à: {assigned_user}] {description}" if assigned_user else description
    )
    db.add(m_task)
    db.commit()
    db.refresh(m_task)

    # 2. If assigned_user or upcoming stay, attribute to reservation
    assigned_res = None
    if assigned_user:
        norm_user = normalize_prenom(assigned_user)
        all_res = db.query(Reservation).order_by(Reservation.start_date.asc()).all()
        assigned_res = next((r for r in all_res if normalize_prenom(r.user_name) == norm_user), None)
    
    if not assigned_res:
        assigned_res = db.query(Reservation).order_by(Reservation.start_date.desc()).first()

    assignment = None
    if assigned_res:
        assignment = StayTaskAssignment(
            reservation_id=assigned_res.id,
            task_id=m_task.id,
            title=m_task.title,
            category=m_task.category,
            frequency=m_task.frequency,
            description=m_task.description,
            completed=0,
            status="A_FAIRE"
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)

    return assignment or m_task

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


# --- Heating & ViCare System Endpoints ---

@app.get("/api/heating/status", response_model=HeatingStatusResponse)
@app.get("/api/heating/vicare/status", response_model=HeatingStatusResponse)
def get_heating_status(property_id: Optional[int] = Query(None)):
    return ViCareService.get_status(property_id=property_id)

@app.post("/api/heating/mode", response_model=HeatingStatusResponse)
@app.post("/api/heating/vicare/mode", response_model=HeatingStatusResponse)
def set_heating_mode(req: HeatingModeRequest):
    return ViCareService.set_mode(req.mode)

@app.post("/api/heating/temperature", response_model=HeatingStatusResponse)
@app.post("/api/heating/vicare/temperature", response_model=HeatingStatusResponse)
def set_heating_temperature(req: HeatingTemperatureRequest):
    return ViCareService.set_temperature(req.target_temperature)


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


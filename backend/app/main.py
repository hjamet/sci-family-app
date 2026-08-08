import os
import shutil
import uuid
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import func

from .database import engine, Base, get_db
from .models import Property, User, Issue, Comment, Reservation, Project, ProjectVote, MemberAvailability, VademecumItem, MaintenanceTask, StayTaskAssignment
from .schemas import (
    LoginRequest, PropertyResponse, UserResponse,
    IssueCreate, IssueUpdate, IssueResponse,
    CommentCreate, CommentResponse,
    ReservationCreate, ReservationUpdate, ReservationResponse,
    ProjectCreate, ProjectReview, ProjectVoteCreate, ProjectVoteResponse, ProjectResponse,
    AvailabilitySet, AvailabilityBatchCreate, AvailabilityResponse, SmartMatchItem,
    VademecumItemCreate, VademecumItemUpdate, VademecumItemResponse,
    MaintenanceTaskCreate, MaintenanceTaskResponse, StayTaskAssignmentResponse,
    StatsResponse
)
from .seed import seed_database

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

# Static Uploads directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


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
    pour = sum(1 for v in votes if v.vote == "POUR")
    contre = sum(1 for v in votes if v.vote == "CONTRE")
    abstention = sum(1 for v in votes if v.vote == "ABSTENTION")

    pour_pct = round((pour / total_votes * 100)) if total_votes > 0 else 0
    contre_pct = round((contre / total_votes * 100)) if total_votes > 0 else 0
    abstention_pct = round((abstention / total_votes * 100)) if total_votes > 0 else 0

    raw_photo_urls = getattr(project, "photo_urls", None)
    urls_list = []
    if raw_photo_urls:
        urls_list = [u.strip() for u in raw_photo_urls.split(",") if u.strip()]
    if not urls_list and project.photo_url:
        urls_list = [project.photo_url]

    return {
        "id": project.id,
        "property_id": project.property_id,
        "title": project.title,
        "description": project.description,
        "estimated_cost": project.estimated_cost,
        "category": project.category,
        "priority": getattr(project, "priority", "MOYENNE") or "MOYENNE",
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
        "vote_summary": {
            "total_votes": total_votes,
            "pour": pour,
            "contre": contre,
            "abstention": abstention,
            "pour_pct": pour_pct,
            "contre_pct": contre_pct,
            "abstention_pct": abstention_pct,
        }
    }


# --- Auth & Users ---

@app.post("/api/auth/login", response_model=UserResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(func.lower(User.prenom) == req.prenom.strip().lower()).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Utilisateur '{req.prenom}' inconnu. Utilisez le prénom d'un membre (ex: Henri, Marie, Pierre, Luc, Parents)."
        )
    
    if user.password != req.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mot de passe incorrect."
        )
    
    return user

@app.get("/api/users", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()

@app.get("/api/properties", response_model=List[PropertyResponse])
def get_properties(db: Session = Depends(get_db)):
    return db.query(Property).all()


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

    db_res = Reservation(
        property_id=res.property_id or 1,
        property_name=prop_name,
        user_name=res.user_name,
        year=res.year,
        week_number=res.week_number,
        start_date=res.start_date,
        end_date=res.end_date,
        guest_count=res.guest_count if res.guest_count is not None else 1,
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

    db_proj = Project(
        property_id=proj.property_id,
        title=proj.title,
        description=proj.description,
        estimated_cost=proj.estimated_cost if proj.estimated_cost is not None else 0.0,
        category=proj.category or "Non classé",
        priority=proj.priority or "MOYENNE",
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

    vote_type = vote_in.vote.upper()
    if vote_type not in ["POUR", "CONTRE", "ABSTENTION"]:
        raise HTTPException(status_code=400, detail="Le vote doit être POUR, CONTRE ou ABSTENTION.")

    existing_vote = db.query(ProjectVote).filter(
        ProjectVote.project_id == project_id,
        ProjectVote.user_name == vote_in.user_name
    ).first()

    if existing_vote:
        existing_vote.vote = vote_type
        existing_vote.comment = vote_in.comment
        existing_vote.voted_at = datetime.utcnow()
    else:
        new_vote = ProjectVote(
            project_id=project_id,
            user_name=vote_in.user_name,
            vote=vote_type,
            comment=vote_in.comment
        )
        db.add(new_vote)

    db.commit()
    db.refresh(db_proj)
    return format_project_response(db_proj)


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

@app.get("/api/members/{user_name}/current-stay-tasks")
def get_member_current_stay_tasks(user_name: str, db: Session = Depends(get_db)):
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    
    # 1. Look for member's NEXT upcoming (or current) stay
    res = db.query(Reservation).filter(
        func.lower(Reservation.user_name) == user_name.strip().lower(),
        Reservation.end_date >= today_str
    ).order_by(Reservation.start_date.asc()).first()

    # 2. If no upcoming stay for member, get their most recent/any stay
    if not res:
        res = db.query(Reservation).filter(
            func.lower(Reservation.user_name) == user_name.strip().lower()
        ).order_by(Reservation.start_date.asc()).first()

    # 3. If still no stay for member, fallback to next upcoming stay overall
    if not res:
        res = db.query(Reservation).order_by(Reservation.start_date.asc()).first()

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


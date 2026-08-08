from datetime import datetime
from typing import List, Optional, Dict
from pydantic import BaseModel

# Auth Schemas
class LoginRequest(BaseModel):
    prenom: str
    password: str

class UserBase(BaseModel):
    prenom: str
    name: str
    email: Optional[str] = None
    role: str = "Associé"
    avatar_color: str = "cyan"

class UserCreate(UserBase):
    password: str = "pass123"

class UserResponse(UserBase):
    id: int
    class Config:
        from_attributes = True

# Property Schemas
class PropertyBase(BaseModel):
    name: str
    address: str
    description: Optional[str] = None
    photo_url: Optional[str] = None

class PropertyCreate(PropertyBase):
    pass

class PropertyResponse(PropertyBase):
    id: int
    class Config:
        from_attributes = True

# Comment Schemas
class CommentCreate(BaseModel):
    author_name: str
    content: str

class CommentResponse(BaseModel):
    id: int
    issue_id: int
    author_name: str
    content: str
    created_at: datetime
    class Config:
        from_attributes = True

# Issue Schemas
class IssueCreate(BaseModel):
    property_id: int
    title: str
    description: str
    category: Optional[str] = "🐛 Corrections / Réparations"
    priority: str = "Moyenne"
    created_by: str
    photo_url: Optional[str] = None
    photo_urls: Optional[List[str]] = []

class IssueUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    category: Optional[str] = None
    estimated_cost: Optional[float] = None

class IssueResponse(BaseModel):
    id: int
    property_id: int
    title: str
    description: str
    category: str
    priority: str
    status: str
    created_by: str
    assigned_to: Optional[str] = None
    estimated_cost: Optional[float] = 0.0
    photo_url: Optional[str] = None
    photo_urls: Optional[List[str]] = []
    created_at: datetime
    updated_at: datetime
    property: Optional[PropertyResponse] = None
    comments: List[CommentResponse] = []
    class Config:
        from_attributes = True

# Reservation Schemas
class ReservationCreate(BaseModel):
    property_id: Optional[int] = 1
    property_name: Optional[str] = None
    properties: Optional[List[str]] = None
    user_name: str
    year: int
    week_number: int
    start_date: str
    end_date: str
    guest_count: Optional[int] = 1
    accepts_extra_family: Optional[bool] = True
    notes: Optional[str] = None

class ReservationUpdate(BaseModel):
    status: Optional[str] = None  # Demande en attente, Confirmée, Refusée
    property_name: Optional[str] = None
    guest_count: Optional[int] = None
    accepts_extra_family: Optional[bool] = None
    notes: Optional[str] = None

class ReservationResponse(BaseModel):
    id: int
    property_id: Optional[int] = 1
    property_name: Optional[str] = None
    user_name: str
    year: int
    week_number: int
    start_date: str
    end_date: str
    status: str
    guest_count: Optional[int] = 1
    accepts_extra_family: Optional[bool] = True
    notes: Optional[str] = None
    created_at: datetime
    property: Optional[PropertyResponse] = None
    class Config:
        from_attributes = True

# Project Schemas
class ProjectCreate(BaseModel):
    property_id: int
    title: str
    description: str
    estimated_cost: Optional[float] = 0.0
    category: Optional[str] = "Non classé"
    priority: Optional[str] = "MOYENNE"
    submitted_by: str
    responsible: Optional[str] = None
    photo_url: Optional[str] = None
    photo_urls: Optional[List[str]] = []

class ProjectReview(BaseModel):
    status: Optional[str] = None  # EN_VOTE, APPROUVE, REFUSE, EN_COURS, TERMINE
    decision_mode: Optional[str] = None  # VALIDER_DIRECTEMENT ou SOUMETTRE_AU_VOTE
    coordinator_notes: Optional[str] = None
    estimated_cost: Optional[float] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    responsible: Optional[str] = None


class ProjectVoteCreate(BaseModel):
    user_name: str
    vote: str  # POUR, CONTRE, ABSTENTION
    comment: Optional[str] = None

class ProjectVoteResponse(BaseModel):
    id: int
    project_id: int
    user_name: str
    vote: str
    comment: Optional[str] = None
    voted_at: datetime
    class Config:
        from_attributes = True

class ProjectResponse(BaseModel):
    id: int
    property_id: int
    title: str
    description: str
    estimated_cost: float
    category: str
    priority: str = "MOYENNE"
    submitted_by: str
    responsible: Optional[str] = None
    photo_url: Optional[str] = None
    photo_urls: Optional[List[str]] = []
    status: str
    decision_mode: Optional[str] = None
    coordinator_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    property: Optional[PropertyResponse] = None
    votes: List[ProjectVoteResponse] = []
    vote_summary: Optional[Dict] = None
    class Config:
        from_attributes = True

# Member Availability Schemas (Crossed Calendar)
class AvailabilitySet(BaseModel):
    property_id: int
    year: int
    week_number: int
    user_name: str
    status: str  # PRESENT, OPTIONNEL, IMPOSSIBLE
    notes: Optional[str] = None

class WeekAvailabilityItem(BaseModel):
    week_number: int
    status: str
    notes: Optional[str] = None

class AvailabilityBatchCreate(BaseModel):
    property_id: int
    year: int
    user_name: str
    availabilities: List[WeekAvailabilityItem]

class AvailabilityResponse(BaseModel):
    id: int
    property_id: int
    year: int
    week_number: int
    user_name: str
    status: str
    notes: Optional[str] = None
    updated_at: datetime
    class Config:
        from_attributes = True

class SmartMatchItem(BaseModel):
    year: int
    week_number: int
    start_date: str
    end_date: str
    score: float
    total_present: int
    total_optionnel: int
    total_impossible: int
    present_members: List[str]
    optionnel_members: List[str]
    impossible_members: List[str]

# Vademecum Schemas
class VademecumItemCreate(BaseModel):
    property_id: int
    category: str
    title: str
    content: str
    code_to_copy: Optional[str] = None
    importance: Optional[str] = "INFO"

class VademecumItemUpdate(BaseModel):
    category: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    code_to_copy: Optional[str] = None
    importance: Optional[str] = None

class VademecumItemResponse(BaseModel):
    id: int
    property_id: int
    category: str
    title: str
    content: str
    code_to_copy: Optional[str] = None
    importance: str
    updated_at: datetime
    class Config:
        from_attributes = True

# Dashboard Stats Schema
class StatsResponse(BaseModel):
    urgent_issues_count: int
    pending_reservations_count: int
    total_open_issues: int
    in_progress_issues: int
    resolved_issues: int
    confirmed_reservations: int
    active_properties_count: int
    pending_projects_count: int
    active_votes_count: int

# Maintenance Task Schemas
class MaintenanceTaskCreate(BaseModel):
    property_id: int
    title: str
    category: str  # Arrivée, Pendant le séjour, Départ
    frequency: str = "Chaque séjour"
    description: Optional[str] = None

class MaintenanceTaskResponse(BaseModel):
    id: int
    property_id: int
    title: str
    category: str
    frequency: str
    description: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

class StayTaskAssignmentResponse(BaseModel):
    id: int
    reservation_id: int
    task_id: Optional[int] = None
    title: str
    category: str
    frequency: Optional[str] = None
    description: Optional[str] = None
    completed: int
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    class Config:
        from_attributes = True



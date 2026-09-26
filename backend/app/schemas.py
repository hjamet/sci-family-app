import json
from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict
from pydantic import BaseModel, field_validator

class VoteEnum(str, Enum):
    OUI = "OUI"
    NON = "NON"
    ABSTENTION = "ABSTENTION"
    REPORT_PROCHAINE_AG = "REPORT_PROCHAINE_AG"
    POUR = "POUR"
    CONTRE = "CONTRE"

class ClassificationEnum(str, Enum):
    SIGNALEMENT = "SIGNALEMENT"
    INITIATIVE = "INITIATIVE"

class TaskWeightEnum(str, Enum):
    MINEUR = "MINEUR"
    MOYEN = "MOYEN"
    MAJEUR = "MAJEUR"
    CRITIQUE = "CRITIQUE"

# Auth Schemas
class LoginRequest(BaseModel):
    prenom: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    username: Optional[str] = None
    identifier: Optional[str] = None
    password: str

class ForgotPasswordRequest(BaseModel):
    prenom: Optional[str] = None
    member_id: Optional[int] = None

class MemberBase(BaseModel):
    prenom: str
    name: str
    email: Optional[str] = None
    role: str = "Membre Associé"
    avatar_color: str = "cyan"
    notif_task_assigned: bool = True
    notif_vote_needed: bool = True
    notif_vote_closed: bool = True
    notif_stay_booked: bool = True
    notif_thermal_changes: bool = False

class MemberCreate(MemberBase):
    password: str = "pass123"

class MemberUpdate(BaseModel):
    prenom: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    avatar_color: Optional[str] = None
    password: Optional[str] = None
    notif_task_assigned: Optional[bool] = None
    notif_vote_needed: Optional[bool] = None
    notif_vote_closed: Optional[bool] = None
    notif_stay_booked: Optional[bool] = None
    notif_thermal_changes: Optional[bool] = None

class MemberResponse(MemberBase):
    id: int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

UserBase = MemberBase
UserCreate = MemberCreate
UserResponse = MemberResponse

class MemberSettingsResponse(BaseModel):
    id: int
    prenom: str
    name: str
    email: Optional[str] = None
    notif_task_assigned: bool = True
    notif_vote_needed: bool = True
    notif_vote_closed: bool = True
    notif_stay_booked: bool = True
    notif_thermal_changes: bool = False

    class Config:
        from_attributes = True

class MemberSettingsUpdate(BaseModel):
    email: Optional[str] = None
    notif_task_assigned: Optional[bool] = None
    notif_vote_needed: Optional[bool] = None
    notif_vote_closed: Optional[bool] = None
    notif_stay_booked: Optional[bool] = None
    notif_thermal_changes: Optional[bool] = None

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    id: Optional[int] = None
    prenom: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    avatar_color: Optional[str] = None
    notif_task_assigned: Optional[bool] = None
    notif_vote_needed: Optional[bool] = None
    notif_vote_closed: Optional[bool] = None
    notif_stay_booked: Optional[bool] = None
    notif_thermal_changes: Optional[bool] = None

# Property Schemas
class PropertyBase(BaseModel):
    name: str
    address: str
    description: Optional[str] = None
    photo_url: Optional[str] = None
    total_chambers: Optional[int] = 5

class PropertyCreate(PropertyBase):
    pass

class PropertyResponse(PropertyBase):
    id: int
    total_chambers: int = 5
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

class IssueCommentCreate(BaseModel):
    author_id: Optional[int] = None
    author_name: str
    comment_text: str
    is_vote_comment: Optional[bool] = False

class IssueCommentResponse(BaseModel):
    id: int
    issue_id: int
    author_id: Optional[int] = None
    author_name: str
    comment_text: str
    is_vote_comment: Optional[bool] = False
    created_at: datetime
    class Config:
        from_attributes = True
# Admin Document Schemas
class AdminDocumentCreate(BaseModel):
    title: str
    category: str = "Documents de Fin de Tâche / Réparation"
    file_url: str
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    source_type: Optional[str] = "TASK"
    source_id: Optional[int] = None
    uploaded_by: Optional[str] = None
    notes: Optional[str] = None

class AdminDocumentResponse(BaseModel):
    id: int
    title: str
    category: str
    file_url: str
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    source_type: Optional[str] = None
    source_id: Optional[int] = None
    uploaded_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

# Document Category Schemas
class DocumentCategoryBase(BaseModel):
    name: str
    emoji: Optional[str] = "📁"
    color: Optional[str] = "slate"

class DocumentCategoryCreate(DocumentCategoryBase):
    pass

class DocumentCategoryResponse(DocumentCategoryBase):
    id: int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# Project Comment Schemas
class ProjectCommentCreate(BaseModel):
    author_name: str
    content: str

class ProjectCommentResponse(BaseModel):
    id: int
    project_id: int
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
    classification: Optional[str] = "SIGNALEMENT"  # SIGNALEMENT vs INITIATIVE
    charge: Optional[int] = 1
    add_to_ag_agenda: Optional[bool] = False
    linked_documents: Optional[str] = None
    supplier_info: Optional[str] = None
    created_by: str
    photo_url: Optional[str] = None
    photo_urls: Optional[List[str]] = []

class IssueUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    category: Optional[str] = None
    classification: Optional[str] = None  # SIGNALEMENT vs INITIATIVE
    charge: Optional[int] = None
    add_to_ag_agenda: Optional[bool] = None
    linked_documents: Optional[str] = None
    supplier_info: Optional[str] = None
    estimated_cost: Optional[float] = None
    completion_notes: Optional[str] = None
    completion_docs: Optional[List[str]] = None

class IssueResponse(BaseModel):
    id: int
    property_id: int
    title: str
    description: str
    category: str
    priority: str
    status: str
    classification: Optional[str] = "SIGNALEMENT"
    charge: Optional[int] = 1
    add_to_ag_agenda: Optional[bool] = False
    linked_documents: Optional[str] = None
    supplier_info: Optional[str] = None
    created_by: str
    assigned_to: Optional[str] = None
    estimated_cost: Optional[float] = 0.0
    photo_url: Optional[str] = None
    photo_urls: Optional[List[str]] = []
    completion_notes: Optional[str] = None
    completion_docs: Optional[List[str]] = []
    created_at: datetime
    updated_at: datetime
    property: Optional[PropertyResponse] = None
    comments: List[CommentResponse] = []
    issue_comments: List[IssueCommentResponse] = []

    @field_validator("completion_docs", mode="before")
    @classmethod
    def parse_completion_docs(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return [s.strip() for s in v.split(",") if s.strip()]
        return v

    class Config:
        from_attributes = True

# Reservation Schemas
class ReservationBase(BaseModel):
    property_id: Optional[int] = 1
    property_name: Optional[str] = None
    properties: Optional[List[str]] = None
    user_name: str
    year: int
    week_number: int
    start_date: str
    end_date: str
    arrival_time: Optional[str] = "15:00"
    departure_time: Optional[str] = "11:00"
    guest_count: Optional[int] = 1
    chambers_used: Optional[int] = 1
    selected_rooms: Optional[List[str]] = None
    rooms_count: Optional[int] = 1
    accepts_extra_family: Optional[bool] = True
    notes: Optional[str] = None

class ReservationCreate(ReservationBase):
    pass

class ReservationUpdate(BaseModel):
    status: Optional[str] = None  # Demande en attente, Confirmée, Refusée
    property_id: Optional[int] = None
    property_name: Optional[str] = None
    user_name: Optional[str] = None
    year: Optional[int] = None
    week_number: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    arrival_time: Optional[str] = None
    departure_time: Optional[str] = None
    guest_count: Optional[int] = None
    chambers_used: Optional[int] = None
    selected_rooms: Optional[List[str]] = None
    rooms_count: Optional[int] = None
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
    arrival_time: Optional[str] = "15:00"
    departure_time: Optional[str] = "11:00"
    status: str
    guest_count: Optional[int] = 1
    chambers_used: Optional[int] = 1
    selected_rooms: Optional[List[str]] = None
    rooms_count: Optional[int] = 1
    accepts_extra_family: Optional[bool] = True
    notes: Optional[str] = None
    created_at: datetime
    property: Optional[PropertyResponse] = None

    @field_validator("selected_rooms", mode="before")
    @classmethod
    def parse_selected_rooms(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return [s.strip() for s in v.split(",") if s.strip()]
        return v

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
    classification: Optional[str] = "SIGNALEMENT"  # SIGNALEMENT vs INITIATIVE
    task_weight: Optional[str] = "MOYEN"  # MINEUR, MOYEN, MAJEUR, CRITIQUE
    charge: Optional[int] = 1
    add_to_ag_agenda: Optional[bool] = False
    linked_documents: Optional[str] = None
    document_urls: Optional[List[str]] = []
    supplier_info: Optional[str] = None
    submitted_by: str
    responsible: Optional[str] = None
    photo_url: Optional[str] = None
    photo_urls: Optional[List[str]] = []
    decision_mode: Optional[str] = None
    status: Optional[str] = None

class ProjectApprove(BaseModel):
    estimated_cost: Optional[float] = 0.0
    coordinator_notes: Optional[str] = None
    document_urls: Optional[List[str]] = []
    classification: Optional[ClassificationEnum] = ClassificationEnum.SIGNALEMENT
    task_weight: Optional[TaskWeightEnum] = TaskWeightEnum.MOYEN
    status: Optional[str] = "APPROUVE"
    decision_mode: Optional[str] = None
    responsible: Optional[str] = None

class ProjectReview(BaseModel):
    status: Optional[str] = None  # EN_VOTE, APPROUVE, REFUSE, EN_COURS, TERMINE, REPORT_AG, EN_ATTENTE_VALIDATION, ARCHIVEE
    decision_mode: Optional[str] = None  # VALIDER_DIRECTEMENT ou SOUMETTRE_AU_VOTE
    classification: Optional[str] = None  # SIGNALEMENT vs INITIATIVE
    task_weight: Optional[str] = None  # MINEUR, MOYEN, MAJEUR, CRITIQUE
    charge: Optional[int] = None
    add_to_ag_agenda: Optional[bool] = None  # Single-Veto AG Rule
    linked_documents: Optional[str] = None
    document_urls: Optional[List[str]] = None
    supplier_info: Optional[str] = None
    coordinator_notes: Optional[str] = None
    estimated_cost: Optional[float] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    responsible: Optional[str] = None
    completion_notes: Optional[str] = None
    completion_docs: Optional[List[str]] = None

class ProjectVoteCreate(BaseModel):
    user_name: str
    vote: VoteEnum  # OUI, NON, ABSTENTION, REPORT_PROCHAINE_AG, POUR, CONTRE
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
    classification: Optional[str] = "SIGNALEMENT"
    task_weight: Optional[str] = "MOYEN"
    charge: Optional[int] = 1
    linked_documents: Optional[str] = None
    document_urls: Optional[List[str]] = []
    supplier_info: Optional[str] = None
    submitted_by: str
    responsible: Optional[str] = None
    photo_url: Optional[str] = None
    photo_urls: Optional[List[str]] = []
    status: str
    decision_mode: Optional[str] = None
    add_to_ag_agenda: Optional[bool] = False
    coordinator_notes: Optional[str] = None
    completion_notes: Optional[str] = None
    completion_docs: Optional[List[str]] = []
    created_at: datetime
    updated_at: datetime
    property: Optional[PropertyResponse] = None
    votes: List[ProjectVoteResponse] = []
    comments: List[ProjectCommentResponse] = []
    vote_summary: Optional[Dict] = None

    @field_validator("document_urls", "completion_docs", mode="before")
    @classmethod
    def parse_json_lists(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return [s.strip() for s in v.split(",") if s.strip()]
        return v

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

class TaskCompletionSubmit(BaseModel):
    completion_notes: Optional[str] = None
    completion_docs: Optional[List[str]] = []

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
    status: Optional[str] = "A_FAIRE"
    completion_notes: Optional[str] = None
    completion_docs: Optional[List[str]] = []

    @field_validator("completion_docs", mode="before")
    @classmethod
    def parse_completion_docs(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return [s.strip() for s in v.split(",") if s.strip()]
        return v

    class Config:
        from_attributes = True

# Workload & Proportional Charge Schemas (Henri's Proportional Usage Workload Model)
class UserWorkloadStats(BaseModel):
    user_name: str
    total_days: int
    occupation_score: float  # O_u = sum(days * chambers_used)
    target_charge_points: float  # C_u^target = (O_u / sum(O_v)) * total_charge_points
    charge_percentage: float  # (O_u / sum(O_v)) * 100

class WorkloadSummaryResponse(BaseModel):
    total_charge_points: float
    total_occupation_score: float
    user_stats: List[UserWorkloadStats]

# ViCare / Heating Schemas
class HeatingStatusResponse(BaseModel):
    room_temperature: Optional[float] = None
    target_temperature: Optional[float] = None
    outside_temperature: Optional[float] = None
    supply_temperature: Optional[float] = None
    boiler_temperature: Optional[float] = None
    dhw_temperature: Optional[float] = None
    mode: Optional[str] = None
    active_mode: Optional[str] = None
    active_program: Optional[str] = None
    fuel_level_percent: Optional[float] = None
    fuel_liters_remaining: Optional[float] = None
    fuel_capacity_liters: Optional[float] = None
    fuel_supplier: Optional[str] = None
    test_mode_read_only: Optional[bool] = None
    message: Optional[str] = None
    class Config:
        from_attributes = True

class HeatingModeRequest(BaseModel):
    mode: str

class HeatingTemperatureRequest(BaseModel):
    target_temperature: float
    program: Optional[str] = "normal"


# --- Piscine Schemas ---
class PiscineStatusResponse(BaseModel):
    water_temperature: float = 13.5
    frost_protection_target: float = 14.0
    pac_state: str = "Mise en veille hivernale"
    pac_power: str = "20 kW"
    cover_state: str = "Verrouillée & tendue"
    filtration_state: str = "En veille (Actif 03h00 - 06h00)"
    filtration_cycle: str = "03h00 — 06h00 (Heures Creuses)"
    hivernage_status: str = "Hivernage Actif"
    sensor_location: str = "Sonde skimmer sud"
    winter_warning: str = "Chauffage du bassin déconseillé & formellement proscrit en octobre-mars. Surcoût électrique estimé à plus de 450 €/semaine ! Le bassin est placé en protocole pré-hivernage DECLERCQ PISCINES."
    frederic_jamet_agreement: str = "Prise en charge contrat DECLERCQ à 100% jusqu’au 31/12/2026."
    agreement_status: str = "Actif (100% pris en charge par Frédéric Jamet)"
    contract_provider: str = "DECLERCQ PISCINES"
    radio_link_ok: bool = True
    radio_status: str = "Liaison radio K-Link active"
    radio_alert: Optional[str] = None
    radio_error: bool = False
    test_mode_read_only: bool = True
    message: str = "Garde-fou de sécurité inviolable actif (Garde-fou Henri #1) : Mode lecture seule permanent. Toute commande actionneur piscine est formellement interdite."
    class Config:
        from_attributes = True


# --- Stay Balance Schemas ---
class StayBalanceMember(BaseModel):
    prenom: str
    name: Optional[str] = None
    role: Optional[str] = None
    avatar_color: Optional[str] = "cyan"
    days: int = 0
    stays_count: int = 0
    percentage: int = 0

class StayBalanceResponse(BaseModel):
    year: int
    total_days: int
    max_days: int
    members: List[StayBalanceMember]


# --- Unified Task Schemas (Stitch Screens) ---

class TaskBase(BaseModel):
    title: str
    description: str
    subject: Optional[str] = "SCI"
    category: Optional[str] = None
    priority: Optional[str] = "Normale"
    status: Optional[str] = "EN_COURS"
    complexity: Optional[str] = "Modérée"
    budget: Optional[float] = 0.0
    budget_notes: Optional[str] = None
    assignee_id: Optional[int] = None
    assigned_members: Optional[List[str]] = []
    deadline: Optional[str] = None
    checklist: Optional[List[Dict]] = []
    documents: Optional[List[Dict]] = []
    completion_notes: Optional[str] = None
    completion_docs: Optional[List[str]] = []
    created_by: Optional[str] = "Henri"


class TaskCreate(TaskBase):
    ref: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    subject: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    complexity: Optional[str] = None
    budget: Optional[float] = None
    budget_notes: Optional[str] = None
    assignee_id: Optional[int] = None
    assigned_members: Optional[List[str]] = None
    deadline: Optional[str] = None
    checklist: Optional[List[Dict]] = None
    documents: Optional[List[Dict]] = None
    completion_notes: Optional[str] = None
    completion_docs: Optional[List[str]] = None


class TaskCloseRequest(BaseModel):
    completion_notes: str
    completion_docs: Optional[List[str]] = []


class TaskCommentBase(BaseModel):
    content: str
    author_name: Optional[str] = None
    author_role: Optional[str] = None
    author_id: Optional[int] = None


class TaskCommentCreate(TaskCommentBase):
    pass


ALLOWED_REACTION_EMOJIS = ['👍', '❤️', '👏', '💡', '🌸']


class TaskCommentReactRequest(BaseModel):
    emoji: str  # Allowed: 👍, ❤️, 👏, 💡, 🌸
    user_name: Optional[str] = None


class TaskCommentResponse(BaseModel):
    id: int
    task_id: int
    author_id: Optional[int] = None
    author_name: str
    author_role: Optional[str] = None
    content: str
    reactions: Dict[str, int] = {}
    created_at: Optional[datetime] = None

    @field_validator("reactions", mode="before")
    @classmethod
    def parse_reactions(cls, v):
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except Exception:
                return {}
        if isinstance(v, dict):
            res = {}
            for k, val in v.items():
                if isinstance(val, list):
                    res[k] = len(val)
                elif isinstance(val, int):
                    res[k] = val
                else:
                    try:
                        res[k] = int(val)
                    except Exception:
                        res[k] = 1
            return res
        return v or {}

    class Config:
        from_attributes = True


class TaskResponse(TaskBase):
    id: int
    ref: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    comments_count: Optional[int] = 0
    comments: Optional[List[TaskCommentResponse]] = []
    progress_percent: Optional[int] = 0
    completed_steps: Optional[int] = 0
    total_steps: Optional[int] = 0

    @field_validator("assigned_members", "checklist", "documents", "completion_docs", mode="before")
    @classmethod
    def parse_task_json_fields(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return [s.strip() for s in v.split(",") if s.strip()]
        return v or []

    class Config:
        from_attributes = True


# --- Log & Audit Schemas ---

class LogCreate(BaseModel):
    action: str
    user_name: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None


class LogResponse(BaseModel):
    id: int
    action: str
    user_name: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Open Banking DSP2 (Enable Banking) Schemas ---

class BankAuthStartRequest(BaseModel):
    aspsp_name: Optional[str] = "Swan"
    psu_type: Optional[str] = "business"
    redirect_url: Optional[str] = None


class BankAuthStartResponse(BaseModel):
    url: str
    session_id: str
    state: str
    aspsp_name: str
    valid_until: str


class BankAuthCallbackRequest(BaseModel):
    code: str
    session_id: Optional[str] = None


class BankTransactionResponse(BaseModel):
    id: int
    transaction_id: str
    account_id: int
    booking_date: str
    value_date: Optional[str] = None
    amount: float
    currency: str = "EUR"
    remittance_information: Optional[str] = None
    creditor_name: Optional[str] = None
    debtor_name: Optional[str] = None
    category: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BankAccountResponse(BaseModel):
    id: int
    account_id: str
    name: str
    iban: Optional[str] = None
    balance: float = 0.0
    balance_type: Optional[str] = "interimAvailable"
    currency: str = "EUR"
    last_synced_at: Optional[datetime] = None
    aspsp_name: Optional[str] = "Swan"
    transactions: List[BankTransactionResponse] = []

    class Config:
        from_attributes = True


class BankSyncResponse(BaseModel):
    success: bool
    accounts_synced: int
    transactions_synced: int
    timestamp: str


class BankStatusResponse(BaseModel):
    application_id: str
    aspsp_name: str
    aspsp_bic: str
    aspsp_country: str
    active_accounts_count: int
    total_balance: float
    currency: str = "EUR"
    last_synced_at: Optional[datetime] = None
    last_successful_sync: Optional[datetime] = None
    status: str = "ok"  # "ok" | "expired" | "error"
    needs_reauth: bool = False
    days_left: Optional[int] = None
    valid_until: Optional[str] = None
    message: Optional[str] = None
    reauth_url: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    notif_task_assigned: Optional[bool] = None
    notif_vote_needed: Optional[bool] = None
    notif_vote_closed: Optional[bool] = None
    notif_stay_booked: Optional[bool] = None
    notif_thermal_changes: Optional[bool] = None
    notify_new_task: Optional[bool] = None
    notify_pending_vote: Optional[bool] = None
    notify_final_decision: Optional[bool] = None
    notify_new_stay: Optional[bool] = None
    notify_thermal_changes: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    old_password: Optional[str] = None
    current_password: Optional[str] = None
    new_password: str
    confirm_password: Optional[str] = None


class MemberSettingsResponse(BaseModel):
    id: Optional[int] = None
    member_id: Optional[int] = None
    prenom: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    notif_task_assigned: bool = True
    notif_vote_needed: bool = True
    notif_vote_closed: bool = True
    notif_stay_booked: bool = True
    notif_thermal_changes: bool = False
    # Aliases for legacy compatibility
    notify_new_task: bool = True
    notify_pending_vote: bool = True
    notify_final_decision: bool = True
    notify_new_stay: bool = True
    notify_thermal_changes: bool = False

    class Config:
        from_attributes = True


class MemberSettingsUpdate(BaseModel):
    email: Optional[str] = None
    notif_task_assigned: Optional[bool] = None
    notif_vote_needed: Optional[bool] = None
    notif_vote_closed: Optional[bool] = None
    notif_stay_booked: Optional[bool] = None
    notif_thermal_changes: Optional[bool] = None
    notify_new_task: Optional[bool] = None
    notify_pending_vote: Optional[bool] = None
    notify_final_decision: Optional[bool] = None
    notify_new_stay: Optional[bool] = None
    notify_thermal_changes: Optional[bool] = None


class HeatingSettingsRequest(BaseModel):
    target_temperature: Optional[float] = None
    mode: Optional[str] = None
    author_name: Optional[str] = None
    details: Optional[str] = None


class HeatingSettingsResponse(BaseModel):
    target_temperature: Optional[float] = 19.0
    mode: Optional[str] = "dhwAndHeating"
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    message: Optional[str] = "Réglages de chauffage enregistrés avec succès."
    status: str = "ok"


class PoolSettingsRequest(BaseModel):
    target_temperature: Optional[float] = None
    filtration_mode: Optional[str] = None
    mode: Optional[str] = None
    author_name: Optional[str] = None
    details: Optional[str] = None


class PoolSettingsResponse(BaseModel):
    target_temperature: Optional[float] = 14.0
    filtration_mode: Optional[str] = "auto"
    mode: Optional[str] = "standby"
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    message: Optional[str] = "Réglages piscine enregistrés avec succès."
    status: str = "ok"



class VoteSubmissionRequest(BaseModel):
    project_id: int
    user_name: str
    vote: str
    comment: Optional[str] = None








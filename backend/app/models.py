from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, UniqueConstraint, Boolean, LargeBinary, BigInteger
from sqlalchemy.orm import relationship, synonym
from .database import Base

class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, index=True)
    prenom = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    nom = synonym("name")
    email = Column(String(255), unique=True, index=True, nullable=True)
    password = Column(String(255), nullable=False, default="pass123")
    role = Column(String(150), default="Membre Associé")  # e.g., "Coordinateur", "Membre Associé", "Artisan"
    is_coordinator = Column(Boolean, default=False, nullable=False, server_default="0")
    avatar_color = Column(String(50), default="cyan")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Notification preferences
    notif_task_assigned = Column(Boolean, default=True, nullable=False, server_default="1")
    notif_task_completed = Column(Boolean, default=True, nullable=False, server_default="1")
    notif_vote_needed = Column(Boolean, default=True, nullable=False, server_default="1")
    notif_vote_closed = Column(Boolean, default=True, nullable=False, server_default="1")
    notif_stay_booked = Column(Boolean, default=True, nullable=False, server_default="1")
    notif_stay_reminder = Column(Boolean, default=True, nullable=False, server_default="1")
    notif_heating_start = Column(Boolean, default=True, nullable=False, server_default="1")
    notif_heating_stop = Column(Boolean, default=True, nullable=False, server_default="1")
    notif_thermal_changes = Column(Boolean, default=False, nullable=False, server_default="0")
    notify_mentions = Column(Boolean, default=True, nullable=False, server_default="1")
    notif_chat_mentions = synonym("notify_mentions")
    notif_task_chat_activity = Column(Boolean, default=False, nullable=False, server_default="0")
    notif_vote_chat_activity = Column(Boolean, default=False, nullable=False, server_default="0")
    notify_task_creation = Column(Boolean, default=False, nullable=False, server_default="0")
    notify_vote_creation = Column(Boolean, default=False, nullable=False, server_default="0")
    notify_vote_arbitration = Column(Boolean, default=False, nullable=False, server_default="0")
    notify_mention_all = Column(Boolean, default=True, nullable=False, server_default="1")
    monthly_contribution = Column(Float, default=50.0, nullable=False, server_default="50.0")
    notif_new_invoices = Column(Boolean, default=True, nullable=False, server_default="1")
    notif_calls_for_funds = synonym("notif_new_invoices")
    payment_reference = Column(String(50), unique=True, index=True, nullable=True)  # ex: "HLV-HENRI"

    tasks = relationship("Task", back_populates="assignee", foreign_keys="Task.assignee_id")
    task_comments = relationship("TaskComment", back_populates="author", foreign_keys="TaskComment.author_id")

User = Member

class Property(Base):
    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    photo_url = Column(String, nullable=True)
    total_chambers = Column(Integer, default=5, nullable=False)

    issues = relationship("Issue", back_populates="property", cascade="all, delete-orphan")
    reservations = relationship("Reservation", back_populates="property", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="property", cascade="all, delete-orphan")
    availabilities = relationship("MemberAvailability", back_populates="property", cascade="all, delete-orphan")
    vademecum_items = relationship("VademecumItem", back_populates="property", cascade="all, delete-orphan")
    maintenance_tasks = relationship("MaintenanceTask", back_populates="property", cascade="all, delete-orphan")

class AdminDocument(Base):
    __tablename__ = "admin_documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    category = Column(String, nullable=False)  # e.g., "Documents de Fin de Tâche / Réparation", "Factures", "Statuts & Contrats", "Autre"
    file_url = Column(String, nullable=False)
    file_name = Column(String, nullable=True)
    file_type = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    file_data = Column(LargeBinary, nullable=True)
    drive_file_id = Column(String(255), nullable=True, index=True)
    file_hash = Column(String(64), nullable=True, index=True)
    source_type = Column(String, nullable=True)  # TASK, ISSUE, PROJECT, MANUAL
    source_id = Column(Integer, nullable=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True)
    uploaded_by = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    tags = Column(Text, nullable=True)  # JSON-encoded array or comma-separated tags
    created_at = Column(DateTime, default=datetime.utcnow)

    # Synonymes d'accès unifiés
    name = synonym("title")
    mime_type = synonym("file_type")
    size = synonym("file_size")

class DocumentCategory(Base):
    __tablename__ = "document_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    emoji = Column(String(20), default="📁", nullable=False)
    color = Column(String(50), default="slate", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Issue(Base):
    __tablename__ = "issues"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String, nullable=False)  # Plomberie, Électricité, Équipement, Structure, Ménage, Autre
    priority = Column(String, default="Moyenne")  # Basse, Moyenne, Haute, Urgent
    status = Column(String, default="Ouvert")  # Ouvert, En cours, Résolu, Annulé, EN_ATTENTE_VALIDATION, ARCHIVEE
    classification = Column(String, default="SIGNALEMENT", nullable=True)  # SIGNALEMENT vs INITIATIVE
    charge = Column(Integer, default=1, nullable=True)
    add_to_ag_agenda = Column(Boolean, default=False, nullable=True)
    linked_documents = Column(Text, nullable=True)
    supplier_info = Column(Text, nullable=True)
    created_by = Column(String, nullable=False)
    assigned_to = Column(String, nullable=True)  # e.g. "Henri Jamet", "Jean Dupont (Plombier)" - Qui s'occupe de quoi
    estimated_cost = Column(Float, nullable=True, default=0.0)
    photo_url = Column(String, nullable=True)
    photo_urls = Column(Text, nullable=True)  # Comma-separated or JSON list of multiple photos uploaded
    completion_notes = Column(Text, nullable=True)
    completion_docs = Column(Text, nullable=True)  # JSON or comma-separated document URLs
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    property = relationship("Property", back_populates="issues")
    comments = relationship("Comment", back_populates="issue", cascade="all, delete-orphan", order_by="Comment.created_at.asc()")
    issue_comments = relationship("IssueComment", back_populates="issue", cascade="all, delete-orphan", order_by="IssueComment.created_at.asc()")

class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    issue_id = Column(Integer, ForeignKey("issues.id"), nullable=False)
    author_name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    issue = relationship("Issue", back_populates="comments")

class IssueComment(Base):
    __tablename__ = "issue_comments"

    id = Column(Integer, primary_key=True, index=True)
    issue_id = Column(Integer, ForeignKey("issues.id"), nullable=False)
    author_id = Column(Integer, nullable=True)
    author_name = Column(String, nullable=False)
    comment_text = Column(Text, nullable=False)
    is_vote_comment = Column(Boolean, default=False, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    issue = relationship("Issue", back_populates="issue_comments")

class Reservation(Base):
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=True)
    property_name = Column(String, nullable=True)
    user_name = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    week_number = Column(Integer, nullable=False)
    start_date = Column(String, nullable=False)  # YYYY-MM-DD
    end_date = Column(String, nullable=False)    # YYYY-MM-DD
    arrival_time = Column(String(10), default="15:00", nullable=True)    # HH:MM
    departure_time = Column(String(10), default="11:00", nullable=True)  # HH:MM
    status = Column(String, default="Demande en attente")  # Demande en attente, Confirmée, Refusée
    guest_count = Column(Integer, default=1, nullable=True)
    chambers_used = Column(Integer, default=1, nullable=True)
    selected_rooms = Column(Text, nullable=True)  # JSON-encoded list of exact room names
    rooms_count = Column(Integer, default=1, nullable=True)  # Count of rooms selected
    accepts_extra_family = Column(Boolean, default=True, nullable=True)
    cohabitation_type = Column(String(50), default="total", nullable=True)  # total, other_building, exclusive
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    property = relationship("Property", back_populates="reservations")
    task_assignments = relationship("StayTaskAssignment", back_populates="reservation", cascade="all, delete-orphan")

class MaintenanceTask(Base):
    __tablename__ = "maintenance_tasks"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    title = Column(String, nullable=False)
    category = Column(String, nullable=False)  # Arrivée, Pendant le séjour, Départ
    frequency = Column(String, nullable=False, default="Chaque séjour")  # Chaque séjour, Hebdomadaire, Mensuel, Saisonnier
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    property = relationship("Property", back_populates="maintenance_tasks")

class StayTaskAssignment(Base):
    __tablename__ = "stay_task_assignments"

    id = Column(Integer, primary_key=True, index=True)
    reservation_id = Column(Integer, ForeignKey("reservations.id"), nullable=False)
    task_id = Column(Integer, ForeignKey("maintenance_tasks.id"), nullable=True)
    title = Column(String, nullable=False)
    category = Column(String, nullable=False)  # Arrivée, Pendant le séjour, Départ
    frequency = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    completed = Column(Integer, default=0)  # 0 or 1
    completed_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String, default="A_FAIRE", nullable=True)  # A_FAIRE, EN_ATTENTE_VALIDATION, ARCHIVEE, TERMINE
    completion_notes = Column(Text, nullable=True)
    completion_docs = Column(Text, nullable=True)

    reservation = relationship("Reservation", back_populates="task_assignments")

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    estimated_cost = Column(Float, nullable=False, default=0.0)
    category = Column(String, nullable=False, default="🛠️ Maintenance / Réparation")
    priority = Column(String, nullable=False, default="MOYENNE") # URGENT, HAUTE, MOYENNE, BASSE
    classification = Column(String, default="SIGNALEMENT", nullable=True) # SIGNALEMENT vs INITIATIVE
    task_weight = Column(String, default="MOYEN", nullable=True) # MINEUR, MOYEN, MAJEUR, CRITIQUE
    charge = Column(Integer, default=1, nullable=True)
    add_to_ag_agenda = Column(Boolean, default=False, nullable=True) # Single-Veto AG Rule
    linked_documents = Column(Text, nullable=True)
    document_urls = Column(Text, nullable=True) # JSON array of stored URLs
    supplier_info = Column(Text, nullable=True)
    submitted_by = Column(String, nullable=False)
    responsible = Column(String, nullable=True)  # "Qui s'occupe de quoi" / Fournisseur / Artisan
    photo_url = Column(String, nullable=True)   # Photo image support for proposals
    photo_urls = Column(Text, nullable=True)   # Comma-separated list of photos uploaded
    status = Column(String, default="SOUMIS")  # SOUMIS, EN_VOTE, APPROUVE, REFUSE, EN_COURS, TERMINE, REPORT_AG, EN_ATTENTE_VALIDATION, ARCHIVEE
    decision_mode = Column(String, nullable=True)  # VALIDER_DIRECTEMENT ou SOUMETTRE_AU_VOTE
    coordinator_notes = Column(Text, nullable=True)
    completion_notes = Column(Text, nullable=True)
    completion_docs = Column(Text, nullable=True)
    options = Column(Text, nullable=True)  # JSON-encoded array of custom vote options
    allow_multiple_choices = Column(Boolean, default=False, nullable=True)
    external_links = Column(Text, nullable=True)  # JSON array: [{"url": "https://...", "title": "Doc Klereo"}]
    key_values = Column(Text, nullable=True)  # JSON array: [{"key": "Entreprise", "value": "EURL Bompais"}, ...]
    custom_fields = Column(Text, nullable=True, default="[]")  # Alias JSON array: [{"key": "...", "value": "..."}]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    property = relationship("Property", back_populates="projects")
    votes = relationship("ProjectVote", back_populates="project", cascade="all, delete-orphan")
    comments = relationship("ProjectComment", back_populates="project", cascade="all, delete-orphan", order_by="ProjectComment.created_at.asc()")

class ProjectComment(Base):
    __tablename__ = "project_comments"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    author_name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="comments")

class ProjectVote(Base):
    __tablename__ = "project_votes"
    __table_args__ = (UniqueConstraint('project_id', 'user_name', name='_project_user_uc'),)

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_name = Column(String, nullable=False)
    vote = Column(Text, nullable=False)  # POUR, CONTRE, ABSTENTION ou texte long / JSON sans troncature
    comment = Column(Text, nullable=True)
    voted_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="votes")

class MemberAvailability(Base):
    __tablename__ = "member_availabilities"
    __table_args__ = (UniqueConstraint('property_id', 'year', 'week_number', 'user_name', name='_avail_uc'),)

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    year = Column(Integer, nullable=False)
    week_number = Column(Integer, nullable=False)
    user_name = Column(String, nullable=False)
    status = Column(String, nullable=False, default="OPTIONNEL")  # PRESENT, OPTIONNEL, IMPOSSIBLE
    notes = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    property = relationship("Property", back_populates="availabilities")

class VademecumItem(Base):
    __tablename__ = "vademecum_items"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    category = Column(String, nullable=False)  # Accès & Clés, Wi-Fi & Réseau, Eau & Électricité, Chauffage & Fioul, Déchets & Recyclage, Équipements & Notice, Urgence
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    code_to_copy = Column(String, nullable=True)  # e.g. wifi password or keycode
    importance = Column(String, default="INFO")  # CRITIQUE, IMPORTANT, INFO
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    property = relationship("Property", back_populates="vademecum_items")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    ref = Column(String(50), unique=True, index=True, nullable=True)  # ex: T-2026-088
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    subject = Column(String(100), nullable=False, default="SCI")  # Rosings, Presbytère, Piscine, Jardin & Espaces Verts, Petites cabanes, Hangar à meuble, SCI & Administratif
    category = Column(String(100), nullable=True)
    priority = Column(String(50), nullable=False, default="Normale")  # Critique, Haute, Normale, Planifié
    status = Column(String(50), nullable=False, default="PROPOSED")  # PROPOSED, A_FAIRE, EN_COURS, TODO, TERMINE, ARCHIVEE, SOUMIS, PENDING_VALIDATION, REJECTED
    is_recurring = Column(Boolean, default=False, nullable=False, server_default="0")
    recurrence_interval = Column(Integer, default=1, nullable=True)  # ex: 1, 2, 3...
    recurrence_unit = Column(String(50), default="semaines", nullable=True)  # jours, semaines, mois, séjours
    auto_assign_by_workload = Column(Boolean, default=False, nullable=True)  # Répartition équitable selon score d'usage
    last_completed_at = Column(DateTime, nullable=True)
    complexity = Column(String(50), default="Modérée")  # Négligeable, Faible, Modérée, Élevée, Très élevée
    charge_points = Column(Integer, default=3, nullable=True)  # Barème: 1, 2, 3, 5, 8 points
    budget = Column(Float, default=0.0, nullable=True)
    budget_notes = Column(String(255), nullable=True)
    assignee_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True)
    assigned_members = Column(Text, nullable=True)  # JSON array string: ["Henri Jamet", "Hortense Jamet"]
    deadline = Column(String(50), nullable=True)  # e.g. "2026-08-31"
    checklist = Column(Text, nullable=True)  # JSON array: [{"text": "...", "completed": true}]
    documents = Column(Text, nullable=True)  # JSON array: [{"name": "...", "url": "...", "type": "PDF", "size": "1.2 Mo"}]
    external_links = Column(Text, nullable=True)  # JSON array: [{"url": "https://...", "title": "Doc Klereo"}]
    key_values = Column(Text, nullable=True)  # JSON array: [{"key": "Entreprise", "value": "EURL Bompais"}, ...]
    custom_fields = Column(Text, nullable=True, default="[]")  # Alias JSON array: [{"key": "...", "value": "..."}]
    completion_notes = Column(Text, nullable=True)  # Mandatory synthesis note on closure
    completion_docs = Column(Text, nullable=True)  # JSON or comma-separated document URLs
    created_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assignee = relationship("Member", back_populates="tasks", foreign_keys=[assignee_id])
    comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan", order_by="TaskComment.created_at.asc()")
    admin_documents = relationship("AdminDocument", backref="task", foreign_keys="[AdminDocument.task_id]")


class TaskComment(Base):
    __tablename__ = "task_comments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    author_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True)
    author_name = Column(String(100), nullable=False)
    author_role = Column(String(100), nullable=True)
    content = Column(Text, nullable=False)
    reactions = Column(Text, default="{}")  # JSON map: {"👍": 2, "❤️": 1, "👏": 2, "💡": 1}
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("Task", back_populates="comments")
    author = relationship("Member", back_populates="task_comments", foreign_keys=[author_id])


class Log(Base):
    __tablename__ = "logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(100), nullable=False)  # LOGIN, TASK_UPDATE, TASK_CLOSE, RESERVATION_CREATE, etc.
    user_name = Column(String(100), nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# --- Open Banking DSP2 (Enable Banking) Models ---

class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(String(255), unique=True, index=True, nullable=False)
    iban = Column(String(100), nullable=True)
    name = Column(String(255), default="Compte Courant SCI Hellenvilliers")
    currency = Column(String(10), default="EUR")
    balance = Column(Float, default=0.0)
    balance_type = Column(String(50), default="interimAvailable")
    last_synced_at = Column(DateTime, nullable=True)
    aspsp_name = Column(String(100), default="Swan")
    session_id = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    transactions = relationship("BankTransaction", back_populates="account", cascade="all, delete-orphan", order_by="BankTransaction.booking_date.desc()")


class BankTransaction(Base):
    __tablename__ = "bank_transactions"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(String(255), unique=True, index=True, nullable=False)
    account_id = Column(Integer, ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False)
    booking_date = Column(String(50), nullable=False)
    value_date = Column(String(50), nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="EUR")
    remittance_information = Column(Text, nullable=True)
    creditor_name = Column(String(255), nullable=True)
    debtor_name = Column(String(255), nullable=True)
    category = Column(String(100), nullable=True)
    raw_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("BankAccount", back_populates="transactions")


class BankAuthSession(Base):
    __tablename__ = "bank_auth_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(255), unique=True, index=True, nullable=False)
    aspsp_name = Column(String(100), default="Swan")
    psu_type = Column(String(50), default="business")
    status = Column(String(50), default="INITIATED")  # INITIATED, AUTHORIZED, EXPIRED, REVOKED
    auth_url = Column(Text, nullable=True)
    redirect_url = Column(Text, nullable=True)
    authorized_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    accounts_data = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MemberSettings(Base):
    __tablename__ = "member_settings"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), unique=True, nullable=False)
    notify_new_task = Column(Boolean, default=True)
    notif_task_assigned = Column(Boolean, default=True)
    notif_task_completed = Column(Boolean, default=True)
    notify_pending_vote = Column(Boolean, default=True)
    notif_vote_required = Column(Boolean, default=True)
    notify_final_decision = Column(Boolean, default=True)
    notify_new_stay = Column(Boolean, default=True)
    notif_stay_booked = Column(Boolean, default=True)
    notif_stay_reminder = Column(Boolean, default=True)
    notif_heating_start = Column(Boolean, default=True)
    notif_heating_stop = Column(Boolean, default=True)
    notify_thermal_changes = Column(Boolean, default=False)
    notify_mentions = Column(Boolean, default=True)
    notif_chat_mentions = synonym("notify_mentions")
    notif_task_chat_activity = Column(Boolean, default=False)
    notif_vote_chat_activity = Column(Boolean, default=False)
    notify_task_creation = Column(Boolean, default=False)
    notify_vote_creation = Column(Boolean, default=False)
    notify_vote_arbitration = Column(Boolean, default=False)
    notify_mention_all = Column(Boolean, default=True)
    notif_new_invoices = Column(Boolean, default=True)
    notif_calls_for_funds = synonym("notif_new_invoices")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member = relationship("Member", backref="settings")


class ThermalSettings(Base):
    __tablename__ = "thermal_settings"

    id = Column(Integer, primary_key=True, index=True)
    equipment_type = Column(String(50), unique=True, index=True, nullable=False)  # 'heating', 'pool'
    target_temperature = Column(Float, nullable=True)
    mode = Column(String(50), nullable=True)
    filtration_mode = Column(String(50), nullable=True)
    updated_by = Column(String(100), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=True)  # None = diffusion globale
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    type = Column(String(50), default="info")  # 'vote', 'task', 'sejour', 'thermal', 'mention', 'alert'
    link_path = Column(String(255), nullable=True)  # '/taches', '/calendrier', '/sejour'
    link_id = Column(String(100), nullable=True)  # ID du projet, tâche ou réservation
    email_entry = Column(Text, nullable=True)  # JSON de l'e-mail simulé ou dispatché
    is_read = Column(Boolean, default=False, nullable=False, server_default="0")
    created_at = Column(DateTime, default=datetime.utcnow)

    member = relationship("Member", backref="notifications")


class AppRelease(Base):
    __tablename__ = "app_releases"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(50), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    pages_json = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, server_default="1")
    created_at = Column(DateTime, default=datetime.utcnow)


class MemberReleaseView(Base):
    __tablename__ = "member_release_views"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    release_version = Column(String(50), nullable=False, index=True)
    viewed_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("member_id", "release_version", name="uq_member_release_view"),
    )

    member = relationship("Member", backref="release_views")


OnboardingRelease = AppRelease


class CallForFunds(Base):
    __tablename__ = "calls_for_funds"
    __table_args__ = (
        UniqueConstraint("member_id", "year", "month", name="uq_member_period_call"),
    )

    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String(50), unique=True, index=True, nullable=False)  # ex: AF-202610-HENRI
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    member_name = Column(String(255), nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    period_label = Column(String(100), nullable=False)  # ex: "Octobre 2026"
    theoretical_contribution = Column(Float, default=50.0, nullable=False)
    approved_expenses_total = Column(Float, default=0.0, nullable=False)
    net_amount = Column(Float, default=50.0, nullable=False)
    balance_before = Column(Float, default=0.0, nullable=False)  # Solde de trésorerie avant échéance
    amount_due = Column(Float, default=50.0, nullable=False)  # Montant net réclamé
    status = Column(String(50), default="PENDING_SWAN_IBAN", nullable=False)  # PENDING_SWAN_IBAN, EMIS, REGLE, COUVERT, NEUTRALISE_COMPENSATION, ANNULE
    iban = Column(String(100), nullable=True)
    bic = Column(String(20), nullable=True)
    payment_reference = Column(String(150), nullable=False)  # ex: "Apport CCA - Henri 10/2026"
    pdf_filename = Column(String(255), nullable=True)
    pdf_url = Column(String(255), nullable=True)
    details_json = Column(Text, nullable=True)  # JSON-encoded list of deducted expenses
    bank_transaction_id = Column(Integer, ForeignKey("bank_transactions.id", ondelete="SET NULL"), nullable=True, index=True)
    paid_at = Column(DateTime, nullable=True)
    notification_sent = Column(Boolean, default=False, nullable=False, server_default="0")
    notification_sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member = relationship("Member", backref="calls_for_funds")
    expenses = relationship("MemberExpense", back_populates="call_for_funds")
    bank_transaction = relationship("BankTransaction", foreign_keys=[bank_transaction_id])


class MemberExpense(Base):
    __tablename__ = "member_expenses"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    member_prenom = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    amount = Column(Float, nullable=False)
    expense_date = Column(String(50), nullable=False)  # YYYY-MM-DD
    category = Column(String(100), default="Entretien & Fournitures", nullable=False)
    status = Column(String(50), default="PENDING", nullable=False)  # PENDING, VALIDATED, REJECTED
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True)
    rejection_reason = Column(Text, nullable=True)
    document_id = Column(Integer, ForeignKey("admin_documents.id", ondelete="SET NULL"), nullable=True)
    document_url = Column(String(255), nullable=True)
    document_filename = Column(String(255), nullable=True)
    call_for_funds_id = Column(Integer, ForeignKey("calls_for_funds.id", ondelete="SET NULL"), nullable=True, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member = relationship("Member", backref="member_expenses")
    document = relationship("AdminDocument", backref="member_expense_records")
    call_for_funds = relationship("CallForFunds", back_populates="expenses")
    task = relationship("Task", foreign_keys=[task_id])


class MemberLedgerEntry(Base):
    __tablename__ = "member_ledger_entries"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    entry_type = Column(String(50), nullable=False)  # AVANCE, VIREMENT, ECHEANCE, AJUSTEMENT
    amount = Column(Float, nullable=False)  # Positif pour crédit (+), négatif pour débit (-)
    balance_after = Column(Float, nullable=True)  # Solde cumulé après opération
    entry_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    description = Column(String(255), nullable=True)
    expense_id = Column(Integer, ForeignKey("member_expenses.id", ondelete="SET NULL"), nullable=True, index=True)
    bank_transaction_id = Column(Integer, ForeignKey("bank_transactions.id", ondelete="SET NULL"), nullable=True, index=True)
    call_for_funds_id = Column(Integer, ForeignKey("calls_for_funds.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member = relationship("Member", backref="ledger_entries")
    expense = relationship("MemberExpense", backref="ledger_entries")
    bank_transaction = relationship("BankTransaction", backref="ledger_entries")
    call_for_funds = relationship("CallForFunds", backref="ledger_entries")


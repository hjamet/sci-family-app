from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, UniqueConstraint, Boolean
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    prenom = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    password = Column(String, nullable=False, default="pass123")
    role = Column(String, default="Membre Associé")  # e.g., "Coordinateur", "Membre Associé", "Artisan"
    avatar_color = Column(String, default="cyan")

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
    source_type = Column(String, nullable=True)  # TASK, ISSUE, PROJECT, MANUAL
    source_id = Column(Integer, nullable=True)
    uploaded_by = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
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
    status = Column(String, default="Demande en attente")  # Demande en attente, Confirmée, Refusée
    guest_count = Column(Integer, default=1, nullable=True)
    chambers_used = Column(Integer, default=1, nullable=True)
    selected_rooms = Column(Text, nullable=True)  # JSON-encoded list of exact room names
    rooms_count = Column(Integer, default=1, nullable=True)  # Count of rooms selected
    accepts_extra_family = Column(Boolean, default=True, nullable=True)
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
    vote = Column(String, nullable=False)  # POUR, CONTRE, ABSTENTION
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



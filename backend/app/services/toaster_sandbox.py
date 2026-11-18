import json
import logging
import os
import tempfile
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Type

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, create_engine, event, text
from sqlalchemy.orm import Session, defer, sessionmaker

from ..database import Base
from ..models import (
    AdminDocument,
    BankAccount,
    BankTransaction,
    CallForFunds,
    DocumentCategory,
    HeatingLiveSnapshot,
    HeatingTelemetryHistory,
    Member,
    MemberExpense,
    MemberLedgerEntry,
    MemberSettings,
    Project,
    ProjectComment,
    ProjectVote,
    Property,
    Reservation,
    StayTaskAssignment,
    Task,
    TaskComment,
    ThermalSettings,
)
from .call_for_funds_service import reconcile_open_calls_for_member
from .treasury_service import add_ledger_entry, get_member_treasury_summary

logger = logging.getLogger("sci_api.toaster_sandbox")

SANDBOX_DB_PATH = os.path.join(tempfile.gettempdir(), "sci_toaster_sandbox.db")
SANDBOX_DB_URL = f"sqlite:///{SANDBOX_DB_PATH}"

sandbox_engine = create_engine(
    SANDBOX_DB_URL,
    connect_args={"check_same_thread": False},
)


@event.listens_for(sandbox_engine, "connect")
def _set_sandbox_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.close()


SandboxSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sandbox_engine)


class SandboxAuditLog(Base):
    """Journal d'audit du bac à sable : trace les mutations DB et intercepte ViCare, Klereo et SMTP."""

    __tablename__ = "sandbox_audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    category = Column(String(50), nullable=False)  # VICARE | KLEREO | EMAIL | DB_MUTATION
    title = Column(String(255), nullable=False)
    payload_json = Column(Text, nullable=False, default="{}")


class SandboxHeatingTelemetry(Base):
    """Table unifiée heating_telemetry du bac à sable miroir SQLite."""

    __tablename__ = "heating_telemetry"

    id = Column(Integer, primary_key=True, index=True)
    recorded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    mode = Column(String(50), default="standby", nullable=False)
    target_temperature = Column(Float, default=20.0, nullable=False)
    room_temperature = Column(Float, nullable=True)
    outside_temperature = Column(Float, nullable=True)
    boiler_temperature = Column(Float, nullable=True)
    dhw_temperature = Column(Float, nullable=True)
    is_heating_active = Column(Integer, default=0, nullable=False)
    burner_active = Column(Integer, default=0, nullable=False)
    burner_hours = Column(Float, nullable=True)
    fuel_liters_remaining = Column(Float, nullable=True)
    pool_mode = Column(String(50), default="eco", nullable=True)
    pool_filtration_mode = Column(String(50), default="auto", nullable=True)
    pool_temperature = Column(Float, default=26.0, nullable=True)
    updated_by = Column(String(100), nullable=True)


CLONED_MODELS: List[Type[Any]] = [
    Property,
    Member,
    MemberSettings,
    DocumentCategory,
    Reservation,
    StayTaskAssignment,
    Task,
    TaskComment,
    Project,
    ProjectVote,
    ProjectComment,
    AdminDocument,
    BankAccount,
    BankTransaction,
    CallForFunds,
    MemberExpense,
    MemberLedgerEntry,
    ThermalSettings,
    HeatingLiveSnapshot,
    HeatingTelemetryHistory,
]


def get_sandbox_db():
    db = SandboxSessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _clone_table_rows(
    prod_db: Session,
    s_db: Session,
    model: Type[Any],
    exclude_cols: Optional[Set[str]] = None,
    limit: Optional[int] = None,
) -> int:
    exclude = exclude_cols or set()
    query = prod_db.query(model)
    if model is AdminDocument:
        query = query.options(defer(AdminDocument.file_data))
    if model is HeatingTelemetryHistory:
        query = query.order_by(HeatingTelemetryHistory.recorded_at.desc())
    if limit is not None:
        query = query.limit(limit)

    rows = query.all()
    col_names = [col.name for col in model.__table__.columns if col.name not in exclude]
    for row in rows:
        data = {col: getattr(row, col) for col in col_names}
        if model is AdminDocument:
            data["file_data"] = None
        s_db.add(model(**data))
    return len(rows)


def _sync_unified_heating_telemetry(s_db: Session) -> SandboxHeatingTelemetry:
    heating_setting = s_db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "heating").first()
    pool_setting = s_db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "pool").first()
    snapshot = s_db.query(HeatingLiveSnapshot).filter(HeatingLiveSnapshot.id == 1).first()
    last_hist = (
        s_db.query(HeatingTelemetryHistory)
        .order_by(HeatingTelemetryHistory.recorded_at.desc())
        .first()
    )

    snap_data: Dict[str, Any] = {}
    if snapshot and snapshot.payload:
        snap_data = json.loads(snapshot.payload)

    mode = (
        (heating_setting.mode if heating_setting and heating_setting.mode else None)
        or snap_data.get("active_mode")
        or snap_data.get("mode")
        or (last_hist.mode if last_hist else None)
        or "standby"
    )
    target_temp = (
        (heating_setting.target_temperature if heating_setting and heating_setting.target_temperature is not None else None)
        or snap_data.get("target_temp")
        or snap_data.get("target_temperature")
        or (last_hist.target_temperature if last_hist else None)
        or 20.0
    )
    room_temp = snap_data.get("room_temperature")
    if room_temp is None and last_hist:
        room_temp = last_hist.room_temperature
    outside_temp = snap_data.get("outside_temperature")
    if outside_temp is None and last_hist:
        outside_temp = last_hist.outside_temperature
    boiler_temp = snap_data.get("boiler_temperature")
    if boiler_temp is None and last_hist:
        boiler_temp = last_hist.boiler_temperature
    dhw_temp = snap_data.get("dhw_temperature")
    if dhw_temp is None and last_hist:
        dhw_temp = last_hist.dhw_temperature
    burner_hours = snap_data.get("burner_hours")
    if burner_hours is None and last_hist:
        burner_hours = last_hist.burner_hours
    fuel_liters = snap_data.get("fuel_liters_remaining")
    if fuel_liters is None and last_hist:
        fuel_liters = last_hist.fuel_liters_remaining

    is_heating_active = 1 if mode in ("dhwAndHeating", "forcedNormal") else 0
    burner_active = 1 if snap_data.get("burner_active") else 0

    telemetry_row = s_db.query(SandboxHeatingTelemetry).filter(SandboxHeatingTelemetry.id == 1).first()
    if not telemetry_row:
        telemetry_row = SandboxHeatingTelemetry(id=1)
        s_db.add(telemetry_row)

    telemetry_row.recorded_at = snapshot.recorded_at if snapshot else datetime.utcnow()
    telemetry_row.mode = mode
    telemetry_row.target_temperature = float(target_temp)
    telemetry_row.room_temperature = float(room_temp) if room_temp is not None else 15.8
    telemetry_row.outside_temperature = float(outside_temp) if outside_temp is not None else 11.2
    telemetry_row.boiler_temperature = float(boiler_temp) if boiler_temp is not None else 42.0
    telemetry_row.dhw_temperature = float(dhw_temp) if dhw_temp is not None else 50.0
    telemetry_row.is_heating_active = is_heating_active
    telemetry_row.burner_active = burner_active
    telemetry_row.burner_hours = float(burner_hours) if burner_hours is not None else 1420.5
    telemetry_row.fuel_liters_remaining = float(fuel_liters) if fuel_liters is not None else 1850.0
    telemetry_row.pool_mode = pool_setting.mode if pool_setting and pool_setting.mode else "eco"
    telemetry_row.pool_filtration_mode = (
        pool_setting.filtration_mode if pool_setting and pool_setting.filtration_mode else "auto"
    )
    telemetry_row.pool_temperature = (
        float(pool_setting.target_temperature)
        if pool_setting and pool_setting.target_temperature is not None
        else 26.0
    )
    telemetry_row.updated_by = (
        heating_setting.updated_by if heating_setting and heating_setting.updated_by else "Système ViCare"
    )
    s_db.commit()
    s_db.refresh(telemetry_row)
    return telemetry_row


def init_or_reset_sandbox(prod_db: Session) -> Dict[str, Any]:
    """
    Réinitialise intégralement la base SQLite du bac à sable et y clone à la volée
    les données actuelles de PostgreSQL prod, en vidant sandbox_audit_logs.
    """
    Base.metadata.drop_all(bind=sandbox_engine)
    Base.metadata.create_all(bind=sandbox_engine)

    counts: Dict[str, int] = {}
    with SandboxSessionLocal() as s_db:
        s_db.execute(text("PRAGMA foreign_keys=OFF;"))
        for model in CLONED_MODELS:
            exclude = {"file_data"} if model is AdminDocument else set()
            limit = 60 if model is HeatingTelemetryHistory else None
            counts[model.__tablename__] = _clone_table_rows(
                prod_db=prod_db,
                s_db=s_db,
                model=model,
                exclude_cols=exclude,
                limit=limit,
            )
        s_db.commit()
        _sync_unified_heating_telemetry(s_db)
        # Vue SQLite 'documents' pointant sur 'admin_documents' pour compatibilité directe
        s_db.execute(text("DROP VIEW IF EXISTS documents;"))
        s_db.execute(text("CREATE VIEW documents AS SELECT * FROM admin_documents;"))
        s_db.commit()

    logger.info(f"[TOASTER SANDBOX] Bac à sable SQLite réinitialisé ({SANDBOX_DB_PATH}) : {counts}")
    return {
        "sandbox_db_path": SANDBOX_DB_PATH,
        "cloned_counts": counts,
        "reset_at": datetime.utcnow().isoformat() + "Z",
    }


def ensure_sandbox_initialized(prod_db: Session) -> None:
    """
    Initialise le bac à sable SQLite s'il n'existe pas encore ou ne contient aucun membre.
    Si aucune action utilisateur n'a été jouée dans le bac à sable (0 log d'audit) et que le
    fichier SQLite date de plus de 60 s, resynchronise automatiquement depuis PostgreSQL prod
    afin que la lecture reflète toujours l'état réel à jour.
    """
    if not os.path.exists(SANDBOX_DB_PATH):
        init_or_reset_sandbox(prod_db)
        return
    Base.metadata.create_all(bind=sandbox_engine)
    with SandboxSessionLocal() as s_db:
        member_count = s_db.query(Member).count()
        audit_count = s_db.query(SandboxAuditLog).count()
    if member_count == 0:
        init_or_reset_sandbox(prod_db)
        return
    if audit_count == 0:
        file_age_s = datetime.utcnow().timestamp() - os.path.getmtime(SANDBOX_DB_PATH)
        if file_age_s > 60.0:
            init_or_reset_sandbox(prod_db)
            return
    with SandboxSessionLocal() as s_db:
        _sync_unified_heating_telemetry(s_db)


def log_sandbox_audit(
    s_db: Session,
    category: str,
    title: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """Enregistre une entrée d'audit dans sandbox_audit_logs (VICARE | KLEREO | EMAIL | DB_MUTATION)."""
    entry = SandboxAuditLog(
        created_at=datetime.utcnow(),
        category=category,
        title=title,
        payload_json=json.dumps(payload, ensure_ascii=False, default=str),
    )
    s_db.add(entry)
    s_db.commit()
    s_db.refresh(entry)
    return format_audit_log(entry)


def format_audit_log(entry: SandboxAuditLog) -> Dict[str, Any]:
    parsed = json.loads(entry.payload_json) if entry.payload_json else {}
    return {
        "id": entry.id,
        "created_at": entry.created_at.isoformat() + "Z" if entry.created_at else None,
        "category": entry.category,
        "title": entry.title,
        "payload_json": entry.payload_json,
        "payload": parsed,
    }


def intercept_vicare_command(
    s_db: Session,
    mode: str,
    target_temperature: float,
    member_name: str,
    reason: str = "Commande manuelle bac à sable",
) -> Dict[str, Any]:
    """
    Coupe-circuit matériel Viessmann ViCare :
    N'appelle JAMAIS l'API ViCare réelle. Met à jour l'état thermique du bac à sable
    et enregistre l'intention de commande dans sandbox_audit_logs (catégorie VICARE).
    """
    setting = s_db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "heating").first()
    if not setting:
        setting = ThermalSettings(equipment_type="heating")
        s_db.add(setting)
    setting.mode = mode
    setting.target_temperature = float(target_temperature)
    setting.updated_by = member_name
    setting.updated_at = datetime.utcnow()

    telemetry = s_db.query(SandboxHeatingTelemetry).filter(SandboxHeatingTelemetry.id == 1).first()
    if not telemetry:
        telemetry = _sync_unified_heating_telemetry(s_db)
    telemetry.mode = mode
    telemetry.target_temperature = float(target_temperature)
    telemetry.is_heating_active = 1 if mode in ("dhwAndHeating", "forcedNormal") else 0
    telemetry.burner_active = 1 if (telemetry.is_heating_active and float(target_temperature) > (telemetry.room_temperature or 16.0)) else 0
    telemetry.updated_by = member_name
    telemetry.recorded_at = datetime.utcnow()

    snapshot = s_db.query(HeatingLiveSnapshot).filter(HeatingLiveSnapshot.id == 1).first()
    if snapshot and snapshot.payload:
        snap_payload = json.loads(snapshot.payload)
        snap_payload["mode"] = mode
        snap_payload["active_mode"] = mode
        snap_payload["target_temperature"] = float(target_temperature)
        snap_payload["target_temp"] = float(target_temperature)
        snap_payload["is_heating_active"] = bool(telemetry.is_heating_active)
        snapshot.payload = json.dumps(snap_payload, ensure_ascii=False)
        snapshot.recorded_at = datetime.utcnow()

    s_db.commit()

    return log_sandbox_audit(
        s_db=s_db,
        category="VICARE",
        title=f"[INTERCEPTÉ] ViCare set_mode('{mode}') & set_temperature({float(target_temperature):.1f} °C)",
        payload={
            "hardware": "Viessmann Vitola 200 / Vitoconnect Opto2 (Presbytère)",
            "intercepted": True,
            "real_api_called": False,
            "commands": [
                f"ViCareService.set_mode('{mode}')",
                f"ViCareService.set_temperature({float(target_temperature):.1f}, program='normal')",
            ],
            "mode": mode,
            "target_temperature": float(target_temperature),
            "requested_by": member_name,
            "reason": reason,
        },
    )


def intercept_klereo_command(
    s_db: Session,
    pool_mode: str,
    filtration_mode: str,
    target_temperature: float,
    member_name: str,
) -> Dict[str, Any]:
    """
    Coupe-circuit matériel Klereo Piscine :
    N'appelle JAMAIS l'API Klereo réelle. Met à jour le bac à sable et journalise dans sandbox_audit_logs.
    """
    pool_setting = s_db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "pool").first()
    if not pool_setting:
        pool_setting = ThermalSettings(equipment_type="pool")
        s_db.add(pool_setting)
    pool_setting.mode = pool_mode
    pool_setting.filtration_mode = filtration_mode
    pool_setting.target_temperature = float(target_temperature)
    pool_setting.updated_by = member_name
    pool_setting.updated_at = datetime.utcnow()

    telemetry = s_db.query(SandboxHeatingTelemetry).filter(SandboxHeatingTelemetry.id == 1).first()
    if not telemetry:
        telemetry = _sync_unified_heating_telemetry(s_db)
    telemetry.pool_mode = pool_mode
    telemetry.pool_filtration_mode = filtration_mode
    telemetry.pool_temperature = float(target_temperature)
    telemetry.updated_by = member_name
    telemetry.recorded_at = datetime.utcnow()
    s_db.commit()

    return log_sandbox_audit(
        s_db=s_db,
        category="KLEREO",
        title=f"[INTERCEPTÉ] Klereo set_heating_mode('{pool_mode}', {float(target_temperature):.1f} °C) & filtration='{filtration_mode}'",
        payload={
            "hardware": "Klereo Kompact M9 (Piscine Domaine)",
            "intercepted": True,
            "real_api_called": False,
            "pool_mode": pool_mode,
            "filtration_mode": filtration_mode,
            "target_temperature": float(target_temperature),
            "requested_by": member_name,
        },
    )


def intercept_email_notification(
    s_db: Session,
    subject: str,
    recipients: List[str],
    summary: str,
    trigger: str,
) -> Dict[str, Any]:
    """
    Coupe-circuit SMTP / Resend :
    N'envoie JAMAIS d'e-mail réel. Journalise l'e-mail intercepté dans sandbox_audit_logs (catégorie EMAIL).
    """
    return log_sandbox_audit(
        s_db=s_db,
        category="EMAIL",
        title=f"[INTERCEPTÉ] E-mail « {subject} » → {', '.join(recipients)}",
        payload={
            "provider": "Resend SMTP (Coupe-circuit Bac à Sable)",
            "intercepted": True,
            "real_email_sent": False,
            "trigger": trigger,
            "subject": subject,
            "recipients": recipients,
            "summary": summary,
        },
    )


def _format_member_prenom(m: Member) -> str:
    prenom = (m.prenom or "").strip()
    email_low = (m.email or "").strip().lower()
    if email_low == "elizabeth_jamet@yahoo.fr" or prenom.lower() in ("maman", "elisabeth", "elizabeth"):
        return "Élisabeth"
    return prenom or "Associé"


def _format_member_display_name(m: Member) -> str:
    prenom = _format_member_prenom(m)
    if prenom == "Élisabeth":
        return "Élisabeth Jamet"
    nom = (m.name or "").strip()
    if nom and prenom and prenom.lower() in nom.lower():
        return nom
    return f"{prenom} {nom}".strip() or nom or prenom


def get_sandbox_state(prod_db: Session, member_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Retourne l'état complet du bac à sable pour GET /api/toaster/state :
    - liste des membres (id, prenom, nom, email)
    - résumé complet du membre actif (solde trésorerie, séjours, tâches, votes ouverts, télémétrie chauffage/fioul)
    - sandbox_audit_logs
    """
    ensure_sandbox_initialized(prod_db)

    with SandboxSessionLocal() as s_db:
        members = s_db.query(Member).order_by(Member.id.asc()).all()
        active_member = None
        if member_id is not None:
            active_member = s_db.query(Member).filter(Member.id == member_id).first()
        if not active_member and members:
            active_member = next(
                (m for m in members if (m.prenom or "").lower() == "henri"),
                members[0],
            )

        members_list = [
            {
                "id": m.id,
                "prenom": _format_member_prenom(m),
                "nom": _format_member_display_name(m),
                "name": _format_member_display_name(m),
                "email": m.email,
                "role": m.role,
                "is_coordinator": bool(m.is_coordinator),
                "avatar_color": m.avatar_color,
                "monthly_contribution": float(m.monthly_contribution or 50.0),
                "payment_reference": (
                    "HLV-ELISABETH"
                    if _format_member_prenom(m) == "Élisabeth"
                    else (m.payment_reference or f"HLV-{_format_member_prenom(m).upper()}")
                ),
            }
            for m in members
        ]

        treasury_summary = get_member_treasury_summary(s_db, active_member) if active_member else {}
        member_calls = []
        member_expenses = []
        if active_member:
            calls_q = (
                s_db.query(CallForFunds)
                .filter(CallForFunds.member_id == active_member.id)
                .order_by(CallForFunds.year.desc(), CallForFunds.month.desc())
                .all()
            )
            member_calls = [
                {
                    "id": c.id,
                    "reference": c.reference,
                    "period_label": c.period_label,
                    "year": c.year,
                    "month": c.month,
                    "theoretical_contribution": float(c.theoretical_contribution or 0.0),
                    "approved_expenses_total": float(c.approved_expenses_total or 0.0),
                    "balance_before": float(c.balance_before or 0.0),
                    "net_amount": float(c.net_amount or 0.0),
                    "amount_due": float(c.amount_due if c.amount_due is not None else (c.net_amount or 0.0)),
                    "status": c.status,
                    "payment_reference": c.payment_reference,
                }
                for c in calls_q
            ]
            exps_q = (
                s_db.query(MemberExpense)
                .filter(MemberExpense.member_id == active_member.id)
                .order_by(MemberExpense.id.desc())
                .all()
            )
            member_expenses = [
                {
                    "id": e.id,
                    "title": e.title,
                    "amount": float(e.amount or 0.0),
                    "expense_date": e.expense_date,
                    "category": e.category,
                    "payer_type": e.payer_type,
                    "status": e.status,
                    "document_filename": e.document_filename,
                }
                for e in exps_q
            ]
            treasury_summary["calls_for_funds"] = member_calls
            treasury_summary["expenses"] = member_expenses

        reservations_q = s_db.query(Reservation).order_by(Reservation.start_date.asc()).all()
        stays_list = []
        for r in reservations_q:
            is_mine = False
            if active_member:
                u_low = (r.user_name or "").lower()
                is_mine = (
                    active_member.prenom.lower() in u_low
                    or active_member.name.lower() in u_low
                )
            stays_list.append(
                {
                    "id": r.id,
                    "property_id": r.property_id,
                    "property_name": r.property_name or ("Presbytère" if r.property_id == 2 else "Rosings"),
                    "user_name": r.user_name,
                    "start_date": r.start_date,
                    "end_date": r.end_date,
                    "arrival_time": r.arrival_time or "15:00",
                    "departure_time": r.departure_time or "11:00",
                    "status": r.status,
                    "guest_count": r.guest_count or 1,
                    "chambers_used": r.chambers_used or 1,
                    "selected_rooms": r.selected_rooms,
                    "notes": r.notes,
                    "is_member_stay": is_mine,
                }
            )

        tasks_q = s_db.query(Task).order_by(Task.id.desc()).all()
        tasks_list = []
        for t in tasks_q:
            assigned_raw = t.assigned_members or "[]"
            try:
                assigned_arr = json.loads(assigned_raw) if isinstance(assigned_raw, str) else assigned_raw
                if not isinstance(assigned_arr, list):
                    assigned_arr = [str(assigned_raw)]
            except Exception:
                assigned_arr = [s.strip() for s in str(assigned_raw).split(",") if s.strip()]

            is_assigned = False
            if active_member:
                is_assigned = (t.assignee_id == active_member.id) or any(
                    active_member.prenom.lower() in str(m_name).lower()
                    or active_member.name.lower() in str(m_name).lower()
                    for m_name in assigned_arr
                )
            tasks_list.append(
                {
                    "id": t.id,
                    "ref": t.ref or f"T-{t.id}",
                    "title": t.title,
                    "description": t.description,
                    "subject": t.subject,
                    "category": t.category,
                    "priority": t.priority,
                    "status": t.status,
                    "charge_points": t.charge_points or 3,
                    "budget": float(t.budget or 0.0),
                    "assignee_id": t.assignee_id,
                    "assigned_members": assigned_arr,
                    "deadline": t.deadline,
                    "created_by": t.created_by,
                    "is_assigned_to_member": is_assigned,
                }
            )

        projects_q = s_db.query(Project).order_by(Project.id.desc()).all()
        all_votes = s_db.query(ProjectVote).all()
        votes_by_project: Dict[int, List[ProjectVote]] = {}
        for v in all_votes:
            votes_by_project.setdefault(v.project_id, []).append(v)

        polls_list = []
        for p in projects_q:
            p_votes = votes_by_project.get(p.id, [])
            my_vote = None
            if active_member:
                for v in p_votes:
                    v_user = (v.user_name or "").lower()
                    if active_member.prenom.lower() in v_user or active_member.name.lower() in v_user:
                        my_vote = v.vote
                        break
            opts = []
            if p.options:
                try:
                    opts = json.loads(p.options) if isinstance(p.options, str) else p.options
                except Exception:
                    opts = []
            polls_list.append(
                {
                    "id": p.id,
                    "property_id": p.property_id,
                    "title": p.title,
                    "description": p.description,
                    "estimated_cost": float(p.estimated_cost or 0.0),
                    "category": p.category,
                    "priority": p.priority,
                    "status": p.status,
                    "submitted_by": p.submitted_by,
                    "options": opts if isinstance(opts, list) else [],
                    "allow_multiple_choices": bool(p.allow_multiple_choices),
                    "votes": [
                        {
                            "id": v.id,
                            "user_name": v.user_name,
                            "vote": v.vote,
                            "comment": v.comment,
                        }
                        for v in p_votes
                    ],
                    "member_vote": my_vote,
                }
            )

        telemetry = _sync_unified_heating_telemetry(s_db)
        fuel_liters = float(telemetry.fuel_liters_remaining or 942.1)
        is_gateway_offline = False
        if telemetry.recorded_at:
            is_gateway_offline = (datetime.utcnow() - telemetry.recorded_at).total_seconds() > 1200
        heating_data = {
            "mode": telemetry.mode,
            "target_temperature": float(telemetry.target_temperature or 20.0),
            "comfort_temperature": 20.0,
            "reduced_temperature": 6.0,
            "night_schedule_note": "Jour confort 20.0 °C (04h30–21h00) • Nuit abaissement réduit 6.0 °C (21h00–04h30, pas de chauffe la nuit)",
            "room_temperature": float(telemetry.room_temperature or 15.8),
            "outside_temperature": float(telemetry.outside_temperature or 11.2),
            "boiler_temperature": float(telemetry.boiler_temperature or 42.0),
            "dhw_temperature": float(telemetry.dhw_temperature or 50.0),
            "is_heating_active": bool(telemetry.is_heating_active),
            "burner_active": bool(telemetry.burner_active),
            "burner_hours": float(telemetry.burner_hours or 4605.0),
            "fuel_liters_remaining": fuel_liters,
            "fuel_capacity_liters": 3000.0,
            "fuel_percent": round((fuel_liters / 3000.0) * 100.0, 1),
            "is_gateway_offline": is_gateway_offline,
            "pool_mode": telemetry.pool_mode or "eco",
            "pool_filtration_mode": telemetry.pool_filtration_mode or "auto",
            "pool_temperature": float(telemetry.pool_temperature or 26.0),
            "updated_by": telemetry.updated_by,
            "recorded_at": telemetry.recorded_at.isoformat() + "Z" if telemetry.recorded_at else None,
        }

        bank_accounts = s_db.query(BankAccount).order_by(BankAccount.id.desc()).all()
        real_bank = next(
            (
                b
                for b in bank_accounts
                if b.iban and "000000000000" not in b.iban.replace(" ", "")
            ),
            bank_accounts[0] if bank_accounts else None,
        )
        recent_txs = (
            s_db.query(BankTransaction)
            .order_by(BankTransaction.booking_date.desc(), BankTransaction.id.desc())
            .limit(10)
            .all()
        )
        swan_banking = {
            "bank_name": real_bank.aspsp_name if real_bank else "Swan",
            "iban": real_bank.iban if real_bank else "FR76 1732 8844 0071 5921 5570 591",
            "balance": float(real_bank.balance or 0.0) if real_bank else 0.0,
            "last_synced_at": real_bank.last_synced_at.isoformat() + "Z" if (real_bank and real_bank.last_synced_at) else None,
            "recent_transactions": [
                {
                    "id": tx.id,
                    "booking_date": tx.booking_date,
                    "amount": float(tx.amount or 0.0),
                    "counterparty": tx.debtor_name if float(tx.amount or 0.0) >= 0 else tx.creditor_name,
                    "label": tx.remittance_information,
                }
                for tx in recent_txs
            ],
        }
        associates_balances = []
        for m in members:
            m_sum = get_member_treasury_summary(s_db, m)
            associates_balances.append(
                {
                    "id": m.id,
                    "name": _format_member_display_name(m),
                    "prenom": m.prenom,
                    "monthly_contribution": float(m.monthly_contribution or 0.0),
                    "cca_balance": float(m_sum.get("balance") or 0.0),
                    "covered_months": int(m_sum.get("covered_months") or 0),
                }
            )
        docs_count = s_db.query(AdminDocument).count()

        audit_rows = s_db.query(SandboxAuditLog).order_by(SandboxAuditLog.id.desc()).limit(100).all()
        audit_logs = [format_audit_log(a) for a in audit_rows]

        active_member_dict = (
            {
                "id": active_member.id,
                "prenom": _format_member_prenom(active_member),
                "nom": _format_member_display_name(active_member),
                "name": _format_member_display_name(active_member),
                "email": active_member.email,
                "role": active_member.role,
                "is_coordinator": bool(active_member.is_coordinator),
                "payment_reference": (
                    "HLV-ELISABETH"
                    if _format_member_prenom(active_member) == "Élisabeth"
                    else (active_member.payment_reference or f"HLV-{_format_member_prenom(active_member).upper()}")
                ),
                "monthly_contribution": float(active_member.monthly_contribution or 50.0),
            }
            if active_member
            else None
        )

        member_summary = {
            "member": active_member_dict,
            "treasury": treasury_summary,
            "swan_banking": swan_banking,
            "associates_balances": associates_balances,
            "documents_count": docs_count,
            "stays": stays_list,
            "tasks": tasks_list,
            "open_votes": polls_list,
            "heating_telemetry": heating_data,
        }

        return {
            "sandbox_db_path": SANDBOX_DB_PATH,
            "members": members_list,
            "active_member": active_member_dict,
            "member_summary": member_summary,
            "treasury": treasury_summary,
            "swan_banking": swan_banking,
            "associates_balances": associates_balances,
            "documents_count": docs_count,
            "stays": stays_list,
            "tasks": tasks_list,
            "open_votes": polls_list,
            "heating_telemetry": heating_data,
            "sandbox_audit_logs": audit_logs,
        }


def _to_bool(val: Any, default: bool = False) -> bool:
    if isinstance(val, bool):
        return val
    if val is None:
        return default
    s = str(val).strip().lower()
    if s in ("true", "1", "yes", "oui", "on", "activer", "confort", "member", "avance"):
        return True
    if s in ("false", "0", "no", "non", "off", "standby", "hors-gel", "sci"):
        return False
    return default


def execute_sandbox_action(
    prod_db: Session,
    member_id: int,
    action_type: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Exécute réellement une action validée depuis une Carte d'Action Hybride
    dans le bac à sable SQLite (zéro écriture Postgres prod, zéro appel ViCare/Klereo/SMTP réel).
    """
    ensure_sandbox_initialized(prod_db)

    norm_type = (action_type or "").strip().lower()
    merged_payload = dict(payload or {})
    for field_list_key in ("deduced_fields", "missing_fields"):
        if isinstance(merged_payload.get(field_list_key), list):
            for item in merged_payload[field_list_key]:
                if isinstance(item, dict) and item.get("key") and item.get("value") is not None:
                    merged_payload[item["key"]] = item["value"]

    audit_added: List[Dict[str, Any]] = []
    confirmation_msg = ""

    with SandboxSessionLocal() as s_db:
        member = s_db.query(Member).filter(Member.id == member_id).first()
        if not member:
            member = s_db.query(Member).order_by(Member.id.asc()).first()
        if not member:
            raise ValueError(f"Aucun membre trouvé dans le bac à sable (member_id={member_id}).")

        if norm_type in ("stay", "propose_stay_action", "reservation", "sejour"):
            operation = str(merged_payload.get("operation") or "create").lower()
            building = str(merged_payload.get("building") or merged_payload.get("property_name") or "Presbytère").strip()
            is_presb = "presbyt" in building.lower()
            prop_id = 2 if is_presb else 1
            prop_name = "Presbytère" if is_presb else "Rosings"
            start_date = str(merged_payload.get("start_date") or datetime.utcnow().strftime("%Y-%m-%d"))
            end_date = str(merged_payload.get("end_date") or start_date)
            arrival_time = str(merged_payload.get("arrival_time") or "15:00")
            departure_time = str(merged_payload.get("departure_time") or "11:00")
            guest_count = int(merged_payload.get("guest_count") or 1)
            chambers_used = int(merged_payload.get("chambers_used") or merged_payload.get("rooms_count") or 1)
            rooms_raw = merged_payload.get("selected_rooms") or merged_payload.get("rooms") or []
            if isinstance(rooms_raw, list):
                rooms_str = json.dumps(rooms_raw, ensure_ascii=False)
            else:
                rooms_str = str(rooms_raw)

            activate_heating = _to_bool(
                merged_payload.get("activate_heating", merged_payload.get("wants_heating")),
                default=is_presb,
            )
            target_temp = float(merged_payload.get("target_temperature") or 20.0)

            if operation in ("cancel", "delete", "annuler"):
                stay_id = merged_payload.get("reservation_id") or merged_payload.get("stay_id") or merged_payload.get("id")
                target_stay = None
                if stay_id:
                    target_stay = s_db.query(Reservation).filter(Reservation.id == int(stay_id)).first()
                if not target_stay:
                    target_stay = (
                        s_db.query(Reservation)
                        .filter(Reservation.user_name.ilike(f"%{member.prenom}%"))
                        .order_by(Reservation.id.desc())
                        .first()
                    )
                if not target_stay:
                    raise ValueError("Aucun séjour correspondant trouvé à annuler dans le bac à sable.")
                target_stay.status = "Annulée"
                s_db.commit()
                audit_added.append(
                    log_sandbox_audit(
                        s_db,
                        "DB_MUTATION",
                        f"Séjour #{target_stay.id} annulé ({target_stay.property_name}, {target_stay.start_date} → {target_stay.end_date})",
                        {"table": "reservations", "operation": "UPDATE", "id": target_stay.id, "status": "Annulée"},
                    )
                )
                confirmation_msg = (
                    f"Le séjour #{target_stay.id} au {target_stay.property_name} "
                    f"({target_stay.start_date} → {target_stay.end_date}) a été annulé dans le bac à sable."
                )
            else:
                try:
                    dt_start = datetime.strptime(start_date[:10], "%Y-%m-%d")
                    year_val = dt_start.year
                    week_val = dt_start.isocalendar()[1]
                except Exception:
                    year_val = datetime.utcnow().year
                    week_val = 1

                domotique_tag = (
                    f"[Domotique: Chauffage Presbytère Confort {target_temp:.0f}°C • Eau Chaude Sanitaire Active]"
                    if (is_presb and activate_heating)
                    else "[Domotique: Chauffage Presbytère Hors-Gel • Eau Chaude Sanitaire Coupée]"
                )
                user_notes = str(merged_payload.get("notes") or "").strip()
                full_notes = f"{user_notes} {domotique_tag}".strip()

                new_stay = Reservation(
                    property_id=prop_id,
                    property_name=prop_name,
                    user_name=member.name,
                    year=year_val,
                    week_number=week_val,
                    start_date=start_date[:10],
                    end_date=end_date[:10],
                    arrival_time=arrival_time,
                    departure_time=departure_time,
                    status="Confirmée",
                    guest_count=guest_count,
                    chambers_used=chambers_used,
                    selected_rooms=rooms_str,
                    rooms_count=chambers_used,
                    notes=full_notes,
                    created_at=datetime.utcnow(),
                )
                s_db.add(new_stay)
                s_db.commit()
                s_db.refresh(new_stay)

                audit_added.append(
                    log_sandbox_audit(
                        s_db,
                        "DB_MUTATION",
                        f"INSERT reservations #{new_stay.id} : {prop_name} ({start_date[:10]} → {end_date[:10]}) pour {member.name}",
                        {
                            "table": "reservations",
                            "operation": "INSERT",
                            "id": new_stay.id,
                            "property_name": prop_name,
                            "user_name": member.name,
                            "start_date": start_date[:10],
                            "end_date": end_date[:10],
                            "guest_count": guest_count,
                            "chambers_used": chambers_used,
                            "activate_heating": activate_heating,
                        },
                    )
                )

                if is_presb and activate_heating:
                    audit_added.append(
                        intercept_vicare_command(
                            s_db=s_db,
                            mode="dhwAndHeating",
                            target_temperature=target_temp,
                            member_name=member.name,
                            reason=f"Asservissement séjour #{new_stay.id} au Presbytère ({start_date[:10]} → {end_date[:10]})",
                        )
                    )

                audit_added.append(
                    intercept_email_notification(
                        s_db=s_db,
                        subject=f"[SCI Hellenvilliers] Séjour confirmé au {prop_name} ({start_date[:10]} au {end_date[:10]})",
                        recipients=[member.email or "hellenvillierssci@gmail.com", "hellenvillierssci@gmail.com"],
                        summary=f"Réservation de {member.name} au {prop_name} ({guest_count} pers., {chambers_used} ch.).",
                        trigger="send_stay_booked_email",
                    )
                )
                heating_suffix = (
                    f" Chaudière ViCare programmée en confort ({target_temp:.0f} °C, commande matérielle interceptée)."
                    if (is_presb and activate_heating)
                    else " Chauffage maintenu en hors-gel."
                )
                confirmation_msg = (
                    f"Séjour #{new_stay.id} confirmé au {prop_name} du {start_date[:10]} au {end_date[:10]} "
                    f"pour {member.name} ({guest_count} pers.).{heating_suffix}"
                )

        elif norm_type in ("heating", "propose_heating_or_pool_action", "pool", "thermal", "chauffage"):
            equipment = str(merged_payload.get("equipment") or "heating").lower()
            raw_mode = str(merged_payload.get("mode") or "dhwAndHeating").strip()
            if raw_mode.lower() in ("confort", "on", "chauffage", "dhwandheating", "normal", "active"):
                mode = "dhwAndHeating"
            elif raw_mode.lower() in ("hors-gel", "standby", "off", "veille", "eco"):
                mode = "standby"
            elif raw_mode.lower() in ("dhw", "ecs"):
                mode = "dhw"
            else:
                mode = raw_mode

            target_temp = float(
                merged_payload.get("target_temperature")
                or merged_payload.get("temperature")
                or (20.0 if mode == "dhwAndHeating" else 10.0)
            )

            if "pool" in equipment or "piscine" in equipment or merged_payload.get("pool_mode"):
                pool_mode = str(merged_payload.get("pool_mode") or merged_payload.get("mode") or "confort")
                filtration = str(merged_payload.get("filtration_mode") or "marche")
                pool_temp = float(merged_payload.get("pool_temperature") or merged_payload.get("target_temperature") or 27.0)
                audit_added.append(
                    intercept_klereo_command(
                        s_db=s_db,
                        pool_mode=pool_mode,
                        filtration_mode=filtration,
                        target_temperature=pool_temp,
                        member_name=member.name,
                    )
                )
                audit_added.append(
                    log_sandbox_audit(
                        s_db,
                        "DB_MUTATION",
                        f"UPDATE thermal_settings (pool) : mode={pool_mode}, consigne={pool_temp:.1f} °C",
                        {"table": "thermal_settings", "equipment_type": "pool", "mode": pool_mode, "target_temperature": pool_temp},
                    )
                )
                confirmation_msg = (
                    f"Piscine programmée en mode « {pool_mode} » ({pool_temp:.1f} °C, filtration « {filtration} »). "
                    f"Requête radio Klereo interceptée par le bac à sable."
                )
            else:
                audit_added.append(
                    intercept_vicare_command(
                        s_db=s_db,
                        mode=mode,
                        target_temperature=target_temp,
                        member_name=member.name,
                        reason="Consigne thermique validée dans l'assistant Grille-Pain",
                    )
                )
                audit_added.append(
                    log_sandbox_audit(
                        s_db,
                        "DB_MUTATION",
                        f"UPDATE thermal_settings & heating_telemetry : mode={mode}, consigne={target_temp:.1f} °C",
                        {"table": "heating_telemetry", "mode": mode, "target_temperature": target_temp, "updated_by": member.name},
                    )
                )
                audit_added.append(
                    intercept_email_notification(
                        s_db=s_db,
                        subject=f"[SCI Hellenvilliers] Modification du chauffage Presbytère ({mode} - {target_temp:.1f} °C)",
                        recipients=[member.email or "hellenvillierssci@gmail.com"],
                        summary=f"{member.name} a passé la chaudière ViCare en mode {mode} ({target_temp:.1f} °C).",
                        trigger="send_thermal_change_email",
                    )
                )
                confirmation_msg = (
                    f"Chaudière Viessmann du Presbytère passée en mode « {mode} » à {target_temp:.1f} °C "
                    f"(commande matérielle ViCare et notification e-mail interceptées dans le bac à sable)."
                )

        elif norm_type in ("expense", "propose_invoice_or_document_upload", "invoice", "document", "facture"):
            supplier = str(merged_payload.get("supplier") or merged_payload.get("artisan") or "Artisan / Fournisseur").strip()
            raw_title = str(merged_payload.get("title") or f"Facture {supplier}").strip()
            amount = float(merged_payload.get("amount") or merged_payload.get("amount_ttc") or 0.0)
            if amount <= 0:
                raise ValueError("Le montant TTC de la facture doit être strictement positif.")
            expense_date = str(merged_payload.get("expense_date") or merged_payload.get("date") or datetime.utcnow().strftime("%Y-%m-%d"))[:10]
            building = str(merged_payload.get("building") or "Presbytère").strip()
            category = str(merged_payload.get("category") or "Entretien & Fournitures").strip()
            filename = str(merged_payload.get("document_filename") or merged_payload.get("attachment_name") or "facture_artisan.pdf")

            advanced_by_member = _to_bool(
                merged_payload.get("advanced_by_member", merged_payload.get("payer_type")),
                default=True,
            )
            payer_type = "member" if advanced_by_member else "sci"
            exp_status = "VALIDATED" if advanced_by_member else "PENDING_SCI_PAYMENT"

            doc = AdminDocument(
                title=raw_title,
                category="Factures",
                file_url=f"/uploads/documents/{filename}",
                file_name=filename,
                file_type="application/pdf",
                uploaded_by=member.name,
                notes=f"Fournisseur : {supplier} | Bâtiment : {building} | Montant TTC : {amount:.2f} €",
                created_at=datetime.utcnow(),
            )
            s_db.add(doc)
            s_db.commit()
            s_db.refresh(doc)

            expense = MemberExpense(
                member_id=member.id,
                member_prenom=member.prenom,
                title=f"{raw_title} ({supplier})" if supplier.lower() not in raw_title.lower() else raw_title,
                amount=round(amount, 2),
                expense_date=expense_date,
                category=category,
                payer_type=payer_type,
                status=exp_status,
                document_id=doc.id,
                document_url=doc.file_url,
                document_filename=filename,
                notes=f"Bâtiment : {building} | Fournisseur : {supplier}",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            s_db.add(expense)
            s_db.commit()
            s_db.refresh(expense)

            new_balance = None
            reconciled_count = 0
            if advanced_by_member:
                ledger_entry = add_ledger_entry(
                    db=s_db,
                    member_id=member.id,
                    entry_type="AVANCE",
                    amount=round(amount, 2),
                    description=f"Avance de frais : {expense.title}",
                    expense_id=expense.id,
                )
                new_balance = ledger_entry.balance_after
                reconciled = reconcile_open_calls_for_member(s_db, member.id)
                reconciled_count = len(reconciled)
            else:
                sci_task = Task(
                    ref=f"T-SCI-{expense.id}",
                    title=f"Règlement facture SCI : {expense.title} ({amount:.2f} €)",
                    description=f"Facture {supplier} du {expense_date} ({building}) à régler par virement SCI.",
                    subject=building,
                    category="Trésorerie & Factures",
                    priority="Haute",
                    status="A_FAIRE",
                    budget=round(amount, 2),
                    created_by=member.name,
                    created_at=datetime.utcnow(),
                )
                s_db.add(sci_task)
                s_db.commit()
                expense.task_id = sci_task.id
                s_db.commit()

            audit_added.append(
                log_sandbox_audit(
                    s_db,
                    "DB_MUTATION",
                    f"INSERT member_expenses #{expense.id} ({amount:.2f} €) + admin_documents #{doc.id} ({payer_type})",
                    {
                        "table": "member_expenses",
                        "expense_id": expense.id,
                        "document_id": doc.id,
                        "title": expense.title,
                        "amount": round(amount, 2),
                        "payer_type": payer_type,
                        "status": exp_status,
                        "new_ledger_balance": new_balance,
                        "reconciled_calls_count": reconciled_count,
                    },
                )
            )
            audit_added.append(
                intercept_email_notification(
                    s_db=s_db,
                    subject=f"[SCI Hellenvilliers] Nouvelle facture déposée : {expense.title} ({amount:.2f} €)",
                    recipients=["hellenvillierssci@gmail.com"],
                    summary=f"Facture déposée par {member.name} ({payer_type}) : {amount:.2f} € TTC.",
                    trigger="send_invoice_approval_request_email",
                )
            )
            if advanced_by_member:
                confirmation_msg = (
                    f"Facture « {expense.title} » de {amount:.2f} € enregistrée en avance personnelle "
                    f"et créditée au grand livre de {member.prenom} (nouveau solde : {new_balance:+.2f} €, "
                    f"{reconciled_count} appel(s) de fonds réconcilié(s))."
                )
            else:
                confirmation_msg = (
                    f"Facture « {expense.title} » de {amount:.2f} € archivée et inscrite en attente de règlement direct par la SCI."
                )

        elif norm_type in ("task", "propose_task_action", "tache"):
            operation = str(merged_payload.get("operation") or ("complete" if merged_payload.get("task_id") else "create")).lower()
            task_id = merged_payload.get("task_id") or merged_payload.get("id")
            title_val = str(merged_payload.get("title") or "").strip()

            target_task = None
            if task_id:
                target_task = s_db.query(Task).filter(Task.id == int(task_id)).first()
            if not target_task and title_val and operation in ("complete", "close", "check", "assign", "update", "terminee"):
                target_task = s_db.query(Task).filter(Task.title.ilike(f"%{title_val}%")).first()

            if operation in ("complete", "close", "check", "terminee", "termine") or (
                target_task and str(merged_payload.get("status", "")).upper() in ("TERMINE", "TERMINEE")
            ):
                if not target_task:
                    raise ValueError("Tâche introuvable dans le bac à sable pour clôture.")
                new_status = str(merged_payload.get("status") or "TERMINEE").upper()
                target_task.status = new_status
                target_task.last_completed_at = datetime.utcnow()
                target_task.completion_notes = str(
                    merged_payload.get("completion_notes") or f"Validée par {member.name} via l'assistant Grille-Pain"
                )
                target_task.updated_at = datetime.utcnow()
                s_db.commit()

                audit_added.append(
                    log_sandbox_audit(
                        s_db,
                        "DB_MUTATION",
                        f"UPDATE tasks #{target_task.id} → statut={new_status} (« {target_task.title} »)",
                        {"table": "tasks", "operation": "UPDATE", "id": target_task.id, "title": target_task.title, "status": new_status},
                    )
                )
                audit_added.append(
                    intercept_email_notification(
                        s_db=s_db,
                        subject=f"[SCI Hellenvilliers] Tâche terminée : {target_task.title}",
                        recipients=["hellenvillierssci@gmail.com"],
                        summary=f"{member.name} a marqué la tâche #{target_task.id} comme {new_status}.",
                        trigger="task_completed",
                    )
                )
                confirmation_msg = f"La tâche #{target_task.id} « {target_task.title} » a été cochée comme {new_status}."
            else:
                assignee_name = str(merged_payload.get("assigned_to") or merged_payload.get("assignee") or member.name).strip()
                assignee_obj = (
                    s_db.query(Member)
                    .filter((Member.prenom.ilike(f"%{assignee_name}%")) | (Member.name.ilike(f"%{assignee_name}%")))
                    .first()
                )
                if target_task and operation == "assign":
                    target_task.assignee_id = assignee_obj.id if assignee_obj else member.id
                    target_task.assigned_members = json.dumps([assignee_obj.name if assignee_obj else assignee_name], ensure_ascii=False)
                    target_task.updated_at = datetime.utcnow()
                    s_db.commit()
                    audit_added.append(
                        log_sandbox_audit(
                            s_db,
                            "DB_MUTATION",
                            f"UPDATE tasks #{target_task.id} attribuée à {assignee_obj.name if assignee_obj else assignee_name}",
                            {"table": "tasks", "operation": "ASSIGN", "id": target_task.id, "assigned_to": assignee_name},
                        )
                    )
                    confirmation_msg = f"La tâche #{target_task.id} « {target_task.title} » a été attribuée à {assignee_obj.name if assignee_obj else assignee_name}."
                else:
                    if not title_val:
                        raise ValueError("Le titre de la tâche à créer est requis.")
                    subject_val = str(merged_payload.get("subject") or merged_payload.get("building") or "Presbytère")
                    priority_val = str(merged_payload.get("priority") or "Normale")
                    charge_pts = int(merged_payload.get("charge_points") or 3)
                    new_task = Task(
                        ref=f"T-2026-{int(datetime.utcnow().timestamp()) % 10000:04d}",
                        title=title_val,
                        description=str(merged_payload.get("description") or title_val),
                        subject=subject_val,
                        category=str(merged_payload.get("category") or "Entretien"),
                        priority=priority_val,
                        status="A_FAIRE",
                        charge_points=charge_pts,
                        assignee_id=assignee_obj.id if assignee_obj else member.id,
                        assigned_members=json.dumps([assignee_obj.name if assignee_obj else member.name], ensure_ascii=False),
                        deadline=merged_payload.get("deadline"),
                        created_by=member.name,
                        created_at=datetime.utcnow(),
                    )
                    s_db.add(new_task)
                    s_db.commit()
                    s_db.refresh(new_task)

                    audit_added.append(
                        log_sandbox_audit(
                            s_db,
                            "DB_MUTATION",
                            f"INSERT tasks #{new_task.id} « {new_task.title} » ({subject_val})",
                            {
                                "table": "tasks",
                                "operation": "INSERT",
                                "id": new_task.id,
                                "title": new_task.title,
                                "subject": subject_val,
                                "assigned_to": assignee_obj.name if assignee_obj else member.name,
                            },
                        )
                    )
                    audit_added.append(
                        intercept_email_notification(
                            s_db=s_db,
                            subject=f"[SCI Hellenvilliers] Nouvelle tâche attribuée : {new_task.title}",
                            recipients=[(assignee_obj.email if assignee_obj and assignee_obj.email else member.email) or "hellenvillierssci@gmail.com"],
                            summary=f"Tâche créée par {member.name} sur {subject_val}.",
                            trigger="send_task_assigned_email",
                        )
                    )
                    confirmation_msg = (
                        f"Nouvelle tâche #{new_task.id} « {new_task.title} » créée sur {subject_val} "
                        f"et attribuée à {assignee_obj.name if assignee_obj else member.name}."
                    )

        elif norm_type in ("vote", "propose_poll_or_vote_action", "poll", "scrutin", "project"):
            operation = str(merged_payload.get("operation") or ("create" if not merged_payload.get("project_id") and merged_payload.get("options") else "vote")).lower()
            if operation == "create":
                title_val = str(merged_payload.get("title") or "Nouveau scrutin familial").strip()
                desc_val = str(merged_payload.get("description") or title_val).strip()
                options_val = merged_payload.get("options") or ["POUR", "CONTRE", "ABSTENTION"]
                if isinstance(options_val, str):
                    options_val = [o.strip() for o in options_val.split(",") if o.strip()]
                new_proj = Project(
                    property_id=2,
                    title=title_val,
                    description=desc_val,
                    estimated_cost=float(merged_payload.get("estimated_cost") or 0.0),
                    category=str(merged_payload.get("category") or "🗳️ Scrutin Familial"),
                    priority=str(merged_payload.get("priority") or "MOYENNE"),
                    status="EN_VOTE",
                    submitted_by=member.name,
                    options=json.dumps(options_val, ensure_ascii=False),
                    allow_multiple_choices=bool(merged_payload.get("allow_multiple_choices", len(options_val) > 3)),
                    created_at=datetime.utcnow(),
                )
                s_db.add(new_proj)
                s_db.commit()
                s_db.refresh(new_proj)
                audit_added.append(
                    log_sandbox_audit(
                        s_db,
                        "DB_MUTATION",
                        f"INSERT projects #{new_proj.id} (scrutin ouvert) : « {new_proj.title} »",
                        {"table": "projects", "operation": "INSERT", "id": new_proj.id, "title": new_proj.title, "options": options_val},
                    )
                )
                audit_added.append(
                    intercept_email_notification(
                        s_db=s_db,
                        subject=f"[SCI Hellenvilliers] Nouveau scrutin soumis au vote : {new_proj.title}",
                        recipients=["hellenvillierssci@gmail.com"],
                        summary=f"Scrutin ouvert par {member.name} avec options : {', '.join(str(o) for o in options_val)}.",
                        trigger="send_vote_required_email",
                    )
                )
                confirmation_msg = f"Scrutin #{new_proj.id} « {new_proj.title} » ouvert au vote dans le bac à sable."
            else:
                project_id = merged_payload.get("project_id") or merged_payload.get("id")
                proj_title = str(merged_payload.get("project_title") or merged_payload.get("title") or "").strip()
                vote_choice = merged_payload.get("vote") or merged_payload.get("choice") or "POUR"
                if isinstance(vote_choice, list):
                    vote_str = json.dumps(vote_choice, ensure_ascii=False)
                else:
                    vote_str = str(vote_choice)
                comment_str = str(merged_payload.get("comment") or "")

                target_proj = None
                if project_id:
                    target_proj = s_db.query(Project).filter(Project.id == int(project_id)).first()
                if not target_proj and proj_title:
                    target_proj = s_db.query(Project).filter(Project.title.ilike(f"%{proj_title}%")).first()
                if not target_proj:
                    target_proj = s_db.query(Project).order_by(Project.id.desc()).first()
                if not target_proj:
                    raise ValueError("Aucun scrutin ou projet trouvé dans le bac à sable pour enregistrer ce vote.")

                existing_vote = (
                    s_db.query(ProjectVote)
                    .filter(
                        ProjectVote.project_id == target_proj.id,
                        ProjectVote.user_name == member.name,
                    )
                    .first()
                )
                if existing_vote:
                    existing_vote.vote = vote_str
                    existing_vote.comment = comment_str
                    existing_vote.voted_at = datetime.utcnow()
                else:
                    existing_vote = ProjectVote(
                        project_id=target_proj.id,
                        user_name=member.name,
                        vote=vote_str,
                        comment=comment_str,
                        voted_at=datetime.utcnow(),
                    )
                    s_db.add(existing_vote)
                s_db.commit()

                audit_added.append(
                    log_sandbox_audit(
                        s_db,
                        "DB_MUTATION",
                        f"UPSERT project_votes (projet #{target_proj.id} « {target_proj.title} ») : {member.name} → {vote_str}",
                        {
                            "table": "project_votes",
                            "project_id": target_proj.id,
                            "project_title": target_proj.title,
                            "user_name": member.name,
                            "vote": vote_str,
                            "comment": comment_str,
                        },
                    )
                )
                audit_added.append(
                    intercept_email_notification(
                        s_db=s_db,
                        subject=f"[SCI Hellenvilliers] Vote enregistré sur « {target_proj.title} » ({member.prenom})",
                        recipients=["hellenvillierssci@gmail.com"],
                        summary=f"{member.name} a voté « {vote_str} » sur le scrutin #{target_proj.id}.",
                        trigger="send_vote_chat_activity_email",
                    )
                )
                confirmation_msg = (
                    f"Vote « {vote_str} » de {member.name} enregistré sur le scrutin #{target_proj.id} « {target_proj.title} »."
                )
        else:
            raise ValueError(f"Type d'action non supporté : {action_type}")

    new_state = get_sandbox_state(prod_db, member_id=member_id)
    return {
        "status": "ok",
        "success": True,
        "action_type": norm_type,
        "message": confirmation_msg,
        "confirmation_message": confirmation_msg,
        "reply": confirmation_msg,
        "audit_logs_added": audit_added,
        "sandbox_audit_logs": new_state["sandbox_audit_logs"],
        "state": new_state,
        **new_state,
    }


def execute_sandbox_read_tool(
    prod_db: Session,
    member_id: Optional[int],
    tool_name: str,
    args: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Exécute un outil de LECTURE SEULE stricte (zéro écriture ni en prod PostgreSQL, ni en bac à sable).
    Retourne un dictionnaire JSON structuré (et éventuellement _inline_attachment si un PDF/image précis est inspecté).
    """
    import base64
    from .drive_service import drive_jail_service
    from .workload_balancer import calculate_workload_distribution

    ensure_sandbox_initialized(prod_db)
    args = dict(args or {})

    with SandboxSessionLocal() as s_db:
        if tool_name in ("read_treasury_and_banking", "consult_treasury_and_ledger"):
            target_name = str(args.get("member_name") or "").strip().lower()
            members = s_db.query(Member).order_by(Member.id.asc()).all()
            target_member = None
            if target_name:
                target_member = next(
                    (
                        m
                        for m in members
                        if target_name in (m.prenom or "").lower() or target_name in (m.name or "").lower()
                    ),
                    None,
                )
            if not target_member and member_id is not None:
                target_member = s_db.query(Member).filter(Member.id == member_id).first()
            if not target_member and members:
                target_member = members[0]

            bank_accounts = s_db.query(BankAccount).order_by(BankAccount.id.desc()).all()
            real_bank = next(
                (b for b in bank_accounts if b.iban and "000000000000" not in b.iban.replace(" ", "")),
                bank_accounts[0] if bank_accounts else None,
            )
            txs = (
                s_db.query(BankTransaction)
                .order_by(BankTransaction.booking_date.desc(), BankTransaction.id.desc())
                .limit(25)
                .all()
            )
            expenses = s_db.query(MemberExpense).order_by(MemberExpense.id.desc()).limit(25).all()
            associates = []
            for m in members:
                msum = get_member_treasury_summary(s_db, m)
                calls = (
                    s_db.query(CallForFunds)
                    .filter(CallForFunds.member_id == m.id)
                    .order_by(CallForFunds.year.desc(), CallForFunds.month.desc())
                    .limit(4)
                    .all()
                )
                associates.append(
                    {
                        "id": m.id,
                        "name": _format_member_display_name(m),
                        "prenom": m.prenom,
                        "monthly_contribution": float(m.monthly_contribution or 0.0),
                        "payment_reference": m.payment_reference,
                        "cca_balance": float(msum.get("balance") or 0.0),
                        "covered_months": int(msum.get("covered_months") or 0),
                        "recent_entries": msum.get("recent_entries") or [],
                        "calls_for_funds": [
                            {
                                "reference": c.reference,
                                "period": c.period_label,
                                "amount_due": float(c.amount_due if c.amount_due is not None else (c.net_amount or 0.0)),
                                "status": c.status,
                            }
                            for c in calls
                        ],
                    }
                )

            return {
                "swan_bank_account": {
                    "bank_name": real_bank.aspsp_name if real_bank else "Swan",
                    "iban": real_bank.iban if real_bank else "FR76 1732 8844 0071 5921 5570 591",
                    "bic": "SWNBFR22",
                    "holder": "SCI HELLENVILLIERS",
                    "balance_eur": float(real_bank.balance or 0.0) if real_bank else 0.0,
                    "last_synced_at": real_bank.last_synced_at.isoformat() + "Z" if (real_bank and real_bank.last_synced_at) else None,
                },
                "total_monthly_contributions_eur": sum(float(m.monthly_contribution or 0.0) for m in members),
                "recent_bank_transactions": [
                    {
                        "id": t.id,
                        "booking_date": t.booking_date,
                        "amount_eur": float(t.amount or 0.0),
                        "creditor_name": t.creditor_name,
                        "debtor_name": t.debtor_name,
                        "remittance_information": t.remittance_information,
                    }
                    for t in txs
                ],
                "associates": associates,
                "focused_member": next((a for a in associates if target_member and a["id"] == target_member.id), None),
                "member_expenses_and_advances": [
                    {
                        "id": e.id,
                        "member_prenom": e.member_prenom,
                        "title": e.title,
                        "amount_eur": float(e.amount or 0.0),
                        "expense_date": e.expense_date,
                        "payer_type": e.payer_type,
                        "status": e.status,
                        "document_id": e.document_id,
                    }
                    for e in expenses
                ],
            }

        if tool_name == "read_tasks_and_equity":
            task_id = args.get("task_id")
            status_filter = str(args.get("status_filter") or "").strip().upper()
            search_q = str(args.get("search_query") or "").strip().lower()

            q = s_db.query(Task).order_by(Task.id.desc())
            if task_id is not None:
                q = q.filter(Task.id == int(task_id))
            tasks_rows = q.all()

            out_tasks = []
            for t in tasks_rows:
                if status_filter and status_filter not in ("ALL", "TOUS") and (t.status or "").upper() != status_filter:
                    continue
                hay = f"{t.ref or ''} {t.title or ''} {t.description or ''} {t.subject or ''} {t.assigned_members or ''}".lower()
                if search_q and search_q not in hay:
                    continue
                comments = (
                    s_db.query(TaskComment)
                    .filter(TaskComment.task_id == t.id)
                    .order_by(TaskComment.created_at.asc())
                    .all()
                )
                linked_docs = (
                    s_db.query(AdminDocument)
                    .filter(AdminDocument.task_id == t.id)
                    .order_by(AdminDocument.id.desc())
                    .all()
                )
                out_tasks.append(
                    {
                        "id": t.id,
                        "ref": t.ref,
                        "title": t.title,
                        "description": t.description,
                        "subject": t.subject,
                        "category": t.category,
                        "priority": t.priority,
                        "status": t.status,
                        "charge_points": t.charge_points or 3,
                        "assigned_members": t.assigned_members,
                        "is_recurring": bool(t.is_recurring),
                        "recurrence": f"{t.recurrence_interval} {t.recurrence_unit}" if t.is_recurring else None,
                        "last_completed_at": str(t.last_completed_at) if t.last_completed_at else None,
                        "comments": [
                            {"author": c.author_name, "content": c.content, "created_at": str(c.created_at)}
                            for c in comments
                        ],
                        "linked_documents": [
                            {"id": d.id, "title": d.title, "file_name": d.file_name, "url": f"/api/documents/{d.id}/download"}
                            for d in linked_docs
                        ],
                    }
                )

            workload = calculate_workload_distribution(s_db)
            return {
                "count": len(out_tasks),
                "tasks": out_tasks,
                "workload_equity_summary": workload,
            }

        if tool_name == "read_stays_and_calendar":
            include_past = bool(args.get("include_past", True))
            today_str = datetime.utcnow().strftime("%Y-%m-%d")
            stays_rows = s_db.query(Reservation).order_by(Reservation.start_date.asc()).all()
            stays_out = []
            for r in stays_rows:
                if not include_past and (r.end_date or "") < today_str:
                    continue
                stays_out.append(
                    {
                        "id": r.id,
                        "property_name": r.property_name or ("Presbytère" if r.property_id == 2 else "Rosings"),
                        "user_name": r.user_name,
                        "start_date": r.start_date,
                        "end_date": r.end_date,
                        "arrival_time": r.arrival_time or "15:00",
                        "departure_time": r.departure_time or "11:00",
                        "status": r.status,
                        "guest_count": r.guest_count or 1,
                        "chambers_used": r.chambers_used or 1,
                        "selected_rooms": r.selected_rooms,
                        "notes": r.notes,
                    }
                )
            return {"count": len(stays_out), "stays": stays_out}

        if tool_name == "read_polls_and_votes":
            proj_id = args.get("project_id")
            q = s_db.query(Project).order_by(Project.id.desc())
            if proj_id is not None:
                q = q.filter(Project.id == int(proj_id))
            projs = q.all()
            out_projs = []
            for p in projs:
                votes = s_db.query(ProjectVote).filter(ProjectVote.project_id == p.id).all()
                comments = s_db.query(ProjectComment).filter(ProjectComment.project_id == p.id).all()
                opts = []
                if p.options:
                    try:
                        opts = json.loads(p.options) if isinstance(p.options, str) else p.options
                    except Exception:
                        opts = [p.options]
                out_projs.append(
                    {
                        "id": p.id,
                        "title": p.title,
                        "description": p.description,
                        "category": p.category,
                        "status": p.status,
                        "estimated_cost_eur": float(p.estimated_cost or 0.0),
                        "submitted_by": p.submitted_by,
                        "allow_multiple_choices": bool(p.allow_multiple_choices),
                        "options": opts,
                        "votes": [
                            {"user_name": v.user_name, "vote": v.vote, "comment": v.comment, "voted_at": str(v.voted_at)}
                            for v in votes
                        ],
                        "comments": [
                            {"author": c.author_name, "content": c.content, "created_at": str(c.created_at)}
                            for c in comments
                        ],
                    }
                )
            return {"count": len(out_projs), "polls_and_projects": out_projs}

        if tool_name == "read_heating_and_pool_status":
            telemetry = _sync_unified_heating_telemetry(s_db)
            snapshot = s_db.query(HeatingLiveSnapshot).filter(HeatingLiveSnapshot.id == 1).first()
            snap_payload = json.loads(snapshot.payload) if (snapshot and snapshot.payload) else {}
            age_s = (datetime.utcnow() - snapshot.recorded_at).total_seconds() if (snapshot and snapshot.recorded_at) else 0.0
            hist = (
                s_db.query(HeatingTelemetryHistory)
                .order_by(HeatingTelemetryHistory.recorded_at.desc())
                .limit(10)
                .all()
            )
            fuel_l = float(telemetry.fuel_liters_remaining or 942.1)
            return {
                "boiler_model": "Viessmann Vitoladens 300-C (22 kW condensation fioul) + Vitoconnect 100 OPTO2 (Presbytère)",
                "gateway_online": age_s <= 1200,
                "last_telemetry_at": snapshot.recorded_at.isoformat() + "Z" if (snapshot and snapshot.recorded_at) else None,
                "active_mode": telemetry.mode,
                "active_program": snap_payload.get("active_program"),
                "comfort_temperature_c": 20.0,
                "reduced_night_temperature_c": 6.0,
                "dhw_target_temperature_c": float(snap_payload.get("dhw_configured_temperature") or 52.0),
                "schedule_summary": "Chauffe confort 20.0 °C en journée (04h30–21h00) lors d'un séjour actif ; abaissement nocturne réduit à 6.0 °C de 21h00 à 04h30 (pas de chauffe la nuit) ; mode standby hors-gel complet hors séjour.",
                "room_temperature_c": telemetry.room_temperature,
                "outside_temperature_c": telemetry.outside_temperature,
                "boiler_temperature_c": telemetry.boiler_temperature,
                "dhw_temperature_c": telemetry.dhw_temperature,
                "burner_active": bool(telemetry.burner_active),
                "burner_hours": telemetry.burner_hours,
                "burner_starts": snap_payload.get("burner_starts"),
                "fuel_tank": {
                    "liters_remaining_estimated": fuel_l,
                    "capacity_liters": 3000.0,
                    "percent_estimated": round((fuel_l / 3000.0) * 100.0, 1),
                    "method": "Estimation logicielle déductive depuis jaugeage manuel au râteau du 17/10/2026 (46 cm / 130 cm ≈ 1 062 L à 4 531 h / 25 072 starts) moins consommation brûleur Viessmann (gicleur Danfoss 0,50/80° H LEV DA : 1,62 L/h ou 0,293 L/démarrage). Marge d'incertitude ±100–150 L (pas de sonde connectée dans la cuve).",
                },
                "pool_klereo": {
                    "mode": telemetry.pool_mode,
                    "filtration_mode": telemetry.pool_filtration_mode,
                    "target_temperature_c": telemetry.pool_temperature,
                },
                "recent_history": [
                    {
                        "recorded_at": h.recorded_at.isoformat() + "Z" if h.recorded_at else None,
                        "room_c": h.room_temperature,
                        "outside_c": h.outside_temperature,
                        "mode": h.mode,
                        "fuel_l": h.fuel_liters_remaining,
                    }
                    for h in hist
                ],
            }

        if tool_name == "read_documents_and_contracts":
            doc_id = args.get("document_id")
            search_q = str(args.get("search_query") or "").strip().lower()
            cat_q = str(args.get("category") or "").strip().lower()

            if doc_id is not None:
                real_doc = prod_db.query(AdminDocument).filter(AdminDocument.id == int(doc_id)).first()
                if not real_doc:
                    return {"error": f"Aucun document trouvé avec id={doc_id}."}
                raw_bytes = real_doc.file_data
                mime = real_doc.file_type or "application/pdf"
                if not raw_bytes and real_doc.drive_file_id and drive_jail_service.is_configured():
                    raw_bytes, meta = drive_jail_service.download_file(real_doc.drive_file_id)
                    if meta and meta.get("mimeType"):
                        mime = meta["mimeType"]
                result_doc: Dict[str, Any] = {
                    "id": real_doc.id,
                    "title": real_doc.title,
                    "category": real_doc.category,
                    "file_name": real_doc.file_name,
                    "file_type": mime,
                    "uploaded_by": real_doc.uploaded_by,
                    "notes": real_doc.notes,
                    "download_url": f"https://hellenvilliers.henri-jamet.com/api/documents/{real_doc.id}/download",
                }
                if raw_bytes and len(raw_bytes) <= 8 * 1024 * 1024:
                    result_doc["_inline_attachment"] = {
                        "mimeType": mime,
                        "data": base64.b64encode(raw_bytes).decode("ascii"),
                        "file_name": real_doc.file_name or f"document_{real_doc.id}.pdf",
                    }
                    result_doc["content_loaded"] = True
                else:
                    result_doc["content_loaded"] = False
                return result_doc

            docs_rows = s_db.query(AdminDocument).order_by(AdminDocument.id.desc()).all()
            matched = []
            for d in docs_rows:
                hay = f"{d.title or ''} {d.file_name or ''} {d.category or ''} {d.notes or ''} {d.tags or ''}".lower()
                if search_q:
                    tokens = [tok for tok in search_q.split() if len(tok) >= 2]
                    if tokens and not all(tok in hay for tok in tokens):
                        continue
                if cat_q and cat_q not in (d.category or "").lower():
                    continue
                matched.append(
                    {
                        "id": d.id,
                        "title": d.title,
                        "category": d.category,
                        "file_name": d.file_name,
                        "uploaded_by": d.uploaded_by,
                        "created_at": str(d.created_at)[:10] if d.created_at else None,
                        "download_url": f"https://hellenvilliers.henri-jamet.com/api/documents/{d.id}/download",
                    }
                )
            return {
                "total_matching_documents": len(matched),
                "documents": matched[:40],
                "hint": "Appelle à nouveau read_documents_and_contracts avec document_id=<id> pour lire le contenu exact PDF/image d'un document précis.",
            }

        if tool_name == "inspect_ui_skill":
            skill_id = str(args.get("skill_id") or "ui_components").strip().lower()
            skills_catalog: Dict[str, Dict[str, Any]] = {
                "ui_components": {
                    "skill_id": "ui_components",
                    "title": "Catalogue complet des composants interactifs partageables via display_ui_component",
                    "usage_rule": "Appelle display_ui_component(component_id=..., props={...}) dès qu'un rendu visuel ou un bouton d'ouverture de formulaire enrichit la réponse. Ne répète jamais en longue liste texte ce que le composant affiche déjà : accompagne-le de 1 à 3 phrases naturelles.",
                    "components": {
                        "stays_calendar": {
                            "props": {"month": "1..12 (ex: 11 pour novembre)", "year": "2026 ou 2027", "building": "'all' | 'Presbytère' | 'Rosings'"},
                            "renders": "Calendrier mensuel interactif des séjours avec navigation par mois, pastilles par associé et bouton '+ Réserver un séjour'.",
                        },
                        "fuel_and_heating_graph": {
                            "props": {"initial_tab": "'annual' (courbe stock fioul & livraisons) | 'temperatures' (courbes int./ext. & brûleur) | 'daily' (allumages quotidiens)"},
                            "renders": "Graphe interactif officiel 3 onglets (cuve fioul 3 000 L, livraisons Éts Josse, températures Presbytère et état passerelle Vitoconnect).",
                        },
                        "pool_status_widget": {
                            "props": {},
                            "renders": "Carte télémétrie en direct de la piscine Klereo (température eau/air, pH, Redox, filtration, PAC 20 kW).",
                        },
                        "poll_status_card": {
                            "props": {"project_id": "ID optionnel d'un scrutin précis (ex: 40 ou 41)", "search_query": "Mot-clé optionnel (ex: 'ménage', 'assemblée')"},
                            "renders": "Carte de vote interactive style WhatsApp avec barres de progression, détail des votes des 7 associés et vote en 1 clic dans le bac à sable.",
                        },
                        "tasks_overview_card": {
                            "props": {"assigned_to": "Prénom optionnel (ex: 'Joséphine', 'Henri', 'Élisabeth')", "status_filter": "'EN_COURS' | 'A_FAIRE' | 'TERMINEE' | 'ALL'", "task_id": "ID optionnel"},
                            "renders": "Cartes visuelles des tâches avec points, responsable, PDF rattachés et bouton d'ouverture de création de tâche.",
                        },
                        "treasury_overview_card": {
                            "props": {"member_name": "Prénom optionnel"},
                            "renders": "Carte financière synthétique : solde bancaire Swan, IBAN copiable, soldes CCA des 7 associés et derniers mouvements.",
                        },
                        "document_viewer_card": {
                            "props": {"document_id": "ID d'un document précis (ex: 177, 163, 162)", "search_query": "Recherche si plusieurs documents"},
                            "renders": "Cartes de documents officiels avec boutons 'Consulter' (visionneuse PDF intégrée) et 'Télécharger'.",
                        },
                        "action_modal_buttons": {
                            "props": {
                                "buttons": "Liste d'objets {modal_type: 'stay'|'task'|'poll'|'document', label: string, prefill: object}",
                            },
                            "renders": "Boutons d'action ronds et modernes ouvrant directement le formulaire interactif correspondant (réservation, création de tâche, création de scrutin, dépôt de document/facture) en mode bac à sable sécurisé.",
                        },
                    },
                },
                "sejours_et_chauffage": {
                    "skill_id": "sejours_et_chauffage",
                    "summary": "7 chambres au total : Presbytère (5 ch. : Suite de Frédéric & Élisabeth, Chambre de Henri, Première Chambre du Couloir, La Mezzanine de Joséphine, Chambre du bas d'Eugénie) et Rosings (2 ch. : Chambre Haut Droite de Marguerite, Chambre Haut Gauche d'Hortense). Chauffage ViCare Presbytère : veille hors-gel standby hors séjour ; en séjour dhwAndHeating avec 20 °C de 04h30 à 21h00 + ECS 52 °C, et réduit nocturne 6 °C de 21h00 à 04h30. Jauge fioul déduite des compteurs brûleur depuis le jaugeage Bompais du 17/10/2026 (46 cm ≈ 1 062 L sur 3 000 L, gicleur Danfoss 1,62 L/h, incertitude ±100–150 L).",
                },
                "taches_et_artisans": {
                    "skill_id": "taches_et_artisans",
                    "summary": "Artisans clés : Chauffage EURL Ervan Bompais (06 83 22 56 24 / 02 32 34 47 55) ; Fioul Éts Josse SAS ; Fosses septiques SARL Les Vidanges Conchoises (02 32 30 17 51 / 02 32 29 71 16, cycle 30 mois) ; Piscine Declercq Conches. Points d'équité : 1 (négligeable) à 8 (très élevée) ; Frédéric est exempté des corvées physiques.",
                },
                "votes_et_ag": {
                    "skill_id": "votes_et_ag",
                    "summary": "Les scrutins (table projects) peuvent être en statut PROPOSED (préparés avant ouverture officielle) ou EN_VOTE (ouverts aux 7 associés : Henri, Marguerite, Hortense, Joséphine, Eugénie, Frédéric, Élisabeth), à choix unique (POUR/CONTRE/ABSTENTION) ou à choix multiples de dates (allow_multiple_choices=true, ex. #40 Ménage de printemps 2027 et #41 Dates des prochaines AG 2027).",
                },
                "tresorerie_et_documents": {
                    "skill_id": "tresorerie_et_documents",
                    "summary": "Compte officiel SCI HELLENVILLIERS chez Swan SAS (IBAN FR76 1732 8844 0071 5921 5570 591, BIC SWNBFR22). Cotisations mensuelles automatiques le 1er du mois : 1 250 €/mois au total (1 000 €/mois mutualisés pour Frédéric & Élisabeth, et 50 €/mois pour chacun des 5 autres associés : Henri, Marguerite, Hortense, Joséphine, Eugénie). Toute avance de frais validée crédite le CCA du membre.",
                },
            }
            if skill_id in skills_catalog:
                return skills_catalog[skill_id]
            return {
                "available_skills": list(skills_catalog.keys()),
                "ui_components_guide": skills_catalog["ui_components"],
            }

        if tool_name == "display_ui_component":
            comp_id = str(args.get("component_id") or "").strip().lower()
            raw_props = args.get("props") if isinstance(args.get("props"), dict) else {}
            props = dict(raw_props)
            # Fusionner aussi les clés passées directement à la racine d'args par commodité
            for k, v in args.items():
                if k not in ("component_id", "props") and v is not None and k not in props:
                    props[k] = v

            if comp_id in ("stays_calendar", "calendar", "calendrier"):
                now_dt = datetime.utcnow()
                month_val = int(props.get("month") or now_dt.month)
                year_val = int(props.get("year") or now_dt.year)
                building_filter = str(props.get("building") or "all")
                stays_rows = s_db.query(Reservation).order_by(Reservation.start_date.asc()).all()
                stays_data = [
                    {
                        "id": r.id,
                        "property_id": r.property_id,
                        "property_name": r.property_name or ("Presbytère" if r.property_id == 2 else "Rosings"),
                        "user_name": ("Élisabeth Jamet" if "maman" in (r.user_name or "").lower() else r.user_name),
                        "start_date": r.start_date,
                        "end_date": r.end_date,
                        "arrival_time": r.arrival_time or "15:00",
                        "departure_time": r.departure_time or "11:00",
                        "status": r.status,
                        "guest_count": r.guest_count or 1,
                        "chambers_used": r.chambers_used or 1,
                        "selected_rooms": r.selected_rooms,
                        "notes": r.notes,
                    }
                    for r in stays_rows
                    if (r.status or "").lower() != "annulée"
                ]
                ui_payload = {
                    "component_id": "stays_calendar",
                    "month": max(1, min(12, month_val)),
                    "year": year_val,
                    "building": building_filter,
                    "stays": stays_data,
                }
                return {
                    "status": "rendered_in_chat",
                    "component_id": "stays_calendar",
                    "stays_count": len(stays_data),
                    "_ui_component": ui_payload,
                }

            if comp_id in ("fuel_and_heating_graph", "fuel_graph", "heating_graph", "fioul", "heating"):
                telemetry = _sync_unified_heating_telemetry(s_db)
                snapshot = s_db.query(HeatingLiveSnapshot).filter(HeatingLiveSnapshot.id == 1).first()
                snap_payload = json.loads(snapshot.payload) if (snapshot and snapshot.payload) else {}
                age_s = (datetime.utcnow() - snapshot.recorded_at).total_seconds() if (snapshot and snapshot.recorded_at) else 0.0
                initial_tab = str(props.get("initial_tab") or "annual").strip().lower()
                if initial_tab not in ("annual", "temperatures", "daily"):
                    initial_tab = "annual"
                heating_status_obj = {
                    "mode": telemetry.mode,
                    "target_temperature": float(telemetry.target_temperature or 20.0),
                    "comfort_temperature": 20.0,
                    "reduced_temperature": 6.0,
                    "room_temperature": telemetry.room_temperature,
                    "outside_temperature": telemetry.outside_temperature,
                    "boiler_temperature": telemetry.boiler_temperature,
                    "dhw_temperature": telemetry.dhw_temperature,
                    "burner_hours": telemetry.burner_hours or snap_payload.get("burner_hours") or 4605,
                    "burner_starts": snap_payload.get("burner_starts") or 25445,
                    "fuel_liters_remaining": float(telemetry.fuel_liters_remaining or 942.1),
                    "fuel_level_percent": round((float(telemetry.fuel_liters_remaining or 942.1) / 3000.0) * 100.0, 1),
                    "is_cached_last_known": age_s > 1200,
                    "last_seen_at": snapshot.recorded_at.isoformat() + "Z" if (snapshot and snapshot.recorded_at) else None,
                }
                ui_payload = {
                    "component_id": "fuel_and_heating_graph",
                    "initial_tab": initial_tab,
                    "heating_status": heating_status_obj,
                }
                return {
                    "status": "rendered_in_chat",
                    "component_id": "fuel_and_heating_graph",
                    "initial_tab": initial_tab,
                    "fuel_liters_remaining": heating_status_obj["fuel_liters_remaining"],
                    "gateway_offline": heating_status_obj["is_cached_last_known"],
                    "_ui_component": ui_payload,
                }

            if comp_id in ("pool_status_widget", "pool", "piscine"):
                telemetry = _sync_unified_heating_telemetry(s_db)
                pool_live: Dict[str, Any] = {
                    "mode": telemetry.pool_mode or "eco",
                    "filtration_mode": telemetry.pool_filtration_mode or "auto",
                    "target_temperature": telemetry.pool_temperature or 0.5,
                }
                try:
                    from .klereo_service import KlereoService
                    live_kl = KlereoService.get_status()
                    if isinstance(live_kl, dict):
                        pool_live.update(live_kl)
                except Exception:
                    pass
                ui_payload = {
                    "component_id": "pool_status_widget",
                    "pool": pool_live,
                }
                return {
                    "status": "rendered_in_chat",
                    "component_id": "pool_status_widget",
                    "water_temperature": pool_live.get("water_temperature"),
                    "_ui_component": ui_payload,
                }

            if comp_id in ("poll_status_card", "poll", "vote", "votes", "scrutin"):
                proj_id = props.get("project_id")
                search_q = str(props.get("search_query") or "").strip().lower()
                q = s_db.query(Project).order_by(Project.id.desc())
                if proj_id is not None:
                    q = q.filter(Project.id == int(proj_id))
                projs = q.all()
                matched_polls = []
                for p in projs:
                    if proj_id is None and search_q:
                        hay = f"{p.title or ''} {p.description or ''} {p.category or ''}".lower()
                        if search_q not in hay:
                            continue
                    elif proj_id is None and not search_q:
                        if (p.status or "").upper() not in ("EN_VOTE", "PROPOSED", "SOUMIS"):
                            continue
                    votes = s_db.query(ProjectVote).filter(ProjectVote.project_id == p.id).all()
                    opts = []
                    if p.options:
                        try:
                            opts = json.loads(p.options) if isinstance(p.options, str) else p.options
                        except Exception:
                            opts = [p.options]
                    matched_polls.append(
                        {
                            "id": p.id,
                            "title": p.title,
                            "description": p.description,
                            "category": p.category,
                            "status": p.status,
                            "estimated_cost": float(p.estimated_cost or 0.0),
                            "submitted_by": ("Élisabeth Jamet" if "maman" in (p.submitted_by or "").lower() else p.submitted_by),
                            "allow_multiple_choices": bool(p.allow_multiple_choices),
                            "options": opts if isinstance(opts, list) else [],
                            "votes": [
                                {
                                    "id": v.id,
                                    "user_name": ("Élisabeth Jamet" if "maman" in (v.user_name or "").lower() else v.user_name),
                                    "vote": v.vote,
                                    "comment": v.comment,
                                }
                                for v in votes
                            ],
                        }
                    )
                ui_payload = {
                    "component_id": "poll_status_card",
                    "polls": matched_polls[:5],
                }
                return {
                    "status": "rendered_in_chat",
                    "component_id": "poll_status_card",
                    "polls_rendered": [ {"id": p["id"], "title": p["title"], "status": p["status"]} for p in matched_polls[:5] ],
                    "_ui_component": ui_payload,
                }

            if comp_id in ("tasks_overview_card", "tasks", "taches"):
                t_id = props.get("task_id")
                assigned_q = str(props.get("assigned_to") or "").strip().lower()
                status_q = str(props.get("status_filter") or "EN_COURS").strip().upper()
                q = s_db.query(Task).order_by(Task.id.desc())
                if t_id is not None:
                    q = q.filter(Task.id == int(t_id))
                rows = q.all()
                cards = []
                for t in rows:
                    if t_id is None and status_q not in ("ALL", "TOUS", ""):
                        if status_q == "ACTIVE" and (t.status or "").upper() in ("TERMINEE", "TERMINE"):
                            continue
                        elif status_q != "ACTIVE" and (t.status or "").upper() != status_q:
                            continue
                    assigned_raw = t.assigned_members or "[]"
                    try:
                        assigned_arr = json.loads(assigned_raw) if isinstance(assigned_raw, str) else assigned_raw
                    except Exception:
                        assigned_arr = [str(assigned_raw)]
                    assigned_clean = [
                        ("Élisabeth Jamet" if "maman" in str(x).lower() else str(x))
                        for x in (assigned_arr if isinstance(assigned_arr, list) else [assigned_arr])
                    ]
                    if assigned_q and not any(assigned_q in a.lower() for a in assigned_clean):
                        continue
                    linked_docs = s_db.query(AdminDocument).filter(AdminDocument.task_id == t.id).all()
                    cards.append(
                        {
                            "id": t.id,
                            "ref": t.ref or f"T-{t.id}",
                            "title": t.title,
                            "description": t.description,
                            "subject": t.subject,
                            "priority": t.priority,
                            "status": t.status,
                            "charge_points": t.charge_points or 3,
                            "assigned_members": assigned_clean,
                            "documents": [
                                {"id": d.id, "title": d.title or d.file_name, "url": f"/api/documents/{d.id}/download"}
                                for d in linked_docs
                            ],
                        }
                    )
                ui_payload = {
                    "component_id": "tasks_overview_card",
                    "filter_label": props.get("assigned_to") or status_q,
                    "tasks": cards[:12],
                }
                return {
                    "status": "rendered_in_chat",
                    "component_id": "tasks_overview_card",
                    "tasks_rendered_count": len(cards[:12]),
                    "_ui_component": ui_payload,
                }

            if comp_id in ("treasury_overview_card", "treasury", "tresorerie", "banque"):
                res_fin = execute_sandbox_read_tool(prod_db, member_id, "read_treasury_and_banking", props)
                ui_payload = {
                    "component_id": "treasury_overview_card",
                    "swan_bank_account": res_fin.get("swan_bank_account"),
                    "associates": res_fin.get("associates"),
                    "recent_transactions": (res_fin.get("recent_bank_transactions") or [])[:6],
                }
                return {
                    "status": "rendered_in_chat",
                    "component_id": "treasury_overview_card",
                    "balance_eur": (res_fin.get("swan_bank_account") or {}).get("balance_eur"),
                    "_ui_component": ui_payload,
                }

            if comp_id in ("document_viewer_card", "document", "documents"):
                doc_id = props.get("document_id")
                search_q = str(props.get("search_query") or "").strip().lower()
                docs_out = []
                if doc_id is not None:
                    d = s_db.query(AdminDocument).filter(AdminDocument.id == int(doc_id)).first()
                    if d:
                        docs_out.append(
                            {
                                "id": d.id,
                                "title": d.title or d.file_name,
                                "file_name": d.file_name,
                                "category": d.category,
                                "uploaded_by": ("Élisabeth Jamet" if "maman" in (d.uploaded_by or "").lower() else d.uploaded_by),
                                "created_at": str(d.created_at)[:10] if d.created_at else None,
                                "download_url": f"/api/documents/{d.id}/download",
                            }
                        )
                else:
                    for d in s_db.query(AdminDocument).order_by(AdminDocument.id.desc()).all():
                        hay = f"{d.title or ''} {d.file_name or ''} {d.category or ''} {d.notes or ''}".lower()
                        if search_q:
                            toks = [tok for tok in search_q.split() if len(tok) >= 2]
                            if toks and not all(tok in hay for tok in toks):
                                continue
                        docs_out.append(
                            {
                                "id": d.id,
                                "title": d.title or d.file_name,
                                "file_name": d.file_name,
                                "category": d.category,
                                "uploaded_by": ("Élisabeth Jamet" if "maman" in (d.uploaded_by or "").lower() else d.uploaded_by),
                                "created_at": str(d.created_at)[:10] if d.created_at else None,
                                "download_url": f"/api/documents/{d.id}/download",
                            }
                        )
                        if len(docs_out) >= 6:
                            break
                ui_payload = {
                    "component_id": "document_viewer_card",
                    "documents": docs_out,
                }
                return {
                    "status": "rendered_in_chat",
                    "component_id": "document_viewer_card",
                    "documents_rendered_count": len(docs_out),
                    "_ui_component": ui_payload,
                }

            if comp_id in ("action_modal_buttons", "modal_buttons", "buttons", "quick_actions"):
                raw_buttons = props.get("buttons")
                if not isinstance(raw_buttons, list) or not raw_buttons:
                    m_type = str(props.get("modal_type") or "stay").lower()
                    default_labels = {
                        "stay": "Ouvrir le formulaire de réservation de séjour",
                        "task": "Ouvrir le formulaire de création de tâche",
                        "poll": "Ouvrir le formulaire de création de vote",
                        "document": "Déposer une facture ou un document",
                    }
                    raw_buttons = [
                        {
                            "modal_type": m_type,
                            "label": props.get("label") or default_labels.get(m_type, "Ouvrir le formulaire"),
                            "prefill": props.get("prefill") or {},
                        }
                    ]
                ui_payload = {
                    "component_id": "action_modal_buttons",
                    "buttons": raw_buttons,
                }
                return {
                    "status": "rendered_in_chat",
                    "component_id": "action_modal_buttons",
                    "buttons_count": len(raw_buttons),
                    "_ui_component": ui_payload,
                }

            return {
                "error": f"Composant UI inconnu : '{comp_id}'. Valeurs supportées : stays_calendar, fuel_and_heating_graph, pool_status_widget, poll_status_card, tasks_overview_card, treasury_overview_card, document_viewer_card, action_modal_buttons.",
            }

    return {"error": f"Outil de lecture inconnu : {tool_name}"}



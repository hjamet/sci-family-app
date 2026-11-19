import base64
import json
import logging
import unicodedata
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, defer

from ..models import (
    AdminDocument,
    BankAccount,
    BankTransaction,
    CallForFunds,
    HeatingLiveSnapshot,
    HeatingTelemetryHistory,
    Log,
    Member,
    MemberExpense,
    Project,
    ProjectComment,
    ProjectVote,
    Property,
    Reservation,
    Task,
    TaskComment,
    ThermalSettings,
    VademecumItem,
)
from .call_for_funds_service import reconcile_open_calls_for_member
from .treasury_service import add_ledger_entry, get_member_treasury_summary
from .workload_balancer import (
    calculate_workload_distribution,
    is_exempt_member,
    is_member_assigned_to_task,
    is_member_creator_of_task,
    normalize_status,
)

logger = logging.getLogger("sci_api.toaster_service")

# Chambres canoniques du Domaine d'Hellenvilliers (alignées sur BookingModal.jsx)
DOMAIN_ROOMS: Dict[str, List[Dict[str, str]]] = {
    "Presbytère": [
        {"name": "Suite", "label": "Suite (Frédéric & Élisabeth)", "building": "Presbytère"},
        {"name": "Deuxième Chambre du Couloir", "label": "Deuxième Chambre du Couloir (Henri)", "building": "Presbytère"},
        {"name": "Première Chambre du Couloir", "label": "Première Chambre du Couloir (Ancienne ch. Hortense)", "building": "Presbytère"},
        {"name": "La Mezzanine", "label": "La Mezzanine (Joséphine)", "building": "Presbytère"},
        {"name": "Chambre du bas", "label": "Chambre du bas (Eugénie)", "building": "Presbytère"},
    ],
    "Rosings": [
        {"name": "Chambre Haut Droite", "label": "Chambre Haut Droite (Marguerite)", "building": "Rosings"},
        {"name": "Chambre Haut Gauche", "label": "Chambre Haut Gauche (Hortense)", "building": "Rosings"},
    ],
}

BUILDING_MAX_ROOMS: Dict[str, int] = {
    "Presbytère": 5,
    "Rosings": 2,
    "Presbytère & Rosings": 7,
}

VADEMECUM_CATEGORIES: List[str] = [
    "Arrivée & Clés",
    "Chauffage & Eau Chaude",
    "Piscine",
    "Ordures Ménagères",
    "Wifi & Multimédia",
    "Artisans & Dépannage",
    "Bâtiments & Réseaux Techniques",
    "Sécurité & Urgences",
]

COMPLETED_TASK_STATUSES = {
    "TERMINE",
    "TERMINEE",
    "VALIDE",
    "VALIDEE",
    "CLOS",
    "CLOTURE",
    "CLOTUREE",
    "COMPLETED",
    "ARCHIVEE",
    "ARCHIVE",
}
UNAPPROVED_TASK_STATUSES = {"PROPOSED", "PROPOSEE", "REJECTED", "REJETEE", "BROUILLON", "DRAFT"}


def _norm_text(s: Optional[str]) -> str:
    if not s:
        return ""
    return "".join(
        c for c in unicodedata.normalize("NFD", str(s).strip().lower()) if unicodedata.category(c) != "Mn"
    )


def format_member_prenom(member: Optional[Member]) -> str:
    if not member:
        return "Associé"
    raw_p = (member.prenom or "").strip()
    raw_n = (member.name or "").strip()
    low = f"{raw_p} {raw_n}".lower()
    if "maman" in low or "élisabeth" in low or "elisabeth" in low:
        return "Élisabeth"
    if raw_p:
        return raw_p
    return raw_n.split()[0] if raw_n else "Associé"


def format_member_display_name(member: Optional[Member]) -> str:
    if not member:
        return "Associé"
    prenom = format_member_prenom(member)
    raw_n = (member.name or "").strip()
    if "maman" in raw_n.lower() or "élisabeth" in raw_n.lower() or "elisabeth" in raw_n.lower():
        return "Élisabeth Jamet"
    if raw_n:
        return raw_n
    return f"{prenom} Jamet"


def sanitize_display_user_name(raw_name: Optional[str]) -> str:
    if not raw_name:
        return ""
    s = str(raw_name).strip()
    if "maman" in s.lower():
        return "Élisabeth Jamet"
    return s


def resolve_building_limits(building: str) -> Tuple[str, int, List[Dict[str, str]]]:
    b_low = _norm_text(building)
    if ("presbyt" in b_low and "rosing" in b_low) or "domaine" in b_low or "tout" in b_low or "deux" in b_low:
        return "Presbytère & Rosings", 7, DOMAIN_ROOMS["Presbytère"] + DOMAIN_ROOMS["Rosings"]
    if "rosing" in b_low:
        return "Rosings", 2, DOMAIN_ROOMS["Rosings"]
    return "Presbytère", 5, DOMAIN_ROOMS["Presbytère"]


def parse_selected_rooms_list(raw_rooms: Any) -> List[str]:
    if not raw_rooms:
        return []
    if isinstance(raw_rooms, list):
        return [str(r).strip() for r in raw_rooms if str(r).strip()]
    s = str(raw_rooms).strip()
    if not s:
        return []
    if s.startswith("["):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return [str(r).strip() for r in parsed if str(r).strip()]
        except ValueError:
            pass
    return [part.strip() for part in s.split(",") if part.strip()]


def validate_stay_rooms(building: str, chambers_used: int, selected_rooms: List[str]) -> Tuple[str, int, int]:
    norm_building, max_rooms, _ = resolve_building_limits(building)
    if chambers_used < 1:
        raise ValueError("Le nombre de chambres occupées doit être d'au moins 1.")
    if chambers_used > max_rooms:
        raise ValueError(
            f"Capacité dépassée : {norm_building} ne comporte que {max_rooms} chambre(s) maximum "
            f"(5 au Presbytère, 2 à Rosings, 7 sur tout le domaine)."
        )
    if len(selected_rooms) > max_rooms:
        raise ValueError(
            f"Trop de chambres sélectionnées ({len(selected_rooms)}) pour {norm_building} (maximum {max_rooms})."
        )
    return norm_building, max_rooms, max(chambers_used, len(selected_rooms))


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


def _read_heating_summary(db: Session) -> Dict[str, Any]:
    heating_setting = db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "heating").first()
    pool_setting = db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "pool").first()
    snapshot = db.query(HeatingLiveSnapshot).filter(HeatingLiveSnapshot.id == 1).first()
    last_hist = (
        db.query(HeatingTelemetryHistory)
        .order_by(HeatingTelemetryHistory.recorded_at.desc())
        .first()
    )

    snap_data: Dict[str, Any] = {}
    if snapshot and snapshot.payload:
        try:
            snap_data = json.loads(snapshot.payload)
        except ValueError:
            snap_data = {}

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

    recorded_at = snapshot.recorded_at if snapshot else (last_hist.recorded_at if last_hist else None)
    age_s = (datetime.utcnow() - recorded_at).total_seconds() if recorded_at else 999999.0
    is_gateway_offline = age_s > 1200
    fuel_val = float(fuel_liters) if fuel_liters is not None else 942.1

    return {
        "mode": mode,
        "active_program": snap_data.get("active_program"),
        "target_temperature": float(target_temp),
        "comfort_temperature": 20.0,
        "reduced_temperature": 6.0,
        "dhw_configured_temperature": float(snap_data.get("dhw_configured_temperature") or 52.0),
        "night_schedule_note": "Jour confort 20.0 °C (04h30–21h00) • Nuit abaissement réduit 6.0 °C (21h00–04h30, pas de chauffe la nuit)",
        "room_temperature": float(room_temp) if room_temp is not None else None,
        "outside_temperature": float(outside_temp) if outside_temp is not None else None,
        "boiler_temperature": float(boiler_temp) if boiler_temp is not None else None,
        "dhw_temperature": float(dhw_temp) if dhw_temp is not None else None,
        "is_heating_active": mode in ("dhwAndHeating", "forcedNormal"),
        "burner_active": bool(snap_data.get("burner_active")),
        "burner_hours": float(burner_hours) if burner_hours is not None else None,
        "burner_starts": snap_data.get("burner_starts"),
        "fuel_liters_remaining": round(fuel_val, 1),
        "fuel_capacity_liters": 3000.0,
        "fuel_percent": round((fuel_val / 3000.0) * 100.0, 1),
        "is_gateway_offline": is_gateway_offline,
        "is_cached_last_known": is_gateway_offline,
        "last_seen_at": recorded_at.isoformat() + "Z" if recorded_at else None,
        "recorded_at": recorded_at.isoformat() + "Z" if recorded_at else None,
        "pool_mode": pool_setting.mode if pool_setting and pool_setting.mode else "eco",
        "pool_filtration_mode": pool_setting.filtration_mode if pool_setting and pool_setting.filtration_mode else "auto",
        "pool_temperature": float(pool_setting.target_temperature) if pool_setting and pool_setting.target_temperature is not None else 0.5,
        "updated_by": heating_setting.updated_by if heating_setting and heating_setting.updated_by else "Système ViCare",
    }


def _fetch_live_pool_status(db: Session) -> Dict[str, Any]:
    """
    Interroge réellement KlereoService.get_pool_status(force_refresh=True) sans avaler les erreurs.
    Retourne toujours des champs structurés d'état radio/Wi-Fi, alertes, filtration, PAC et sondes.
    """
    from .klereo_service import KlereoService

    pool_setting = db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "pool").first()
    base: Dict[str, Any] = {
        "mode": pool_setting.mode if pool_setting and pool_setting.mode else "eco",
        "filtration_mode": pool_setting.filtration_mode if pool_setting and pool_setting.filtration_mode else "auto",
        "target_temperature": float(pool_setting.target_temperature) if pool_setting and pool_setting.target_temperature is not None else 0.5,
        "live_error": None,
    }
    try:
        live_kl = KlereoService.get_pool_status(force_refresh=True)
        if isinstance(live_kl, dict):
            base.update(live_kl)
    except HTTPException as exc:
        detail = exc.detail
        err_msg = detail.get("error") if isinstance(detail, dict) else str(detail)
        logger.warning(f"[TOASTER POOL] Erreur Klereo HTTP {exc.status_code}: {err_msg}")
        base["live_error"] = err_msg
        base["wifi_box_ok"] = False
        base["radio_link_ok"] = False
    except Exception as exc:
        logger.warning(f"[TOASTER POOL] Erreur Klereo: {exc}")
        base["live_error"] = str(exc)
        base["wifi_box_ok"] = False
        base["radio_link_ok"] = False
    return base


def compute_family_leaderboard(db: Session, period: str = "all") -> Dict[str, Any]:
    """
    Reproduit fidèlement l'algorithme officiel de WorkloadDashboard.jsx :
    - score_usage = jours passés au domaine (réservations confirmées / en attente)
    - score_taches = tâches complétées assignées + bonus création de tâches approuvées
    - ratio = (score_taches + 0.5) / (score_usage + 0.5)
    """
    members = db.query(Member).order_by(Member.id.asc()).all()
    all_tasks = db.query(Task).all()
    all_reservations = db.query(Reservation).all()

    now = datetime.utcnow()
    cutoff = None
    if period == "1_year":
        cutoff = now - timedelta(days=365)
    elif period == "3_months":
        cutoff = now - timedelta(days=90)

    days_by_member_id: Dict[int, int] = {m.id: 0 for m in members}
    stays_count_by_member_id: Dict[int, int] = {m.id: 0 for m in members}

    for r in all_reservations:
        st = _norm_text(r.status)
        if st not in ("confirmee", "demande en attente"):
            continue
        if not r.start_date:
            continue
        try:
            d1 = datetime.strptime(r.start_date[:10], "%Y-%m-%d")
            d2 = datetime.strptime((r.end_date or r.start_date)[:10], "%Y-%m-%d")
        except ValueError:
            continue
        if cutoff and d2 < cutoff:
            continue
        diff_days = max(1, (d2 - d1).days + 1)
        r_user = _norm_text(r.user_name)
        for m in members:
            p_norm = _norm_text(format_member_prenom(m))
            is_elisabeth = p_norm == "elisabeth" and ("maman" in r_user or "elisabeth" in r_user or "elizabeth" in r_user)
            if (p_norm and p_norm in r_user) or is_elisabeth:
                days_by_member_id[m.id] += diff_days
                stays_count_by_member_id[m.id] += 1

    entries: List[Dict[str, Any]] = []
    for m in members:
        member_tasks = [t for t in all_tasks if is_member_assigned_to_task(m, t)]
        completed_tasks = [t for t in member_tasks if normalize_status(t.status) in COMPLETED_TASK_STATUSES]
        active_tasks = [
            t for t in member_tasks
            if normalize_status(t.status) not in COMPLETED_TASK_STATUSES
            and normalize_status(t.status) not in UNAPPROVED_TASK_STATUSES
        ]
        created_approved = [
            t for t in all_tasks
            if is_member_creator_of_task(m, t)
            and normalize_status(t.status) not in UNAPPROVED_TASK_STATUSES
            and normalize_status(t.status) != ""
        ]

        score_usage = days_by_member_id.get(m.id, 0)
        completed_count = len(completed_tasks)
        created_bonus = len(created_approved)
        score_taches = completed_count + created_bonus
        charge_pts_done = sum(int(t.charge_points or 3) for t in completed_tasks)
        ratio = round((score_taches + 0.5) / (score_usage + 0.5), 2)

        entries.append(
            {
                "member_id": m.id,
                "prenom": format_member_prenom(m),
                "name": format_member_display_name(m),
                "role": m.role or "Associé",
                "is_exempt": is_exempt_member(m),
                "score_usage": score_usage,
                "stays_count": stays_count_by_member_id.get(m.id, 0),
                "score_taches": score_taches,
                "completed_tasks_count": completed_count,
                "active_tasks_count": len(active_tasks),
                "created_bonus_count": created_bonus,
                "charge_points_completed": charge_pts_done,
                "ratio": ratio,
            }
        )

    entries.sort(
        key=lambda x: (-x["ratio"], -x["score_taches"], x["score_usage"], x["prenom"])
    )
    for idx, entry in enumerate(entries, start=1):
        entry["rank"] = idx

    period_labels = {
        "all": "Toute la période",
        "1_year": "Dernière année",
        "3_months": "3 derniers mois",
    }
    return {
        "period": period,
        "period_label": period_labels.get(period, "Toute la période"),
        "formula": "Ratio = (Tâches réalisées + Créations validées + 0,5) / (Jours de séjour + 0,5)",
        "members": entries,
    }


def resolve_member(db: Session, member_id: Optional[int] = None, member_prenom: Optional[str] = None) -> Optional[Member]:
    if member_id is not None:
        m = db.query(Member).filter(Member.id == int(member_id)).first()
        if m:
            return m
    if member_prenom:
        target = _norm_text(member_prenom)
        for m in db.query(Member).order_by(Member.id.asc()).all():
            if _norm_text(format_member_prenom(m)) == target or target in _norm_text(m.name):
                return m
    members = db.query(Member).order_by(Member.id.asc()).all()
    if not members:
        return None
    return next((m for m in members if _norm_text(m.prenom) == "henri"), members[0])


def get_toaster_state(prod_db: Session, member_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Lit directement l'état vivant de PostgreSQL (zéro clone SQLite).
    """
    members = prod_db.query(Member).order_by(Member.id.asc()).all()
    active_member = resolve_member(prod_db, member_id=member_id)

    members_list = [
        {
            "id": m.id,
            "prenom": format_member_prenom(m),
            "nom": format_member_display_name(m),
            "name": format_member_display_name(m),
            "email": m.email,
            "role": m.role,
            "is_coordinator": bool(m.is_coordinator),
            "avatar_color": m.avatar_color,
            "monthly_contribution": float(m.monthly_contribution or 50.0),
            "payment_reference": (
                "HLV-ELISABETH"
                if format_member_prenom(m) == "Élisabeth"
                else (m.payment_reference or f"HLV-{format_member_prenom(m).upper()}")
            ),
        }
        for m in members
    ]

    treasury_summary = get_member_treasury_summary(prod_db, active_member) if active_member else {}
    if active_member:
        calls_q = (
            prod_db.query(CallForFunds)
            .filter(CallForFunds.member_id == active_member.id)
            .order_by(CallForFunds.year.desc(), CallForFunds.month.desc())
            .all()
        )
        exps_q = (
            prod_db.query(MemberExpense)
            .filter(MemberExpense.member_id == active_member.id)
            .order_by(MemberExpense.id.desc())
            .all()
        )
        treasury_summary["calls_for_funds"] = [
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
        treasury_summary["expenses"] = [
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

    reservations_q = prod_db.query(Reservation).order_by(Reservation.start_date.asc()).all()
    stays_list = []
    for r in reservations_q:
        u_clean = sanitize_display_user_name(r.user_name)
        is_mine = False
        if active_member:
            u_low = _norm_text(u_clean)
            is_mine = _norm_text(format_member_prenom(active_member)) in u_low
        stays_list.append(
            {
                "id": r.id,
                "property_id": r.property_id,
                "property_name": r.property_name or ("Presbytère" if r.property_id == 2 else "Rosings"),
                "user_name": u_clean,
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

    tasks_q = prod_db.query(Task).order_by(Task.id.desc()).all()
    tasks_list = []
    for t in tasks_q:
        assigned_raw = t.assigned_members or "[]"
        try:
            assigned_arr = json.loads(assigned_raw) if isinstance(assigned_raw, str) else assigned_raw
            if not isinstance(assigned_arr, list):
                assigned_arr = [str(assigned_raw)]
        except ValueError:
            assigned_arr = [s.strip() for s in str(assigned_raw).split(",") if s.strip()]
        assigned_arr = [sanitize_display_user_name(x) for x in assigned_arr]
        is_assigned = bool(active_member and is_member_assigned_to_task(active_member, t))
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
                "created_by": sanitize_display_user_name(t.created_by),
                "is_assigned_to_member": is_assigned,
            }
        )

    projects_q = prod_db.query(Project).order_by(Project.id.desc()).all()
    all_votes = prod_db.query(ProjectVote).all()
    votes_by_project: Dict[int, List[ProjectVote]] = {}
    for v in all_votes:
        votes_by_project.setdefault(v.project_id, []).append(v)

    polls_list = []
    for p in projects_q:
        p_votes = votes_by_project.get(p.id, [])
        my_vote = None
        if active_member:
            ap_norm = _norm_text(format_member_prenom(active_member))
            for v in p_votes:
                if ap_norm in _norm_text(sanitize_display_user_name(v.user_name)):
                    my_vote = v.vote
                    break
        opts = []
        if p.options:
            try:
                opts = json.loads(p.options) if isinstance(p.options, str) else p.options
            except ValueError:
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
                "submitted_by": sanitize_display_user_name(p.submitted_by),
                "options": opts if isinstance(opts, list) else [],
                "allow_multiple_choices": bool(p.allow_multiple_choices),
                "votes": [
                    {
                        "id": v.id,
                        "user_name": sanitize_display_user_name(v.user_name),
                        "vote": v.vote,
                        "comment": v.comment,
                    }
                    for v in p_votes
                ],
                "member_vote": my_vote,
            }
        )

    heating_data = _read_heating_summary(prod_db)

    bank_accounts = prod_db.query(BankAccount).order_by(BankAccount.id.desc()).all()
    real_bank = next(
        (b for b in bank_accounts if b.iban and "000000000000" not in b.iban.replace(" ", "")),
        bank_accounts[0] if bank_accounts else None,
    )
    recent_txs = (
        prod_db.query(BankTransaction)
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
        m_sum = get_member_treasury_summary(prod_db, m)
        associates_balances.append(
            {
                "id": m.id,
                "name": format_member_display_name(m),
                "prenom": format_member_prenom(m),
                "monthly_contribution": float(m.monthly_contribution or 0.0),
                "cca_balance": float(m_sum.get("balance") or 0.0),
                "covered_months": int(m_sum.get("covered_months") or 0),
            }
        )

    docs_count = prod_db.query(AdminDocument).count()
    vademecum_count = prod_db.query(VademecumItem).count()

    active_member_dict = (
        {
            "id": active_member.id,
            "prenom": format_member_prenom(active_member),
            "nom": format_member_display_name(active_member),
            "name": format_member_display_name(active_member),
            "email": active_member.email,
            "role": active_member.role,
            "is_coordinator": bool(active_member.is_coordinator),
            "payment_reference": (
                "HLV-ELISABETH"
                if format_member_prenom(active_member) == "Élisabeth"
                else (active_member.payment_reference or f"HLV-{format_member_prenom(active_member).upper()}")
            ),
            "monthly_contribution": float(active_member.monthly_contribution or 50.0),
            "cca_balance": float(treasury_summary.get("balance") or 0.0),
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
        "vademecum_count": vademecum_count,
        "stays": stays_list,
        "tasks": tasks_list,
        "open_votes": polls_list,
        "heating_telemetry": heating_data,
    }

    return {
        "mode": "production",
        "members": members_list,
        "active_member": active_member_dict,
        "member_summary": member_summary,
        "treasury": treasury_summary,
        "swan_banking": swan_banking,
        "associates_balances": associates_balances,
        "documents_count": docs_count,
        "vademecum_count": vademecum_count,
        "stays": stays_list,
        "tasks": tasks_list,
        "open_votes": polls_list,
        "heating_telemetry": heating_data,
        "room_catalog": DOMAIN_ROOMS,
    }


def execute_toaster_action(
    prod_db: Session,
    member_id: int,
    action_type: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Exécute réellement une action confirmée par l'utilisateur sur la base PostgreSQL de production
    (et sur ViCare / Klereo si demandé). Fail-Fast strict sur toute incohérence ou indisponibilité matérielle.
    """
    norm_type = (action_type or "").strip().lower()
    merged_payload = dict(payload or {})
    for field_list_key in ("deduced_fields", "missing_fields"):
        if isinstance(merged_payload.get(field_list_key), list):
            for item in merged_payload[field_list_key]:
                if isinstance(item, dict) and item.get("key") and item.get("value") is not None:
                    val = item.get("raw_value") if item.get("raw_value") is not None else item["value"]
                    merged_payload[item["key"]] = val

    member = resolve_member(prod_db, member_id=member_id)
    if not member:
        raise ValueError(f"Aucun associé trouvé pour member_id={member_id}.")

    member_display = format_member_display_name(member)
    member_prenom = format_member_prenom(member)
    confirmation_msg = ""

    if norm_type in ("stay", "propose_stay_action", "reservation", "sejour"):
        operation = str(merged_payload.get("operation") or "create").lower()
        building_raw = str(merged_payload.get("building") or merged_payload.get("property_name") or "Presbytère").strip()
        norm_building, max_rooms, _ = resolve_building_limits(building_raw)
        is_presb = "presbyt" in _norm_text(norm_building)
        prop_id = 2 if is_presb else 1
        prop_name = norm_building

        start_date = str(merged_payload.get("start_date") or datetime.utcnow().strftime("%Y-%m-%d"))[:10]
        end_date = str(merged_payload.get("end_date") or start_date)[:10]
        if end_date < start_date:
            raise ValueError(f"La date de départ ({end_date}) ne peut pas précéder l'arrivée ({start_date}).")

        arrival_time = str(merged_payload.get("arrival_time") or "15:00")
        departure_time = str(merged_payload.get("departure_time") or "11:00")
        guest_count = max(1, int(merged_payload.get("guest_count") or 1))
        selected_rooms = parse_selected_rooms_list(merged_payload.get("selected_rooms") or merged_payload.get("rooms"))
        raw_chambers = int(merged_payload.get("chambers_used") or merged_payload.get("rooms_count") or max(1, len(selected_rooms)))

        if operation not in ("cancel", "delete", "annuler"):
            norm_building, max_rooms, chambers_used = validate_stay_rooms(norm_building, raw_chambers, selected_rooms)
            prop_name = norm_building
        else:
            chambers_used = raw_chambers

        rooms_str = json.dumps(selected_rooms, ensure_ascii=False) if selected_rooms else ""
        activate_heating = _to_bool(
            merged_payload.get("activate_heating", merged_payload.get("wants_heating")),
            default=is_presb,
        )
        target_temp = float(merged_payload.get("target_temperature") or 20.0)

        if operation in ("cancel", "delete", "annuler"):
            stay_id = merged_payload.get("reservation_id") or merged_payload.get("stay_id") or merged_payload.get("id")
            target_stay = None
            if stay_id:
                target_stay = prod_db.query(Reservation).filter(Reservation.id == int(stay_id)).first()
            if not target_stay:
                target_stay = (
                    prod_db.query(Reservation)
                    .filter(Reservation.user_name.ilike(f"%{member_prenom}%"))
                    .filter(Reservation.status != "Annulée")
                    .order_by(Reservation.id.desc())
                    .first()
                )
            if not target_stay:
                raise ValueError("Aucun séjour actif correspondant trouvé à annuler.")
            target_stay.status = "Annulée"
            prod_db.add(
                Log(
                    action="TOASTER_STAY_CANCEL",
                    user_name=member_display,
                    details=f"Séjour #{target_stay.id} annulé ({target_stay.property_name}, {target_stay.start_date} -> {target_stay.end_date})",
                )
            )
            prod_db.commit()
            confirmation_msg = (
                f"Le séjour #{target_stay.id} au {target_stay.property_name} "
                f"({target_stay.start_date} → {target_stay.end_date}) a été annulé."
            )
        else:
            try:
                dt_start = datetime.strptime(start_date, "%Y-%m-%d")
                year_val = dt_start.year
                week_val = dt_start.isocalendar()[1]
            except ValueError:
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
                user_name=member_display,
                year=year_val,
                week_number=week_val,
                start_date=start_date,
                end_date=end_date,
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
            prod_db.add(new_stay)
            prod_db.flush()
            prod_db.add(
                Log(
                    action="TOASTER_STAY_CREATE",
                    user_name=member_display,
                    details=f"Séjour #{new_stay.id} créé : {prop_name} ({start_date} -> {end_date}, {guest_count} pers., {chambers_used} ch.)",
                )
            )
            prod_db.commit()
            prod_db.refresh(new_stay)

            rooms_note = f" ({', '.join(selected_rooms)})" if selected_rooms else ""
            heating_suffix = (
                f" Le chauffage du Presbytère est programmé en confort ({target_temp:.0f} °C) pour votre arrivée."
                if (is_presb and activate_heating)
                else " Le chauffage reste en hors-gel."
            )
            confirmation_msg = (
                f"Séjour #{new_stay.id} enregistré au {prop_name} du {start_date} au {end_date} "
                f"pour {member_display} ({guest_count} pers., {chambers_used} ch.{rooms_note}).{heating_suffix}"
            )

    elif norm_type in ("heating", "propose_heating_or_pool_action", "pool", "thermal", "chauffage"):
        equipment = str(merged_payload.get("equipment") or "heating").lower()
        raw_mode = str(merged_payload.get("mode") or "dhwAndHeating").strip()

        if "pool" in equipment or "piscine" in equipment or merged_payload.get("pool_mode"):
            from .klereo_service import KlereoService

            pool_mode = str(merged_payload.get("pool_mode") or raw_mode or "confort").strip().lower()
            filtration = str(merged_payload.get("filtration_mode") or "auto").strip().lower()
            pool_temp = float(merged_payload.get("pool_temperature") or merged_payload.get("target_temperature") or 27.0)

            try:
                KlereoService.set_heating_mode(mode=pool_mode)
                if merged_payload.get("filtration_mode"):
                    KlereoService.set_pump_mode(mode=filtration)
                if merged_payload.get("target_temperature") or merged_payload.get("pool_temperature"):
                    KlereoService.set_temperature(pool_temp)
            except HTTPException as exc:
                detail = exc.detail.get("error") if isinstance(exc.detail, dict) else str(exc.detail)
                raise ValueError(f"Commande piscine Klereo impossible : {detail}")
            except Exception as exc:
                raise ValueError(f"Commande piscine Klereo impossible : {exc}")

            pool_setting = prod_db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "pool").first()
            if not pool_setting:
                pool_setting = ThermalSettings(equipment_type="pool")
                prod_db.add(pool_setting)
            pool_setting.mode = pool_mode
            pool_setting.filtration_mode = filtration
            pool_setting.target_temperature = pool_temp
            pool_setting.updated_by = member_display
            pool_setting.updated_at = datetime.utcnow()
            prod_db.add(
                Log(
                    action="TOASTER_POOL_UPDATE",
                    user_name=member_display,
                    details=f"Piscine Klereo réglée : mode={pool_mode}, filtration={filtration}, consigne={pool_temp:.1f}°C",
                )
            )
            prod_db.commit()
            confirmation_msg = (
                f"Piscine Klereo mise à jour : mode « {pool_mode} » ({pool_temp:.1f} °C, filtration « {filtration} »)."
            )
        else:
            from .vicare_service import ViCareService

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

            try:
                ViCareService.set_mode(mode, refresh_status=False)
                if mode in ("dhwAndHeating", "forcedNormal") and target_temp:
                    ViCareService.set_temperature(target_temp, program="comfort", refresh_status=True)
            except HTTPException as exc:
                detail = exc.detail.get("error") if isinstance(exc.detail, dict) else str(exc.detail)
                raise ValueError(
                    f"Impossible de piloter la chaudière Viessmann du Presbytère (passerelle Vitoconnect hors ligne ou erreur ViCare) : {detail}"
                )
            except Exception as exc:
                raise ValueError(
                    f"Impossible de piloter la chaudière Viessmann du Presbytère : {exc}"
                )

            setting = prod_db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "heating").first()
            if not setting:
                setting = ThermalSettings(equipment_type="heating")
                prod_db.add(setting)
            setting.mode = mode
            setting.target_temperature = target_temp
            setting.updated_by = member_display
            setting.updated_at = datetime.utcnow()

            dhw_setting = prod_db.query(ThermalSettings).filter(ThermalSettings.equipment_type == "dhw").first()
            if not dhw_setting:
                dhw_setting = ThermalSettings(equipment_type="dhw")
                prod_db.add(dhw_setting)
            dhw_setting.mode = "off" if mode == "standby" else "on"
            dhw_setting.updated_by = member_display
            dhw_setting.updated_at = datetime.utcnow()

            prod_db.add(
                Log(
                    action="TOASTER_HEATING_UPDATE",
                    user_name=member_display,
                    details=f"Chaudière ViCare réglée : mode={mode}, consigne={target_temp:.1f}°C",
                )
            )
            prod_db.commit()
            confirmation_msg = (
                f"Commande envoyée à la chaudière Viessmann du Presbytère : mode « {mode} » à {target_temp:.1f} °C."
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
            uploaded_by=member_display,
            notes=f"Fournisseur : {supplier} | Bâtiment : {building} | Montant TTC : {amount:.2f} €",
            created_at=datetime.utcnow(),
        )
        prod_db.add(doc)
        prod_db.flush()

        expense = MemberExpense(
            member_id=member.id,
            member_prenom=member_prenom,
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
        prod_db.add(expense)
        prod_db.commit()
        prod_db.refresh(expense)

        if advanced_by_member:
            ledger_entry = add_ledger_entry(
                db=prod_db,
                member_id=member.id,
                entry_type="AVANCE",
                amount=round(amount, 2),
                description=f"Avance de frais : {expense.title}",
                expense_id=expense.id,
            )
            reconciled = reconcile_open_calls_for_member(prod_db, member.id)
            confirmation_msg = (
                f"Facture « {expense.title} » ({amount:.2f} €) enregistrée en avance personnelle et créditée au CCA "
                f"de {member_prenom} (nouveau solde : {ledger_entry.balance_after:+.2f} €, {len(reconciled)} appel(s) réconcilié(s))."
            )
        else:
            sci_task = Task(
                ref=f"T-SCI-{expense.id}",
                title=f"Règlement facture SCI : {expense.title} ({amount:.2f} €)",
                description=f"Facture {supplier} du {expense_date} ({building}) à régler par virement SCI.",
                subject=building,
                category="Trésorerie & Factures",
                priority="Haute",
                status="PROPOSED",
                budget=round(amount, 2),
                created_by=member_display,
                created_at=datetime.utcnow(),
            )
            prod_db.add(sci_task)
            prod_db.flush()
            expense.task_id = sci_task.id
            prod_db.commit()
            confirmation_msg = (
                f"Facture « {expense.title} » ({amount:.2f} €) archivée et inscrite en attente de règlement par la SCI (tâche #{sci_task.id})."
            )

    elif norm_type in ("task", "propose_task_action", "tache"):
        operation = str(merged_payload.get("operation") or ("complete" if merged_payload.get("task_id") else "create")).lower()
        task_id = merged_payload.get("task_id") or merged_payload.get("id")
        title_val = str(merged_payload.get("title") or "").strip()

        target_task = None
        if task_id:
            target_task = prod_db.query(Task).filter(Task.id == int(task_id)).first()
        if not target_task and title_val and operation in ("complete", "close", "check", "assign", "update", "terminee"):
            target_task = prod_db.query(Task).filter(Task.title.ilike(f"%{title_val}%")).first()

        if operation in ("complete", "close", "check", "terminee", "termine") or (
            target_task and str(merged_payload.get("status", "")).upper() in ("TERMINE", "TERMINEE")
        ):
            if not target_task:
                raise ValueError("Tâche introuvable pour clôture.")
            new_status = str(merged_payload.get("status") or "TERMINEE").upper()
            target_task.status = new_status
            target_task.last_completed_at = datetime.utcnow()
            target_task.completion_notes = str(
                merged_payload.get("completion_notes") or f"Validée par {member_display} via l'assistant Grille-Pain"
            )
            target_task.updated_at = datetime.utcnow()
            prod_db.commit()
            confirmation_msg = f"La tâche #{target_task.id} « {target_task.title} » a été marquée comme {new_status}."
        else:
            assignee_name = str(merged_payload.get("assigned_to") or merged_payload.get("assignee") or "").strip()
            assignee_obj = None
            if assignee_name:
                assignee_obj = (
                    prod_db.query(Member)
                    .filter(
                        or_(
                            Member.prenom.ilike(f"%{assignee_name}%"),
                            Member.name.ilike(f"%{assignee_name}%"),
                        )
                    )
                    .first()
                )
            if target_task and operation == "assign":
                final_assignee = format_member_display_name(assignee_obj) if assignee_obj else (assignee_name or member_display)
                target_task.assignee_id = assignee_obj.id if assignee_obj else member.id
                target_task.assigned_members = json.dumps([final_assignee], ensure_ascii=False)
                target_task.updated_at = datetime.utcnow()
                prod_db.commit()
                confirmation_msg = f"La tâche #{target_task.id} « {target_task.title} » a été attribuée à {final_assignee}."
            else:
                if not title_val:
                    raise ValueError("Le titre de la tâche à créer est requis.")
                subject_val = str(merged_payload.get("subject") or merged_payload.get("building") or "Presbytère")
                priority_val = str(merged_payload.get("priority") or "Normale")
                charge_pts = int(merged_payload.get("charge_points") or 3)
                explicit_status = str(merged_payload.get("status") or "").strip().upper()
                task_status = explicit_status if (member.is_coordinator and explicit_status in ("A_FAIRE", "EN_COURS", "PROPOSED")) else "PROPOSED"

                last_t = prod_db.query(Task).order_by(Task.id.desc()).first()
                next_num = (last_t.id + 100) if (last_t and last_t.id) else 101
                candidate_ref = f"T-2026-{next_num:03d}"
                while prod_db.query(Task).filter(Task.ref == candidate_ref).first():
                    next_num += 1
                    candidate_ref = f"T-2026-{next_num:03d}"

                assigned_list = [format_member_display_name(assignee_obj)] if assignee_obj else ([assignee_name] if assignee_name else [])
                new_task = Task(
                    ref=candidate_ref,
                    title=title_val,
                    description=str(merged_payload.get("description") or title_val),
                    subject=subject_val,
                    category=str(merged_payload.get("category") or subject_val),
                    priority=priority_val,
                    status=task_status,
                    charge_points=charge_pts,
                    assignee_id=assignee_obj.id if assignee_obj else None,
                    assigned_members=json.dumps(assigned_list, ensure_ascii=False),
                    deadline=merged_payload.get("deadline"),
                    created_by=member_display,
                    created_at=datetime.utcnow(),
                )
                prod_db.add(new_task)
                prod_db.commit()
                prod_db.refresh(new_task)
                confirmation_msg = (
                    f"Tâche #{new_task.id} ({new_task.ref}) « {new_task.title} » créée sur {subject_val} (statut : {new_task.status})."
                )

    elif norm_type in ("vote", "propose_poll_or_vote_action", "poll", "scrutin", "project"):
        operation = str(
            merged_payload.get("operation")
            or ("create" if not merged_payload.get("project_id") and merged_payload.get("options") else "vote")
        ).lower()

        if operation == "create":
            title_val = str(merged_payload.get("title") or "Nouveau scrutin familial").strip()
            desc_val = str(merged_payload.get("description") or title_val).strip()
            options_val = merged_payload.get("options") or ["POUR", "CONTRE", "ABSTENTION"]
            if isinstance(options_val, str):
                options_val = [o.strip() for o in options_val.replace("\n", ",").split(",") if o.strip()]
            options_val = [str(o).strip() for o in options_val if str(o).strip()]
            if not options_val:
                options_val = ["POUR", "CONTRE", "ABSTENTION"]

            new_proj = Project(
                property_id=2,
                title=title_val,
                description=desc_val,
                estimated_cost=float(merged_payload.get("estimated_cost") or 0.0),
                category=str(merged_payload.get("category") or "🗳️ Scrutin Familial"),
                priority=str(merged_payload.get("priority") or "MOYENNE"),
                status="EN_VOTE",
                submitted_by=member_display,
                options=json.dumps(options_val, ensure_ascii=False),
                allow_multiple_choices=bool(merged_payload.get("allow_multiple_choices", len(options_val) > 3)),
                created_at=datetime.utcnow(),
            )
            prod_db.add(new_proj)
            prod_db.commit()
            prod_db.refresh(new_proj)
            confirmation_msg = f"Scrutin #{new_proj.id} « {new_proj.title} » ouvert au vote sur le portail."

        elif operation == "open":
            project_id = merged_payload.get("project_id") or merged_payload.get("id")
            target_proj = prod_db.query(Project).filter(Project.id == int(project_id)).first() if project_id else None
            if not target_proj:
                raise ValueError("Scrutin introuvable pour ouverture.")
            if merged_payload.get("title"):
                target_proj.title = str(merged_payload["title"]).strip()
            if merged_payload.get("description"):
                target_proj.description = str(merged_payload["description"]).strip()
            if merged_payload.get("options"):
                opts = merged_payload["options"]
                if isinstance(opts, str):
                    opts = [o.strip() for o in opts.replace("\n", ",").split(",") if o.strip()]
                target_proj.options = json.dumps([str(o).strip() for o in opts if str(o).strip()], ensure_ascii=False)
            target_proj.status = "EN_VOTE"
            prod_db.commit()
            confirmation_msg = f"Le scrutin #{target_proj.id} « {target_proj.title} » est désormais ouvert au vote."

        else:
            project_id = merged_payload.get("project_id") or merged_payload.get("vote_id") or merged_payload.get("id")
            if isinstance(project_id, dict):
                project_id = project_id.get("id")
            proj_title = str(merged_payload.get("project_title") or merged_payload.get("title") or "").strip()
            vote_choice = merged_payload.get("vote") or merged_payload.get("choice") or "POUR"
            vote_str = json.dumps(vote_choice, ensure_ascii=False) if isinstance(vote_choice, list) else str(vote_choice)
            comment_str = str(merged_payload.get("comment") or "")

            target_proj = None
            if project_id:
                target_proj = prod_db.query(Project).filter(Project.id == int(project_id)).first()
            if not target_proj and proj_title:
                target_proj = prod_db.query(Project).filter(Project.title.ilike(f"%{proj_title}%")).first()
            if not target_proj:
                raise ValueError("Aucun scrutin correspondant trouvé pour enregistrer ce vote.")

            existing_vote = (
                prod_db.query(ProjectVote)
                .filter(
                    ProjectVote.project_id == target_proj.id,
                    ProjectVote.user_name == member_display,
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
                    user_name=member_display,
                    vote=vote_str,
                    comment=comment_str,
                    voted_at=datetime.utcnow(),
                )
                prod_db.add(existing_vote)
            prod_db.commit()
            confirmation_msg = (
                f"Vote « {vote_str} » de {member_display} enregistré sur le scrutin #{target_proj.id} « {target_proj.title} »."
            )

    elif norm_type in ("vademecum", "propose_vademecum_action"):
        operation = str(merged_payload.get("operation") or ("update" if merged_payload.get("item_id") else "create")).lower()
        item_id = merged_payload.get("item_id") or merged_payload.get("id")
        title_val = str(merged_payload.get("title") or "").strip()
        content_val = str(merged_payload.get("content") or "").strip()
        category_val = str(merged_payload.get("category") or "Arrivée & Clés").strip()
        code_val = str(merged_payload.get("code_to_copy") or "").strip() or None
        importance_val = str(merged_payload.get("importance") or "INFO").strip().upper()
        if importance_val not in ("CRITIQUE", "IMPORTANT", "INFO"):
            importance_val = "INFO"

        raw_prop = merged_payload.get("property_id") or merged_payload.get("building") or 2
        if isinstance(raw_prop, int) or str(raw_prop).isdigit():
            prop_id = int(raw_prop)
        else:
            prop_id = 1 if "rosing" in _norm_text(str(raw_prop)) else 2

        if operation == "update":
            target_item = prod_db.query(VademecumItem).filter(VademecumItem.id == int(item_id)).first() if item_id else None
            if not target_item and title_val:
                target_item = prod_db.query(VademecumItem).filter(VademecumItem.title.ilike(f"%{title_val}%")).first()
            if not target_item:
                raise ValueError("Fiche Vademecum introuvable pour mise à jour.")
            if title_val:
                target_item.title = title_val
            if content_val:
                target_item.content = content_val
            if category_val:
                target_item.category = category_val
            if "code_to_copy" in merged_payload:
                target_item.code_to_copy = code_val
            if merged_payload.get("importance"):
                target_item.importance = importance_val
            target_item.updated_at = datetime.utcnow()
            prod_db.commit()
            confirmation_msg = f"Fiche Vademecum #{target_item.id} « {target_item.title} » mise à jour."
        else:
            if not title_val or not content_val:
                raise ValueError("Le titre et le contenu de la fiche Vademecum sont obligatoires.")
            new_item = VademecumItem(
                property_id=prop_id,
                category=category_val,
                title=title_val,
                content=content_val,
                code_to_copy=code_val,
                importance=importance_val,
                updated_at=datetime.utcnow(),
            )
            prod_db.add(new_item)
            prod_db.commit()
            prod_db.refresh(new_item)
            confirmation_msg = f"Fiche Vademecum #{new_item.id} « {new_item.title} » ajoutée dans « {new_item.category} »."
    else:
        raise ValueError(f"Type d'action non supporté : {action_type}")

    new_state = get_toaster_state(prod_db, member_id=member.id)
    return {
        "status": "ok",
        "success": True,
        "action_type": norm_type,
        "message": confirmation_msg,
        "confirmation_message": confirmation_msg,
        "reply": confirmation_msg,
        "state": new_state,
        **new_state,
    }


def execute_toaster_read_tool(
    prod_db: Session,
    member_id: Optional[int],
    tool_name: str,
    args: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Exécute un outil de LECTURE SEULE directement sur PostgreSQL de production (et API live Klereo / Drive si besoin).
    """
    from .drive_service import drive_jail_service

    args = dict(args or {})

    if tool_name in ("read_treasury_and_banking", "consult_treasury_and_ledger"):
        target_name = _norm_text(args.get("member_name"))
        members = prod_db.query(Member).order_by(Member.id.asc()).all()
        target_member = None
        if target_name:
            target_member = next(
                (
                    m
                    for m in members
                    if target_name in _norm_text(format_member_prenom(m))
                    or target_name in _norm_text(format_member_display_name(m))
                ),
                None,
            )
        if not target_member:
            target_member = resolve_member(prod_db, member_id=member_id)

        bank_accounts = prod_db.query(BankAccount).order_by(BankAccount.id.desc()).all()
        real_bank = next(
            (b for b in bank_accounts if b.iban and "000000000000" not in b.iban.replace(" ", "")),
            bank_accounts[0] if bank_accounts else None,
        )
        txs = (
            prod_db.query(BankTransaction)
            .order_by(BankTransaction.booking_date.desc(), BankTransaction.id.desc())
            .limit(25)
            .all()
        )
        expenses = prod_db.query(MemberExpense).order_by(MemberExpense.id.desc()).limit(25).all()
        associates = []
        for m in members:
            msum = get_member_treasury_summary(prod_db, m)
            calls = (
                prod_db.query(CallForFunds)
                .filter(CallForFunds.member_id == m.id)
                .order_by(CallForFunds.year.desc(), CallForFunds.month.desc())
                .limit(4)
                .all()
            )
            associates.append(
                {
                    "id": m.id,
                    "name": format_member_display_name(m),
                    "prenom": format_member_prenom(m),
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
                    "member_prenom": sanitize_display_user_name(e.member_prenom),
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
        search_q = _norm_text(args.get("search_query"))

        q = prod_db.query(Task).order_by(Task.id.desc())
        if task_id is not None:
            q = q.filter(Task.id == int(task_id))
        tasks_rows = q.all()

        out_tasks = []
        for t in tasks_rows:
            if status_filter and status_filter not in ("ALL", "TOUS") and (t.status or "").upper() != status_filter:
                continue
            hay = _norm_text(f"{t.ref or ''} {t.title or ''} {t.description or ''} {t.subject or ''} {t.assigned_members or ''}")
            if search_q and search_q not in hay:
                continue
            comments = (
                prod_db.query(TaskComment)
                .filter(TaskComment.task_id == t.id)
                .order_by(TaskComment.created_at.asc())
                .all()
            )
            linked_docs = (
                prod_db.query(AdminDocument)
                .options(defer(AdminDocument.file_data))
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
                    "created_by": sanitize_display_user_name(t.created_by),
                    "is_recurring": bool(t.is_recurring),
                    "recurrence": f"{t.recurrence_interval} {t.recurrence_unit}" if t.is_recurring else None,
                    "last_completed_at": str(t.last_completed_at) if t.last_completed_at else None,
                    "comments": [
                        {"author": sanitize_display_user_name(c.author_name), "content": c.content, "created_at": str(c.created_at)}
                        for c in comments
                    ],
                    "linked_documents": [
                        {"id": d.id, "title": d.title, "file_name": d.file_name, "url": f"/api/documents/{d.id}/download"}
                        for d in linked_docs
                    ],
                }
            )

        confirmed_res = prod_db.query(Reservation).filter(Reservation.status == "Confirmée").all()
        all_tasks_db = prod_db.query(Task).all()
        workload = calculate_workload_distribution(confirmed_res, tasks=all_tasks_db)
        leaderboard = compute_family_leaderboard(prod_db, period="all")
        return {
            "count": len(out_tasks),
            "tasks": out_tasks,
            "workload_equity_summary": workload,
            "leaderboard": leaderboard,
        }

    if tool_name == "read_stays_and_calendar":
        include_past = bool(args.get("include_past", True))
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        stays_rows = prod_db.query(Reservation).order_by(Reservation.start_date.asc()).all()
        stays_out = []
        for r in stays_rows:
            if not include_past and (r.end_date or "") < today_str:
                continue
            stays_out.append(
                {
                    "id": r.id,
                    "property_name": r.property_name or ("Presbytère" if r.property_id == 2 else "Rosings"),
                    "user_name": sanitize_display_user_name(r.user_name),
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
        return {"count": len(stays_out), "stays": stays_out, "room_catalog": DOMAIN_ROOMS}

    if tool_name == "read_polls_and_votes":
        proj_id = args.get("project_id")
        q = prod_db.query(Project).order_by(Project.id.desc())
        if proj_id is not None:
            q = q.filter(Project.id == int(proj_id))
        projs = q.all()
        out_projs = []
        for p in projs:
            votes = prod_db.query(ProjectVote).filter(ProjectVote.project_id == p.id).all()
            comments = prod_db.query(ProjectComment).filter(ProjectComment.project_id == p.id).all()
            opts = []
            if p.options:
                try:
                    opts = json.loads(p.options) if isinstance(p.options, str) else p.options
                except ValueError:
                    opts = [p.options]
            out_projs.append(
                {
                    "id": p.id,
                    "title": p.title,
                    "description": p.description,
                    "category": p.category,
                    "status": p.status,
                    "estimated_cost_eur": float(p.estimated_cost or 0.0),
                    "submitted_by": sanitize_display_user_name(p.submitted_by),
                    "allow_multiple_choices": bool(p.allow_multiple_choices),
                    "options": opts,
                    "votes": [
                        {"user_name": sanitize_display_user_name(v.user_name), "vote": v.vote, "comment": v.comment, "voted_at": str(v.voted_at)}
                        for v in votes
                    ],
                    "comments": [
                        {"author": sanitize_display_user_name(c.author_name), "content": c.content, "created_at": str(c.created_at)}
                        for c in comments
                    ],
                }
            )
        return {"count": len(out_projs), "polls_and_projects": out_projs}

    if tool_name == "read_heating_and_pool_status":
        heating = _read_heating_summary(prod_db)
        pool_live = _fetch_live_pool_status(prod_db)
        hist = (
            prod_db.query(HeatingTelemetryHistory)
            .order_by(HeatingTelemetryHistory.recorded_at.desc())
            .limit(10)
            .all()
        )
        return {
            "boiler_model": "Viessmann Vitoladens 300-C (22 kW condensation fioul) + Vitoconnect 100 OPTO2 (Presbytère)",
            "gateway_online": not heating["is_gateway_offline"],
            "last_telemetry_at": heating["last_seen_at"],
            "active_mode": heating["mode"],
            "active_program": heating["active_program"],
            "comfort_temperature_c": 20.0,
            "reduced_night_temperature_c": 6.0,
            "dhw_target_temperature_c": heating["dhw_configured_temperature"],
            "schedule_summary": "Chauffe confort 20.0 °C en journée (04h30–21h00) lors d'un séjour actif ; abaissement nocturne réduit à 6.0 °C de 21h00 à 04h30 ; mode standby hors-gel complet hors séjour.",
            "room_temperature_c": heating["room_temperature"],
            "outside_temperature_c": heating["outside_temperature"],
            "boiler_temperature_c": heating["boiler_temperature"],
            "dhw_temperature_c": heating["dhw_temperature"],
            "burner_active": heating["burner_active"],
            "burner_hours": heating["burner_hours"],
            "burner_starts": heating["burner_starts"],
            "fuel_tank": {
                "liters_remaining_estimated": heating["fuel_liters_remaining"],
                "capacity_liters": 3000.0,
                "percent_estimated": heating["fuel_percent"],
                "method": "Estimation logicielle déductive depuis jaugeage manuel au râteau du 17/10/2026 (46 cm / 130 cm ≈ 1 062 L) moins consommation brûleur Viessmann (±100–150 L).",
            },
            "pool_klereo": pool_live,
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

    if tool_name == "read_vademecum":
        item_id = args.get("item_id")
        search_q = _norm_text(args.get("search_query"))
        cat_q = _norm_text(args.get("category"))
        prop_q = _norm_text(args.get("building") or args.get("property_name"))

        props_map = {p.id: p.name for p in prod_db.query(Property).all()}
        q = prod_db.query(VademecumItem).order_by(VademecumItem.importance.desc(), VademecumItem.category.asc(), VademecumItem.id.asc())
        if item_id is not None:
            q = q.filter(VademecumItem.id == int(item_id))
        rows = q.all()

        matched = []
        for it in rows:
            prop_name = props_map.get(it.property_id, "Presbytère" if it.property_id == 2 else "Rosings")
            if cat_q and cat_q not in _norm_text(it.category):
                continue
            if prop_q and prop_q not in _norm_text(prop_name):
                continue
            hay = _norm_text(f"{it.title} {it.category} {it.content} {it.code_to_copy or ''} {prop_name}")
            if search_q:
                toks = [tok for tok in search_q.split() if len(tok) >= 2]
                if toks and not all(tok in hay for tok in toks):
                    continue
            matched.append(
                {
                    "id": it.id,
                    "property_id": it.property_id,
                    "property_name": prop_name,
                    "category": it.category,
                    "title": it.title,
                    "content": it.content,
                    "code_to_copy": it.code_to_copy,
                    "importance": it.importance,
                    "updated_at": str(it.updated_at)[:10] if it.updated_at else None,
                }
            )
        return {
            "count": len(matched),
            "categories_available": sorted({r.category for r in rows if r.category}),
            "items": matched[:30],
        }

    if tool_name == "read_documents_and_contracts":
        doc_id = args.get("document_id")
        search_q = _norm_text(args.get("search_query"))
        cat_q = _norm_text(args.get("category"))

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
                "uploaded_by": sanitize_display_user_name(real_doc.uploaded_by),
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

        docs_rows = (
            prod_db.query(AdminDocument)
            .options(defer(AdminDocument.file_data))
            .order_by(AdminDocument.id.desc())
            .all()
        )
        matched = []
        for d in docs_rows:
            hay = _norm_text(f"{d.title or ''} {d.file_name or ''} {d.category or ''} {d.notes or ''} {d.tags or ''}")
            if search_q:
                tokens = [tok for tok in search_q.split() if len(tok) >= 2]
                if tokens and not all(tok in hay for tok in tokens):
                    continue
            if cat_q and cat_q not in _norm_text(d.category):
                continue
            matched.append(
                {
                    "id": d.id,
                    "title": d.title,
                    "category": d.category,
                    "file_name": d.file_name,
                    "uploaded_by": sanitize_display_user_name(d.uploaded_by),
                    "created_at": str(d.created_at)[:10] if d.created_at else None,
                    "download_url": f"https://hellenvilliers.henri-jamet.com/api/documents/{d.id}/download",
                }
            )
        return {
            "total_matching_documents": len(matched),
            "documents": matched[:40],
            "hint": "Appelle à nouveau read_documents_and_contracts avec document_id=<id> pour lire le contenu exact PDF/image.",
        }

    if tool_name == "inspect_ui_skill":
        skill_id = str(args.get("skill_id") or "ui_components").strip().lower()
        skills_catalog: Dict[str, Dict[str, Any]] = {
            "ui_components": {
                "skill_id": "ui_components",
                "title": "Catalogue complet des composants interactifs via display_ui_component",
                "usage_rule": (
                    "Appelle display_ui_component(component_id=..., props={...}) dès qu'un rendu visuel enrichit la réponse. "
                    "Ne duplique JAMAIS un poll_status_card dans le même tour qu'une carte d'action propose_poll_or_vote_action pour le même scrutin."
                ),
                "components": {
                    "stays_calendar": {"props": {"month": "1..12", "year": "2026|2027", "building": "'all'|'Presbytère'|'Rosings'"}},
                    "fuel_and_heating_graph": {"props": {"initial_tab": "'annual'|'temperatures'|'daily'"}},
                    "pool_status_widget": {"props": {}, "renders": "Télémétrie Klereo en direct avec statut Wi-Fi/radio (radioPB), filtration, PAC et sondes."},
                    "poll_status_card": {"props": {"project_id": "int optionnel", "search_query": "str optionnel"}},
                    "tasks_overview_card": {"props": {"assigned_to": "str", "status_filter": "'EN_COURS'|'PROPOSED'|'A_FAIRE'|'TERMINEE'|'ALL'", "task_id": "int"}},
                    "treasury_overview_card": {"props": {"member_name": "str optionnel"}},
                    "document_viewer_card": {"props": {"document_id": "int", "search_query": "str"}},
                    "leaderboard_card": {"props": {"period": "'all'|'1_year'|'3_months'"}, "renders": "Classement participatif & équité officiel des 7 associés (tâches vs jours de séjour)."},
                    "custom_chart_card": {
                        "props": {
                            "title": "Titre du graphique",
                            "subtitle": "Sous-titre optionnel",
                            "chart_type": "'bar' | 'horizontal_bar' | 'line' | 'pie'",
                            "unit": "Unité affichée (ex: '€', 'L', '°C', 'j', 'pts', '%')",
                            "labels": ["Liste des étiquettes X / catégories"],
                            "series": [{"name": "Nom série", "color": "#059669", "values": [10, 20, 30]}],
                        },
                        "renders": "Graphique SVG interactif sur mesure construit à la volée à partir des données réelles de la SCI.",
                    },
                    "vademecum_card": {"props": {"item_id": "int", "search_query": "str", "category": "str", "building": "str"}, "renders": "Fiches pratiques du Vademecum avec codes copiables en 1 clic."},
                    "action_modal_buttons": {"props": {"buttons": [{"modal_type": "'stay'|'task'|'poll'|'document'|'vademecum'", "label": "str", "prefill": {}}]}},
                },
            },
            "sejours_et_chauffage": {
                "skill_id": "sejours_et_chauffage",
                "summary": (
                    "7 chambres EXACTEMENT au total : Presbytère (5 max : Suite, Deuxième Chambre du Couloir, Première Chambre du Couloir, La Mezzanine, Chambre du bas) "
                    "et Rosings (2 max : Chambre Haut Droite, Chambre Haut Gauche). Il est IMPOSSIBLE de réserver plus de 5 chambres au Presbytère, 2 à Rosings ou 7 sur tout le domaine. "
                    "Chauffage ViCare Presbytère : veille hors-gel standby hors séjour ; confort 20 °C (04h30–21h00) + réduit 6 °C la nuit."
                ),
            },
            "taches_et_artisans": {
                "skill_id": "taches_et_artisans",
                "summary": "Artisans clés : Chauffage EURL Ervan Bompais ; Fioul Éts Josse SAS (02 32 34 57 35) ; Fosses septiques SARL Les Vidanges Conchoises ; Piscine Declercq Conches. Points d'équité : 1 à 8 ; Frédéric est exempté des corvées physiques.",
            },
            "votes_et_ag": {
                "skill_id": "votes_et_ag",
                "summary": "Les scrutins (table projects) peuvent être en statut PROPOSED ou EN_VOTE, à choix unique (POUR/CONTRE/ABSTENTION) ou multi-dates. Toujours fournir une description claire lors d'une création.",
            },
            "tresorerie_et_documents": {
                "skill_id": "tresorerie_et_documents",
                "summary": "Compte officiel SCI HELLENVILLIERS chez Swan SAS (IBAN FR76 1732 8844 0071 5921 5570 591). Cotisations : 1 250 €/mois au total (1 000 € Frédéric & Élisabeth, 50 € chacun des 5 autres associés).",
            },
            "vademecum": {
                "skill_id": "vademecum",
                "summary": f"Le Vademecum regroupe les fiches pratiques (Wi-Fi, clés, chauffage, piscine, déchets, artisans, urgences) dans les catégories : {', '.join(VADEMECUM_CATEGORIES)}. Utiliser read_vademecum pour lire, display_ui_component('vademecum_card') pour afficher les fiches et propose_vademecum_action pour créer ou modifier une fiche.",
            },
        }
        return skills_catalog.get(skill_id, {"available_skills": list(skills_catalog.keys()), "ui_components_guide": skills_catalog["ui_components"]})

    if tool_name == "display_ui_component":
        comp_id = str(args.get("component_id") or "").strip().lower()
        raw_props = args.get("props") if isinstance(args.get("props"), dict) else {}
        props = dict(raw_props)
        for k, v in args.items():
            if k not in ("component_id", "props") and v is not None and k not in props:
                props[k] = v

        if comp_id in ("stays_calendar", "calendar", "calendrier"):
            now_dt = datetime.utcnow()
            month_val = int(props.get("month") or now_dt.month)
            year_val = int(props.get("year") or now_dt.year)
            building_filter = str(props.get("building") or "all")
            stays_rows = prod_db.query(Reservation).order_by(Reservation.start_date.asc()).all()
            stays_data = [
                {
                    "id": r.id,
                    "property_id": r.property_id,
                    "property_name": r.property_name or ("Presbytère" if r.property_id == 2 else "Rosings"),
                    "user_name": sanitize_display_user_name(r.user_name),
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
            return {"status": "rendered_in_chat", "component_id": "stays_calendar", "stays_count": len(stays_data), "_ui_component": ui_payload}

        if comp_id in ("fuel_and_heating_graph", "fuel_graph", "heating_graph", "fioul", "heating"):
            heating = _read_heating_summary(prod_db)
            initial_tab = str(props.get("initial_tab") or "annual").strip().lower()
            if initial_tab not in ("annual", "temperatures", "daily"):
                initial_tab = "annual"
            heating_status_obj = {
                "mode": heating["mode"],
                "target_temperature": heating["target_temperature"],
                "comfort_temperature": 20.0,
                "reduced_temperature": 6.0,
                "room_temperature": heating["room_temperature"],
                "outside_temperature": heating["outside_temperature"],
                "boiler_temperature": heating["boiler_temperature"],
                "dhw_temperature": heating["dhw_temperature"],
                "burner_hours": heating["burner_hours"] or 4605,
                "burner_starts": heating["burner_starts"] or 25445,
                "fuel_liters_remaining": heating["fuel_liters_remaining"],
                "fuel_level_percent": heating["fuel_percent"],
                "is_cached_last_known": heating["is_gateway_offline"],
                "last_seen_at": heating["last_seen_at"],
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
                "fuel_liters_remaining": heating["fuel_liters_remaining"],
                "gateway_offline": heating["is_gateway_offline"],
                "_ui_component": ui_payload,
            }

        if comp_id in ("pool_status_widget", "pool", "piscine"):
            pool_live = _fetch_live_pool_status(prod_db)
            ui_payload = {
                "component_id": "pool_status_widget",
                "pool": pool_live,
            }
            return {
                "status": "rendered_in_chat",
                "component_id": "pool_status_widget",
                "wifi_box_ok": pool_live.get("wifi_box_ok"),
                "radio_link_ok": pool_live.get("radio_link_ok"),
                "radio_error": pool_live.get("radio_error"),
                "klereo_alert_code": pool_live.get("klereo_alert_code"),
                "radio_alert": pool_live.get("radio_alert"),
                "water_temperature": pool_live.get("water_temperature"),
                "live_error": pool_live.get("live_error"),
                "_ui_component": ui_payload,
            }

        if comp_id in ("leaderboard_card", "leaderboard", "classement", "equite", "equity"):
            period = str(props.get("period") or "all").strip().lower()
            if period not in ("all", "1_year", "3_months"):
                period = "all"
            lb = compute_family_leaderboard(prod_db, period=period)
            ui_payload = {
                "component_id": "leaderboard_card",
                **lb,
            }
            return {
                "status": "rendered_in_chat",
                "component_id": "leaderboard_card",
                "period": period,
                "top_member": lb["members"][0]["name"] if lb["members"] else None,
                "_ui_component": ui_payload,
            }

        if comp_id in ("custom_chart_card", "custom_chart", "chart", "graph", "graphe"):
            title = str(props.get("title") or "Graphique SCI Hellenvilliers").strip()
            subtitle = str(props.get("subtitle") or "").strip()
            chart_type = str(props.get("chart_type") or "bar").strip().lower()
            if chart_type not in ("bar", "horizontal_bar", "line", "area", "pie", "donut"):
                chart_type = "bar"
            unit = str(props.get("unit") or "").strip()
            labels = props.get("labels") if isinstance(props.get("labels"), list) else []
            raw_series = props.get("series") if isinstance(props.get("series"), list) else []

            # Support simplifié si Gemini fournit directement {data: [{label, value}]}
            if not labels and isinstance(props.get("data"), list):
                labels = [str(d.get("label") or d.get("name") or f"#{i+1}") for i, d in enumerate(props["data"]) if isinstance(d, dict)]
                vals = [float(d.get("value") or 0) for d in props["data"] if isinstance(d, dict)]
                raw_series = [{"name": title, "values": vals}]

            palette = ["#059669", "#0284c7", "#d97706", "#7c3aed", "#e11d48", "#0d9488", "#4f46e5"]
            clean_series = []
            for idx, s in enumerate(raw_series):
                if not isinstance(s, dict):
                    continue
                vals = []
                for v in (s.get("values") or []):
                    try:
                        vals.append(float(v))
                    except (ValueError, TypeError):
                        vals.append(0.0)
                clean_series.append(
                    {
                        "name": str(s.get("name") or f"Série {idx + 1}"),
                        "color": str(s.get("color") or palette[idx % len(palette)]),
                        "values": vals,
                    }
                )
            if not labels or not clean_series:
                return {"error": "custom_chart_card requiert 'labels' (liste non vide) et 'series' ([{name, values}])."}

            ui_payload = {
                "component_id": "custom_chart_card",
                "title": title,
                "subtitle": subtitle,
                "chart_type": chart_type,
                "unit": unit,
                "labels": [str(lb) for lb in labels],
                "series": clean_series,
            }
            return {
                "status": "rendered_in_chat",
                "component_id": "custom_chart_card",
                "title": title,
                "chart_type": chart_type,
                "points_count": len(labels),
                "_ui_component": ui_payload,
            }

        if comp_id in ("vademecum_card", "vademecum", "fiches_pratiques"):
            res_vad = execute_toaster_read_tool(prod_db, member_id, "read_vademecum", props)
            ui_payload = {
                "component_id": "vademecum_card",
                "query": props.get("search_query") or props.get("category") or "",
                "items": (res_vad.get("items") or [])[:10],
            }
            return {
                "status": "rendered_in_chat",
                "component_id": "vademecum_card",
                "items_count": len(ui_payload["items"]),
                "_ui_component": ui_payload,
            }

        if comp_id in ("poll_status_card", "poll", "vote", "votes", "scrutin"):
            proj_id = props.get("project_id")
            search_q = _norm_text(props.get("search_query"))
            q = prod_db.query(Project).order_by(Project.id.desc())
            if proj_id is not None:
                q = q.filter(Project.id == int(proj_id))
            projs = q.all()
            matched_polls = []
            for p in projs:
                if proj_id is None and search_q:
                    hay = _norm_text(f"{p.title or ''} {p.description or ''} {p.category or ''}")
                    if search_q not in hay:
                        continue
                elif proj_id is None and not search_q:
                    if (p.status or "").upper() not in ("EN_VOTE", "PROPOSED", "SOUMIS"):
                        continue
                votes = prod_db.query(ProjectVote).filter(ProjectVote.project_id == p.id).all()
                opts = []
                if p.options:
                    try:
                        opts = json.loads(p.options) if isinstance(p.options, str) else p.options
                    except ValueError:
                        opts = [p.options]
                matched_polls.append(
                    {
                        "id": p.id,
                        "title": p.title,
                        "description": p.description,
                        "category": p.category,
                        "status": p.status,
                        "estimated_cost": float(p.estimated_cost or 0.0),
                        "submitted_by": sanitize_display_user_name(p.submitted_by),
                        "allow_multiple_choices": bool(p.allow_multiple_choices),
                        "options": opts if isinstance(opts, list) else [],
                        "votes": [
                            {"id": v.id, "user_name": sanitize_display_user_name(v.user_name), "vote": v.vote, "comment": v.comment}
                            for v in votes
                        ],
                    }
                )
            ui_payload = {"component_id": "poll_status_card", "polls": matched_polls[:5]}
            return {
                "status": "rendered_in_chat",
                "component_id": "poll_status_card",
                "polls_rendered": [{"id": p["id"], "title": p["title"], "status": p["status"]} for p in matched_polls[:5]],
                "_ui_component": ui_payload,
            }

        if comp_id in ("tasks_overview_card", "tasks", "taches"):
            t_id = props.get("task_id")
            assigned_q = _norm_text(props.get("assigned_to"))
            status_q = str(props.get("status_filter") or "ACTIVE").strip().upper()
            q = prod_db.query(Task).order_by(Task.id.desc())
            if t_id is not None:
                q = q.filter(Task.id == int(t_id))
            rows = q.all()
            cards = []
            for t in rows:
                if t_id is None and status_q not in ("ALL", "TOUS", ""):
                    st_up = (t.status or "").upper()
                    if status_q == "ACTIVE" and st_up in ("TERMINEE", "TERMINE", "ARCHIVEE"):
                        continue
                    elif status_q != "ACTIVE" and st_up != status_q:
                        continue
                assigned_raw = t.assigned_members or "[]"
                try:
                    assigned_arr = json.loads(assigned_raw) if isinstance(assigned_raw, str) else assigned_raw
                except ValueError:
                    assigned_arr = [str(assigned_raw)]
                assigned_clean = [sanitize_display_user_name(str(x)) for x in (assigned_arr if isinstance(assigned_arr, list) else [assigned_arr])]
                if assigned_q and not any(assigned_q in _norm_text(a) for a in assigned_clean):
                    continue
                linked_docs = (
                    prod_db.query(AdminDocument)
                    .options(defer(AdminDocument.file_data))
                    .filter(AdminDocument.task_id == t.id)
                    .all()
                )
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
            return {"status": "rendered_in_chat", "component_id": "tasks_overview_card", "tasks_rendered_count": len(cards[:12]), "_ui_component": ui_payload}

        if comp_id in ("treasury_overview_card", "treasury", "tresorerie", "banque"):
            res_fin = execute_toaster_read_tool(prod_db, member_id, "read_treasury_and_banking", props)
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
            search_q = _norm_text(props.get("search_query"))
            docs_out = []
            if doc_id is not None:
                d = prod_db.query(AdminDocument).options(defer(AdminDocument.file_data)).filter(AdminDocument.id == int(doc_id)).first()
                if d:
                    docs_out.append(
                        {
                            "id": d.id,
                            "title": d.title or d.file_name,
                            "file_name": d.file_name,
                            "category": d.category,
                            "uploaded_by": sanitize_display_user_name(d.uploaded_by),
                            "created_at": str(d.created_at)[:10] if d.created_at else None,
                            "download_url": f"/api/documents/{d.id}/download",
                        }
                    )
            else:
                for d in prod_db.query(AdminDocument).options(defer(AdminDocument.file_data)).order_by(AdminDocument.id.desc()).all():
                    hay = _norm_text(f"{d.title or ''} {d.file_name or ''} {d.category or ''} {d.notes or ''}")
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
                            "uploaded_by": sanitize_display_user_name(d.uploaded_by),
                            "created_at": str(d.created_at)[:10] if d.created_at else None,
                            "download_url": f"/api/documents/{d.id}/download",
                        }
                    )
                    if len(docs_out) >= 6:
                        break
            ui_payload = {"component_id": "document_viewer_card", "documents": docs_out}
            return {"status": "rendered_in_chat", "component_id": "document_viewer_card", "documents_rendered_count": len(docs_out), "_ui_component": ui_payload}

        if comp_id in ("action_modal_buttons", "modal_buttons", "buttons", "quick_actions"):
            raw_buttons = props.get("buttons")
            if not isinstance(raw_buttons, list) or not raw_buttons:
                m_type = str(props.get("modal_type") or "stay").lower()
                default_labels = {
                    "stay": "Ouvrir le formulaire de réservation de séjour",
                    "task": "Ouvrir le formulaire de création de tâche",
                    "poll": "Ouvrir le formulaire de création de vote",
                    "document": "Déposer une facture ou un document",
                    "vademecum": "Ajouter une fiche au Vademecum",
                }
                raw_buttons = [
                    {
                        "modal_type": m_type,
                        "label": props.get("label") or default_labels.get(m_type, "Ouvrir le formulaire"),
                        "prefill": props.get("prefill") or {},
                    }
                ]
            ui_payload = {"component_id": "action_modal_buttons", "buttons": raw_buttons}
            return {"status": "rendered_in_chat", "component_id": "action_modal_buttons", "buttons_count": len(raw_buttons), "_ui_component": ui_payload}

        return {
            "error": (
                f"Composant UI inconnu : '{comp_id}'. Valeurs supportées : stays_calendar, fuel_and_heating_graph, "
                "pool_status_widget, poll_status_card, tasks_overview_card, treasury_overview_card, document_viewer_card, "
                "leaderboard_card, custom_chart_card, vademecum_card, action_modal_buttons."
            )
        }

    return {"error": f"Outil de lecture inconnu : {tool_name}"}

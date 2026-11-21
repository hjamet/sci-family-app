from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple
import unicodedata
import json
import re

def calculate_reservation_days(start_date: str, end_date: str) -> int:
    """
    Calculates the number of days for a reservation (inclusive of start and end dates).
    """
    try:
        d1 = datetime.strptime(start_date, "%Y-%m-%d")
        d2 = datetime.strptime(end_date, "%Y-%m-%d")
        return max((d2 - d1).days + 1, 1)
    except Exception:
        return 7  # Fallback standard week


def calculate_effective_rooms(
    accepts_extra_family: Optional[bool] = True,
    rooms_count: Optional[int] = 1,
    chambers_used: Optional[int] = 1,
    cohabitation_type: Optional[str] = None
) -> int:
    """
    Henri's Capacity Penalty Rule:
    If cohabitation_type == 'exclusive' or accepts_extra_family is False,
    exclusive booking penalty applies -> rooms_count = 7 (100% SCI capacity penalty, ratio = 1.0).
    Otherwise, returns selected rooms_count, fallback to chambers_used or 1.
    """
    if cohabitation_type == "exclusive" or accepts_extra_family is False:
        return 7
    if rooms_count is not None and rooms_count > 0:
        return rooms_count
    if chambers_used is not None and chambers_used > 0:
        return chambers_used
    return 1


def calculate_reservation_score(
    start_date: str,
    end_date: str,
    accepts_extra_family: Optional[bool] = True,
    rooms_count: Optional[int] = 1,
    chambers_used: Optional[int] = 1,
    cohabitation_type: Optional[str] = None
) -> float:
    """
    Calculates single reservation occupation score O_u_i = days * effective_rooms.
    """
    days = calculate_reservation_days(start_date, end_date)
    rooms = calculate_effective_rooms(accepts_extra_family, rooms_count, chambers_used, cohabitation_type)
    return float(days * rooms)


# ==============================================================================
# AXES ORTHOGONAUX OFFICIELS : URGENCE (rapidité d'action) vs DIFFICULTÉ (points)
# ==============================================================================

TASK_URGENCY_LEVELS: Tuple[str, ...] = (
    "Immédiate",
    "Rapide",
    "Normale",
    "Sans urgence",
)

TASK_DIFFICULTY_LEVELS: Tuple[str, ...] = (
    "Très facile",
    "Facile",
    "Moyenne",
    "Difficile",
    "Très difficile",
)

# Barème pondéré officiel Henri - Difficulté / Charge de la tâche (1, 2, 3, 5, 8 pts)
# Accepte les libellés canoniques (Très facile..Très difficile) et les alias historiques (Négligeable..Très élevée)
TASK_CHARGE_WEIGHTS: Dict[str, int] = {
    "Très facile": 1,
    "Facile": 2,
    "Moyenne": 3,
    "Difficile": 5,
    "Très difficile": 8,
    "Négligeable": 1,
    "Faible": 2,
    "Modérée": 3,
    "Élevée": 5,
    "Très élevée": 8,
}

CANCELLED_STAY_STATUSES = {
    "ANNULEE",
    "ANNULE",
    "REFUSEE",
    "REFUSE",
    "CANCELLED",
    "CANCELED",
    "REJECTED",
    "SUPPRIMEE",
    "SUPPRIME",
}


def _strip_accents_lower(value: Optional[str]) -> str:
    if not value:
        return ""
    return "".join(
        c for c in unicodedata.normalize("NFD", str(value).strip().lower())
        if unicodedata.category(c) != "Mn"
    )


def normalize_urgency(raw: Optional[str]) -> str:
    """
    Normalise l'axe URGENCE (« à quel point faut-il agir vite ? ») :
    Immédiate | Rapide | Normale | Sans urgence.
    Indépendant de la difficulté et des points d'équité.
    """
    if not raw:
        return "Normale"
    clean = _strip_accents_lower(raw)
    if clean in ("immediate", "critique", "urgent", "urgente", "tres urgente", "immédiate"):
        return "Immédiate"
    if clean in ("rapide", "haute", "high", "elevee", "importante", "prioritaire"):
        return "Rapide"
    if clean in ("sans urgence", "planifie", "planifiee", "basse", "low", "faible", "aucune", "quand possible"):
        return "Sans urgence"
    return "Normale"


def normalize_difficulty(raw: Optional[str]) -> str:
    """
    Normalise l'axe DIFFICULTÉ (« à quel point la tâche est pesante pour celui qui s'en charge ? ») :
    Très facile (1 pt) | Facile (2 pts) | Moyenne (3 pts) | Difficile (5 pts) | Très difficile (8 pts).
    """
    if not raw:
        return "Moyenne"
    clean = _strip_accents_lower(raw)
    if "tres facile" in clean or "neglig" in clean or clean == "1":
        return "Très facile"
    if "tres difficile" in clean or "tres elev" in clean or clean == "8":
        return "Très difficile"
    if "facile" in clean or "faible" in clean or clean == "2":
        return "Facile"
    if "difficile" in clean or "elev" in clean or "expertise" in clean or clean == "5":
        return "Difficile"
    if "moyen" in clean or "moder" in clean or clean == "3":
        return "Moyenne"
    return "Moyenne"


def get_task_charge_points(complexity: Optional[str]) -> int:
    """
    Retourne les points d'équité d'une tâche selon sa Difficulté (strictement découplée de l'Urgence) :
    Très facile / Négligeable -> 1 pt, Facile / Faible -> 2 pts, Moyenne / Modérée -> 3 pts,
    Difficile / Élevée -> 5 pts, Très difficile / Très élevée -> 8 pts.
    """
    if not complexity:
        return 3
    comp = str(complexity).strip()
    if comp in TASK_CHARGE_WEIGHTS:
        return TASK_CHARGE_WEIGHTS[comp]
    canonical = normalize_difficulty(comp)
    return TASK_CHARGE_WEIGHTS.get(canonical, 3)


ACTIVE_STATUSES = {"EN_COURS", "A_FAIRE", "TODO"}
COMPLETED_STATUSES = {"TERMINEE", "TERMINE", "VALIDE", "VALIDEE", "CLOS", "CLOTUREE", "COMPLETED", "ARCHIVEE"}
UNAPPROVED_STATUSES = {"PROPOSED", "PROPOSEE", "REJECTED", "REJETEE", "BROUILLON", "DRAFT"}


def normalize_status(st: Optional[str]) -> str:
    if not st:
        return ""
    clean = unicodedata.normalize("NFD", str(st).strip().upper())
    clean = "".join(c for c in clean if unicodedata.category(c) != "Mn")
    clean = clean.replace(" ", "_").replace("-", "_")
    return clean


def is_exempt_member(member: Any) -> bool:
    """
    Exempte Frédéric Jamet (Papa) des corvées et des recommandations
    (il finance déjà la SCI à hauteur de plus de 20 fois les autres membres).
    """
    m_name = (getattr(member, "name", None) or (member.get("name") if isinstance(member, dict) else "") or str(member)).lower()
    m_prenom = (getattr(member, "prenom", None) or (member.get("prenom") if isinstance(member, dict) else "")).lower()
    clean_name = "".join(c for c in unicodedata.normalize("NFD", m_name) if unicodedata.category(c) != "Mn")
    clean_prenom = "".join(c for c in unicodedata.normalize("NFD", m_prenom) if unicodedata.category(c) != "Mn")
    if "frederic" in clean_prenom or "frederic" in clean_name:
        return True
    monthly = getattr(member, "monthly_contribution", 0.0) or (member.get("monthly_contribution", 0.0) if isinstance(member, dict) else 0.0)
    try:
        if float(monthly) >= 500.0:
            return True
    except (ValueError, TypeError):
        pass
    return False


def is_member_assigned_to_task(member: Any, task: Any) -> bool:
    m_id = getattr(member, "id", None) or (member.get("id") if isinstance(member, dict) else None)
    t_assignee_id = getattr(task, "assignee_id", None) if not isinstance(task, dict) else task.get("assignee_id")
    if m_id is not None and t_assignee_id is not None and m_id == t_assignee_id:
        return True

    m_name = (getattr(member, "name", None) or (member.get("name") if isinstance(member, dict) else "") or str(member)).strip()
    m_prenom = (getattr(member, "prenom", None) or (member.get("prenom") if isinstance(member, dict) else "")).strip()

    assigned = getattr(task, "assigned_members", None) if not isinstance(task, dict) else task.get("assigned_members")
    if isinstance(assigned, str):
        try:
            assigned = json.loads(assigned)
        except Exception:
            assigned = [assigned]
    elif not isinstance(assigned, list):
        assigned = [getattr(task, "assignee", None)] if getattr(task, "assignee", None) else []

    clean_prenom = "".join(c for c in unicodedata.normalize("NFD", m_prenom.lower()) if unicodedata.category(c) != "Mn")
    clean_name = "".join(c for c in unicodedata.normalize("NFD", m_name.lower()) if unicodedata.category(c) != "Mn")

    for a in (assigned or []):
        if not a:
            continue
        a_str = str(a).strip().lower()
        a_clean = "".join(c for c in unicodedata.normalize("NFD", a_str) if unicodedata.category(c) != "Mn")
        if clean_name and (clean_name in a_clean or a_clean in clean_name):
            return True
        if clean_prenom and (clean_prenom in a_clean or a_clean in clean_prenom):
            return True

    return False


def is_member_creator_of_task(member: Any, task: Any) -> bool:
    creator = getattr(task, "created_by", None) if not isinstance(task, dict) else task.get("created_by")
    if not creator:
        return False
    c_str = str(creator).strip().lower()
    c_clean = "".join(c for c in unicodedata.normalize("NFD", c_str) if unicodedata.category(c) != "Mn")
    m_name = (getattr(member, "name", None) or (member.get("name") if isinstance(member, dict) else "") or str(member)).strip().lower()
    m_prenom = (getattr(member, "prenom", None) or (member.get("prenom") if isinstance(member, dict) else "")).strip().lower()
    clean_prenom = "".join(c for c in unicodedata.normalize("NFD", m_prenom) if unicodedata.category(c) != "Mn")
    clean_name = "".join(c for c in unicodedata.normalize("NFD", m_name) if unicodedata.category(c) != "Mn")
    if clean_name and (clean_name in c_clean or c_clean in clean_name):
        return True
    if clean_prenom and (clean_prenom in c_clean or c_clean in clean_prenom):
        return True
    return False


def calculate_workload_distribution(
    reservations: List[Any],
    total_charge_points: float = 100.0,
    tasks: Optional[List[Any]] = None
) -> Dict[str, Any]:
    """
    Henri's Proportional Usage Workload Model:
    - User occupation score: O_u = sum(days * rooms_count)
    - If cohabitation_type == 'exclusive' or accepts_extra_family == False: rooms_count = 7 (100% capacity penalty).
    - Target Charge Points: C_u^target = (O_u / sum(O_v)) * Total Charge Points.
    - Points de charge réalisés ou assignés basés sur la Charge de la tâche (1, 2, 3, 5, 8 pts).
    
    Accepts SQLAlchemy Reservation objects or dictionary representations.
    """
    user_scores: Dict[str, float] = {}
    user_days: Dict[str, int] = {}

    for res in reservations:
        # Support both SQLAlchemy model instances and dicts
        if isinstance(res, dict):
            user_name = res.get("user_name", "Anonyme")
            start_date = res.get("start_date", "")
            end_date = res.get("end_date", "")
            accepts_extra = res.get("accepts_extra_family", True)
            cohab_type = res.get("cohabitation_type")
            rc = res.get("rooms_count", 1)
            cu = res.get("chambers_used", 1)
        else:
            user_name = getattr(res, "user_name", "Anonyme")
            start_date = getattr(res, "start_date", "")
            end_date = getattr(res, "end_date", "")
            accepts_extra = getattr(res, "accepts_extra_family", True)
            cohab_type = getattr(res, "cohabitation_type", None)
            rc = getattr(res, "rooms_count", 1)
            cu = getattr(res, "chambers_used", 1)

        days = calculate_reservation_days(start_date, end_date)
        rooms = calculate_effective_rooms(accepts_extra, rc, cu, cohab_type)
        score = float(days * rooms)

        user_scores[user_name] = user_scores.get(user_name, 0.0) + score
        user_days[user_name] = user_days.get(user_name, 0) + days

    total_o = sum(user_scores.values())

    # Points de charge réalisés par membre (si les tâches sont fournies)
    user_performed_charge: Dict[str, float] = {}
    if tasks:
        for t in tasks:
            t_comp = getattr(t, "complexity", None) if not isinstance(t, dict) else t.get("complexity")
            pts = float(get_task_charge_points(t_comp))
            st_raw = getattr(t, "status", None) if not isinstance(t, dict) else t.get("status")
            st_norm = normalize_status(st_raw)

            assigned = getattr(t, "assigned_members", None) if not isinstance(t, dict) else t.get("assigned_members")
            if isinstance(assigned, str):
                try:
                    assigned = json.loads(assigned)
                except Exception:
                    assigned = [assigned]
            elif not isinstance(assigned, list):
                assigned = [getattr(t, "assignee", None)] if getattr(t, "assignee", None) else []

            # Tâches terminées ou validées
            if st_norm in COMPLETED_STATUSES or not st_norm:
                for a in (assigned or []):
                    if a:
                        user_performed_charge[str(a)] = user_performed_charge.get(str(a), 0.0) + pts

            # Bonus de création (+1 pt) pour toute tâche créée et approuvée
            if st_norm not in UNAPPROVED_STATUSES:
                creator = getattr(t, "created_by", None) if not isinstance(t, dict) else t.get("created_by")
                if creator:
                    c_str = str(creator).strip()
                    user_performed_charge[c_str] = user_performed_charge.get(c_str, 0.0) + 1.0

    user_stats = []
    for user_name, o_u in user_scores.items():
        charge_pct = (o_u / total_o * 100.0) if total_o > 0 else 0.0
        target_charge = (o_u / total_o * total_charge_points) if total_o > 0 else 0.0
        perf_charge = user_performed_charge.get(user_name, 0.0)

        user_stats.append({
            "user_name": user_name,
            "total_days": user_days.get(user_name, 0),
            "occupation_score": round(o_u, 2),
            "target_charge_points": round(target_charge, 2),
            "charge_percentage": round(charge_pct, 2),
            "performed_charge_points": round(perf_charge, 2)
        })

    return {
        "total_charge_points": total_charge_points,
        "total_occupation_score": round(total_o, 2),
        "user_stats": user_stats
    }


def _to_date_only(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip()
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _reservation_involves_member(res: Any, member: Any) -> bool:
    """
    Vérifie si un associé est le titulaire ou un co-participant familial d'une réservation
    (user_name ou section participants dans notes, en ignorant le bloc [Domotique: ...]).
    """
    m_name = getattr(member, "name", None) if not isinstance(member, dict) else member.get("name", "")
    m_prenom = getattr(member, "prenom", None) if not isinstance(member, dict) else member.get("prenom", "")
    clean_name = _strip_accents_lower(m_name)
    clean_prenom = _strip_accents_lower(m_prenom)
    if not clean_prenom and clean_name:
        clean_prenom = clean_name.split()[0]

    u_name = res.get("user_name", "") if isinstance(res, dict) else getattr(res, "user_name", "")
    clean_u = _strip_accents_lower(u_name)
    if clean_name and clean_name in clean_u:
        return True
    if clean_prenom and len(clean_prenom) >= 3 and re.search(rf"\b{re.escape(clean_prenom)}\b", clean_u):
        return True

    notes = res.get("notes", "") if isinstance(res, dict) else getattr(res, "notes", "")
    if notes:
        # Retirer les blocs techniques [Domotique: ...] avant de chercher les prénoms de co-participants
        notes_without_dom = re.sub(r"\[Domotique:[^\]]*\]", " ", str(notes), flags=re.IGNORECASE)
        clean_notes = _strip_accents_lower(notes_without_dom)
        # Ne matcher que si la note mentionne des participants / membres / famille ou le nom complet
        has_participant_hint = any(
            k in clean_notes for k in ("participant", "membre", "famille", "avec ", "cohab")
        )
        if clean_name and clean_name in clean_notes:
            return True
        if has_participant_hint and clean_prenom and len(clean_prenom) >= 3:
            if re.search(rf"\b{re.escape(clean_prenom)}\b", clean_notes):
                return True
    return False


def extract_upcoming_member_stays(
    members: List[Any],
    reservations: List[Any],
    today: Optional[date] = None
) -> Dict[str, Dict[str, Any]]:
    """
    Pour chaque associé non exempté, retourne son séjour confirmé actif ou le plus proche à venir.
    """
    ref_day = _to_date_only(today) or datetime.utcnow().date()
    eligible_members = [m for m in (members or []) if not is_exempt_member(m)]
    best_by_member: Dict[str, Dict[str, Any]] = {}

    for res in (reservations or []):
        st_raw = res.get("status", "") if isinstance(res, dict) else getattr(res, "status", "")
        if normalize_status(st_raw) in CANCELLED_STAY_STATUSES:
            continue

        start_d = _to_date_only(res.get("start_date") if isinstance(res, dict) else getattr(res, "start_date", None))
        end_d = _to_date_only(res.get("end_date") if isinstance(res, dict) else getattr(res, "end_date", None))
        if not start_d or not end_d:
            continue
        if end_d < ref_day:
            continue

        is_now = start_d <= ref_day <= end_d
        days_until = 0 if is_now else (start_d - ref_day).days
        res_id = res.get("id") if isinstance(res, dict) else getattr(res, "id", None)
        prop_name = res.get("property_name") if isinstance(res, dict) else getattr(res, "property_name", None)
        label = (
            f"Sur place jusqu'au {end_d.strftime('%d/%m')}"
            if is_now
            else f"Vient le {start_d.strftime('%d/%m')} (J-{days_until})"
        )

        for m in eligible_members:
            if not _reservation_involves_member(res, m):
                continue
            m_name = m.name if hasattr(m, "name") else (m.get("name") if isinstance(m, dict) else str(m))
            prev = best_by_member.get(m_name)
            if prev is None or (days_until, start_d.isoformat()) < (prev["days_until_stay"], prev["start_date"]):
                best_by_member[m_name] = {
                    "reservation_id": res_id,
                    "start_date": start_d.isoformat(),
                    "end_date": end_d.isoformat(),
                    "days_until_stay": days_until,
                    "is_on_site_now": is_now,
                    "property_name": prop_name or "Domaine",
                    "label": label,
                }

    return best_by_member


def compute_member_subject_expertise(
    members: List[Any],
    tasks: Optional[List[Any]],
    subject: Optional[str] = None,
    category: Optional[str] = None,
) -> Dict[str, int]:
    """
    Calcule l'expertise thématique réelle de chaque associé : nombre de tâches
    terminées dans le même sujet/domaine (100 % issu de l'historique BDD).
    """
    target_tokens = {
        tok for tok in (_strip_accents_lower(subject), _strip_accents_lower(category))
        if tok and tok not in ("general", "général", "autre", "sci")
    }
    counts: Dict[str, int] = {}
    for m in (members or []):
        m_name = m.name if hasattr(m, "name") else (m.get("name") if isinstance(m, dict) else str(m))
        counts[m_name] = 0

    if not target_tokens or not tasks:
        return counts

    for t in tasks:
        st_raw = getattr(t, "status", None) if not isinstance(t, dict) else t.get("status")
        if normalize_status(st_raw) not in COMPLETED_STATUSES:
            continue
        t_sub = _strip_accents_lower(getattr(t, "subject", None) if not isinstance(t, dict) else t.get("subject"))
        t_cat = _strip_accents_lower(getattr(t, "category", None) if not isinstance(t, dict) else t.get("category"))
        matched_domain = any(
            (tok and ((t_sub and (tok in t_sub or t_sub in tok)) or (t_cat and (tok in t_cat or t_cat in tok))))
            for tok in target_tokens
        )
        if not matched_domain:
            continue
        for m in (members or []):
            if is_exempt_member(m):
                continue
            if is_member_assigned_to_task(m, t):
                m_name = m.name if hasattr(m, "name") else (m.get("name") if isinstance(m, dict) else str(m))
                counts[m_name] = counts.get(m_name, 0) + 1

    return counts


def compute_anticipation_horizon_days(
    urgency: Optional[str] = None,
    deadline: Optional[str] = None,
    created_at: Optional[Any] = None,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    """
    Calcule le « système d'avance » (horizon H en jours avant une venue confirmée)
    STRICTEMENT à partir de l'Urgence et de la date d'échéance (jamais de la Difficulté) :
    - Immédiate (ou échéance dépassée / <= 14 j) -> horizon None (∞ : prochaine venue)
    - Rapide (ou échéance <= 30 j)               -> 30 j (ou ∞ si attend depuis > 14 j)
    - Normale                                    -> 14 j (ou échéance <= 21 j)
    - Sans urgence                               -> 0 j (vivier volontaire pur jusqu'à échéance <= 21 j)
    """
    ref_day = _to_date_only(today) or datetime.utcnow().date()
    base_urgency = normalize_urgency(urgency)
    effective_urgency = base_urgency

    deadline_d = _to_date_only(deadline)
    days_to_deadline = (deadline_d - ref_day).days if deadline_d is not None else None

    if days_to_deadline is not None:
        if days_to_deadline <= 14:
            effective_urgency = "Immédiate"
        elif days_to_deadline <= 30 and effective_urgency in ("Normale", "Sans urgence"):
            effective_urgency = "Rapide"
        elif days_to_deadline <= 21 and effective_urgency == "Sans urgence":
            effective_urgency = "Normale"

    created_d = _to_date_only(created_at)
    age_days = max(0, (ref_day - created_d).days) if created_d is not None else 0

    horizon_days: Optional[int]
    is_voluntary_pool_only = False
    if effective_urgency == "Immédiate":
        horizon_days = None  # Infini : dès la toute prochaine venue confirmée
        reason = "Urgence immédiate : à attribuer dès la prochaine venue confirmée."
    elif effective_urgency == "Rapide":
        if age_days > 14:
            horizon_days = None
            reason = f"Urgence rapide en attente depuis {age_days} j : élargie à la prochaine venue confirmée."
        else:
            horizon_days = 30
            reason = "Urgence rapide : attribution automatique si une venue confirmée a lieu dans les 30 prochains jours."
    elif effective_urgency == "Normale":
        horizon_days = 14
        reason = "Urgence normale : attribution automatique si une venue confirmée a lieu sous 14 jours, sinon vivier sur place."
    else:
        horizon_days = 0
        is_voluntary_pool_only = True
        reason = "Sans urgence : laissée au vivier volontaire sur place (/sejour) sans assignation forcée."

    return {
        "base_urgency": base_urgency,
        "effective_urgency": effective_urgency,
        "horizon_days": horizon_days,
        "is_voluntary_pool_only": is_voluntary_pool_only,
        "days_to_deadline": days_to_deadline,
        "age_days": age_days,
        "reason": reason,
    }


def get_task_recommendations(
    members: List[Any],
    reservations: List[Any],
    tasks: Optional[List[Any]] = None,
    subject: Optional[str] = None,
    category: Optional[str] = None,
    complexity: Optional[str] = None,
    limit: int = 7,
    onsite_presence: bool = False,
    urgency: Optional[str] = None,
    deadline: Optional[str] = None,
    created_at: Optional[Any] = None,
    today: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """
    Calcule dynamiquement les associés les plus recommandés pour une tâche :
    1. Frédéric Jamet est systématiquement exempté des corvées.
    2. Équité globale basée sur les points de Difficulté (active + terminée + ratio).
    3. Expertise thématique réelle issue des tâches terminées sur le même domaine (bonus borné à -3 pts).
    4. Si onsite_presence=True : intègre la présence physique (prochain séjour confirmé + vague 7 j + système d'avance piloté par l'Urgence).
    """
    if not members:
        return []

    eligible_members = [m for m in members if not is_exempt_member(m)]
    if not eligible_members:
        eligible_members = members

    # 1. Calcul des scores d'usage par associé (jours * chambres effectives)
    usage_by_name: Dict[str, float] = {}
    for res in (reservations or []):
        st_raw = res.get("status", "") if isinstance(res, dict) else getattr(res, "status", "")
        if normalize_status(st_raw) in CANCELLED_STAY_STATUSES:
            continue
        u_name = res.get("user_name") if isinstance(res, dict) else getattr(res, "user_name", "")
        if not u_name:
            continue
        s_date = res.get("start_date") if isinstance(res, dict) else getattr(res, "start_date", "")
        e_date = res.get("end_date") if isinstance(res, dict) else getattr(res, "end_date", "")
        accepts_extra = res.get("accepts_extra_family", True) if isinstance(res, dict) else getattr(res, "accepts_extra_family", True)
        cohab = res.get("cohabitation_type") if isinstance(res, dict) else getattr(res, "cohabitation_type", None)
        rc = res.get("rooms_count", 1) if isinstance(res, dict) else getattr(res, "rooms_count", 1)
        cu = res.get("chambers_used", 1) if isinstance(res, dict) else getattr(res, "chambers_used", 1)

        score = calculate_reservation_score(s_date, e_date, accepts_extra, rc, cu, cohab)
        for m in eligible_members:
            m_name = m.name if hasattr(m, "name") else (m.get("name") if isinstance(m, dict) else str(m))
            m_prenom = m.prenom if hasattr(m, "prenom") else (m.get("prenom") if isinstance(m, dict) else "")
            if (m_prenom and m_prenom.lower() in u_name.lower()) or (m_name and m_name.lower() in u_name.lower()):
                usage_by_name[m_name] = usage_by_name.get(m_name, 0.0) + score

    # 2. Analyse des tâches à l'échelle globale de la SCI
    m_active_tasks: Dict[str, List[Dict[str, Any]]] = {}
    m_active_charge: Dict[str, float] = {}
    m_completed_charge: Dict[str, float] = {}
    m_completed_tasks_count: Dict[str, int] = {}
    m_creation_bonus: Dict[str, float] = {}

    for m in eligible_members:
        m_name = m.name if hasattr(m, "name") else (m.get("name") if isinstance(m, dict) else str(m))
        m_active_tasks[m_name] = []
        m_active_charge[m_name] = 0.0
        m_completed_charge[m_name] = 0.0
        m_completed_tasks_count[m_name] = 0
        m_creation_bonus[m_name] = 0.0

    if tasks:
        for t in tasks:
            t_comp = getattr(t, "complexity", None) if not isinstance(t, dict) else t.get("complexity")
            t_pts_raw = getattr(t, "charge_points", None) if not isinstance(t, dict) else t.get("charge_points")
            charge_pts = float(t_pts_raw if t_pts_raw is not None else get_task_charge_points(t_comp))
            st_raw = getattr(t, "status", None) if not isinstance(t, dict) else t.get("status")
            st_norm = normalize_status(st_raw)
            t_title = str(getattr(t, "title", "") if not isinstance(t, dict) else t.get("title", "")).strip()

            is_active = st_norm in ACTIVE_STATUSES
            is_completed = st_norm in COMPLETED_STATUSES
            is_approved = st_norm not in UNAPPROVED_STATUSES

            for m in eligible_members:
                m_name = m.name if hasattr(m, "name") else (m.get("name") if isinstance(m, dict) else str(m))
                if is_member_assigned_to_task(m, t):
                    if is_active:
                        m_active_tasks[m_name].append({
                            "title": t_title,
                            "points": charge_pts
                        })
                        m_active_charge[m_name] += charge_pts
                    elif is_completed:
                        m_completed_charge[m_name] += charge_pts
                        m_completed_tasks_count[m_name] += 1

                if is_approved and is_member_creator_of_task(m, t):
                    m_creation_bonus[m_name] += 1.0

    # 3. Présence physique & expertise thématique réelle
    upcoming_stays = extract_upcoming_member_stays(eligible_members, reservations, today=today)
    expertise_by_name = compute_member_subject_expertise(eligible_members, tasks, subject=subject, category=category)
    horizon_info = compute_anticipation_horizon_days(
        urgency=urgency, deadline=deadline, created_at=created_at, today=today
    )
    horizon_days = horizon_info["horizon_days"]
    eff_urgency = horizon_info["effective_urgency"]
    task_weight_pts = get_task_charge_points(complexity)

    # Déterminer la vague d'arrivée la plus proche parmi les visiteurs dans l'horizon H
    eligible_stay_days: List[int] = []
    if onsite_presence:
        for stay in upcoming_stays.values():
            d = stay["days_until_stay"]
            if horizon_days is None or (horizon_days > 0 and d <= horizon_days):
                eligible_stay_days.append(d)
    d_min = min(eligible_stay_days) if eligible_stay_days else None

    urgency_arrival_weights = {
        "Immédiate": 6.0,
        "Rapide": 3.0,
        "Normale": 1.5,
        "Sans urgence": 0.5,
    }
    arrival_week_weight = urgency_arrival_weights.get(eff_urgency, 1.5)

    priority_order = [
        "Joséphine Jamet", "Hortense Jamet", "Marguerite Jamet",
        "Eugénie Jamet", "Élisabeth Jamet", "Henri Jamet"
    ]

    candidates = []
    for m in eligible_members:
        m_name = m.name if hasattr(m, "name") else (m.get("name") if isinstance(m, dict) else str(m))
        m_prenom = m.prenom if hasattr(m, "prenom") else (m.get("prenom") if isinstance(m, dict) else "")
        if not m_prenom:
            m_prenom = m_name.split()[0] if m_name else "Associé"

        u_score = usage_by_name.get(m_name, 0.0)
        act_tasks = m_active_tasks.get(m_name, [])
        act_count = len(act_tasks)
        act_charge = m_active_charge.get(m_name, 0.0)
        comp_charge = m_completed_charge.get(m_name, 0.0)
        comp_count = m_completed_tasks_count.get(m_name, 0)
        bonus_pts = m_creation_bonus.get(m_name, 0.0)
        exp_count = expertise_by_name.get(m_name, 0)
        exp_bonus = min(exp_count * 1.5, 3.0)

        total_charge = act_charge + comp_charge + bonus_pts
        equity_base = act_charge + comp_charge
        heavy_task_guard = (0.5 * act_charge) if task_weight_pts >= 5 else 0.0
        ratio = (total_charge + 0.5) / (u_score + 0.5)

        stay_info = upcoming_stays.get(m_name)
        days_until = stay_info["days_until_stay"] if stay_info else None
        is_on_site_now = bool(stay_info["is_on_site_now"]) if stay_info else False

        presence_eligible = False
        arrival_penalty = 0.0
        if onsite_presence and stay_info is not None:
            if horizon_days is None or (horizon_days > 0 and days_until <= horizon_days):
                presence_eligible = True
                if d_min is not None:
                    delay_days = max(0, days_until - d_min)
                    if delay_days > 7:
                        arrival_penalty = (delay_days / 7.0) * arrival_week_weight

        composite_score = equity_base + heavy_task_guard + arrival_penalty - exp_bonus

        pref_idx = 99
        clean_m_prenom = _strip_accents_lower(m_prenom)
        clean_m_name = _strip_accents_lower(m_name)
        for idx, pref_name in enumerate(priority_order):
            clean_pref = _strip_accents_lower(pref_name)
            if clean_m_prenom in clean_pref or clean_m_name in clean_pref:
                pref_idx = idx
                break

        candidates.append({
            "name": m_name,
            "prenom": m_prenom,
            "score_usage": round(u_score, 1),
            "active_tasks": act_tasks,
            "active_tasks_count": act_count,
            "active_charge_points": round(act_charge, 1),
            "completed_tasks_count": comp_count,
            "completed_charge_points": round(comp_charge, 1),
            "creation_bonus": round(bonus_pts, 1),
            "total_charge_points": round(total_charge, 1),
            "global_tasks_count": act_count + comp_count,
            "global_charge_points": round(equity_base, 1),
            "domain_charge_points": round(act_charge, 1),
            "domain_tasks_count": act_count,
            "expertise_count": exp_count,
            "expertise_bonus": round(exp_bonus, 2),
            "next_stay": stay_info,
            "next_stay_label": stay_info["label"] if stay_info else "Aucun séjour prévu",
            "days_until_stay": days_until,
            "is_on_site_now": is_on_site_now,
            "presence_eligible": presence_eligible,
            "arrival_penalty": round(arrival_penalty, 2),
            "composite_score": round(composite_score, 2),
            "ratio": round(ratio, 3),
            "pref_idx": pref_idx,
        })

    if onsite_presence:
        # 1) Visiteurs éligibles dans l'horizon H (triés par score composite : équité + vague d'arrivée - expertise)
        # 2) Autres associés ayant un séjour ultérieur (du plus proche au plus lointain)
        # 3) Associés sans séjour prévu (triés par équité)
        candidates.sort(key=lambda x: (
            0 if x["presence_eligible"] else (1 if x["next_stay"] is not None else 2),
            x["composite_score"] if x["presence_eligible"] else (x["days_until_stay"] if x["days_until_stay"] is not None else 9999),
            x["composite_score"],
            x["active_tasks_count"],
            x["ratio"],
            -x["score_usage"],
            x["pref_idx"],
        ))
    else:
        candidates.sort(key=lambda x: (
            x["composite_score"],
            x["active_tasks_count"],
            x["ratio"],
            -x["score_usage"],
            x["pref_idx"],
        ))

    results = []
    for rank_idx, c in enumerate(candidates[:limit]):
        rank = rank_idx + 1
        act_cnt = c["active_tasks_count"]
        act_pts = c["active_charge_points"]
        comp_cnt = c["completed_tasks_count"]
        exp_cnt = c["expertise_count"]

        parts: List[str] = []
        if onsite_presence:
            parts.append(c["next_stay_label"])

        if act_cnt == 0 and rank == 1:
            parts.append("charge la plus basse · aucune tâche en cours")
        elif act_cnt == 0:
            if comp_cnt > 0:
                parts.append(f"aucune tâche en cours ({comp_cnt} terminée{'s' if comp_cnt > 1 else ''})")
            else:
                parts.append("aucune tâche en cours")
        elif act_cnt == 1:
            raw_title = c["active_tasks"][0]["title"] if c["active_tasks"] else "tâche"
            short_title = raw_title if len(raw_title) <= 28 else (raw_title[:26].rstrip() + "…")
            parts.append(f"1 tâche en cours ({int(act_pts)} pts) : {short_title}")
        else:
            parts.append(f"{act_cnt} tâches en cours ({int(act_pts)} pts)")

        if exp_cnt > 0 and subject:
            parts.append(f"expertise {subject} ({exp_cnt} terminée{'s' if exp_cnt > 1 else ''})")

        results.append({
            "rank": rank,
            "name": c["name"],
            "prenom": c["prenom"],
            "reason": " · ".join(parts),
            "score_usage": c["score_usage"],
            "active_tasks_count": act_cnt,
            "active_charge_points": act_pts,
            "completed_tasks_count": comp_cnt,
            "completed_charge_points": c["completed_charge_points"],
            "global_charge_points": c["global_charge_points"],
            "domain_charge_points": c["domain_charge_points"],
            "domain_tasks_count": c["domain_tasks_count"],
            "expertise_count": exp_cnt,
            "expertise_bonus": c["expertise_bonus"],
            "next_stay": c["next_stay"],
            "next_stay_label": c["next_stay_label"],
            "days_until_stay": c["days_until_stay"],
            "is_on_site_now": c["is_on_site_now"],
            "presence_eligible": c["presence_eligible"],
            "composite_score": c["composite_score"],
            "ratio": c["ratio"],
        })

    return results


def evaluate_presence_task_assignment(
    task: Any,
    members: List[Any],
    reservations: List[Any],
    tasks: Optional[List[Any]] = None,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    """
    Décide si une tâche sur place doit être attribuée automatiquement maintenant
    ou patienter au vivier sur place (/sejour) selon le système d'avance (Urgence + Échéance).
    """
    is_onsite = bool(getattr(task, "onsite_presence", True) if not isinstance(task, dict) else task.get("onsite_presence", True))
    t_urgency = (getattr(task, "priority", None) if not isinstance(task, dict) else (task.get("urgency") or task.get("priority"))) or "Normale"
    t_deadline = getattr(task, "deadline", None) if not isinstance(task, dict) else task.get("deadline")
    t_created = getattr(task, "created_at", None) if not isinstance(task, dict) else task.get("created_at")
    t_subject = getattr(task, "subject", None) if not isinstance(task, dict) else task.get("subject")
    t_category = getattr(task, "category", None) if not isinstance(task, dict) else task.get("category")
    t_complexity = getattr(task, "complexity", None) if not isinstance(task, dict) else (task.get("difficulty") or task.get("complexity"))
    t_id = getattr(task, "id", None) if not isinstance(task, dict) else task.get("id")

    other_tasks = [t for t in (tasks or []) if (getattr(t, "id", None) if not isinstance(t, dict) else t.get("id")) != t_id]

    if not is_onsite:
        recs = get_task_recommendations(
            members=members,
            reservations=reservations,
            tasks=other_tasks,
            subject=t_subject,
            category=t_category or t_subject,
            complexity=t_complexity,
            onsite_presence=False,
            urgency=t_urgency,
            deadline=t_deadline,
            created_at=t_created,
            today=today,
            limit=1,
        )
        chosen = recs[0] if recs else None
        return {
            "should_assign": bool(chosen),
            "keep_in_pool": False,
            "onsite_presence": False,
            "member_name": chosen["name"] if chosen else None,
            "reservation_id": None,
            "horizon_days": None,
            "effective_urgency": normalize_urgency(t_urgency),
            "reason": f"Tâche à distance : attribution immédiate par équité & expertise ({chosen['name']})." if chosen else "Aucun associé éligible.",
        }

    horizon_info = compute_anticipation_horizon_days(
        urgency=t_urgency, deadline=t_deadline, created_at=t_created, today=today
    )

    if horizon_info["is_voluntary_pool_only"]:
        return {
            "should_assign": False,
            "keep_in_pool": True,
            "onsite_presence": True,
            "member_name": None,
            "reservation_id": None,
            "horizon_days": 0,
            "effective_urgency": horizon_info["effective_urgency"],
            "reason": horizon_info["reason"],
        }

    recs = get_task_recommendations(
        members=members,
        reservations=reservations,
        tasks=other_tasks,
        subject=t_subject,
        category=t_category or t_subject,
        complexity=t_complexity,
        onsite_presence=True,
        urgency=t_urgency,
        deadline=t_deadline,
        created_at=t_created,
        today=today,
        limit=7,
    )
    eligible_recs = [r for r in recs if r.get("presence_eligible")]
    if not eligible_recs:
        h_txt = "prochaine venue" if horizon_info["horizon_days"] is None else f"{horizon_info['horizon_days']} prochains jours"
        return {
            "should_assign": False,
            "keep_in_pool": True,
            "onsite_presence": True,
            "member_name": None,
            "reservation_id": None,
            "horizon_days": horizon_info["horizon_days"],
            "effective_urgency": horizon_info["effective_urgency"],
            "reason": f"Aucun séjour confirmé dans les {h_txt} : conservée au vivier sur place (/sejour) sans assignation prématurée.",
        }

    top = eligible_recs[0]
    next_stay = top.get("next_stay") or {}
    return {
        "should_assign": True,
        "keep_in_pool": False,
        "onsite_presence": True,
        "member_name": top["name"],
        "reservation_id": next_stay.get("reservation_id"),
        "next_stay": next_stay,
        "horizon_days": horizon_info["horizon_days"],
        "effective_urgency": horizon_info["effective_urgency"],
        "reason": f"Attribuée à {top['name']} ({top['reason']}).",
    }


def resolve_auto_assignment_by_workload(
    members: List[Any],
    reservations: List[Any],
    tasks: Optional[List[Any]] = None,
    subject: Optional[str] = None,
    category: Optional[str] = None,
    complexity: Optional[str] = None,
    onsite_presence: bool = False,
    urgency: Optional[str] = None,
    deadline: Optional[str] = None,
    created_at: Optional[Any] = None,
) -> Optional[str]:
    """
    Détermine l'associé auquel attribuer automatiquement une tâche
    selon le modèle proportionnel d'équité + expertise (+ présence si onsite_presence=True).
    """
    if onsite_presence:
        decision = evaluate_presence_task_assignment(
            task={
                "onsite_presence": True,
                "priority": urgency or "Normale",
                "deadline": deadline,
                "created_at": created_at,
                "subject": subject,
                "category": category or subject,
                "complexity": complexity,
            },
            members=members,
            reservations=reservations,
            tasks=tasks,
        )
        return decision["member_name"] if decision.get("should_assign") else None

    recs = get_task_recommendations(
        members=members,
        reservations=reservations,
        tasks=tasks,
        subject=subject,
        category=category,
        complexity=complexity,
        onsite_presence=False,
        urgency=urgency,
        deadline=deadline,
        created_at=created_at,
        limit=1,
    )
    if recs:
        return recs[0]["name"]
    return "Joséphine Jamet"



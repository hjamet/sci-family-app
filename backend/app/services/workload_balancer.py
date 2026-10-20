from datetime import datetime
from typing import List, Dict, Any, Optional
import unicodedata
import json

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


# Barème pondéré officiel Henri - Charge de la tâche (Annotation 3)
TASK_CHARGE_WEIGHTS: Dict[str, int] = {
    "Négligeable": 1,
    "Faible": 2,
    "Modérée": 3,
    "Élevée": 5,
    "Très élevée": 8,
}

def get_task_charge_points(complexity: Optional[str]) -> int:
    """
    Retourne les points de charge d'une tâche selon le barème officiel :
    Négligeable -> 1 pt, Faible -> 2 pts, Modérée -> 3 pts, Élevée -> 5 pts, Très élevée -> 8 pts.
    """
    if not complexity:
        return 3
    comp = str(complexity).strip()
    if comp in TASK_CHARGE_WEIGHTS:
        return TASK_CHARGE_WEIGHTS[comp]
    c_lower = comp.lower()
    if "neglig" in c_lower:
        return 1
    elif "faible" in c_lower:
        return 2
    elif "modér" in c_lower or "moder" in c_lower:
        return 3
    elif "très" in c_lower or "tres" in c_lower:
        return 8
    elif "élev" in c_lower or "elev" in c_lower or "expertise" in c_lower:
        return 5
    return 3


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


def get_task_recommendations(
    members: List[Any],
    reservations: List[Any],
    tasks: Optional[List[Any]] = None,
    subject: Optional[str] = None,
    category: Optional[str] = None,
    complexity: Optional[str] = None,
    limit: int = 7
) -> List[Dict[str, Any]]:
    """
    Calcule dynamiquement les associés les plus recommandés pour une tâche
    selon les scores de charge actuels réels sur toute la SCI.
    
    Critères d'équité :
    1. Frédéric Jamet (Papa) est systématiquement exempté des corvées.
    2. Les tâches en cours sont calculées à l'échelle de toute la SCI (tous bâtiments confondus).
    3. Tri par : (active_charge_points + completed_charge_points, active_tasks_count, ratio, -score_usage, pref_idx).
    4. Textes explicatifs précis :
       - active_tasks_count == 0 & rank == 1 : "charge la plus basse · aucune tâche en cours"
       - active_tasks_count == 0 : "aucune tâche en cours" (ou "aucune tâche en cours (N terminée(s))")
       - active_tasks_count == 1 : "1 tâche en cours (X pts) : <titre>"
       - active_tasks_count >= 2 : "N tâches en cours (X pts)"
    """
    if not members:
        return []

    # 0. Exclure explicitement Frédéric Jamet (Papa)
    eligible_members = [m for m in members if not is_exempt_member(m)]
    if not eligible_members:
        eligible_members = members

    # 1. Calcul des scores d'usage par associé (jours * chambres effectives)
    usage_by_name: Dict[str, float] = {}
    for res in (reservations or []):
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
            charge_pts = float(get_task_charge_points(t_comp))
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

    # 3. Calcul du score et classement pour chaque membre éligible
    candidates = []
    # Ordre de départ canonique si égalité parfaite (sans Frédéric Jamet)
    priority_order = [
        "Joséphine Jamet", "Hortense Jamet", "Marguerite Jamet",
        "Eugénie Jamet", "Maman (Élisabeth) Jamet", "Henri Jamet"
    ]

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

        total_charge = act_charge + comp_charge + bonus_pts
        ratio = (total_charge + 0.5) / (u_score + 0.5)

        pref_idx = 99
        clean_m_prenom = "".join(c for c in unicodedata.normalize("NFD", m_prenom.lower()) if unicodedata.category(c) != "Mn")
        clean_m_name = "".join(c for c in unicodedata.normalize("NFD", m_name.lower()) if unicodedata.category(c) != "Mn")
        for idx, pref_name in enumerate(priority_order):
            clean_pref = "".join(c for c in unicodedata.normalize("NFD", pref_name.lower()) if unicodedata.category(c) != "Mn")
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
            "global_charge_points": round(act_charge + comp_charge, 1),
            "domain_charge_points": round(act_charge, 1),
            "domain_tasks_count": act_count,
            "ratio": round(ratio, 3),
            "pref_idx": pref_idx,
        })

    # Tri selon les critères d'équité sur l'ensemble de la SCI :
    # 1. Somme de charge active + terminée la plus faible
    # 2. Nombre de tâches en cours le plus bas
    # 3. Ratio d'implication global plus bas
    # 4. Score d'usage plus élevé
    # 5. Index de préférence canonique
    candidates.sort(key=lambda x: (
        x["active_charge_points"] + x["completed_charge_points"],
        x["active_tasks_count"],
        x["ratio"],
        -x["score_usage"],
        x["pref_idx"]
    ))

    # Formater les recommandations avec libellés explicatifs
    results = []
    for rank_idx, c in enumerate(candidates[:limit]):
        rank = rank_idx + 1
        act_cnt = c["active_tasks_count"]
        act_pts = c["active_charge_points"]
        comp_cnt = c["completed_tasks_count"]

        if act_cnt == 0 and rank == 1:
            reason = "charge la plus basse · aucune tâche en cours"
        elif act_cnt == 0:
            if comp_cnt > 0:
                reason = f"aucune tâche en cours ({comp_cnt} terminée{'s' if comp_cnt > 1 else ''})"
            else:
                reason = "aucune tâche en cours"
        elif act_cnt == 1:
            raw_title = c["active_tasks"][0]["title"] if c["active_tasks"] else "tâche"
            short_title = raw_title if len(raw_title) <= 32 else (raw_title[:30].rstrip() + "…")
            reason = f"1 tâche en cours ({int(act_pts)} pts) : {short_title}"
        else:
            reason = f"{act_cnt} tâches en cours ({int(act_pts)} pts)"

        results.append({
            "rank": rank,
            "name": c["name"],
            "prenom": c["prenom"],
            "reason": reason,
            "score_usage": c["score_usage"],
            "active_tasks_count": act_cnt,
            "active_charge_points": act_pts,
            "completed_tasks_count": comp_cnt,
            "completed_charge_points": c["completed_charge_points"],
            "global_charge_points": c["global_charge_points"],
            "domain_charge_points": c["domain_charge_points"],
            "domain_tasks_count": c["domain_tasks_count"],
            "ratio": c["ratio"]
        })

    return results


def resolve_auto_assignment_by_workload(
    members: List[Any],
    reservations: List[Any],
    tasks: Optional[List[Any]] = None,
    subject: Optional[str] = None,
    category: Optional[str] = None,
    complexity: Optional[str] = None
) -> Optional[str]:
    """
    Détermine l'associé auquel attribuer automatiquement une tâche
    selon le modèle proportionnel d'équité d'Henri (Frédéric Jamet étant exempté).
    """
    recs = get_task_recommendations(
        members=members,
        reservations=reservations,
        tasks=tasks,
        subject=subject,
        category=category,
        complexity=complexity,
        limit=1
    )
    if recs:
        return recs[0]["name"]
    return "Joséphine Jamet"



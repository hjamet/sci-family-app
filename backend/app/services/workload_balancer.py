from datetime import datetime
from typing import List, Dict, Any, Optional

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
            assigned = getattr(t, "assigned_members", None) if not isinstance(t, dict) else t.get("assigned_members")
            if isinstance(assigned, str):
                try:
                    import json
                    assigned = json.loads(assigned)
                except Exception:
                    assigned = [assigned]
            elif not isinstance(assigned, list):
                assigned = [getattr(t, "assignee", None)] if getattr(t, "assignee", None) else []

            for a in (assigned or []):
                if a:
                    user_performed_charge[str(a)] = user_performed_charge.get(str(a), 0.0) + pts

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


def resolve_auto_assignment_by_workload(
    members: List[Any],
    reservations: List[Any],
    tasks: Optional[List[Any]] = None
) -> Optional[str]:
    """
    Détermine l'associé auquel attribuer automatiquement une tâche récurrente
    selon le modèle proportionnel d'équité d'Henri :
    - Score d'usage O_u = sum(jours * chambres_effectives)
    - Score de corvées C_u = somme pondérée des points de charge des tâches (1, 2, 3, 5, 8 pts)
    - Ratio d'équité gamifié : R_u = (C_u + 0.5) / (O_u + 0.5)
    
    L'associé ayant le ratio d'implication le plus faible (celui qui utilise le plus le domaine
    et a le moins contribué en charge de tâches) est sélectionné en priorité absolue.
    """
    if not members:
        return "Henri Jamet"

    # Calcul des scores d'usage par associé
    usage_by_name: Dict[str, float] = {}
    for res in reservations:
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
        # Rapprochement souple sur le nom canonique
        for m in members:
            m_name = m.name if hasattr(m, "name") else (m.get("name") if isinstance(m, dict) else str(m))
            m_prenom = m.prenom if hasattr(m, "prenom") else (m.get("prenom") if isinstance(m, dict) else "")
            if (m_prenom and m_prenom.lower() in u_name.lower()) or (m_name and m_name.lower() in u_name.lower()):
                usage_by_name[m_name] = usage_by_name.get(m_name, 0.0) + score

    # Compte pondéré des tâches par associé selon la Charge de la tâche (Annotation 3)
    tasks_by_name: Dict[str, float] = {}
    if tasks:
        for t in tasks:
            t_comp = getattr(t, "complexity", None) if not isinstance(t, dict) else t.get("complexity")
            charge_pts = float(get_task_charge_points(t_comp))

            assigned = getattr(t, "assigned_members", None) if not isinstance(t, dict) else t.get("assigned_members")
            if isinstance(assigned, str):
                try:
                    import json
                    assigned = json.loads(assigned)
                except Exception:
                    assigned = [assigned]
            elif not isinstance(assigned, list):
                assigned = [getattr(t, "assignee", None)] if getattr(t, "assignee", None) else []

            for a in (assigned or []):
                if a:
                    tasks_by_name[str(a)] = tasks_by_name.get(str(a), 0.0) + charge_pts

    # Calcul du ratio d'implication pour chaque associé éligible
    scored_members = []
    for m in members:
        m_name = m.name if hasattr(m, "name") else (m.get("name") if isinstance(m, dict) else str(m))
        u_score = usage_by_name.get(m_name, 0.0)
        t_score = tasks_by_name.get(m_name, 0.0)
        # Ratio gamifié inversé : plus le ratio est petit, plus la personne "doit" du temps
        ratio = (t_score + 0.5) / (u_score + 0.5)
        scored_members.append((ratio, u_score, -t_score, m_name))

    # Tri par ratio croissant : le plus faible en tête (doit le plus de corvées)
    scored_members.sort(key=lambda x: (x[0], -x[1], x[2]))
    return scored_members[0][3] if scored_members else "Henri Jamet"


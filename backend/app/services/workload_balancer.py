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


def get_task_recommendations(
    members: List[Any],
    reservations: List[Any],
    tasks: Optional[List[Any]] = None,
    subject: Optional[str] = None,
    category: Optional[str] = None,
    complexity: Optional[str] = None,
    limit: int = 3
) -> List[Dict[str, Any]]:
    """
    Calcule dynamiquement les associés les plus recommandés pour une tâche
    selon le sujet/domaine/lieu et les scores de charge actuels (Annotation 5).
    
    Critères d'équité :
    1. Charge de tâches actuelle dans le sujet / domaine (subject_charge_points croissant)
    2. Nombre de tâches dans le sujet (subject_tasks_count croissant)
    3. Ratio d'implication global : R_u = (C_u + 0.5) / (O_u + 0.5) croissant
       (priorité à celui qui utilise le plus le domaine et a le moins contribué)
    4. Score d'usage O_u décroissant
    """
    if not members:
        return []

    target_domain = (subject or category or "").strip()

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
        for m in members:
            m_name = m.name if hasattr(m, "name") else (m.get("name") if isinstance(m, dict) else str(m))
            m_prenom = m.prenom if hasattr(m, "prenom") else (m.get("prenom") if isinstance(m, dict) else "")
            if (m_prenom and m_prenom.lower() in u_name.lower()) or (m_name and m_name.lower() in u_name.lower()):
                usage_by_name[m_name] = usage_by_name.get(m_name, 0.0) + score

    # 2. Compte pondéré des tâches globales et par domaine/sujet
    global_charge_by_name: Dict[str, float] = {}
    global_tasks_count_by_name: Dict[str, int] = {}
    domain_charge_by_name: Dict[str, float] = {}
    domain_tasks_count_by_name: Dict[str, int] = {}

    if tasks:
        for t in tasks:
            t_comp = getattr(t, "complexity", None) if not isinstance(t, dict) else t.get("complexity")
            charge_pts = float(get_task_charge_points(t_comp))
            t_subj = str(getattr(t, "subject", "") if not isinstance(t, dict) else t.get("subject", "")).strip()
            t_cat = str(getattr(t, "category", "") if not isinstance(t, dict) else t.get("category", "")).strip()

            assigned = getattr(t, "assigned_members", None) if not isinstance(t, dict) else t.get("assigned_members")
            if isinstance(assigned, str):
                try:
                    import json
                    assigned = json.loads(assigned)
                except Exception:
                    assigned = [assigned]
            elif not isinstance(assigned, list):
                assigned = [getattr(t, "assignee", None)] if getattr(t, "assignee", None) else []

            is_in_domain = False
            if target_domain:
                target_clean = target_domain.lower()
                if (t_subj and (target_clean in t_subj.lower() or t_subj.lower() in target_clean)) or \
                   (t_cat and (target_clean in t_cat.lower() or t_cat.lower() in target_clean)):
                    is_in_domain = True

            for a in (assigned or []):
                if not a:
                    continue
                # Rapprochement du nom du membre
                for m in members:
                    m_name = m.name if hasattr(m, "name") else (m.get("name") if isinstance(m, dict) else str(m))
                    m_prenom = m.prenom if hasattr(m, "prenom") else (m.get("prenom") if isinstance(m, dict) else "")
                    if str(a).strip().lower() in m_name.lower() or (m_prenom and m_prenom.lower() in str(a).strip().lower()):
                        global_charge_by_name[m_name] = global_charge_by_name.get(m_name, 0.0) + charge_pts
                        global_tasks_count_by_name[m_name] = global_tasks_count_by_name.get(m_name, 0) + 1
                        if is_in_domain:
                            domain_charge_by_name[m_name] = domain_charge_by_name.get(m_name, 0.0) + charge_pts
                            domain_tasks_count_by_name[m_name] = domain_tasks_count_by_name.get(m_name, 0) + 1

    # 3. Calcul du score et classement pour chaque membre
    candidates = []
    # Ordre de départ canonique si égalité parfaite
    priority_order = [
        "Joséphine Jamet", "Hortense Jamet", "Marguerite Jamet",
        "Eugénie Jamet", "Frédéric Jamet", "Maman (Élisabeth) Jamet", "Henri Jamet"
    ]

    for m in members:
        m_name = m.name if hasattr(m, "name") else (m.get("name") if isinstance(m, dict) else str(m))
        m_prenom = m.prenom if hasattr(m, "prenom") else (m.get("prenom") if isinstance(m, dict) else "")
        if not m_prenom:
            m_prenom = m_name.split()[0] if m_name else "Associé"

        u_score = usage_by_name.get(m_name, 0.0)
        g_charge = global_charge_by_name.get(m_name, 0.0)
        g_count = global_tasks_count_by_name.get(m_name, 0)
        d_charge = domain_charge_by_name.get(m_name, 0.0)
        d_count = domain_tasks_count_by_name.get(m_name, 0)

        # Ratio d'implication gamifié
        ratio = (g_charge + 0.5) / (u_score + 0.5)

        # Index de priorité par défaut
        pref_idx = 99
        for idx, pref_name in enumerate(priority_order):
            if m_prenom.lower() in pref_name.lower() or m_name.lower() in pref_name.lower():
                pref_idx = idx
                break

        candidates.append({
            "name": m_name,
            "prenom": m_prenom,
            "score_usage": round(u_score, 1),
            "global_tasks_count": g_count,
            "global_charge_points": round(g_charge, 1),
            "ratio": round(ratio, 3),
            "domain_charge_points": round(d_charge, 1),
            "domain_tasks_count": d_count,
            "pref_idx": pref_idx,
        })

    # Tri par :
    # 1. Moins de charge dans le domaine
    # 2. Moins de tâches dans le domaine
    # 3. Ratio d'équité global plus bas (doit le plus de corvées)
    # 4. Score d'usage plus élevé
    # 5. Index de préférence par défaut
    candidates.sort(key=lambda x: (
        x["domain_charge_points"],
        x["domain_tasks_count"],
        x["ratio"],
        -x["score_usage"],
        x["pref_idx"]
    ))

    # Formater les recommandations avec libellés explicatifs
    results = []
    for rank_idx, c in enumerate(candidates[:limit]):
        rank = rank_idx + 1
        d_pts = c["domain_charge_points"]
        d_cnt = c["domain_tasks_count"]

        if target_domain:
            if rank == 1:
                reason = f"charge la plus basse dans {target_domain}"
            elif d_pts == 0 and d_cnt == 0:
                reason = f"aucune tâche en cours dans {target_domain}"
            elif d_cnt == 1:
                reason = f"1 seule tâche dans {target_domain}"
            elif d_pts <= 3:
                reason = f"charge modérée dans {target_domain}"
            else:
                reason = f"charge de {int(d_pts)} pts dans {target_domain}"
        else:
            if rank == 1:
                reason = "ratio d'équité le plus favorable"
            elif c["ratio"] < 1.0:
                reason = "faible charge globale"
            else:
                reason = "charge globale équilibrée"

        results.append({
            "rank": rank,
            "name": c["name"],
            "prenom": c["prenom"],
            "reason": reason,
            "score_usage": c["score_usage"],
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
    selon le modèle proportionnel d'équité d'Henri et le sujet/domaine.
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



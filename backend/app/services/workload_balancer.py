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
    chambers_used: Optional[int] = 1
) -> int:
    """
    Henri's Capacity Penalty Rule:
    If accepts_extra_family is False, exclusive booking penalty applies -> rooms_count = 7 (100% SCI capacity penalty).
    Otherwise, returns selected rooms_count, fallback to chambers_used or 1.
    """
    if accepts_extra_family is False:
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
    chambers_used: Optional[int] = 1
) -> float:
    """
    Calculates single reservation occupation score O_u_i = days * effective_rooms.
    """
    days = calculate_reservation_days(start_date, end_date)
    rooms = calculate_effective_rooms(accepts_extra_family, rooms_count, chambers_used)
    return float(days * rooms)


def calculate_workload_distribution(
    reservations: List[Any],
    total_charge_points: float = 100.0
) -> Dict[str, Any]:
    """
    Henri's Proportional Usage Workload Model:
    - User occupation score: O_u = sum(days * rooms_count)
    - If accepts_extra_family == False: rooms_count = 7 (100% capacity penalty).
    - Target Charge Points: C_u^target = (O_u / sum(O_v)) * Total Charge Points.
    
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
            rc = res.get("rooms_count", 1)
            cu = res.get("chambers_used", 1)
        else:
            user_name = getattr(res, "user_name", "Anonyme")
            start_date = getattr(res, "start_date", "")
            end_date = getattr(res, "end_date", "")
            accepts_extra = getattr(res, "accepts_extra_family", True)
            rc = getattr(res, "rooms_count", 1)
            cu = getattr(res, "chambers_used", 1)

        days = calculate_reservation_days(start_date, end_date)
        rooms = calculate_effective_rooms(accepts_extra, rc, cu)
        score = float(days * rooms)

        user_scores[user_name] = user_scores.get(user_name, 0.0) + score
        user_days[user_name] = user_days.get(user_name, 0) + days

    total_o = sum(user_scores.values())

    user_stats = []
    for user_name, o_u in user_scores.items():
        charge_pct = (o_u / total_o * 100.0) if total_o > 0 else 0.0
        target_charge = (o_u / total_o * total_charge_points) if total_o > 0 else 0.0

        user_stats.append({
            "user_name": user_name,
            "total_days": user_days.get(user_name, 0),
            "occupation_score": round(o_u, 2),
            "target_charge_points": round(target_charge, 2),
            "charge_percentage": round(charge_pct, 2)
        })

    return {
        "total_charge_points": total_charge_points,
        "total_occupation_score": round(total_o, 2),
        "user_stats": user_stats
    }

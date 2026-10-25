"""
Persistance des relevés réels ViCare (Presbytère).

- `heating_live_snapshot` (ligne unique) : dernier relevé complet, réutilisé pendant
  LIVE_SNAPSHOT_REUSE_SECONDS pour ne pas marteler la passerelle Vitoconnect Opto2,
  et servi explicitement (`is_cached_last_known`) quand la passerelle est hors ligne.
- `heating_telemetry_history` : série temporelle (1 point / HISTORY_MIN_INTERVAL_SECONDS,
  ou à chaque changement d'état chauffage / brûleur / mode).
"""
import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..models import HeatingLiveSnapshot, HeatingTelemetryHistory

LIVE_SNAPSHOT_ID = 1
LIVE_SNAPSHOT_REUSE_SECONDS = 20
HISTORY_MIN_INTERVAL_SECONDS = 600

HISTORY_STATE_FIELDS = ("is_heating_active", "burner_active", "mode")


def to_utc_iso(dt: datetime) -> str:
    """Les DateTime du projet sont stockés en UTC naïf : on explicite le fuseau pour le frontend."""
    return dt.isoformat() + "Z"


def next_cron_sync_utc(now: datetime) -> datetime:
    """Calcule la prochaine exécution du pg_cron Supabase (*/15 * * * * : :00, :15, :30, :45 UTC)."""
    quarter_minutes = ((now.minute // 15) + 1) * 15
    base = now.replace(minute=0, second=0, microsecond=0)
    return base + timedelta(minutes=quarter_minutes)


def get_live_snapshot(db: Session) -> Optional[HeatingLiveSnapshot]:
    return db.get(HeatingLiveSnapshot, LIVE_SNAPSHOT_ID)


def snapshot_age_seconds(snapshot: HeatingLiveSnapshot, now: datetime) -> float:
    return (now - snapshot.recorded_at).total_seconds()


def serve_snapshot(
    snapshot: HeatingLiveSnapshot,
    is_cached_last_known: bool,
    live_error: Optional[str] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    ref_now = now or datetime.utcnow()
    return {
        **json.loads(snapshot.payload),
        "is_cached_last_known": is_cached_last_known,
        "last_seen_at": to_utc_iso(snapshot.recorded_at),
        "next_sync_at": to_utc_iso(next_cron_sync_utc(ref_now)),
        "live_error": live_error,
    }


def _history_point_from_status(status_data: Dict[str, Any], recorded_at: datetime) -> HeatingTelemetryHistory:
    return HeatingTelemetryHistory(
        recorded_at=recorded_at,
        room_temperature=status_data.get("room_temperature"),
        outside_temperature=status_data.get("outside_temperature"),
        boiler_temperature=status_data.get("boiler_temperature"),
        dhw_temperature=status_data.get("dhw_temperature"),
        target_temperature=status_data.get("target_temperature"),
        is_heating_active=bool(status_data.get("is_heating_active", False)),
        burner_active=bool(status_data.get("burner_active", False)),
        mode=status_data.get("mode"),
        burner_hours=status_data.get("burner_hours"),
        fuel_liters_remaining=status_data.get("fuel_liters_remaining"),
    )


def should_append_history(last: Optional[HeatingTelemetryHistory], status_data: Dict[str, Any], now: datetime) -> bool:
    if last is None:
        return True
    if (now - last.recorded_at).total_seconds() >= HISTORY_MIN_INTERVAL_SECONDS:
        return True
    current_state = (
        bool(status_data.get("is_heating_active", False)),
        bool(status_data.get("burner_active", False)),
        status_data.get("mode"),
    )
    previous_state = (bool(last.is_heating_active), bool(last.burner_active), last.mode)
    return current_state != previous_state


def record_live_status(db: Session, status_data: Dict[str, Any], now: datetime) -> None:
    """Persiste un relevé ViCare réel : snapshot complet + point d'historique si nécessaire."""
    snapshot = get_live_snapshot(db)
    if snapshot is None:
        snapshot = HeatingLiveSnapshot(id=LIVE_SNAPSHOT_ID)
        db.add(snapshot)
    snapshot.recorded_at = now
    snapshot.payload = json.dumps(status_data, default=str)

    last_point = db.query(HeatingTelemetryHistory).order_by(HeatingTelemetryHistory.recorded_at.desc()).first()
    if should_append_history(last_point, status_data, now):
        db.add(_history_point_from_status(status_data, now))
    db.commit()


def list_history(db: Session, days: int, now: datetime) -> List[Dict[str, Any]]:
    since = now - timedelta(days=days)
    rows = (
        db.query(HeatingTelemetryHistory)
        .filter(HeatingTelemetryHistory.recorded_at >= since)
        .order_by(HeatingTelemetryHistory.recorded_at.asc())
        .all()
    )
    return [
        {
            "recorded_at": to_utc_iso(r.recorded_at),
            "room_temperature": r.room_temperature,
            "outside_temperature": r.outside_temperature,
            "boiler_temperature": r.boiler_temperature,
            "dhw_temperature": r.dhw_temperature,
            "target_temperature": r.target_temperature,
            "is_heating_active": bool(r.is_heating_active),
            "burner_active": bool(r.burner_active),
            "mode": r.mode,
            "burner_hours": r.burner_hours,
            "fuel_liters_remaining": r.fuel_liters_remaining,
        }
        for r in rows
    ]

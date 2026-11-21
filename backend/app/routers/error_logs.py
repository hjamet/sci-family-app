from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import ensure_error_logs_schema_once, get_db
from ..models import AppErrorLog, Member
from ..security import decode_access_token
from ..services.error_log_service import record_error_log, serialize_error_log

router = APIRouter(prefix="/api/error-logs", tags=["Diagnostics & Error Logs"])


class ClientErrorLogRequest(BaseModel):
    source: str = Field(default="frontend_error", max_length=60)
    severity: str = Field(default="error", max_length=20)
    message: str = Field(..., min_length=1, max_length=4000)
    error_type: Optional[str] = Field(default=None, max_length=120)
    stack_trace: Optional[str] = Field(default=None, max_length=12000)
    endpoint: Optional[str] = Field(default=None, max_length=255)
    http_method: Optional[str] = Field(default=None, max_length=16)
    status_code: Optional[int] = None
    page_url: Optional[str] = Field(default=None, max_length=500)
    member_name: Optional[str] = Field(default=None, max_length=120)
    context: Optional[Dict[str, Any]] = None


def _require_coordinator(request: Request, db: Session) -> Member:
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentification requise pour consulter les journaux d'erreurs.")
    token = auth_header[7:].strip()
    payload = decode_access_token(token)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=401, detail="Jeton d'authentification invalide ou expiré.")

    member: Optional[Member] = None
    sub_id = payload.get("member_id") or payload.get("id")
    if sub_id is not None and str(sub_id).isdigit():
        member = db.query(Member).filter(Member.id == int(sub_id)).first()
    if not member:
        sub_name = str(payload.get("sub") or payload.get("prenom") or payload.get("username") or "").strip().lower()
        if sub_name:
            for m in db.query(Member).all():
                if (m.prenom or "").strip().lower() == sub_name or sub_name in (m.name or "").strip().lower():
                    member = m
                    break
    if not member:
        raise HTTPException(status_code=401, detail="Associé introuvable.")
    is_coord = bool(member.is_coordinator) or (member.prenom or "").strip().lower() in ("henri", "joséphine", "josephine")
    if not is_coord:
        raise HTTPException(status_code=403, detail="Accès réservé aux coordinateurs de la SCI.")
    return member


@router.post("/client", status_code=201)
def report_client_error(payload: ClientErrorLogRequest, request: Request):
    """Enregistre automatiquement une erreur frontend (JS, promesse non gérée, erreur API/upload/Mr. Collins)."""
    log_id = record_error_log(
        source=payload.source or "frontend_error",
        severity=payload.severity or "error",
        message=payload.message,
        error_type=payload.error_type,
        stack_trace=payload.stack_trace,
        endpoint=payload.endpoint,
        http_method=payload.http_method,
        status_code=payload.status_code,
        page_url=payload.page_url,
        member_name=payload.member_name,
        context=payload.context,
        request=request,
    )
    return {"status": "recorded" if log_id else "skipped", "id": log_id}


@router.get("")
def list_error_logs(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    source: Optional[str] = Query(None),
    unresolved_only: bool = Query(False),
    since_hours: Optional[int] = Query(None, ge=1, le=24 * 90),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Consulte l'historique persistant des erreurs backend & frontend (réservé aux coordinateurs)."""
    _require_coordinator(request, db)
    ensure_error_logs_schema_once()

    q = db.query(AppErrorLog)
    if source:
        q = q.filter(AppErrorLog.source == source.strip())
    if unresolved_only:
        q = q.filter(AppErrorLog.resolved == False)  # noqa: E712
    if since_hours is not None:
        cutoff = datetime.utcnow() - timedelta(hours=since_hours)
        q = q.filter(AppErrorLog.created_at >= cutoff)
    if search and search.strip():
        like_pat = f"%{search.strip()}%"
        q = q.filter(
            (AppErrorLog.message.ilike(like_pat))
            | (AppErrorLog.endpoint.ilike(like_pat))
            | (AppErrorLog.error_type.ilike(like_pat))
        )

    total_matching = q.count()
    rows = q.order_by(AppErrorLog.id.desc()).limit(limit).all()

    counts_by_source_rows = (
        db.query(AppErrorLog.source, func.count(AppErrorLog.id))
        .filter(AppErrorLog.resolved == False)  # noqa: E712
        .group_by(AppErrorLog.source)
        .all()
    )
    unresolved_by_source = {src: int(cnt) for src, cnt in counts_by_source_rows}

    return {
        "total_matching": total_matching,
        "unresolved_total": sum(unresolved_by_source.values()),
        "unresolved_by_source": unresolved_by_source,
        "errors": [serialize_error_log(r) for r in rows],
    }


@router.patch("/{log_id}/resolve")
def resolve_error_log(log_id: int, request: Request, resolved: bool = Query(True), db: Session = Depends(get_db)):
    _require_coordinator(request, db)
    ensure_error_logs_schema_once()
    row = db.query(AppErrorLog).filter(AppErrorLog.id == log_id).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Journal d'erreur #{log_id} introuvable.")
    row.resolved = bool(resolved)
    db.commit()
    db.refresh(row)
    return serialize_error_log(row)


@router.delete("/{log_id}")
def delete_error_log(log_id: int, request: Request, db: Session = Depends(get_db)):
    _require_coordinator(request, db)
    ensure_error_logs_schema_once()
    row = db.query(AppErrorLog).filter(AppErrorLog.id == log_id).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Journal d'erreur #{log_id} introuvable.")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": log_id}

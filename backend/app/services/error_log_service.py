import json
import logging
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from fastapi import Request

from ..database import SessionLocal, ensure_error_logs_schema_once
from ..models import AppErrorLog
from ..security import decode_access_token

logger = logging.getLogger("sci_api.error_logs")

_SENSITIVE_KEY_TOKENS = ("password", "secret", "token", "authorization", "cookie", "base64", "file_data", "api_key")


def _truncate_str(val: Optional[str], max_len: int) -> Optional[str]:
    if val is None:
        return None
    s = str(val)
    if len(s) <= max_len:
        return s
    return s[: max_len - 16] + "... [truncated]"


def _sanitize_context(obj: Any, depth: int = 0) -> Any:
    if depth > 4:
        return "[max_depth]"
    if obj is None or isinstance(obj, (bool, int, float)):
        return obj
    if isinstance(obj, str):
        if len(obj) > 1200:
            return obj[:1200] + f"... [len={len(obj)}]"
        return obj
    if isinstance(obj, dict):
        cleaned: Dict[str, Any] = {}
        for idx, (k, v) in enumerate(obj.items()):
            if idx >= 40:
                cleaned["_truncated_keys"] = True
                break
            k_str = str(k)
            k_low = k_str.lower()
            if any(tok in k_low for tok in _SENSITIVE_KEY_TOKENS):
                cleaned[k_str] = f"[redacted len={len(str(v))}]" if v else "[redacted]"
            else:
                cleaned[k_str] = _sanitize_context(v, depth + 1)
        return cleaned
    if isinstance(obj, (list, tuple)):
        items = [_sanitize_context(item, depth + 1) for item in obj[:25]]
        if len(obj) > 25:
            items.append(f"... [{len(obj) - 25} more]")
        return items
    return _truncate_str(repr(obj), 500)


def extract_member_from_request(request: Optional[Request]) -> Tuple[Optional[int], Optional[str]]:
    if not request:
        return None, None
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return None, None
    token = auth_header[7:].strip()
    if not token:
        return None, None
    payload = decode_access_token(token)
    if not isinstance(payload, dict):
        return None, None
    raw_id = payload.get("member_id") or payload.get("id")
    member_id = int(raw_id) if raw_id is not None and str(raw_id).isdigit() else None
    member_name = payload.get("name") or payload.get("prenom") or payload.get("sub") or payload.get("username")
    return member_id, (str(member_name)[:120] if member_name else None)


def record_error_log(
    *,
    source: str,
    message: str,
    severity: str = "error",
    endpoint: Optional[str] = None,
    http_method: Optional[str] = None,
    status_code: Optional[int] = None,
    error_type: Optional[str] = None,
    stack_trace: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
    member_id: Optional[int] = None,
    member_name: Optional[str] = None,
    user_agent: Optional[str] = None,
    page_url: Optional[str] = None,
    request: Optional[Request] = None,
    exc: Optional[BaseException] = None,
) -> Optional[int]:
    """
    Persiste une erreur dans `app_error_logs` via une session DB indépendante.
    Ne relance jamais d'exception pour éviter de masquer l'erreur applicative d'origine.
    """
    try:
        ensure_error_logs_schema_once()

        if request is not None:
            req_mid, req_mname = extract_member_from_request(request)
            if member_id is None:
                member_id = req_mid
            if not member_name:
                member_name = req_mname
            if not endpoint:
                endpoint = request.url.path
            if not http_method:
                http_method = request.method
            if not user_agent:
                user_agent = request.headers.get("user-agent")
            if not page_url:
                page_url = request.headers.get("referer")

        if exc is not None:
            if not error_type:
                error_type = type(exc).__name__
            if not stack_trace:
                tb_str = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
                stack_trace = tb_str if tb_str.strip() else traceback.format_exc()

        ctx_serialized = None
        if context is not None:
            ctx_serialized = _truncate_str(
                json.dumps(_sanitize_context(context), ensure_ascii=False, default=str),
                8000,
            )

        db = SessionLocal()
        try:
            row = AppErrorLog(
                source=(source or "unknown")[:60],
                severity=(severity or "error")[:20],
                endpoint=_truncate_str(endpoint, 255),
                http_method=_truncate_str(http_method, 16),
                status_code=int(status_code) if status_code is not None else None,
                error_type=_truncate_str(error_type, 120),
                message=_truncate_str(message or "Erreur sans message", 4000),
                stack_trace=_truncate_str(stack_trace, 12000),
                context_json=ctx_serialized,
                member_id=int(member_id) if member_id is not None else None,
                member_name=_truncate_str(member_name, 120),
                user_agent=_truncate_str(user_agent, 300),
                page_url=_truncate_str(page_url, 500),
                resolved=False,
                created_at=datetime.utcnow(),
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return row.id
        finally:
            db.close()
    except Exception as log_err:
        logger.error(f"[ERROR_LOG_SERVICE] Échec enregistrement app_error_logs ({source}): {log_err}")
        return None


def serialize_error_log(row: AppErrorLog) -> Dict[str, Any]:
    created_iso = None
    if row.created_at:
        dt = row.created_at
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        created_iso = dt.isoformat() + "Z"

    ctx = None
    if row.context_json:
        try:
            ctx = json.loads(row.context_json)
        except ValueError:
            ctx = row.context_json

    return {
        "id": row.id,
        "source": row.source,
        "severity": row.severity,
        "endpoint": row.endpoint,
        "http_method": row.http_method,
        "status_code": row.status_code,
        "error_type": row.error_type,
        "message": row.message,
        "stack_trace": row.stack_trace,
        "context": ctx,
        "member_id": row.member_id,
        "member_name": row.member_name,
        "user_agent": row.user_agent,
        "page_url": row.page_url,
        "resolved": bool(row.resolved),
        "created_at": created_iso,
    }

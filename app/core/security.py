from __future__ import annotations

import hmac
import secrets
from urllib.parse import urlparse

from fastapi import HTTPException, Request, WebSocket

SESSION_COOKIE = "pibic_workspace_session"

# A restart intentionally invalidates browser sessions. The user already authenticated
# to the VM through SSH; this adds browser-local CSRF/origin protection on top.
_SESSION_TOKEN = secrets.token_urlsafe(32)
_CSRF_TOKEN = secrets.token_urlsafe(32)

_ALLOWED_HOSTS = {"127.0.0.1", "localhost"}
_STATE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _host_only(value: str | None) -> str:
    if not value:
        return ""
    value = value.strip()
    if value.startswith("["):
        end = value.find("]")
        return value[1:end] if end >= 0 else value
    return value.split(":", 1)[0]


def is_allowed_host(value: str | None) -> bool:
    return _host_only(value) in _ALLOWED_HOSTS


def is_allowed_origin(value: str | None) -> bool:
    if not value:
        return False
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and (parsed.hostname or "") in _ALLOWED_HOSTS


def session_ok(value: str | None) -> bool:
    return bool(value) and hmac.compare_digest(value, _SESSION_TOKEN)


def csrf_ok(value: str | None) -> bool:
    return bool(value) and hmac.compare_digest(value, _CSRF_TOKEN)


def session_payload() -> dict[str, str]:
    return {"csrf": _CSRF_TOKEN}


def set_session_cookie(response) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=_SESSION_TOKEN,
        httponly=True,
        samesite="strict",
        secure=False,
        path="/",
    )


def validate_request(request: Request) -> None:
    if request.url.path == "/api/health":
        return
    if not is_allowed_host(request.headers.get("host")):
        raise HTTPException(status_code=400, detail="Host não permitido")
    if request.url.path.startswith("/api/"):
        if not session_ok(request.cookies.get(SESSION_COOKIE)):
            raise HTTPException(status_code=401, detail="Sessão inválida")
        if request.method.upper() in _STATE_METHODS:
            if not is_allowed_origin(request.headers.get("origin")):
                raise HTTPException(status_code=403, detail="Origin não permitido")
            if not csrf_ok(request.headers.get("x-csrf-token")):
                raise HTTPException(status_code=403, detail="CSRF inválido")


def validate_websocket(websocket: WebSocket) -> None:
    if not is_allowed_host(websocket.headers.get("host")):
        raise HTTPException(status_code=400, detail="Host não permitido")
    if not is_allowed_origin(websocket.headers.get("origin")):
        raise HTTPException(status_code=403, detail="Origin não permitido")
    if not session_ok(websocket.cookies.get(SESSION_COOKIE)):
        raise HTTPException(status_code=401, detail="Sessão inválida")

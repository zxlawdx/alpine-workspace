from __future__ import annotations

import hmac
import os
import pwd
import secrets
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException, Request, WebSocket

SESSION_COOKIE = "pibic_workspace_session"
_ALLOWED_HOSTS = {"127.0.0.1", "localhost"}
_STATE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _state_dir() -> Path:
    configured = os.environ.get("XDG_STATE_HOME")
    if configured:
        base = Path(configured).expanduser()
    else:
        try:
            home = Path(pwd.getpwuid(os.geteuid()).pw_dir)
        except (KeyError, OSError):
            home = Path.home()
        base = home / ".local" / "state"
    path = base / "pibic-workspace"
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        path.chmod(0o700)
    except OSError:
        pass
    return path


def _persistent_secret(name: str) -> str:
    """Keep browser sessions valid across service restarts.

    The Workspace is already isolated on loopback and reached through SSH. Persisting
    these random values avoids turning every OpenRC restart into a stale-cookie/401
    loop while keeping the token local to the Unix account running the service.
    """

    path = _state_dir() / name
    try:
        value = path.read_text(encoding="utf-8").strip()
        if len(value) >= 32:
            return value
    except OSError:
        pass

    value = secrets.token_urlsafe(48)
    tmp = path.with_suffix(".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(value)
            handle.write("\n")
        os.replace(tmp, path)
        try:
            path.chmod(0o600)
        except OSError:
            pass
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
    return value


_SESSION_TOKEN = _persistent_secret("browser-session.key")
_CSRF_TOKEN = _persistent_secret("browser-csrf.key")


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


def session_payload() -> dict[str, object]:
    """Return CSRF data plus the Unix identity actually running this Workspace.

    PIBIC LAB starts one Workspace process from each authenticated SSH session. Using
    the effective UID here keeps the UI tied to that real Unix account instead of a
    hardcoded username in the browser bundle.
    """

    uid = os.geteuid()
    gid = os.getegid()

    try:
        account = pwd.getpwuid(uid)
        username = account.pw_name
        home = account.pw_dir
        shell = account.pw_shell
    except (KeyError, OSError):
        username = os.environ.get("USER") or os.environ.get("LOGNAME") or str(uid)
        home = str(Path.home())
        shell = os.environ.get("SHELL") or ""

    return {
        "csrf": _CSRF_TOKEN,
        "username": username,
        "uid": uid,
        "gid": gid,
        "home": home,
        "shell": shell,
        "role": "root" if uid == 0 else "ssh-user",
        "role_label": "root" if uid == 0 else "usuário SSH",
    }


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
    # Host validation also applies to the health endpoint. Local SSH forwarding keeps
    # Host as 127.0.0.1:<local-port>, which is accepted by _host_only().
    if not is_allowed_host(request.headers.get("host")):
        raise HTTPException(status_code=400, detail="Host não permitido")

    if request.url.path == "/api/health":
        return

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

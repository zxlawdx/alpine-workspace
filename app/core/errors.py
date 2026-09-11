from __future__ import annotations

from fastapi import HTTPException


def api_error(status: int, code: str, message: str, details: str | None = None) -> HTTPException:
    payload = {"code": code, "message": message}
    if details:
        payload["details"] = details
    return HTTPException(status_code=status, detail=payload)

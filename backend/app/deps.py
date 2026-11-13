"""Request authentication helpers."""

from __future__ import annotations

from fastapi import Header, HTTPException

from app import db
from app.security import token_digest


def bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(401, "Sign in to continue.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(401, "Sign in to continue.")
    return token.strip()


def current_user(authorization: str | None = Header(default=None)) -> dict:
    token = bearer_token(authorization)
    user = db.get_session_user(token_digest(token))
    if not user:
        raise HTTPException(401, "Your session has expired. Sign in again.")
    return user


def optional_user(authorization: str | None = Header(default=None)) -> dict | None:
    if not authorization:
        return None
    try:
        return current_user(authorization)
    except HTTPException:
        return None

from __future__ import annotations

import asyncio
import hmac
import json
import queue
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services import digital_twin
from app import db
from app.core.config import get_settings
from app.deps import current_user, optional_user
from app.realtime import hub
from app.security import (
    hash_password,
    new_session_token,
    token_digest,
    verify_password,
)

router = APIRouter()
settings = get_settings()

SESSION_DAYS = 30
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


def _session(user_id: str, user_agent: str | None = None) -> tuple[str, dict[str, Any]]:
    token = new_session_token()
    expires = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat()
    db.create_session(user_id, token_digest(token), expires, user_agent)
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(500, "The account could not be loaded.")
    return token, user


class RegisterPayload(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=240)
    password: str = Field(min_length=8, max_length=200)
    role: str = Field(default="candidate", pattern="^(candidate|recruiter)$")
    company: str | None = Field(default=None, max_length=160)


class LoginPayload(BaseModel):
    email: str = Field(min_length=5, max_length=240)
    password: str = Field(min_length=1, max_length=200)


class ProfilePayload(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    avatar_url: str | None = Field(default=None, max_length=500)
    headline: str | None = Field(default=None, max_length=180)
    location: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=2000)
    website: str | None = Field(default=None, max_length=300)
    linkedin: str | None = Field(default=None, max_length=300)
    github: str | None = Field(default=None, max_length=300)
    company: str | None = Field(default=None, max_length=160)
    job_title: str | None = Field(default=None, max_length=160)
    years_experience: int | None = Field(default=None, ge=0, le=60)
    target_role: str | None = Field(default=None, max_length=120)
    open_to_work: bool | None = None
    onboarded: bool | None = None


class PasswordPayload(BaseModel):
    current_password: str = Field(default="", max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class OAuthPayload(BaseModel):
    email: str = Field(min_length=5, max_length=240)
    name: str = Field(min_length=1, max_length=120)
    avatar_url: str | None = Field(default=None, max_length=500)
    provider: str = Field(default="google", max_length=30)
    email_verified: bool = True


def _clean_email(email: str) -> str:
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Enter a valid email address.")
    return email


@router.post("/auth/register", tags=["auth"])
async def register(payload: RegisterPayload, request: Request) -> dict[str, Any]:
    email = _clean_email(payload.email)
    if db.get_user_by_email(email):
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    user = db.create_user(
        email=email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role=payload.role,
        provider="password",
        company=payload.company,
    )
    db.log_event(
        user["id"],
        "account",
        "Account created",
        "Add a resume to unlock live skill scoring and job matching.",
    )
    token, user = _session(user["id"], request.headers.get("user-agent"))
    hub.publish(user["id"], "profile", {"reason": "register"})
    return {"token": token, "user": user}


@router.post("/auth/login", tags=["auth"])
async def login(payload: LoginPayload, request: Request) -> dict[str, Any]:
    email = _clean_email(payload.email)
    record = db.get_user_by_email(email)
    if not record or not verify_password(payload.password, record.get("password_hash")):
        raise HTTPException(401, "Email or password is incorrect.")
    token, user = _session(record["id"], request.headers.get("user-agent"))
    return {"token": token, "user": user}


@router.post("/auth/logout", tags=["auth"])
async def logout(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token:
            db.delete_session(token_digest(token.strip()))
    return {"ok": True}


@router.get("/auth/session", tags=["auth"])
async def session_user(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"user": user}


@router.put("/auth/profile", tags=["auth"])
async def update_profile(
    payload: ProfilePayload,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    if values.get("name") is not None and not values["name"].strip():
        raise HTTPException(422, "Your name cannot be empty.")
    updated = db.update_user(user["id"], **values)
    digital_twin.refresh_quietly(user["id"], "profile_update")
    db.log_event(user["id"], "profile", "Profile updated", "Your profile details are now up to date.")
    hub.publish(user["id"], "profile", {"reason": "updated"})
    return {"user": updated}


@router.put("/auth/password", tags=["auth"])
async def change_password(
    payload: PasswordPayload,
    authorization: str | None = Header(default=None),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    record = db.get_user_record(user["id"]) or {}
    stored = record.get("password_hash")
    if stored and not verify_password(payload.current_password, stored):
        raise HTTPException(401, "Your current password is incorrect.")
    db.update_user(user["id"], password_hash=hash_password(payload.new_password))
    if authorization:
        _, _, token = authorization.partition(" ")
        db.delete_user_sessions(user["id"], keep=token_digest(token.strip()))
    db.log_event(user["id"], "security", "Password changed", "Your password was updated successfully.")
    hub.publish(user["id"], "profile", {"reason": "password"})
    return {"ok": True}


@router.post("/auth/oauth", tags=["auth"])
async def oauth_session(
    payload: OAuthPayload,
    request: Request,
    x_internal_secret: str | None = Header(default=None),
) -> dict[str, Any]:
    """Trusted server-to-server bridge used by the Next.js Google OAuth callback."""
    configured = settings.internal_api_secret
    if not configured or not x_internal_secret or not hmac.compare_digest(x_internal_secret, configured):
        raise HTTPException(401, "OAuth bridge is not authorized.")
    email = _clean_email(payload.email)
    record = db.get_user_by_email(email)
    if record:
        updates: dict[str, Any] = {"email_verified": 1}
        if payload.avatar_url and not record.get("avatar_url"):
            updates["avatar_url"] = payload.avatar_url
        if payload.name and not record.get("name"):
            updates["name"] = payload.name
        db.update_user(record["id"], **updates)
        user_id = record["id"]
    else:
        user = db.create_user(
            email=email,
            name=payload.name,
            password_hash=None,
            role="candidate",
            provider=payload.provider,
            avatar_url=payload.avatar_url,
            email_verified=payload.email_verified,
        )
        user_id = user["id"]
        db.log_event(
            user_id,
            "account",
            "Account created with Google",
            "Complete your profile to personalize the workspace.",
        )
    token, user = _session(user_id, request.headers.get("user-agent"))
    hub.publish(user_id, "profile", {"reason": "oauth"})
    return {"token": token, "user": user}


@router.get("/events", tags=["realtime"])
async def events(request: Request, user: dict[str, Any] = Depends(current_user)) -> StreamingResponse:
    channel = hub.subscribe(user["id"])

    async def stream():
        ticks = 0
        try:
            yield "retry: 3000\n\n"
            while True:
                if await request.is_disconnected():
                    break
                message = None
                try:
                    message = channel.get_nowait()
                except queue.Empty:
                    message = None
                if message:
                    yield f"event: change\ndata: {json.dumps(message)}\n\n"
                    ticks = 0
                else:
                    ticks += 1
                    if ticks >= 38:  # ~15 seconds at 0.4s intervals
                        yield ": keep-alive\n\n"
                        ticks = 0
                await asyncio.sleep(0.4)
        finally:
            hub.unsubscribe(user["id"], channel)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/auth/optional-session", tags=["auth"])
async def optional_session(user: dict[str, Any] | None = Depends(optional_user)) -> dict[str, Any]:
    return {"user": user}

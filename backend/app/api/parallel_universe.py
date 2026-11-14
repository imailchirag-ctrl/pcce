"""Authenticated API for hypothetical AI career futures."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.deps import current_user
from app.services import parallel_universe

router = APIRouter(prefix="/parallel-universe", tags=["parallel-universe"])


def _candidate_only(user: dict[str, Any]) -> None:
    if user.get("role") != "candidate":
        raise HTTPException(403, "AI Parallel Universe is available to candidate accounts.")


class DecisionRequest(BaseModel):
    decision: str = Field(min_length=3, max_length=220)

    @field_validator("decision")
    @classmethod
    def trim_decision(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 3:
            raise ValueError("Enter at least three characters for the hypothetical decision.")
        return cleaned


@router.get("/profile")
async def get_current_self(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    _candidate_only(user)
    return parallel_universe.current_self(user)


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    _candidate_only(user)
    return await parallel_universe.create_simulation(user)


@router.get("/sessions")
async def list_sessions(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    _candidate_only(user)
    sessions = parallel_universe.list_simulations(user["id"])
    return {"sessions": sessions}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    _candidate_only(user)
    session = parallel_universe.get_simulation(user["id"], session_id)
    if not session:
        raise HTTPException(404, "Parallel Universe session not found.")
    return session


@router.post("/sessions/{session_id}/debate")
async def debate(session_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    _candidate_only(user)
    result = await parallel_universe.run_debate(user, session_id)
    if not result:
        raise HTTPException(404, "Parallel Universe session not found.")
    return result


@router.post("/sessions/{session_id}/decisions")
async def decide(session_id: str, payload: DecisionRequest, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    _candidate_only(user)
    result = await parallel_universe.simulate_decision(
        user,
        session_id,
        payload.decision,
    )
    if not result:
        raise HTTPException(404, "Parallel Universe session not found.")
    return result

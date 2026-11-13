"""Authenticated Career Quest API."""

from fastapi import APIRouter, Depends, Response, status
from starlette.concurrency import run_in_threadpool

from app.services import digital_twin
from app.deps import current_user
from app.schemas.career_quest import AttemptRequest, CreateRunRequest, EmptyRequest, InteractionRequest
from app.services import career_quest

router = APIRouter(prefix="/career-quests", tags=["career-quest"])


@router.get("/catalog")
async def get_catalog() -> dict:
    return await run_in_threadpool(career_quest.get_catalog)


@router.get("/progression")
async def get_progression(user: dict = Depends(current_user)) -> dict:
    return career_quest.get_progression(user)


@router.post("/runs", status_code=status.HTTP_201_CREATED)
async def create_run(payload: CreateRunRequest, user: dict = Depends(current_user)) -> dict:
    return career_quest.start_run(user, payload.career_key, payload.difficulty)


@router.get("/runs")
async def list_runs(user: dict = Depends(current_user)) -> dict:
    return {"runs": career_quest.list_user_runs(user)}


@router.get("/runs/{run_id}")
async def get_run(run_id: str, user: dict = Depends(current_user)) -> dict:
    return career_quest.get_run(user, run_id)


@router.post("/runs/{run_id}/missions/{mission_id}/interactions")
async def add_interaction(
    run_id: str,
    mission_id: str,
    payload: InteractionRequest,
    user: dict = Depends(current_user),
) -> dict:
    return await run_in_threadpool(
        career_quest.add_interaction,
        user,
        run_id,
        mission_id,
        action=payload.action,
        choices=payload.choices,
        text=payload.text,
    )


@router.post("/runs/{run_id}/missions/{mission_id}/attempts", status_code=status.HTTP_202_ACCEPTED)
async def create_attempt(
    run_id: str,
    mission_id: str,
    payload: AttemptRequest,
    response: Response,
    user: dict = Depends(current_user),
) -> dict:
    attempt = career_quest.submit_attempt(
        user,
        run_id,
        mission_id,
        language=payload.language,
        source_code=payload.source_code,
        idempotency_key=payload.idempotency_key,
    )
    if attempt["status"] not in {"QUEUED", "RUNNING"}:
        response.status_code = status.HTTP_200_OK
    return {"attempt": attempt}


@router.get("/runs/{run_id}/attempts/{attempt_id}")
async def get_attempt(run_id: str, attempt_id: str, user: dict = Depends(current_user)) -> dict:
    return {"attempt": career_quest.get_attempt(user, run_id, attempt_id)}


@router.post("/runs/{run_id}/missions/{mission_id}/complete")
async def complete_mission(
    run_id: str,
    mission_id: str,
    payload: EmptyRequest,
    user: dict = Depends(current_user),
) -> dict:
    del payload
    result = await run_in_threadpool(career_quest.complete_mission, user, run_id, mission_id)
    digital_twin.refresh_quietly(user["id"], "assessment_completed")
    return result


@router.post("/runs/{run_id}/abandon")
async def abandon_run(
    run_id: str,
    payload: EmptyRequest,
    user: dict = Depends(current_user),
) -> dict:
    del payload
    return career_quest.abandon_run(user, run_id)


@router.get("/runs/{run_id}/report")
async def get_report(run_id: str, user: dict = Depends(current_user)) -> dict:
    return career_quest.get_report(user, run_id)

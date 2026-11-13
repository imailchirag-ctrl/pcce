"""Digital Twin, Career Market Intelligence and Skill Exchange endpoints.

Every route resolves the user from the session token (``current_user``); no
route accepts a user id from the request body for ownership decisions.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.deps import current_user
from app.ml.model_registry import registry
from app.ml.skill_taxonomy import ROLE_CATALOG, canonical_role
from app.services import career_intel, digital_twin, market_intel, skill_exchange

router = APIRouter()


# ----------------------------------------------------------------- payloads
class ReadinessPayload(BaseModel):
    question: str = Field(default="", max_length=400)
    role: str | None = Field(default=None, max_length=120)


class ChatPayload(BaseModel):
    question: str = Field(min_length=2, max_length=600)
    use_llm: bool = False


class RefreshPayload(BaseModel):
    query: str = Field(default="software engineer", min_length=2, max_length=60)
    providers: list[Literal["remotive", "arbeitnow"]] | None = None
    force: bool = False


class JobDescriptionPayload(BaseModel):
    title: str = Field(default="Pasted job description", min_length=2, max_length=160)
    text: str = Field(min_length=60, max_length=30_000)
    role: str | None = Field(default=None, max_length=120)


class ExchangeProfilePayload(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)
    headline: str | None = Field(default=None, max_length=140)
    teach: list[str] = Field(default_factory=list, max_length=20)
    learn: list[str] = Field(default_factory=list, max_length=20)
    tech: list[str] = Field(default_factory=list, max_length=20)
    interests: list[str] = Field(default_factory=list, max_length=20)
    roles: list[str] = Field(default_factory=list, max_length=10)
    availability: str | None = Field(default=None, max_length=80)
    level: Literal["beginner", "intermediate", "advanced"] = "beginner"
    visibility: Literal["hidden", "members"] = "hidden"
    show_evidence: bool = True


class ConnectPayload(BaseModel):
    member_id: str = Field(min_length=3, max_length=80)
    message: str | None = Field(default=None, max_length=400)


class JoinPayload(BaseModel):
    role: str | None = Field(default=None, max_length=60)
    message: str | None = Field(default=None, max_length=400)


class DecisionPayload(BaseModel):
    accept: bool


class MemberRefPayload(BaseModel):
    member_id: str = Field(min_length=3, max_length=80)


class ReportPayload(BaseModel):
    target_type: Literal["user", "project"]
    target_id: str = Field(min_length=3, max_length=80)
    reason: str = Field(min_length=5, max_length=500)


class RolePayload(BaseModel):
    role: str = Field(min_length=2, max_length=60)
    skills: list[str] = Field(default_factory=list, max_length=8)


class ProjectPayload(BaseModel):
    title: str = Field(min_length=4, max_length=120)
    description: str = Field(min_length=20, max_length=3000)
    roles: list[RolePayload] = Field(default_factory=list, max_length=8)
    skills: list[str] = Field(default_factory=list, max_length=16)


class ResponsibilityPayload(BaseModel):
    member_id: str = Field(min_length=3, max_length=80)
    responsibility: str = Field(default="", max_length=140)


class ProjectUpdatePayload(BaseModel):
    status: Literal["OPEN", "CLOSED"] | None = None
    responsibilities: list[ResponsibilityPayload] = Field(default_factory=list, max_length=20)


class MilestonePayload(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    due_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class MilestoneTogglePayload(BaseModel):
    done: bool


class TaskPayload(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    skills: list[str] = Field(default_factory=list, max_length=6)
    assignee_id: str | None = Field(default=None, max_length=80)
    milestone_id: str | None = Field(default=None, max_length=80)


class TaskUpdatePayload(BaseModel):
    status: Literal["TODO", "DOING", "DONE"] | None = None
    assignee_id: str | None = Field(default=None, max_length=80)


# ------------------------------------------------------------- digital twin
@router.get("/twin", tags=["digital-twin"])
async def twin_get(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return digital_twin.ensure(user["id"])


@router.post("/twin/rebuild", tags=["digital-twin"])
async def twin_rebuild(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return digital_twin.rebuild(user["id"], reason="manual_refresh")


@router.get("/twin/graph", tags=["digital-twin"])
async def twin_graph(role: str | None = Query(default=None, max_length=120), user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    role_key = canonical_role(role or user.get("target_role"))
    reqs = market_intel.role_requirements(role_key, user["id"])
    graph = digital_twin.build_graph(user["id"], [item["skill"] for item in reqs["requirements"]])
    return {**graph, "role": {"role_key": role_key, "title": reqs["title"], "source": reqs["source"]}}


@router.get("/twin/timeline", tags=["digital-twin"])
async def twin_timeline(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"events": digital_twin.timeline(user["id"])}


@router.post("/twin/readiness", tags=["digital-twin"])
async def twin_readiness(payload: ReadinessPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return career_intel.readiness(user["id"], payload.question, payload.role)


@router.post("/twin/chat", tags=["digital-twin"])
async def twin_chat(payload: ChatPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return career_intel.chat(user["id"], payload.question, payload.use_llm)


# --------------------------------------------------------- market intelligence
@router.get("/market/roles", tags=["market"])
async def market_roles() -> dict[str, Any]:
    return {"roles": [{"role_key": key, "title": value["title"]} for key, value in ROLE_CATALOG.items()]}


@router.get("/market/dashboard", tags=["market"])
async def market_dashboard(
    scope: Literal["market", "live", "platform", "mine", "sample"] = "market",
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    return market_intel.dashboard(user["id"], scope)


@router.post("/market/refresh", tags=["market"])
async def market_refresh(payload: RefreshPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    results = market_intel.refresh_live(payload.query, payload.providers, force=payload.force)
    return {"results": results, "dashboard": market_intel.dashboard(user["id"], "market")}


@router.get("/market/role/{role_key}", tags=["market"])
async def market_role(role_key: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    key = canonical_role(role_key.replace("-", " "))
    return {"requirements": market_intel.role_requirements(key, user["id"]), "comparison": career_intel.compare(user["id"], key)}


@router.post("/market/analyze-jd", tags=["market"])
async def market_analyze_jd(payload: JobDescriptionPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    role_key = canonical_role(payload.role) if payload.role else None
    extracted = market_intel.add_user_posting(user["id"], title=payload.title, text=payload.text, role_key=role_key)
    keywords = registry.extract_keywords(payload.text, top_n=10)
    target = extracted["role_key"] or canonical_role(user.get("target_role"))
    return {
        "skills": extracted["skills"],
        "role_key": target,
        "keywords": keywords,
        "comparison": career_intel.compare(user["id"], target),
        "note": "Stored privately as a user-provided posting; only extracted skills are kept.",
    }


@router.get("/market/recommendations", tags=["market"])
async def market_recommendations(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"roles": career_intel.recommendations(user["id"])}


# ----------------------------------------------------------- skill exchange
@router.get("/exchange/profile", tags=["exchange"])
async def exchange_profile(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.get_profile(user["id"])


@router.put("/exchange/profile", tags=["exchange"])
async def exchange_profile_save(payload: ExchangeProfilePayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.save_profile(user["id"], payload.model_dump())


@router.get("/exchange/matches", tags=["exchange"])
async def exchange_matches(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.matches(user["id"])


@router.post("/exchange/connect", tags=["exchange"])
async def exchange_connect(payload: ConnectPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.create_request(user["id"], kind="PEER_CONNECT", member_id=payload.member_id, project_id=None, role=None, message=payload.message)


@router.get("/exchange/requests", tags=["exchange"])
async def exchange_requests(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.list_requests(user["id"])


@router.post("/exchange/requests/{request_id}/decision", tags=["exchange"])
async def exchange_decide(request_id: str, payload: DecisionPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.decide_request(user["id"], request_id, payload.accept)


@router.post("/exchange/requests/{request_id}/withdraw", tags=["exchange"])
async def exchange_withdraw(request_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.withdraw_request(user["id"], request_id)


@router.get("/exchange/blocks", tags=["exchange"])
async def exchange_blocks(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"blocked": skill_exchange.list_blocks(user["id"])}


@router.post("/exchange/block", tags=["exchange"])
async def exchange_block(payload: MemberRefPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.block(user["id"], payload.member_id)


@router.post("/exchange/unblock", tags=["exchange"])
async def exchange_unblock(payload: MemberRefPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.unblock(user["id"], payload.member_id)


@router.post("/exchange/report", tags=["exchange"])
async def exchange_report(payload: ReportPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.report(user["id"], payload.target_type, payload.target_id, payload.reason)


@router.get("/exchange/projects", tags=["exchange"])
async def exchange_projects(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.list_projects(user["id"])


@router.post("/exchange/projects", tags=["exchange"])
async def exchange_project_create(payload: ProjectPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.create_project(user["id"], payload.model_dump())


@router.get("/exchange/projects/{project_id}", tags=["exchange"])
async def exchange_project(project_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.project_detail(user["id"], project_id)


@router.patch("/exchange/projects/{project_id}", tags=["exchange"])
async def exchange_project_update(project_id: str, payload: ProjectUpdatePayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.update_project(user["id"], project_id, payload.model_dump())


@router.post("/exchange/projects/{project_id}/join", tags=["exchange"])
async def exchange_project_join(project_id: str, payload: JoinPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.create_request(user["id"], kind="PROJECT_JOIN", member_id=None, project_id=project_id, role=payload.role, message=payload.message)


@router.get("/exchange/projects/{project_id}/candidates", tags=["exchange"])
async def exchange_project_candidates(project_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"candidates": skill_exchange.project_candidates(user["id"], project_id)}


@router.post("/exchange/projects/{project_id}/milestones", tags=["exchange"])
async def exchange_milestone_add(project_id: str, payload: MilestonePayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.add_milestone(user["id"], project_id, payload.title, payload.due_date)


@router.patch("/exchange/projects/{project_id}/milestones/{milestone_id}", tags=["exchange"])
async def exchange_milestone_toggle(project_id: str, milestone_id: str, payload: MilestoneTogglePayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.toggle_milestone(user["id"], project_id, milestone_id, payload.done)


@router.post("/exchange/projects/{project_id}/tasks", tags=["exchange"])
async def exchange_task_add(project_id: str, payload: TaskPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.add_task(user["id"], project_id, payload.model_dump())


@router.patch("/exchange/projects/{project_id}/tasks/{task_id}", tags=["exchange"])
async def exchange_task_update(project_id: str, task_id: str, payload: TaskUpdatePayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return skill_exchange.update_task(user["id"], project_id, task_id, payload.model_dump(exclude_unset=True))

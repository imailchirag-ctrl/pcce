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

    return skill_exchange.update_task(user[id], project_id, task_id, payload.model_dump(exclude_unset=True))
class StrategyRequest(BaseModel):
    target_role: str = Field(default="", max_length=120)
    include_market: bool = Field(default=True, description="Include market demand comparison")

class StrategyResponse(BaseModel):
    role: str
    role_title: str
    alignment: float
    demonstrated_skills: list[dict[str, Any]]
    unverified_skills: list[dict[str, Any]]
    critical_gaps: list[dict[str, Any]]
    market_demand: list[dict[str, Any]]
    recommended_actions: list[dict[str, Any]]

class SprintTask(BaseModel):
    id: str
    title: str
    explanation: str
    skill: str
    why: str
    duration: str
    priority: str
    module: str
    action_url: str | None = None

class SprintPlan(BaseModel):
    role: str
    generated_at: str
    tasks: list[SprintTask]
    total_duration: str

class NextActionResponse(BaseModel):
    action: str
    title: str
    explanation: str
    skill: str
    module: str
    link: str | None = None
    priority: str
@router.post("/command-center/strategy", tags=["command-center"])
async def command_center_strategy(payload: StrategyRequest, user: dict[str, Any] = Depends(current_user)) -> StrategyResponse:
    """Generate a comprehensive career strategy for the target role."""
    from app.services import career_intel, digital_twin, market_intel

    role_key = canonical_role(payload.target_role.replace("–", " ")) if payload.target_role else canonical_role(user.get("target_role"))
    twin = digital_twin.skill_map(user["id"])
    comparison = career_intel.compare(user["id"], role_key)

    # Demonstrated vs unverified skills
    demonstrated = []
    unverified = []
    for row in comparison["requirements"]:
        key = row["skill"]
        state = row["state"]
        display = row["display"]
        if state in TIER_CREDIT and TIER_CREDIT[state] >= 0.8:  # demonstrated or verified
            demonstrated.append({"skill": key, "display": display, "status": state, "proficiency": row.get("proficiency", 0), "evidence": row.get("evidence", [])[:2]})
        else:
            unverified.append({"skill": key, "display": display, "status": state, "proficiency": row.get("proficiency", 0)})

    # Critical skill gaps (missing or adjacent)
    critical_gaps = []
    for row in comparison["requirements"]:
        if row["state"] == "missing" or row["state"] == "adjacent":
            critical_gaps.append({"skill": row["skill"], "display": row["display"], "state": row["state"], "proficiency": row.get("proficiency", 0), "essential": row.get("essential", False), "closest_skill": row.get("closest_skill")})

    # Market demand comparison
    market_demand = []
    if payload.include_market:
        market_reqs = market_intel.role_requirements(role_key, user["id"])
        # Align twin skills with market requirements
        for req in market_reqs["requirements"][:10]:
            skill = req["skill"]
            market_postings = req.get("postings", 0)
            # Check if user has this skill
            has_skill = skill in twin if twin else False
            market_demand.append({
                "skill": skill,
                "display": req.get("display", display_name(skill)),
                "postings": market_postings,
                "share": req.get("share"),
                "user_has": has_skill,
                "essential": req.get("essential", False)
            })

    # Recommended actions based on gaps
    recommended_actions = []
    for gap in critical_gaps[:5]:
        if gap["state"] == "missing":
            recommended_actions.append({
                "action": "learn_skill",
                "title": f"Learn {gap['display']}",
                "explanation": f"This skill is marked as critical gap for {role_key} role",
                "skill": gap["skill"],
                "priority": "high",
                "module": "skill_exchange"
            })
        elif gap["state"] == "adjacent":
            recommended_actions.append({
                "action": "bridge_skill",
                "title": f"Bridge {gap['display']} gap",
                "explanation": f"Build on adjacent skill to close the gap for {role_key}",
                "skill": gap["skill"],
                "priority": "medium",
                "module": "career_quest"
            })

    alignment = comparison.get("alignment", 0.0)

    return StrategyResponse(
        role=role_key,
        role_title=comparison.get("role", {}).get("title", role_title or role_key.title()),
        alignment=alignment,
        demonstrated_skills=demonstrated,
        unverified_skills=unverified,
        critical_gaps=critical_gaps,
        market_demand=market_demand,
        recommended_actions=recommended_actions
    )
@router.get("/command-center/gaps", tags=["command-center"])
async def command_center_skill_gaps(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """Get skill gaps for the user's target role."""
    from app.services import career_intel, digital_twin, market_intel

    target_role = user.get("target_role")
    if not target_role:
        return {"gaps": [], "note": "No target role set. Please select a target career first."}

    role_key = canonical_role(target_role.replace("–", " "))
    comparison = career_intel.compare(user["id"], role_key)
    twin = digital_twin.skill_map(user["id"])

    gaps = []
    for row in comparison["requirements"]:
        if row["state"] in ("missing", "adjacent"):
            gaps.append({
                "skill": row["skill"],
                "display": row["display"],
                "state": row["state"],
                "proficiency": row.get("proficiency", 0),
                "essential": row.get("essential", False),
                "evidence": twin.get(row["skill"], {}).get("evidence", []) if twin else []
            })

    # Group by priority
    critical = [g for g in gaps if g["state"] == "missing" and g.get("essential")]
    high = [g for g in gaps if g["state"] == "missing" and not g.get("essential")]
    medium = [g for g in gaps if g["state"] == "adjacent"]

    return {
        "gaps": gaps,
        "critical": critical,
        "high": high,
        "medium": medium,
        "total": len(gaps),
        "note": f"Found {len(gaps)} skill gaps for {target_role}"
    }
@router.get("/command-center/sprint", tags=["command-center"])
async def command_center_sprint(user: dict[str, Any] = Depends(current_user)) -> SprintPlan:
    """Generate a 7-day personalized career sprint plan."""
    from app.services import career_intel, digital_twin, market_intel, skill_exchange
    from datetime import datetime, timedelta
    import re

    target_role = user.get("target_role")
    if not target_role:
        # Return empty plan with note
        return SprintPlan(
            role=target_role or "",
            generated_at=datetime.utcnow().isoformat(),
            tasks=[],
            total_duration="0h"
        )

    role_key = canonical_role(target_role.replace("–", " "))
    comparison = career_intel.compare(user["id"], role_key)
    twin = digital_twin.skill_map(user["id"])

    tasks = []
    total_minutes = 0

    # Generate tasks based on gaps and next_steps
    next_steps_result = career_intel.next_steps(comparison, limit=7)

    for i, step in enumerate(next_steps_result.get("next_steps", [])[:7]):
        if i >= 7:
            break
        task_title = step.get("action", "Learn skill")
        display = step.get("display", "Unknown skill")
        why = step.get("why", "Recommended for skill development")
        duration = step.get("duration", "2h")
        priority = step.get("priority", "medium")
        related_module = step.get("related_module", "skill_exchange")

        # Create action URL based on module
        action_url = None
        if related_module == "career_quest":
            action_url = "/career-quest/start?difficulty=intermediate"
        elif related_module == "skill_exchange":
            action_url = f"/skill-exchange/browse?target={step.get('skill', '')}"
        elif related_module == "interviews":
            action_url = f"/interviews/practise?topic={step.get('skill', '')}"

        task = SprintTask(
            id=f"sprint_{datetime.utcnow().timestamp()}_{i}",
            title=task_title,
            explanation=why,
            skill=step.get("skill", ""),
            why=why,
            duration=duration,
            priority=priority,
            module=related_module,
            action_url=action_url
        )
        tasks.append(task)

        # Estimate duration in minutes
        dur_match = re.search(r"(\d+)", duration)
        if dur_match:
            total_minutes += int(dur_match.group(1))

    total_hours = f"{total_minutes // 60}h {total_minutes % 60}m" if total_minutes else "0h"

    return SprintPlan(
        role=target_role,
        generated_at=datetime.utcnow().isoformat(),
        tasks=tasks,
        total_duration=total_hours
    )
@router.get("/command-center/next-action", tags=["command-center"])
async def command_center_next_action(user: dict[str, Any] = Depends(current_user)) -> NextActionResponse:
    """Get the single highest-priority next action for the user."""
    from app.services import career_intel, digital_twin, market_intel

    target_role = user.get("target_role")
    if not target_role:
        return NextActionResponse(
            action="set_goal",
            title="Set Your Target Career",
            explanation="Please select a target career role to receive personalized recommendations",
            skill="",
            module="command-center",
            priority="high"
        )

    role_key = canonical_role(target_role.replace("–", " "))
    comparison = career_intel.compare(user["id"], role_key)
    twin = digital_twin.skill_map(user["id"])

    # Find the highest-priority action
    # Look for missing essential skills first
    critical_missing = [r for r in comparison["requirements"] if r["state"] == "missing" and r.get("essential")]

    if critical_missing:
        gap = critical_missing[0]
        action = "learn_skill"
        title = f"Learn {gap['display']}"
        explanation = f"This essential skill is missing for the {role_key} role. Starting with this will have the biggest impact on your career progression."
        skill = gap["skill"]
        module = "skill_exchange"
        link = None
        priority = "high"
    elif comparison.get("alignment", 100) < 50:
        # Low alignment - focus on bridging gaps
        missing = [r for r in comparison["requirements"] if r["state"] == "missing"]
        if missing:
            gap = missing[0]
            action = "bridge_skill"
            title = f"Bridge the {gap['display']} gap"
            explanation = f"Your alignment with the {role_key} role is low. Focus on building this missing skill."
            skill = gap["skill"]
            module = "career_quest"
            link = None
            priority = "high"
        else:
            return NextActionResponse(
                action="assess",
                title="Take Skills Assessment",
                explanation="Complete a brief skills assessment to identify your current level.",
                skill="",
                module="interviews",
                priority="medium"
            )
    else:
        # Good alignment - focus on demonstrating skills
        demonstrated = [r for r in comparison["requirements"] if r["state"] in TIER_CREDIT and TIER_CREDIT[r["state"]] >= 0.8]
        if demonstrated:
            skill = demonstrated[0]["skill"]
            action = "practise"
            title = f"Practise {skill} for interviews"
            explanation = f"You have this skill demonstrated. Practise it with interview questions to reinforce your knowledge."
            skill = skill
            module = "interviews"
            link = None
            priority = "medium"
        else:
            # No skills demonstrated - start with career quest
            action = "start_mission"
            title = "Start a Career Quest Mission"
            explanation = "Begin with a Career Quest mission to demonstrate your capabilities and build evidence."
            skill = ""
            module = "career_quest"
            link = "/career-quest"
            priority = "high"

    return NextActionResponse(
        action=action,
        title=title,
        explanation=explanation,
        skill=skill,
        module=module,
        link=link,
        priority=priority
    )

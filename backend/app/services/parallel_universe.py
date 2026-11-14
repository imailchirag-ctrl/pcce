"""Evidence-grounded, hypothetical career simulations for one signed-in user."""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from app import db
from app.core.config import get_settings
from app.ml.model_registry import registry
from app.services import digital_twin

logger = logging.getLogger("skillbridge.parallel_universe")

SCHEMA = """
CREATE TABLE IF NOT EXISTS parallel_universe_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_json TEXT NOT NULL,
  futures_json TEXT NOT NULL,
  comparison_json TEXT NOT NULL,
  model TEXT,
  provider TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_universe_sessions_user ON parallel_universe_sessions(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS parallel_universe_debates (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES parallel_universe_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_universe_debates_session ON parallel_universe_debates(session_id, created_at DESC);
CREATE TABLE IF NOT EXISTS parallel_universe_scenarios (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES parallel_universe_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision_text TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_universe_scenarios_session ON parallel_universe_scenarios(session_id, created_at DESC);
"""

MODEL_NAME = "qwen2.5-coder:3b"
FUTURE_IDS = ("future-a", "future-b", "future-c")
TIER_WEIGHT = {"verified": 1.0, "demonstrated": 0.8, "claimed": 0.35}
SIMULATION_NOTICE = (
    "Hypothetical scenario, not a prediction or promise. Your simulated decisions do not change real skills or progress."
)


def _ensure_schema() -> None:
    db.init_db()
    with db.connection() as conn:
        conn.executescript(SCHEMA)


def _decoded(raw: str | None, default: Any) -> Any:
    try:
        return json.loads(raw) if raw else default
    except (TypeError, json.JSONDecodeError):
        return default


def _clean(value: Any, limit: int = 320) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()[:limit]


def _list(value: Any, limit: int = 8, item_limit: int = 180) -> list[str]:
    if not isinstance(value, list):
        return []
    output: list[str] = []
    for item in value:
        text = _clean(item, item_limit)
        if text and text not in output:
            output.append(text)
        if len(output) >= limit:
            break
    return output


async def _model_call(prompt: str, *, max_tokens: int = 1900) -> dict[str, Any]:
    settings = get_settings()
    if not settings.enable_llm:
        return {"ok": False, "provider": "fallback", "model": None, "error": "Local generation is disabled."}
    result = await registry.generate_json_async(
        prompt,
        model=MODEL_NAME,
        timeout=min(max(settings.ollama_timeout_seconds, 60), 105),
        num_predict=max_tokens,
        keep_alive="10m",
    )
    return result


def _collect_profile(user: dict[str, Any]) -> dict[str, Any]:
    user_id = str(user["id"])
    twin = digital_twin.ensure(user_id)
    resume = db.latest_resume(user_id)
    analysis = (resume or {}).get("analysis") or db.latest_analysis(user_id) or {}
    skills = twin.get("skills") or []
    if not skills:
        # Resume-parser results are claims until another module records evidence.
        names = analysis.get("skill_names") or []
        skills = [
            {"skill": str(name).lower(), "display": str(name), "status": "claimed", "proficiency": 0, "evidence_count": 0, "evidence": []}
            for name in names[:40]
        ]

    with db.connection() as conn:
        quest = conn.execute(
            "SELECT COUNT(DISTINCT r.id) AS runs, COUNT(a.id) AS attempts, "
            "AVG(a.score) AS average_attempt_score, MAX(a.score) AS best_attempt_score "
            "FROM career_quest_runs r LEFT JOIN career_quest_missions m ON m.run_id = r.id "
            "LEFT JOIN career_quest_attempts a ON a.mission_id = m.id WHERE r.user_id = ?",
            (user_id,),
        ).fetchone()
        quest_skills = conn.execute(
            "SELECT e.skill_key, ROUND(AVG(e.score), 1) AS score, COUNT(*) AS evidence_count "
            "FROM career_quest_skill_evidence e JOIN career_quest_runs r ON r.id = e.run_id "
            "WHERE r.user_id = ? GROUP BY e.skill_key ORDER BY score DESC LIMIT 12",
            (user_id,),
        ).fetchall()

    interviews = db.interview_history(user_id)
    completed = [item for item in interviews if item.get("status") == "COMPLETED" and item.get("score") is not None]
    projects = _list(((analysis.get("projects") or {}).get("lines") or []), 8, 240)
    education_obj = analysis.get("education") or {}
    education = _list(education_obj.get("lines") or education_obj.get("degrees") or [], 6, 200)
    sections = analysis.get("sections") or {}
    interests = _list(sections.get("interests") or [], 8, 180)
    if user.get("headline"):
        interests.append(_clean(user["headline"], 120))
    profile_summary = ((analysis.get("profile") or {}).get("summary") or user.get("bio") or "")
    if profile_summary and not interests:
        interests = [_clean(profile_summary, 220)]

    claimed = [item for item in skills if item.get("status") == "claimed"]
    demonstrated = [item for item in skills if item.get("status") == "demonstrated"]
    verified = [item for item in skills if item.get("status") == "verified"]
    source_count = sum(int(item.get("evidence_count") or 0) for item in skills)
    gaps: list[str] = []
    if not resume:
        gaps.append("No resume is available in SkillBridge.")
    if not education:
        gaps.append("Education details are missing or not extracted from the resume.")
    if not projects:
        gaps.append("No project descriptions are available in the resume analysis.")
    if not completed:
        gaps.append("No completed mock interview score is available.")
    if not int(quest["runs"] or 0):
        gaps.append("No Career Quest evidence is available.")
    if not verified:
        gaps.append("No skills currently have verified evidence in Digital Twin.")

    return {
        "profile": {
            "display_name": _clean(user.get("name") or "Student", 100),
            "headline": _clean(user.get("headline") or "", 160) or None,
            "education": education,
            "years_experience": (analysis.get("experience") or {}).get("years") or user.get("years_experience"),
            "career_goal": _clean(user.get("target_role") or analysis.get("target_role") or "", 120) or None,
            "github_url": _clean(user.get("github") or "", 240) or None,
            "github_repository_data_available": False,
            "interests": interests[:8],
            "projects": projects,
            "claimed_skills": [{"name": item.get("display", item.get("skill")), "source": "resume/profile claim"} for item in claimed[:30]],
            "demonstrated_skills": [{"name": item.get("display", item.get("skill")), "evidence_count": item.get("evidence_count", 0)} for item in demonstrated[:30]],
            "verified_skills": [{"name": item.get("display", item.get("skill")), "evidence_count": item.get("evidence_count", 0)} for item in verified[:30]],
            "skills_with_insufficient_evidence": [{"name": item.get("display", item.get("skill")), "reason": "Claimed, but no demonstration or verification is recorded."} for item in claimed[:20]],
            "experience_gaps": gaps,
            "mock_interviews": {
                "completed": len(completed),
                "scores": [{"role": item.get("role"), "score": item.get("score")} for item in completed[:8]],
                "average_score": round(sum(int(item["score"]) for item in completed) / len(completed), 1) if completed else None,
            },
            "career_quest": {
                "runs": int(quest["runs"] or 0),
                "coding_attempts": int(quest["attempts"] or 0),
                "average_coding_score": round(float(quest["average_attempt_score"]), 1) if quest["average_attempt_score"] is not None else None,
                "best_coding_score": float(quest["best_attempt_score"]) if quest["best_attempt_score"] is not None else None,
                "skill_evidence": [dict(row) for row in quest_skills],
            },
            "digital_twin": {
                "evidence_records": source_count,
                "skills": [{"name": item.get("display", item.get("skill")), "status": item.get("status"), "proficiency": item.get("proficiency"), "sources": item.get("sources", [])} for item in skills[:40]],
            },
            "source_availability": {
                "resume": bool(resume),
                "projects": bool(projects),
                "interests": bool(interests),
                "github_profile_link": bool(user.get("github")),
                "github_repository_data": False,
                "coding_assessments": int(quest["attempts"] or 0) > 0,
                "mock_interviews": bool(completed),
                "career_quest": int(quest["runs"] or 0) > 0,
            },
        },
        "skills": skills,
        "has_material_evidence": bool(resume or skills or education or projects or completed or int(quest["runs"] or 0)),
    }


def current_self(user: dict[str, Any]) -> dict[str, Any]:
    return _collect_profile(user)["profile"]


def _fallback_paths(profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Clearly labeled pathway scaffold used only when local model output is unavailable."""
    skill_names = [item["name"] for item in profile.get("demonstrated_skills", []) + profile.get("verified_skills", [])]
    claimed = [item["name"] for item in profile.get("claimed_skills", [])]
    names = skill_names + claimed
    projects = profile.get("projects", [])
    interest_text = " ".join(profile.get("interests", [])).lower()
    goals = str(profile.get("career_goal") or "").lower()
    candidates = [
        {
            "id": "future-a", "name": "The Model Cartographer", "direction": "Applied AI & machine learning engineering", "archetype": "AI Engineer",
            "personality": "Analytical and curious; tests ideas against evidence before scaling them.", "career_strategy": "Build a progression from Python and data foundations to one evaluated ML product, then learn deployment and model monitoring.",
            "technical_strengths": ["Experiment design", "Model evaluation", "Turning research into working prototypes"], "existing_skills": names[:5],
            "new_skills": ["Python for data", "Machine learning evaluation", "Model serving", "MLOps fundamentals"],
            "suggested_projects": ["Build a small, measured prediction or retrieval feature and document its baseline."], "weaknesses": ["May over-invest in model novelty before proving a user need."],
            "risks": ["Progress depends on collecting reliable data and showing repeatable evaluation."], "career_strategy_note": "Use measured project evidence to decide whether to specialize further.",
            "why_it_fits": "This is a hypothesis to explore against your recorded interests and skills; the current profile may not contain enough ML evidence.",
        },
        {
            "id": "future-b", "name": "The Systems Cartographer", "direction": "Backend and cloud systems engineering", "archetype": "Systems Architect",
            "personality": "Structured and calm under complexity; values clear interfaces, observability, and reliability.", "career_strategy": "Strengthen APIs, data modeling, testing, and cloud deployment through one service that handles realistic load and failure cases.",
            "technical_strengths": ["System decomposition", "Reliability thinking", "Pragmatic trade-offs"], "existing_skills": names[:5],
            "new_skills": ["Database design", "Distributed systems", "Cloud operations", "System design"],
            "suggested_projects": ["Extend a small service with persistent storage, tests, metrics, and a documented scaling plan."], "weaknesses": ["May optimize infrastructure before validating the product workflow."],
            "risks": ["Architecture work can be hard to demonstrate without a running service and clear measurements."], "career_strategy_note": "Publish design decisions and operational evidence alongside the code.",
            "why_it_fits": "A systems path can build on technical foundations, but the available profile evidence is limited.",
        },
        {
            "id": "future-c", "name": "The Product Pathfinder", "direction": "Product engineering and venture building", "archetype": "Innovator",
            "personality": "Experimental and user-focused; learns by shipping small versions and listening closely.", "career_strategy": "Pick a narrow user problem, ship an end-to-end product, observe usage, and improve the solution in short cycles.",
            "technical_strengths": ["Rapid prototyping", "Product judgment", "Connecting technical choices to user outcomes"], "existing_skills": names[:5],
            "new_skills": ["Product discovery", "Full-stack delivery", "Analytics and experimentation", "Clear product storytelling"],
            "suggested_projects": ["Interview a few target users, prototype a workflow, and record what changed after feedback."], "weaknesses": ["Can spread effort across too many ideas before one is finished."],
            "risks": ["Early feedback may be noisy; a small sample does not establish broad demand."], "career_strategy_note": "Use a finished product and user feedback as the next decision point.",
            "why_it_fits": "A product-building route is a useful contrast to deep specialization; more project evidence would improve this fit assessment.",
        },
    ]
    if any(word in goals + " " + interest_text for word in ("ai", "machine learning", "ml", "data")):
        candidates[0]["why_it_fits"] = "Your recorded goal or interests mention AI or data; that is a reason to test this route, not evidence of ML capability."
    if any(word in goals + " " + interest_text for word in ("backend", "cloud", "system", "platform")):
        candidates[1]["why_it_fits"] = "Your recorded goal or interests mention systems or cloud work; practical projects would test this direction."
    if any(word in goals + " " + interest_text for word in ("product", "startup", "entrepreneur", "build")):
        candidates[2]["why_it_fits"] = "Your recorded goal or interests mention product building; user feedback and shipped work would test this direction."
    for item in candidates:
        item["milestones"] = _fallback_milestones(item)
        item["supporting_evidence"] = []
    return candidates


def _fallback_milestones(path: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        "six_months": {"target": "Complete one evidence-backed foundation project", "required_skills": path["new_skills"][:3], "action": path["suggested_projects"][0], "evidence": "A runnable project, tests or evaluation notes, and a short decision log.", "effort_hours": 100, "dependencies": ["Choose a small scope and weekly schedule."]},
        "one_year": {"target": "Extend the project into a focused specialization", "required_skills": path["new_skills"][:4], "action": "Add a second iteration based on feedback or measured limitations.", "evidence": "A public or shareable demo, documented results, and one external review.", "effort_hours": 220, "dependencies": ["Finish the six-month foundation project."]},
        "three_years": {"target": "Explore an advanced role or specialization", "required_skills": path["new_skills"][:4], "action": "Choose a specialization from the work you have actually completed and reviewed.", "evidence": "A portfolio of maintained work and practical feedback from collaborators or users.", "effort_hours": 600, "dependencies": ["Build sustained project evidence and reassess your interests."]},
    }


def _generation_prompt(profile: dict[str, Any]) -> str:
    evidence = {
        "goal": profile.get("career_goal"),
        "interests": profile.get("interests", [])[:5],
        "education": profile.get("education", [])[:4],
        "projects": profile.get("projects", [])[:4],
        "claimed_skills": profile.get("claimed_skills", [])[:12],
        "demonstrated_skills": profile.get("demonstrated_skills", [])[:10],
        "verified_skills": profile.get("verified_skills", [])[:10],
        "interviews": {"completed": profile.get("mock_interviews", {}).get("completed", 0), "average_score": profile.get("mock_interviews", {}).get("average_score")},
        "career_quest": {"runs": profile.get("career_quest", {}).get("runs", 0), "coding_attempts": profile.get("career_quest", {}).get("coding_attempts", 0), "average_coding_score": profile.get("career_quest", {}).get("average_coding_score"), "skill_evidence": profile.get("career_quest", {}).get("skill_evidence", [])[:6]},
        "known_gaps": profile.get("experience_gaps", [])[:5],
    }
    return (
        "Generate 3 distinct hypothetical paths: applied AI/specialization, backend/systems, and product/innovation; adapt them to evidence. "
        "Never invent completed projects, skills, grades, experience, or assessment results. Resume-only skills remain claims. Suggested projects are future actions. "
        "Be cautious; promise no job, salary, or success. Return JSON only: {\"futures\":[3 objects]}. Each object needs id (future-a/b/c), name, direction, archetype, personality, career_strategy, "
        "technical_strengths (3), existing_skills (only supplied skills), new_skills (3), suggested_projects (2), weaknesses (1), risks (1), why_it_fits, "
        "milestones with six_months/one_year/three_years. Each milestone: target, required_skills (3), action, evidence, effort_hours integer, dependencies (1). "
        "Keep each value concise (one sentence or phrase).\nEVIDENCE:\n"
        f"{json.dumps(evidence, ensure_ascii=False, separators=(',', ':'))[:7000]}"
    )


def _supported_skill_names(profile: dict[str, Any]) -> set[str]:
    values: set[str] = set()
    for group in ("claimed_skills", "demonstrated_skills", "verified_skills"):
        for item in profile.get(group, []):
            name = item.get("name") if isinstance(item, dict) else item
            if name:
                values.add(str(name).strip().lower())
    return values


def _normalize_milestone(raw: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    try:
        hours = max(1, min(2000, int(raw.get("effort_hours", fallback["effort_hours"]))))
    except (TypeError, ValueError):
        hours = fallback["effort_hours"]
    return {
        "target": _clean(raw.get("target"), 160) or fallback["target"],
        "required_skills": _list(raw.get("required_skills"), 6, 90) or fallback["required_skills"],
        "action": _clean(raw.get("action"), 240) or fallback["action"],
        "evidence": _clean(raw.get("evidence"), 220) or fallback["evidence"],
        "effort_hours": hours,
        "dependencies": _list(raw.get("dependencies"), 4, 130) or fallback["dependencies"],
        "simulated": True,
    }


def _normalize_future(raw: Any, fallback: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    name = _clean(raw.get("name"), 80) or fallback["name"]
    fields = {
        "id": fallback["id"],
        "name": name,
        "direction": _clean(raw.get("direction"), 140) or fallback["direction"],
        "archetype": _clean(raw.get("archetype"), 80) or fallback["archetype"],
        "personality": _clean(raw.get("personality"), 220) or fallback["personality"],
        "career_strategy": _clean(raw.get("career_strategy"), 320) or fallback["career_strategy"],
        "technical_strengths": _list(raw.get("technical_strengths"), 5, 120) or fallback["technical_strengths"],
        "new_skills": _list(raw.get("new_skills"), 6, 90) or fallback["new_skills"],
        "suggested_projects": _list(raw.get("suggested_projects"), 4, 180) or fallback["suggested_projects"],
        "weaknesses": _list(raw.get("weaknesses"), 3, 180) or fallback["weaknesses"],
        "risks": _list(raw.get("risks"), 3, 180) or fallback["risks"],
        "why_it_fits": _clean(raw.get("why_it_fits"), 300) or fallback["why_it_fits"],
    }
    allowed = _supported_skill_names(profile)
    proposed_existing = _list(raw.get("existing_skills"), 12, 90)
    supported = [name for name in proposed_existing if name.lower() in allowed]
    fields["existing_skills"] = supported or [name for name in fallback["existing_skills"] if name.lower() in allowed][:8]
    fallback_milestones = _fallback_milestones(fallback)
    raw_milestones = raw.get("milestones") if isinstance(raw.get("milestones"), dict) else {}
    fields["milestones"] = {
        key: _normalize_milestone(raw_milestones.get(key), fallback_milestones[key])
        for key in ("six_months", "one_year", "three_years")
    }
    fields["supporting_evidence"] = _evidence_for_future(fields, profile)
    return fields


def _evidence_for_future(future: dict[str, Any], profile: dict[str, Any]) -> list[dict[str, str]]:
    evidence: list[dict[str, str]] = []
    for skill in future.get("existing_skills", [])[:4]:
        evidence.append({"type": "skill", "text": skill, "status": "Recorded in the profile; see its source tier."})
    for project in profile.get("projects", [])[:5]:
        if any(token in (future["direction"] + " " + " ".join(future.get("new_skills", []))).lower() for token in re.findall(r"[a-z0-9+#.]{3,}", project.lower())[:4]):
            evidence.append({"type": "project", "text": project[:180], "status": "Resume project description; not independently verified."})
            break
    if profile.get("career_goal"):
        evidence.append({"type": "goal", "text": profile["career_goal"], "status": "User-stated target role."})
    return evidence


def _similarity(left: str, right: str) -> float:
    if not left.strip() or not right.strip():
        return 0.5
    try:
        import numpy as np

        vectors = registry.embed([left[:1800], right[:1800]])
        return max(0.0, min(1.0, (float(np.dot(vectors[0], vectors[1])) - 0.08) / 0.72))
    except Exception as exc:  # noqa: BLE001
        logger.info("Embedding comparison fell back to token overlap: %s", exc)
        a = set(re.findall(r"[a-z0-9+#.]{3,}", left.lower()))
        b = set(re.findall(r"[a-z0-9+#.]{3,}", right.lower()))
        return len(a & b) / max(1, len(a | b))


def _comparison(futures: list[dict[str, Any]], profile: dict[str, Any], skills: list[dict[str, Any]]) -> dict[str, Any]:
    status_by_name = {str(item.get("display") or item.get("skill") or "").lower(): item.get("status", "claimed") for item in skills}
    interest_text = " ".join(profile.get("interests", []))
    goal = profile.get("career_goal") or ""
    project_text = " ".join(profile.get("projects", []))
    results = []
    for future in futures:
        skill_names = list(dict.fromkeys(future.get("existing_skills", []) + future.get("new_skills", [])))
        evidence_values = []
        missing = []
        for name in skill_names:
            lower = name.lower()
            status = status_by_name.get(lower)
            if status is None:
                # A claimed spelling can differ from the twin's canonical display name.
                matching = next((value for key, value in status_by_name.items() if key in lower or lower in key), None)
                status = matching
            if status:
                evidence_values.append(TIER_WEIGHT.get(status, 0.2))
            else:
                evidence_values.append(0.0)
                missing.append(name)
        evidence_fit = sum(evidence_values) / max(1, len(evidence_values))
        interest_fit = _similarity(interest_text, future["direction"] + " " + " ".join(future.get("new_skills", [])))
        goal_fit = _similarity(goal, future["direction"]) if goal else 0.5
        project_fit = _similarity(project_text, future["direction"] + " " + " ".join(future.get("suggested_projects", [])))
        score = round(100 * (0.55 * evidence_fit + 0.25 * interest_fit + 0.15 * goal_fit + 0.05 * project_fit))
        results.append({
            "future_id": future["id"], "alignment_score": max(0, min(100, score)),
            "score_components": {"current_evidence": round(evidence_fit * 100), "semantic_interest_fit": round(interest_fit * 100), "career_goal_fit": round(goal_fit * 100), "project_semantic_fit": round(project_fit * 100)},
            "supported_skills": [name for name, value in zip(skill_names, evidence_values) if value > 0],
            "missing_competencies": missing[:10],
            "learning_effort_hours": min(2000, len(missing) * 28 + len(future.get("suggested_projects", [])) * 36 + 24),
            "opportunities": future.get("technical_strengths", [])[:3],
            "risks": future.get("risks", [])[:3],
            "uncertainties": ["A heuristic fit score is not a validated prediction.", "Your profile may omit relevant evidence or interests."],
        })
    return {
        "method": "Heuristic: 55% evidence-weighted skill overlap (verified 1.0, demonstrated 0.8, claimed 0.35), 25% MiniLM semantic interest fit, 15% semantic goal fit, and 5% semantic project fit.",
        "scores_are_predictions": False,
        "embedding_model": "sentence-transformers/all-MiniLM-L6-v2 (token-overlap fallback if unavailable)",
        "paths": results,
    }


async def _new_simulation(user: dict[str, Any]) -> dict[str, Any]:
    collected = _collect_profile(user)
    profile = collected["profile"]
    fallbacks = _fallback_paths(profile)
    prompt = _generation_prompt(profile)
    generated = await _model_call(prompt, max_tokens=1800)
    model_futures = (generated.get("data") or {}).get("futures") if generated.get("ok") else None
    ai_generated = isinstance(model_futures, list) and len(model_futures) == 3
    futures = [
        _normalize_future(model_futures[index] if ai_generated else {}, fallbacks[index], profile)
        for index in range(3)
    ]
    comparison = _comparison(futures, profile, collected["skills"])
    if not collected["has_material_evidence"]:
        profile["simulation_limit"] = "Very limited: no resume, skill evidence, assessments, or project data were found. These are general career hypotheses, not a sample candidate."
    else:
        profile["simulation_limit"] = "Personalized to evidence currently stored in your SkillBridge account. Missing profile data narrows the analysis."
    session_id = f"pu-{uuid.uuid4().hex[:16]}"
    provider = "ollama" if ai_generated else "evidence_based_fallback"
    model = generated.get("model") if ai_generated else None
    _ensure_schema()
    with db.connection() as conn:
        conn.execute(
            "INSERT INTO parallel_universe_sessions (id,user_id,profile_json,futures_json,comparison_json,model,provider,created_at) VALUES (?,?,?,?,?,?,?,?)",
            (session_id, str(user["id"]), json.dumps(profile), json.dumps(futures), json.dumps(comparison), model, provider, db.utcnow()),
        )
    return {
        "id": session_id, "profile": profile, "futures": futures, "comparison": comparison,
        "provider": provider, "model": model, "created_at": db.utcnow(), "simulation_notice": SIMULATION_NOTICE,
        "ai_note": None if ai_generated else "The local model could not produce a valid response; this session uses a clearly labeled evidence-based pathway scaffold.",
    }


async def create_simulation(user: dict[str, Any]) -> dict[str, Any]:
    return await _new_simulation(user)


def list_simulations(user_id: str) -> list[dict[str, Any]]:
    _ensure_schema()
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT s.id,s.provider,s.model,s.created_at,s.profile_json,s.futures_json,d.result_json AS debate_json "
            "FROM parallel_universe_sessions s LEFT JOIN parallel_universe_debates d ON d.id=(SELECT id FROM parallel_universe_debates WHERE session_id=s.id ORDER BY created_at DESC LIMIT 1) "
            "WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 20", (user_id,),
        ).fetchall()
    return [{"id": row["id"], "provider": row["provider"], "model": row["model"], "created_at": row["created_at"], "future_names": [item.get("name") for item in _decoded(row["futures_json"], [])], "has_debate": bool(row["debate_json"])} for row in rows]


def get_simulation(user_id: str, session_id: str) -> dict[str, Any] | None:
    _ensure_schema()
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM parallel_universe_sessions WHERE id=? AND user_id=?", (session_id, user_id)).fetchone()
        if not row:
            return None
        debate = conn.execute("SELECT result_json FROM parallel_universe_debates WHERE session_id=? AND user_id=? ORDER BY created_at DESC LIMIT 1", (session_id, user_id)).fetchone()
        scenarios = conn.execute("SELECT id,decision_text,result_json,created_at FROM parallel_universe_scenarios WHERE session_id=? AND user_id=? ORDER BY created_at DESC", (session_id, user_id)).fetchall()
    return {
        "id": row["id"], "profile": _decoded(row["profile_json"], {}), "futures": _decoded(row["futures_json"], []),
        "comparison": _decoded(row["comparison_json"], {}), "provider": row["provider"], "model": row["model"], "created_at": row["created_at"],
        "debate": _decoded(debate["result_json"], None) if debate else None,
        "scenarios": [{"id": item["id"], "decision": item["decision_text"], "result": _decoded(item["result_json"], {}), "created_at": item["created_at"]} for item in scenarios],
        "simulation_notice": SIMULATION_NOTICE,
    }


def _fallback_debate(futures: list[dict[str, Any]], profile: dict[str, Any]) -> dict[str, Any]:
    evidence = [item.get("name") for item in profile.get("verified_skills", []) + profile.get("demonstrated_skills", [])]
    evidence_text = ", ".join(evidence[:4]) if evidence else "there is little demonstrated or verified skill evidence yet"
    turns = []
    for future in futures:
        turns.append({"future_id": future["id"], "agent_name": future["name"], "argument": f"I would explore {future['direction']} because {future['why_it_fits']}", "challenge": f"My risk is {future['risks'][0] if future.get('risks') else 'the available evidence may not support this direction yet'}", "question": f"What project could you finish in the next month to test {future['direction']}?"})
    return {"turns": turns, "summary": {"best_arguments": [f"{future['name']}: {future['career_strategy'][:180]}" for future in futures], "disagreements": ["The profiles prioritize specialization, reliability, and user outcomes differently."], "tradeoffs": [f"Current evidence includes {evidence_text}; build a small project to gather stronger evidence before specializing."], "next_action": "Choose one two-week project that creates visible evidence for two paths, then review which work you want to continue.", "uncertainties": profile.get("experience_gaps", [])[:5] or ["These scenarios do not predict employment or career outcomes."]}}


async def run_debate(user: dict[str, Any], session_id: str) -> dict[str, Any] | None:
    simulation = get_simulation(str(user["id"]), session_id)
    if not simulation:
        return None
    futures = simulation["futures"]
    profile = simulation["profile"]
    payload = {
        "evidence": {key: profile.get(key) for key in ("career_goal", "interests", "projects", "claimed_skills", "demonstrated_skills", "verified_skills", "experience_gaps")},
        "futures": [{key: item.get(key) for key in ("id", "name", "direction", "personality", "career_strategy", "why_it_fits", "weaknesses", "risks")} for item in futures],
    }
    prompt = (
        "Run one short, three-agent career debate grounded only in this evidence and these simulated paths. "
        "Each future self must speak once in its own voice, challenge a different agent's assumption, cite a supplied fact or plainly say evidence is missing, and ask the student one difficult question. "
        "Make disagreement real: AI focuses on experiment quality and model evidence; systems focuses on fundamentals, reliability, and maintainability; product focuses on user need and finishing work. "
        "Do not invent user achievements. Finish with a balanced synthesis, trade-offs, next action, and uncertainties. No agent may claim to know the student's actual future. "
        "Return JSON: turns array (future_id,agent_name,argument,challenge,question); summary object (best_arguments array, disagreements array, tradeoffs array, next_action string, uncertainties array). Keep it compact.\n"
        + json.dumps(payload, ensure_ascii=False)[:10000]
    )
    generated = await _model_call(prompt, max_tokens=1000)
    data = generated.get("data") if generated.get("ok") else None
    if not isinstance(data, dict):
        data = _fallback_debate(futures, profile)
        provider, model = "evidence_based_fallback", None
    else:
        turns_in = data.get("turns") if isinstance(data.get("turns"), list) else []
        turns_by_id = {str(item.get("future_id")): item for item in turns_in if isinstance(item, dict)}
        turns = []
        for future in futures:
            item = turns_by_id.get(future["id"], {})
            fallback = _fallback_debate([future], profile)["turns"][0]
            turns.append({"future_id": future["id"], "agent_name": future["name"], "argument": _clean(item.get("argument"), 600) or fallback["argument"], "challenge": _clean(item.get("challenge"), 400) or fallback["challenge"], "question": _clean(item.get("question"), 260) or fallback["question"]})
        summary_in = data.get("summary") if isinstance(data.get("summary"), dict) else {}
        fb = _fallback_debate(futures, profile)["summary"]
        data = {"turns": turns, "summary": {
            "best_arguments": _list(summary_in.get("best_arguments"), 4, 260) or fb["best_arguments"],
            "disagreements": _list(summary_in.get("disagreements"), 5, 240) or fb["disagreements"],
            "tradeoffs": _list(summary_in.get("tradeoffs"), 5, 240) or fb["tradeoffs"],
            "next_action": _clean(summary_in.get("next_action"), 320) or fb["next_action"],
            "uncertainties": _list(summary_in.get("uncertainties"), 5, 200) or fb["uncertainties"],
        }}
        provider, model = "ollama", generated.get("model")
    data.update({"provider": provider, "model": model, "notice": SIMULATION_NOTICE})
    _ensure_schema()
    debate_id = f"deb-{uuid.uuid4().hex[:16]}"
    with db.connection() as conn:
        conn.execute("INSERT INTO parallel_universe_debates (id,session_id,user_id,result_json,created_at) VALUES (?,?,?,?,?)", (debate_id, session_id, str(user["id"]), json.dumps(data), db.utcnow()))
    return data


def _fallback_decision(decision: str, futures: list[dict[str, Any]]) -> dict[str, Any]:
    outcomes = []
    for future in futures:
        similarity = _similarity(decision, future["direction"] + " " + " ".join(future.get("new_skills", [])))
        stance = "supports" if similarity >= 0.55 else "questions"
        outcomes.append({"future_id": future["id"], "stance": stance, "impact": "high" if similarity >= .62 else "medium" if similarity >= .38 else "low", "skills_developed": _list(future.get("new_skills", []), 3, 80), "tradeoff": "This decision uses time that could go to another path; review progress before extending the commitment.", "timeline_update": f"Treat this as a short experiment: collect one project or assessment artifact connected to {future['direction']} and reassess in four weeks."})
    return {"decision": decision, "outcomes": outcomes, "opportunity_cost": "Time committed here is unavailable for a different skill or project; the best choice depends on evidence gathered and your interest after trying it.", "review_point": "Review the experiment after four weeks using a completed artifact and what you learned.", "scenario_revision": True}


async def simulate_decision(user: dict[str, Any], session_id: str, decision: str) -> dict[str, Any] | None:
    simulation = get_simulation(str(user["id"]), session_id)
    if not simulation:
        return None
    futures = simulation["futures"]
    profile = simulation["profile"]
    payload = {"hypothetical_decision": decision, "career_goal": profile.get("career_goal"), "evidence": {key: profile.get(key) for key in ("interests", "claimed_skills", "demonstrated_skills", "verified_skills", "experience_gaps")}, "paths": [{key: item.get(key) for key in ("id", "name", "direction", "new_skills", "milestones")} for item in futures]}
    prompt = (
        "Simulate this hypothetical choice against all three paths. It must not update actual student skills, assessments, or progress. "
        "For each path, judge whether it supports or questions the choice, name only skills the choice can reasonably develop, explain an opportunity cost, and propose a hypothetical timeline adjustment. "
        "Keep every judgment conditional; do not guarantee outcomes or invent completed actions. Return JSON with outcomes array (future_id,stance [supports|neutral|questions],impact [high|medium|low],skills_developed,tradeoff,timeline_update), opportunity_cost, review_point.\n"
        + json.dumps(payload, ensure_ascii=False)[:10000]
    )
    generated = await _model_call(prompt, max_tokens=900)
    data = generated.get("data") if generated.get("ok") else None
    provider = "ollama" if isinstance(data, dict) else "evidence_based_fallback"
    if not isinstance(data, dict):
        data = _fallback_decision(decision, futures)
    else:
        incoming = data.get("outcomes") if isinstance(data.get("outcomes"), list) else []
        by_id = {str(item.get("future_id")): item for item in incoming if isinstance(item, dict)}
        fallback = _fallback_decision(decision, futures)
        fallback_by_id = {item["future_id"]: item for item in fallback["outcomes"]}
        outcomes = []
        for future in futures:
            item = by_id.get(future["id"], {})
            default = fallback_by_id[future["id"]]
            stance = item.get("stance") if item.get("stance") in {"supports", "neutral", "questions"} else default["stance"]
            impact = item.get("impact") if item.get("impact") in {"high", "medium", "low"} else default["impact"]
            outcomes.append({"future_id": future["id"], "stance": stance, "impact": impact, "skills_developed": _list(item.get("skills_developed"), 4, 90) or default["skills_developed"], "tradeoff": _clean(item.get("tradeoff"), 280) or default["tradeoff"], "timeline_update": _clean(item.get("timeline_update"), 300) or default["timeline_update"]})
        data = {"decision": decision, "outcomes": outcomes, "opportunity_cost": _clean(data.get("opportunity_cost"), 360) or fallback["opportunity_cost"], "review_point": _clean(data.get("review_point"), 260) or fallback["review_point"], "scenario_revision": True}
    # Each revision remains separate from the original heuristic comparison.
    baseline = {item["future_id"]: item["alignment_score"] for item in simulation["comparison"].get("paths", [])}
    for outcome in data["outcomes"]:
        future = next(item for item in futures if item["id"] == outcome["future_id"])
        relevance = _similarity(decision, future["direction"] + " " + " ".join(future.get("new_skills", [])))
        delta = round((relevance - 0.5) * 10)
        outcome["baseline_alignment"] = baseline.get(outcome["future_id"], 0)
        outcome["scenario_alignment"] = max(0, min(100, outcome["baseline_alignment"] + delta))
        outcome["alignment_delta"] = delta
        outcome["timeline_is_hypothetical"] = True
    data.update({"provider": provider, "model": generated.get("model") if provider == "ollama" else None, "notice": SIMULATION_NOTICE})
    _ensure_schema()
    scenario_id = f"scn-{uuid.uuid4().hex[:16]}"
    with db.connection() as conn:
        conn.execute("INSERT INTO parallel_universe_scenarios (id,session_id,user_id,decision_text,result_json,created_at) VALUES (?,?,?,?,?,?)", (scenario_id, session_id, str(user["id"]), decision, json.dumps(data), db.utcnow()))
    data["scenario_id"] = scenario_id
    return data

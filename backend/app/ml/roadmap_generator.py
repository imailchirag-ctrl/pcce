"""Personalized learning roadmap generation with Qwen enrichment."""

from __future__ import annotations

import time
from typing import Any

from app.ml.job_recommender import recommend_courses, recommend_projects
from app.ml.skill_taxonomy import display_name, role_profile

SYSTEM = (
    "You are SkillBridge AI, a career coach. Use only the supplied skill gaps. "
    "Return valid JSON with this shape: {\"weekly_focus\":[...],\"items\":[{\"skill\":string,"
    "\"why_it_matters\":string,\"practice_task\":string,\"estimated_hours\":number}]}. "
    "Be concrete, concise, and never promise a job."
)


def generate_roadmap(
    missing_skills: list[str],
    target_role: str = "software engineer",
    *,
    use_llm: bool = True,
    learner_context: str = "",
) -> dict[str, Any]:
    started = time.perf_counter()
    role = role_profile(target_role)
    courses = recommend_courses(missing_skills)
    projects = recommend_projects(missing_skills, role["title"])

    deterministic_items = []
    for index, course in enumerate(courses):
        skill_key = course["skill_key"]
        deterministic_items.append(
            {
                "id": f"gap-{index + 1}",
                "skill": course["skill"],
                "skill_key": skill_key,
                "title": f"Build practical {course['skill']} evidence",
                "objective": f"Close the {course['skill']} gap for a {role['title']} role.",
                "why_it_matters": f"{course['skill']} appears in the target role requirements and is not yet evidenced in the resume.",
                "resource": course["title"],
                "resource_url": course["url"],
                "provider": course["provider"],
                "difficulty": course["level"],
                "estimated_hours": course["duration_hours"],
                "practice_task": f"Create a small, reviewable artifact that demonstrates {course['skill']}.",
                "completed": False,
            }
        )

    llm_payload: dict[str, Any] | None = None
    llm_meta: dict[str, Any] = {"provider": "deterministic", "used_llm": False, "elapsed_ms": 0}
    if use_llm and missing_skills:
        prompt = (
            f"Target role: {role['title']}. Gaps: {', '.join(display_name(skill) for skill in missing_skills[:8])}. "
            f"Learner context: {learner_context[:900] or 'not supplied'}. "
            "Explain why each gap matters and give one specific practice task. Keep each field under 35 words. "
            "Also return 3 weekly focus statements."
        )
        result = registry_generate(prompt)
        llm_meta = {
            "provider": result.get("provider"),
            "used_llm": bool(result.get("ok")),
            "model": result.get("model"),
            "elapsed_ms": result.get("elapsed_ms", 0),
            "error": result.get("error"),
        }
        if result.get("ok") and isinstance(result.get("data"), dict):
            llm_payload = result["data"]

    if llm_payload:
        by_skill = {
            str(item.get("skill", "")).strip().lower(): item
            for item in llm_payload.get("items", [])
            if isinstance(item, dict)
        }
        for item in deterministic_items:
            enriched = by_skill.get(item["skill"].lower()) or by_skill.get(item["skill_key"])
            if enriched:
                item["why_it_matters"] = str(enriched.get("why_it_matters") or item["why_it_matters"])[:400]
                item["practice_task"] = str(enriched.get("practice_task") or item["practice_task"])[:400]
                try:
                    hours = int(enriched.get("estimated_hours") or item["estimated_hours"])
                    item["estimated_hours"] = max(2, min(40, hours))
                except (TypeError, ValueError):
                    pass

    weekly_focus = [
        f"Complete the first two {display_name(skill)} practice tasks."
        for skill in missing_skills[:2]
    ]
    if llm_payload and isinstance(llm_payload.get("weekly_focus"), list):
        weekly_focus = [str(item)[:160] for item in llm_payload["weekly_focus"]][:4] or weekly_focus
    if not weekly_focus:
        weekly_focus = ["Refresh your resume with measurable outcomes.", "Practice one mock interview answer."]

    return {
        "target_role": role["title"],
        "items": deterministic_items,
        "courses": courses,
        "projects": projects,
        "weekly_focus": weekly_focus,
        "total_hours": sum(item["estimated_hours"] for item in deterministic_items),
        "provider": llm_meta.get("provider") or "deterministic",
        "llm": llm_meta,
        "inference_ms": round((time.perf_counter() - started) * 1000, 1),
        "notice": (
            "Course links point to free public resources. The roadmap is coaching guidance, not a guarantee of employment."
        ),
    }


def registry_generate(prompt: str) -> dict[str, Any]:
    from app.ml.model_registry import registry

    return registry.generate_json(prompt, system=SYSTEM, timeout=55, num_predict=420)

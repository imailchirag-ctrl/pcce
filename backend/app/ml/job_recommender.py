"""Semantic job matching and course recommendations."""

from __future__ import annotations

import time
from typing import Any

from app.db import list_jobs
from app.ml.model_registry import registry
from app.ml.skill_extractor import extract_skills_semantic, match_skills, semantic_similarity
from app.ml.skill_taxonomy import LEARNING_RESOURCES, display_name


def rank_jobs(
    candidate_skills: list[str],
    resume_text: str = "",
    jobs: list[dict[str, Any]] | None = None,
    *,
    limit: int = 12,
    use_reranker: bool = False,
) -> dict[str, Any]:
    started = time.perf_counter()
    available_jobs = jobs if jobs is not None else list_jobs()
    skills = list(dict.fromkeys(candidate_skills))
    if not skills and resume_text.strip():
        skills = extract_skills_semantic(resume_text)

    ranked: list[dict[str, Any]] = []
    documents: list[str] = []
    for job in available_jobs:
        required = job.get("required_skills") or extract_skills_semantic(job.get("description", ""))
        match = match_skills(skills, required)
        semantic = semantic_similarity(resume_text, job.get("description", "")) * 100 if resume_text.strip() else 0.0
        coverage = match["weighted_coverage"]
        # Skills dominate because they are explainable; semantic similarity adds
        # context from the full resume and job description.
        score = coverage * 0.72 + semantic * 0.23 + min(100, len(match["matched"]) * 4) * 0.05
        documents.append(job.get("description", ""))
        ranked.append(
            {
                **job,
                "match_percent": round(max(0, min(100, score)), 1),
                "skill_coverage": coverage,
                "semantic_similarity": round(semantic, 1),
                "matched_skills": [item["display"] for item in match["matched"]],
                "partial_skills": [
                    {"skill": item["display"], "confidence": item["confidence"]}
                    for item in match["partial"][:6]
                ],
                "missing_skills": [item["display"] for item in match["missing"][:6]],
                "matched_skill_keys": match["matched_names"],
                "missing_skill_keys": match["missing_names"],
                "explainability": {
                    "method": "minilm_semantic_skill_match",
                    "weights": {"skill_coverage": 0.72, "semantic_similarity": 0.23, "coverage_bonus": 0.05},
                },
            }
        )

    rerank_info: dict[str, Any] = {"method": "disabled"}
    if use_reranker and resume_text.strip():
        rerank_info = registry.rerank(resume_text[:4000], [doc[:4000] for doc in documents], top_k=len(ranked))
        if rerank_info.get("scores"):
            score_map = {item["index"]: item["score"] for item in rerank_info["scores"]}
            for index, job in enumerate(ranked):
                rerank_score = score_map.get(index, 0.0)
                job["rerank_score"] = round(rerank_score, 4)
                job["match_percent"] = round(job["match_percent"] * 0.75 + _sigmoid(rerank_score) * 100 * 0.25, 1)
            ranked.sort(key=lambda item: item.get("rerank_score", -999), reverse=True)

    ranked.sort(key=lambda item: item["match_percent"], reverse=True)
    return {
        "jobs": ranked[:limit],
        "count": len(ranked),
        "candidate_skills": [display_name(skill) for skill in skills],
        "method": "semantic_hybrid",
        "reranker": rerank_info,
        "inference_ms": round((time.perf_counter() - started) * 1000, 1),
        "notice": "Match percentage is an explainable coaching aid, not a hiring probability.",
    }


def recommend_courses(missing_skills: list[str], limit: int = 12) -> list[dict[str, Any]]:
    courses: list[dict[str, Any]] = []
    for index, raw_skill in enumerate(missing_skills[:limit]):
        skill = raw_skill.lower()
        resource = LEARNING_RESOURCES.get(skill)
        if not resource:
            resource = {
                "title": f"{display_name(skill)} foundations",
                "provider": "Official documentation and free practice",
                "url": None,
            }
        courses.append(
            {
                "id": f"course-{index + 1}",
                "title": resource["title"],
                "provider": resource["provider"],
                "url": resource.get("url"),
                "skill": display_name(skill),
                "skill_key": skill,
                "price": "Free",
                "level": "Beginner" if index < 2 else "Intermediate",
                "duration_hours": 4 if index < 2 else 6,
                "reason": f"Addresses the detected gap in {display_name(skill)}.",
            }
        )
    return courses


def recommend_projects(missing_skills: list[str], target_role: str = "software engineer") -> list[dict[str, Any]]:
    focus = [display_name(skill) for skill in missing_skills[:3]]
    focus_text = ", ".join(focus) if focus else "your core role skills"
    return [
        {
            "title": f"Portfolio project for {target_role.title()}",
            "description": f"Build a small end-to-end project that demonstrates {focus_text}. Ship it with a README, tests, and a short demo video.",
            "skills": focus,
            "estimated_hours": 10,
            "difficulty": "Intermediate",
        },
        {
            "title": "Measurable impact case study",
            "description": "Pick one existing project and document the problem, your decisions, trade-offs, and a measurable outcome.",
            "skills": focus[:2],
            "estimated_hours": 3,
            "difficulty": "Beginner",
        },
    ]


def _sigmoid(value: float) -> float:
    import math

    return 1 / (1 + math.exp(-value))

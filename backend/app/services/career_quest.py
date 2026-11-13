"""Career Quest catalog projections, state transitions, scoring, and attempts."""

from __future__ import annotations

import hashlib
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.errors import DomainError
from app.repositories import career_quest as repository
from app.core.config import get_settings
from app.services import career_quest_catalog as catalog
from app.services import career_quest_ai
from app.services.career_quest_runner import (
    Judge0Client,
    RunnerExecutionError,
    RunnerUnavailable,
)
from app.realtime import hub

logger = logging.getLogger("skillbridge.career_quest")

MAX_SOURCE_BYTES = 16_000
MAX_ATTEMPTS_PER_MISSION = 8
MAX_PENDING_ATTEMPTS = 4
MIN_COMPLETION_TEST_SCORE = 70
DIFFICULTY_XP_MULTIPLIER = {"beginner": 1.0, "intermediate": 1.15, "advanced": 1.3}

_runner_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="career-quest-runner")
_runner_slots = threading.BoundedSemaphore(MAX_PENDING_ATTEMPTS)


def _candidate_only(user: dict[str, Any]) -> None:
    if user.get("role") != "candidate":
        raise DomainError(403, "forbidden", "Career Quest is available to candidate accounts.")


def _owned_run(run_id: str, user_id: str) -> dict[str, Any]:
    run = repository.fetch_run(run_id, user_id)
    if not run:
        raise DomainError(404, "not_found", "Career Quest run not found.")
    return run


def _mission_row(run: dict[str, Any], mission_id: str) -> dict[str, Any]:
    for mission in run["missions"]:
        if mission["id"] == mission_id:
            return mission
    raise DomainError(404, "not_found", "Mission not found in this run.")


def _active_mission(run: dict[str, Any], mission_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    if run["status"] != "IN_PROGRESS":
        raise DomainError(409, "invalid_state", "This run is no longer in progress.")
    row = _mission_row(run, mission_id)
    if row["status"] != "AVAILABLE":
        raise DomainError(409, "invalid_state", "That mission is not currently available.")
    mission = catalog.MISSION_BY_KEY.get(row["template_key"])
    if not mission:
        raise DomainError(409, "invalid_state", "The mission catalog version is no longer available.")
    return row, mission


def _public_attempt(attempt: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": attempt["id"],
        "mission_id": attempt.get("mission_id"),
        "attempt_number": attempt["attempt_number"],
        "status": attempt["status"],
        "score": attempt.get("score"),
        "result": attempt.get("result_summary"),
        "created_at": attempt["created_at"],
        "updated_at": attempt["updated_at"],
    }


def _public_run(run: dict[str, Any]) -> dict[str, Any]:
    missions = []
    for row in run["missions"]:
        template = catalog.MISSION_BY_KEY.get(row["template_key"])
        if not template:
            continue
        missions.append(
            {
                "id": row["id"],
                "sequence": row["sequence"],
                "status": row["status"],
                "started_at": row["started_at"],
                "completed_at": row["completed_at"],
                "mission": catalog.public_mission(template, run["difficulty"]),
                "score": row["score"],
            }
        )
    available = next((item for item in missions if item["status"] == "AVAILABLE"), None)
    interactions = []
    for item in run["interactions"]:
        metadata = item.get("metadata") or {}
        interactions.append(
            {
                "id": item["id"],
                "mission_id": item["mission_id"],
                "actor": item["actor"],
                "type": item["interaction_type"],
                "content": item["content"],
                "choices": metadata.get("choices", []),
                "provider": metadata.get("provider", "authored_scenario"),
                "created_at": item["created_at"],
            }
        )
    attempts = [_public_attempt(item) for item in run["attempts"]]
    return {
        "id": run["id"],
        "career_key": run["career_key"],
        "career_title": catalog.CAREER["title"],
        "difficulty": run["difficulty"],
        "status": run["status"],
        "catalog_version": run["catalog_version"],
        "company": catalog.COMPANY,
        "started_at": run["started_at"],
        "updated_at": run["updated_at"],
        "completed_at": run["completed_at"],
        "progress": {
            "completed": sum(item["status"] == "COMPLETED" for item in missions),
            "total": len(missions),
            "percent": round(
                sum(item["status"] == "COMPLETED" for item in missions) / max(1, len(missions)) * 100
            ),
        },
        "current_mission_id": available["id"] if available else None,
        "missions": missions,
        "interactions": interactions,
        "attempts": attempts,
        "report_available": run["status"] == "COMPLETED",
    }


def get_catalog() -> dict[str, Any]:
    return {
        "catalog_version": catalog.CATALOG_VERSION,
        "careers": [catalog.CAREER, *catalog.FUTURE_CAREERS],
        "difficulties": catalog.DIFFICULTIES,
        "mission_types": ["debugging", "feature", "incident", "boss"],
        "duration_minutes": sum(item["timebox_minutes"] for item in catalog.MISSIONS),
        "practice_notice": (
            "Career Quest is a practice simulation. Its scores describe evidence from these missions, "
            "not hiring probability or a definitive measure of job readiness."
        ),
        "ai_status": career_quest_ai.status_summary(),
    }


def start_run(user: dict[str, Any], career_key: str, difficulty: str) -> dict[str, Any]:
    _candidate_only(user)
    if career_key != catalog.CAREER["key"]:
        raise DomainError(422, "unsupported_career", "That career is not available yet.")
    if difficulty not in catalog.DIFFICULTIES:
        raise DomainError(422, "invalid_difficulty", "Choose Beginner, Intermediate, or Advanced.")
    run_id = repository.create_run(
        user["id"],
        career_key,
        difficulty,
        [
            {
                "key": item["key"],
                "version": item["version"],
                "type": item["type"],
                "manager_opening": item["manager_opening"],
                "catalog_version": catalog.CATALOG_VERSION,
            }
            for item in catalog.MISSIONS
        ],
    )
    hub.publish(user["id"], "career_quest.run", {"run_id": run_id, "status": "IN_PROGRESS"})
    return _public_run(_owned_run(run_id, user["id"]))


def list_user_runs(user: dict[str, Any]) -> list[dict[str, Any]]:
    _candidate_only(user)
    runs = repository.list_runs(user["id"])
    titles = {item["key"]: item["title"] for item in catalog.MISSIONS}
    result = []
    for run in runs:
        detailed = repository.fetch_run(run["id"], user["id"])
        current = next((item for item in detailed["missions"] if item["status"] == "AVAILABLE"), None)
        result.append(
            {
                **run,
                "career_title": catalog.CAREER["title"],
                "current_mission_title": titles.get(current["template_key"]) if current else None,
                "resume_allowed": run["status"] == "IN_PROGRESS",
            }
        )
    return result


def get_run(user: dict[str, Any], run_id: str) -> dict[str, Any]:
    _candidate_only(user)
    return _public_run(_owned_run(run_id, user["id"]))


def get_progression(user: dict[str, Any]) -> dict[str, Any]:
    _candidate_only(user)
    return repository.progression(user["id"])


def _manager_reply(
    mission: dict[str, Any],
    action: str,
    choices: list[str],
    player_text: str,
    history: list[dict[str, Any]] | None = None,
) -> tuple[str, str]:
    settings = get_settings()
    action_summary = ", ".join(choices) if action == "decision" else action.replace("_", " ")
    try:
        response = career_quest_ai.manager_reply(
            model=settings.career_quest_manager_model,
            fallback_model=settings.career_quest_fallback_model,
            manager_name=catalog.COMPANY["manager"]["name"],
            mission_title=mission["title"],
            mission_brief=mission["brief"],
            authored_fallback=mission["manager_fallback"],
            action_summary=action_summary,
            player_text=player_text,
            history=[
                {
                    "actor": item.get("actor", "manager"),
                    "type": item.get("interaction_type", "message"),
                    "content": str(item.get("content", ""))[:280],
                }
                for item in (history or [])[-6:]
            ],
        )
        return response["provider"], response["message"]
    except Exception as exc:
        logger.warning("Career Quest manager dialogue fell back after %s.", type(exc).__name__)
    if action == "decision" and any(key in {"patch_without_tests", "ship_without_tests", "increase_capacity"} for key in choices):
        return (
            "authored_scenario",
            "I see the fast path you chose. Before we ship, check the evidence and confirm the change is safe for clinics.",
        )
    return "authored_scenario", mission["manager_fallback"]


def add_interaction(
    user: dict[str, Any],
    run_id: str,
    mission_id: str,
    *,
    action: str,
    choices: list[str],
    text: str | None,
) -> dict[str, Any]:
    _candidate_only(user)
    run = _owned_run(run_id, user["id"])
    _, mission = _active_mission(run, mission_id)
    evidence = repository.mission_evidence(run_id, mission_id)
    selected = list(dict.fromkeys(choices))

    if action == "decision":
        if not selected or text:
            raise DomainError(422, "invalid_interaction", "Choose one or more listed actions.")
        allowed = {item["key"] for item in mission["decisions"]}
        if any(key not in allowed for key in selected):
            raise DomainError(422, "invalid_interaction", "One of the selected actions is not available.")
        if any(item["interaction_type"] == "decision" for item in evidence["interactions"]):
            raise DomainError(409, "already_submitted", "A decision has already been recorded for this mission.")
        if mission["type"] == "incident" and len(selected) < 2:
            raise DomainError(422, "invalid_interaction", "Choose at least two actions for the incident response.")
        labels = {item["key"]: item["label"] for item in mission["decisions"]}
        content = "; ".join(labels[key] for key in selected)
        repository.add_interaction(
            run_id, mission_id, "player", "decision", content,
            {"choices": selected},
        )
        requirement_change = mission.get("requirement_change")
        already_changed = any(
            item["interaction_type"] == "requirement_change" for item in evidence["interactions"]
        )
        if requirement_change and not already_changed:
            repository.add_interaction(
                run_id, mission_id, "manager", "requirement_change", requirement_change,
                {"provider": "authored_scenario"},
            )
    elif action == "reflection":
        if choices or not text or len(text.strip()) < 12:
            raise DomainError(422, "invalid_interaction", "Write at least 12 characters about your reasoning.")
        if sum(item["interaction_type"] == "reflection" for item in evidence["interactions"]) >= 5:
            raise DomainError(429, "interaction_limit", "The reflection limit for this mission has been reached.")
        content = text.strip()
        repository.add_interaction(run_id, mission_id, "player", "reflection", content)
    else:
        if choices or not text or not text.strip():
            raise DomainError(422, "invalid_interaction", "Write a short message for your manager.")
        if sum(item["interaction_type"] == "manager_message" for item in evidence["interactions"]) >= 8:
            raise DomainError(429, "interaction_limit", "The manager conversation limit for this mission has been reached.")
        content = text.strip()
        repository.add_interaction(run_id, mission_id, "player", "manager_message", content)

    provider, reply = _manager_reply(
        mission,
        action,
        selected,
        content,
        history=evidence["interactions"],
    )
    repository.add_interaction(
        run_id,
        mission_id,
        "manager",
        "manager_reply",
        reply,
        {"provider": provider},
    )
    hub.publish(user["id"], "career_quest.mission", {"run_id": run_id, "mission_id": mission_id})
    return get_run(user, run_id)


def _attempt_capacity() -> bool:
    return _runner_slots.acquire(blocking=False)


def _attempt_release() -> None:
    _runner_slots.release()


def _parse_output(output: str) -> tuple[bool, str]:
    try:
        return True, json.loads(output.strip())
    except (json.JSONDecodeError, TypeError):
        return False, "invalid_output"


def _run_attempt(
    attempt_id: str,
    run_id: str,
    mission_id: str,
    user_id: str,
    mission_key: str,
    difficulty: str,
    source_code: str,
) -> None:
    runner_job_id = None
    try:
        repository.update_attempt(attempt_id, status="RUNNING")
        hub.publish(user_id, "career_quest.attempt", {"run_id": run_id, "attempt_id": attempt_id, "status": "RUNNING"})
        client = Judge0Client()
        cases = catalog.test_cases(mission_key, difficulty)
        passed = 0
        failures: set[str] = set()
        for case in cases:
            result = client.execute(source_code, case["input"])
            runner_job_id = runner_job_id or result["job_id"]
            if result["status_id"] == 5:
                failures.add("time_limit")
                continue
            if result["status_id"] == 6:
                failures.add("compile_error")
                continue
            if result["status_id"] != 3:
                failures.add("runtime_error")
                continue
            parsed, actual = _parse_output(result["stdout"])
            if not parsed:
                failures.add("invalid_output")
            elif actual == case["expected"]:
                passed += 1
            else:
                failures.add("incorrect_output")

        total = len(cases)
        score = round(passed / max(1, total) * 100, 1)
        if passed == total:
            feedback = "All test cases passed. Review the requirements and submit your mission debrief."
        elif passed:
            feedback = "Some tests passed. Use the public examples and edge-case requirements to refine your solution."
        else:
            feedback = "No test cases passed yet. Check the function contract, output format, and edge cases."
        summary = {
            "passed_tests": passed,
            "total_tests": total,
            "score": score,
            "failure_categories": sorted(failures),
            "feedback": feedback,
            "source_retained": False,
        }
        repository.update_attempt(
            attempt_id,
            status="COMPLETED",
            summary=summary,
            score=score,
            runner_job_id=runner_job_id,
        )
        final_status = "COMPLETED"
    except RunnerUnavailable as exc:
        logger.warning("Career Quest attempt %s could not reach the isolated runner: %s", attempt_id, type(exc).__name__)
        repository.update_attempt(
            attempt_id,
            status="UNAVAILABLE",
            summary={"feedback": "The isolated code runner is unavailable. Your mission is saved; retry later.", "source_retained": False},
        )
        final_status = "UNAVAILABLE"
    except RunnerExecutionError as exc:
        logger.warning("Career Quest attempt %s received an invalid runner response: %s", attempt_id, type(exc).__name__)
        repository.update_attempt(
            attempt_id,
            status="FAILED",
            summary={"feedback": "The isolated runner could not verify this submission. Retry with a new attempt.", "source_retained": False},
        )
        final_status = "FAILED"
    except Exception as exc:  # preserve job state while keeping source and provider details out of logs
        logger.exception("Unexpected Career Quest attempt failure (%s)", type(exc).__name__)
        repository.update_attempt(
            attempt_id,
            status="FAILED",
            summary={"feedback": "The submission could not be verified. Retry this attempt.", "source_retained": False},
        )
        final_status = "FAILED"
    finally:
        _attempt_release()
    hub.publish(user_id, "career_quest.attempt", {"run_id": run_id, "attempt_id": attempt_id, "status": final_status})


def submit_attempt(
    user: dict[str, Any],
    run_id: str,
    mission_id: str,
    *,
    language: str,
    source_code: str,
    idempotency_key: str,
) -> dict[str, Any]:
    _candidate_only(user)
    run = _owned_run(run_id, user["id"])
    mission_row, mission = _active_mission(run, mission_id)
    if language != "python" or mission["type"] not in {"debugging", "feature", "incident", "boss"}:
        raise DomainError(422, "unsupported_language", "This mission accepts Python submissions only.")
    if len(source_code.encode("utf-8")) > MAX_SOURCE_BYTES:
        raise DomainError(413, "source_too_large", "Keep the Python submission under 16 KB.")
    fingerprint = hashlib.sha256(source_code.encode("utf-8")).hexdigest()
    if not _attempt_capacity():
        raise DomainError(429, "runner_throttled", "The isolated runner queue is full. Try again shortly.")
    reserved = True
    try:
        attempt, created, limited = repository.create_attempt(
            mission_id,
            idempotency_key,
            fingerprint,
            max_attempts=MAX_ATTEMPTS_PER_MISSION,
        )
        if limited:
            raise DomainError(429, "attempt_limit", "The attempt limit for this mission has been reached.")
        if not created:
            if attempt["submission_fingerprint"] != fingerprint:
                raise DomainError(409, "idempotency_conflict", "This idempotency key was already used for a different submission.")
            return _public_attempt(attempt)
        _runner_pool.submit(
            _run_attempt,
            attempt["id"],
            run_id,
            mission_id,
            user["id"],
            mission["key"],
            run["difficulty"],
            source_code,
        )
        reserved = False
    except Exception:
        if "attempt" in locals() and attempt and attempt.get("status") == "QUEUED":
            repository.update_attempt(
                attempt["id"],
                status="FAILED",
                summary={"feedback": "The submission could not enter the isolated runner queue. Retry with a new attempt.", "source_retained": False},
            )
        if reserved:
            _attempt_release()
        raise
    hub.publish(user["id"], "career_quest.attempt", {"run_id": run_id, "attempt_id": attempt["id"], "status": "QUEUED"})
    return _public_attempt(attempt)


def get_attempt(user: dict[str, Any], run_id: str, attempt_id: str) -> dict[str, Any]:
    _candidate_only(user)
    attempt = repository.get_attempt_for_user(run_id, attempt_id, user["id"])
    if not attempt:
        raise DomainError(404, "not_found", "Attempt not found.")
    return _public_attempt(attempt)


def _decision_score(mission: dict[str, Any], interactions: list[dict[str, Any]]) -> tuple[float, list[str]]:
    decision = next((item for item in interactions if item["interaction_type"] == "decision"), None)
    if not decision:
        return 0.0, []
    selected = list(dict.fromkeys((decision.get("metadata") or {}).get("choices", [])))
    recommended = set(mission["recommended_actions"])
    positive = len(set(selected) & recommended)
    risky = len(set(selected) - recommended)
    value = round(max(0, min(100, positive / max(1, len(recommended)) * 100 - risky * 25)), 1)
    return value, selected


def _reflection_score(
    text: str, choices: list[str], review: dict[str, Any] | None
) -> tuple[float, float, str, dict[str, Any]]:
    """Deterministic, transparent fallback used when model evaluation is unavailable."""
    normalized = text.casefold()
    specificity = min(100.0, round(45 + min(len(text.strip()), 180) / 3, 1))
    reasoning_terms = ("test", "reproduc", "risk", "rollback", "edge", "contract", "log", "impact", "verify")
    evidence_terms = sum(term in normalized for term in reasoning_terms)
    reasoning = min(100.0, round(specificity * 0.65 + evidence_terms * 7, 1))
    communication = min(100.0, round(50 + min(len(text.strip()), 250) / 5, 1))
    if choices:
        reasoning = round((reasoning + min(100, len(choices) * 25)) / 2, 1)
    if review:
        return float(review["problem_solving_score"]), float(review["communication_score"]), f"ollama:{review['model']}", {
            "feedback": review["feedback"],
            "decision_analysis": review["decision_analysis"],
            "demonstrated_skills": review["demonstrated_skills"],
            "fallback": False,
        }
    return reasoning, communication, "rule_based_fallback", {
        "feedback": "The explanation is recorded. Local model feedback was unavailable; these scores use the published length and evidence-word rubric.",
        "decision_analysis": "Decision quality uses the deterministic scenario choice rubric.",
        "signals": {"specificity": specificity, "evidence_terms": evidence_terms},
        "fallback": True,
    }


def _learning_roadmap(dimensions: dict[str, float]) -> list[dict[str, str]]:
    suggestions = {
        "technical_correctness": ("Python testing", "Practice writing small functions with edge-case and malformed-input tests."),
        "problem_solving": ("Debugging workflow", "Reproduce failures, inspect the input contract, and test one hypothesis at a time."),
        "debugging_ability": ("API reliability", "Trace request and response contracts, then add regression tests for the reported failure."),
        "decision_making": ("Production operations", "Practice incident severity, rollback thresholds, blast-radius control, and verification."),
        "communication": ("Engineering communication", "Write concise updates that state impact, action, owner, and next update time."),
    }
    ordered = sorted(dimensions.items(), key=lambda item: (item[1], item[0]))
    return [
        {"skill": suggestions[key][0], "recommendation": suggestions[key][1], "evidence_score": round(score, 1)}
        for key, score in ordered[:3]
    ]


def _career_readiness(overall: float) -> dict[str, Any]:
    if overall >= 85:
        return {
            "band": "strong_evidence",
            "label": "Strong practice evidence",
            "summary": "You handled debugging, implementation, release risk, and communication with consistent evidence. Keep rehearsing production trade-offs in unfamiliar systems.",
        }
    if overall >= 70:
        return {
            "band": "developing",
            "label": "Developing readiness",
            "summary": "The core engineering behaviors are visible. Tighten the weaker dimension before relying on this pattern under a real deadline.",
        }
    if overall >= 50:
        return {
            "band": "foundation",
            "label": "Building the foundation",
            "summary": "You can complete parts of the workflow, but the evidence is uneven. Repeat the missions with a focus on testing and explicit risk reasoning.",
        }
    return {
        "band": "needs_practice",
        "label": "Needs focused practice",
        "summary": "This run did not yet produce strong technical evidence. Start with the debugging and testing fundamentals, then retry the arc.",
    }


def _skillbridge_roadmap(skill_results: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Reuse SkillBridge's existing learning-roadmap generator for weak quest skills."""
    missing = [item["skill"] for item in skill_results if float(item["score"]) < 70][:5]
    if not missing:
        return None
    try:
        from app.ml.roadmap_generator import generate_roadmap

        roadmap = generate_roadmap(
            missing,
            target_role="software engineer",
            use_llm=False,
            learner_context="Career Quest practice simulation evidence",
        )
    except Exception as exc:  # Roadmap guidance must never break a completed run report.
        logger.warning("Career Quest could not build a SkillBridge roadmap (%s).", type(exc).__name__)
        return None
    return {
        "target_role": roadmap["target_role"],
        "items": [
            {
                "skill": item["skill"],
                "title": item["title"],
                "resource": item["resource"],
                "resource_url": item["resource_url"],
                "provider": item["provider"],
                "estimated_hours": item["estimated_hours"],
                "practice_task": item["practice_task"],
            }
            for item in roadmap["items"][:5]
        ],
        "weekly_focus": roadmap["weekly_focus"][:3],
        "total_hours": roadmap["total_hours"],
        "notice": roadmap["notice"],
    }


def _build_report(run: dict[str, Any], current_mission_id: str, score: dict[str, Any]) -> dict[str, Any]:
    rows = []
    for row in run["missions"]:
        mission_score = score if row["id"] == current_mission_id else row.get("score")
        template = catalog.MISSION_BY_KEY[row["template_key"]]
        rows.append({"title": template["title"], "mission_id": row["id"], "score": mission_score})
    components = [item["score"] for item in rows if item["score"]]
    keys = ("technical_correctness", "problem_solving", "debugging_ability", "decision_making", "communication")
    dimensions = {
        key: round(sum(float(item.get(key, 0)) for item in components) / max(1, len(components)), 1)
        for key in keys
    }
    weights = {
        "technical_correctness": 0.35,
        "problem_solving": 0.2,
        "debugging_ability": 0.15,
        "decision_making": 0.2,
        "communication": 0.1,
    }
    overall = round(sum(dimensions[key] * weight for key, weight in weights.items()), 1)
    skill_scores: dict[str, list[float]] = {}
    for row in run["missions"]:
        mission_score = score if row["id"] == current_mission_id else row.get("score")
        if not mission_score:
            continue
        for skill in catalog.MISSION_BY_KEY[row["template_key"]]["skills"]:
            if skill == "python":
                value = mission_score["technical_correctness"]
            elif skill in {"debugging", "api debugging"}:
                value = mission_score["debugging_ability"]
            elif skill in {"testing", "algorithms"}:
                value = mission_score["problem_solving"]
            elif skill in {"decision making", "incident response"}:
                value = mission_score["decision_making"]
            else:
                value = mission_score["communication"]
            skill_scores.setdefault(skill, []).append(float(value))
    skill_results = [
        {"skill": skill, "score": round(sum(values) / len(values), 1), "evidence_count": len(values)}
        for skill, values in sorted(skill_scores.items())
    ]
    demonstrated = [item for item in skill_results if item["score"] >= 75]
    improving = [item for item in skill_results if item["score"] < 65]
    dimensions_low = [key for key, value in dimensions.items() if value < 65]
    return {
        "type": "practice_simulation",
        "title": "Software Engineer Career Quest report",
        "catalog_version": run["catalog_version"],
        "rubric_version": catalog.RUBRIC_VERSION,
        "overall_score": overall,
        "career_readiness": _career_readiness(overall),
        "mission_completion": {
            "completed": sum(
                item["status"] == "COMPLETED" or item["id"] == current_mission_id
                for item in run["missions"]
            ),
            "total": len(run["missions"]),
        },
        "dimensions": dimensions,
        "score_methodology": {
            "weights": weights,
            "technical_correctness": "Actual output compared with server-side test expectations after isolated Python execution.",
            "reasoning_and_communication": "Versioned reflection rubric; model-backed when available, otherwise the named rule-based fallback.",
            "decision_making": "Deterministic score from the submitted choices and the authored scenario rubric.",
            "simulation_limit": "Practice evidence only. This score is not a hiring probability or definitive readiness measure.",
        },
        "mission_evidence": rows,
        "skills_demonstrated": demonstrated,
        "skills_requiring_improvement": improving or [item for item in skill_results if item["skill"] in dimensions_low],
        "recommended_learning_roadmap": _learning_roadmap(dimensions),
        "skillbridge_learning_roadmap": _skillbridge_roadmap(skill_results),
    }


def complete_mission(user: dict[str, Any], run_id: str, mission_id: str) -> dict[str, Any]:
    _candidate_only(user)
    run = _owned_run(run_id, user["id"])
    mission_row, mission = _active_mission(run, mission_id)
    evidence = repository.mission_evidence(run_id, mission_id)
    decision_score, selected = _decision_score(mission, evidence["interactions"])
    reflections = [item for item in evidence["interactions"] if item["interaction_type"] == "reflection"]
    if not selected or not reflections:
        raise DomainError(409, "objective_incomplete", "Record a mission decision and written debrief before completing.")
    latest_attempt = next((item for item in evidence["attempts"] if item["status"] == "COMPLETED" and item.get("score") is not None), None)
    if not latest_attempt:
        if any(item["status"] == "UNAVAILABLE" for item in evidence["attempts"]):
            raise DomainError(503, "runner_unavailable", "The isolated runner has not verified this mission yet. Retry your submission.")
        raise DomainError(409, "execution_required", "Submit code and wait for isolated test results before completing.")
    if float(latest_attempt["score"]) < MIN_COMPLETION_TEST_SCORE:
        raise DomainError(409, "tests_incomplete", f"Pass at least {MIN_COMPLETION_TEST_SCORE}% of the server-side tests to unlock the next mission.")

    reflection = reflections[-1]["content"]
    settings = get_settings()
    reflection_review = career_quest_ai.evaluate_reflection(
        model=settings.career_quest_coder_model,
        mission_title=mission["title"],
        objectives=mission["objectives"],
        choices=selected,
        reflection=reflection,
        passed_tests=int(latest_attempt["result_summary"]["passed_tests"]),
        total_tests=int(latest_attempt["result_summary"]["total_tests"]),
        decision_rubric=f"{mission['decision_prompt']} Recommended actions: {mission['recommended_actions']}",
        allowed_skills=mission["skills"],
    )
    semantic_matches = career_quest_ai.match_mission_skills(reflection, mission["skills"])
    problem_solving, communication, evaluator, reflection_detail = _reflection_score(reflection, selected, reflection_review)
    technical = float(latest_attempt["score"])
    debugging = round((technical + decision_score) / 2, 1) if mission["type"] == "debugging" else technical
    score = {
        "technical_correctness": technical,
        "problem_solving": problem_solving,
        "debugging_ability": debugging,
        "decision_making": decision_score,
        "communication": communication,
        "overall": round(technical * 0.35 + problem_solving * 0.2 + debugging * 0.15 + decision_score * 0.2 + communication * 0.1, 1),
        "evaluator": evaluator,
        "reflection_feedback": reflection_detail,
        "semantic_skill_matches": semantic_matches,
        "test_evidence": {
            "passed": latest_attempt["result_summary"]["passed_tests"],
            "total": latest_attempt["result_summary"]["total_tests"],
            "attempt_id": latest_attempt["id"],
        },
        "decision_evidence": {"selected_choices": selected, "recommended_choices": mission["recommended_actions"]},
    }
    xp = round((50 + round(score["overall"] / 10)) * DIFFICULTY_XP_MULTIPLIER[run["difficulty"]])
    achievements: list[dict[str, Any]] = []
    if mission_row["sequence"] == 1:
        achievements.append({"key": "first_mission", "evidence": {"mission": mission["key"]}})
    if technical == 100:
        achievements.append({"key": "clean_execution", "evidence": {"mission": mission["key"], "test_score": technical}})
    if mission["type"] == "incident":
        achievements.append({"key": "incident_responder", "evidence": {"mission": mission["key"], "decision_score": decision_score}})
    if mission["type"] == "boss":
        achievements.append({"key": "boss_cleared", "evidence": {"mission": mission["key"], "overall": score["overall"]}})
    if mission_row["sequence"] == len(run["missions"]):
        achievements.append({"key": "career_quest_complete", "evidence": {"catalog_version": run["catalog_version"]}})

    skill_evidence = []
    for skill in mission["skills"]:
        if skill == "python":
            value = technical
        elif skill in {"debugging", "api debugging"}:
            value = debugging
        elif skill in {"testing", "algorithms"}:
            value = problem_solving
        elif skill in {"decision making", "incident response"}:
            value = decision_score
        else:
            value = communication
        skill_evidence.append(
            {
                "skill_key": skill,
                "dimension": "observed_mission_performance",
                "score": value,
                "rubric_version": catalog.RUBRIC_VERSION,
                "evidence_refs": [mission_id, latest_attempt["id"]],
            }
        )

    report = _build_report(run, mission_id, score) if mission_row["sequence"] == len(run["missions"]) else None
    committed = repository.complete_mission(
        run_id=run_id,
        mission_id=mission_id,
        score=score,
        xp=xp,
        xp_reason=f"Completed {mission['title']} with verified mission evidence.",
        evidence=skill_evidence,
        achievements=achievements,
        report=report,
    )
    if not committed:
        raise DomainError(409, "invalid_state", "This mission has already been completed or is no longer active.")
    completed_run = _owned_run(run_id, user["id"])
    hub.publish(user["id"], "career_quest.progression", {"run_id": run_id, "mission_id": mission_id})
    hub.publish(user["id"], "career_quest.mission", {"run_id": run_id, "mission_id": mission_id, "status": "COMPLETED"})
    if completed_run["status"] == "COMPLETED":
        hub.publish(user["id"], "career_quest.report", {"run_id": run_id, "status": "COMPLETED"})
    return {
        "run": _public_run(completed_run),
        "mission_score": score,
        "xp_earned": xp,
        "progression": repository.progression(user["id"]),
        "report": completed_run["report"] if completed_run["status"] == "COMPLETED" else None,
    }


def abandon_run(user: dict[str, Any], run_id: str) -> dict[str, Any]:
    _candidate_only(user)
    _owned_run(run_id, user["id"])
    if not repository.abandon_run(run_id, user["id"]):
        raise DomainError(409, "invalid_state", "This run can no longer be abandoned.")
    hub.publish(user["id"], "career_quest.run", {"run_id": run_id, "status": "ABANDONED"})
    return get_run(user, run_id)


def get_report(user: dict[str, Any], run_id: str) -> dict[str, Any]:
    _candidate_only(user)
    run = _owned_run(run_id, user["id"])
    if run["status"] != "COMPLETED" or not run["report"]:
        raise DomainError(409, "report_unavailable", "The final report is available after all missions are complete.")
    return run["report"]

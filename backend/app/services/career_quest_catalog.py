"""Versioned, server-owned Career Quest content.

Only ``public_mission`` is serialized to the browser. Test cases and scoring
rules stay in this module and are consumed only by the grading service.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

CATALOG_VERSION = "software-engineer-1.0"
RUBRIC_VERSION = "career-quest-rubric-1.0"

DIFFICULTIES: dict[str, dict[str, str]] = {
    "beginner": {
        "label": "Beginner",
        "description": "Clear requirements, guided debugging, and a smaller edge-case set.",
    },
    "intermediate": {
        "label": "Intermediate",
        "description": "More ambiguous signals, broader test coverage, and trade-offs to explain.",
    },
    "advanced": {
        "label": "Advanced",
        "description": "Production constraints, tricky edge cases, and stronger evidence expectations.",
    },
}

CAREER = {
    "key": "software_engineer",
    "title": "Software Engineer",
    "summary": "Debug APIs, ship a tested feature, and respond to a production incident.",
    "available": True,
    "skills": ["Python", "API debugging", "Testing", "Incident response", "Communication"],
}

FUTURE_CAREERS = [
    {"key": "ai_engineer", "title": "AI Engineer", "available": False},
    {"key": "data_scientist", "title": "Data Scientist", "available": False},
    {"key": "cybersecurity_analyst", "title": "Cybersecurity Analyst", "available": False},
    {"key": "product_manager", "title": "Product Manager", "available": False},
    {"key": "business_analyst", "title": "Business Analyst", "available": False},
]

COMPANY = {
    "name": "BrightLayer Health",
    "industry": "Digital health",
    "mission": (
        "Make every clinic billing day predictable. BrightLayer builds the billing and scheduling "
        "layer that keeps small care teams focused on patients instead of paperwork."
    ),
    "manager": {"name": "Anika Rao", "role": "Engineering Manager"},
    "team": [
        {"name": "Dev Malik", "role": "Backend Engineer"},
        {"name": "Noor Patel", "role": "Site Reliability Engineer"},
    ],
    "role": "Software Engineer, Platform Team",
    "deadline": "Today, 5:00 PM",
    "briefing": (
        "BrightLayer is preparing a clinic billing release. You have one focused workday to fix a "
        "billing API regression, add a small ranking endpoint, and help the team respond to a "
        "checkout incident. Your manager will review the evidence you produce, not just the outcome."
    ),
}


MISSIONS: list[dict[str, Any]] = [
    {
        "key": "debug_billing_api",
        "version": "1.0",
        "type": "debugging",
        "title": "Debug the billing API",
        "subtitle": "A revoked cart item is still being charged.",
        "brief": (
            "The clinic billing API started returning inflated totals after yesterday's catalog "
            "change. Inspect the item contract, repair ``calculate_total``, and keep inactive or "
            "malformed entries out of the invoice."
        ),
        "objectives": [
            "Return the correct total for active, valid line items.",
            "Ignore inactive, malformed, or non-positive quantity entries.",
            "Explain the first check you would make before shipping the fix.",
        ],
        "skills": ["python", "debugging", "testing"],
        "timebox_minutes": 18,
        "starter_code": '''import json\nimport sys\n\ndef calculate_total(items):\n    total = 0\n    for item in items:\n        total += float(item["unit_price"]) * int(item["quantity"])\n    return round(total, 2)\n\nitems = json.load(sys.stdin)\nprint(json.dumps(calculate_total(items)))\n''',
        "public_examples": [
            {"input": [{"active": True, "unit_price": 12.5, "quantity": 2}], "output": 25.0},
            {"input": [{"active": False, "unit_price": 9, "quantity": 3}], "output": 0.0},
        ],
        "decisions": [
            {"key": "check_contract", "label": "Check the item contract and reproduce with a revoked item"},
            {"key": "inspect_logs", "label": "Compare request and response logs for a failing invoice"},
            {"key": "patch_without_tests", "label": "Patch the arithmetic and ship before running tests"},
        ],
        "recommended_actions": ["check_contract", "inspect_logs"],
        "decision_prompt": "What is your first debugging move?",
        "manager_opening": "A clinic says today's invoice total includes a product they removed yesterday. What will you inspect first?",
        "manager_fallback": "I have the billing request trace ready. Start with a reproducible example, then tell me what contract you found.",
        "requirement_change": (
            "Mid-mission requirement change from Product: revoked items can now arrive without a quantity "
            "field at all, not just as zero. Treat any malformed or incomplete line item as zero so one bad "
            "record cannot crash the entire invoice."
        ),
        "tests": {
            "beginner": [
                {"input": [{"active": True, "unit_price": 12.5, "quantity": 2}], "expected": 25.0},
                {"input": [{"active": False, "unit_price": 9, "quantity": 3}], "expected": 0.0},
                {"input": [], "expected": 0.0},
                {"input": [{"active": True, "unit_price": 4, "quantity": 0}], "expected": 0.0},
                {"input": [{"active": True, "unit_price": 5}], "expected": 0.0},
            ],
            "intermediate": [
                {"input": [{"active": True, "unit_price": 12.5, "quantity": 2}], "expected": 25.0},
                {"input": [{"active": False, "unit_price": 9, "quantity": 3}], "expected": 0.0},
                {"input": [], "expected": 0.0},
                {"input": [{"active": True, "unit_price": 4, "quantity": 0}], "expected": 0.0},
                {"input": [{"active": True, "unit_price": 5}], "expected": 0.0},
                {"input": [{"active": True, "unit_price": 2.4, "quantity": 3}, {"active": True, "unit_price": 1.1, "quantity": 1}], "expected": 8.3},
                {"input": [{"active": True, "unit_price": 20, "quantity": 1}, {"active": False, "unit_price": 500, "quantity": 2}], "expected": 20.0},
            ],
            "advanced": [
                {"input": [{"active": True, "unit_price": 12.5, "quantity": 2}], "expected": 25.0},
                {"input": [{"active": False, "unit_price": 9, "quantity": 3}], "expected": 0.0},
                {"input": [], "expected": 0.0},
                {"input": [{"active": True, "unit_price": 4, "quantity": 0}], "expected": 0.0},
                {"input": [{"active": True, "unit_price": 5}], "expected": 0.0},
                {"input": [{"active": True, "unit_price": 2.4, "quantity": 3}, {"active": True, "unit_price": 1.1, "quantity": 1}], "expected": 8.3},
                {"input": [{"active": True, "unit_price": 20, "quantity": 1}, {"active": False, "unit_price": 500, "quantity": 2}], "expected": 20.0},
                {"input": [{"active": True, "unit_price": "3.25", "quantity": "4"}], "expected": 13.0},
                {"input": [{"active": True, "unit_price": -1, "quantity": 2}, {"active": True, "unit_price": 5, "quantity": 2}], "expected": 10.0},
            ],
        },
    },
    {
        "key": "implement_skill_ranking",
        "version": "1.0",
        "type": "feature",
        "title": "Implement skill ranking",
        "subtitle": "Help clinics find the right specialist sooner.",
        "brief": (
            "The team needs a small endpoint that orders clinicians by their match score. "
            "Implement ``rank_skills`` so ties are predictable and the requested result count "
            "is handled safely."
        ),
        "objectives": [
            "Sort skill names by score from highest to lowest.",
            "Break equal-score ties by skill name in case-insensitive alphabetical order.",
            "Respect a non-negative result limit and explain one edge case you tested.",
        ],
        "skills": ["python", "algorithms", "testing"],
        "timebox_minutes": 20,
        "starter_code": '''import json\nimport sys\n\ndef rank_skills(scores, limit):\n    return list(scores.keys())[:limit]\n\npayload = json.load(sys.stdin)\nprint(json.dumps(rank_skills(payload["scores"], payload["limit"])))\n''',
        "public_examples": [
            {"input": {"scores": {"Python": 82, "SQL": 95, "React": 82}, "limit": 2}, "output": ["SQL", "Python"]},
            {"input": {"scores": {"Go": 70, "API Design": 70}, "limit": 5}, "output": ["API Design", "Go"]},
        ],
        "decisions": [
            {"key": "write_tests_first", "label": "Write a tie and limit test before implementing"},
            {"key": "ask_for_example", "label": "Ask the product partner for a ranking example"},
            {"key": "ship_without_tests", "label": "Return the first items and skip edge-case checks"},
        ],
        "recommended_actions": ["write_tests_first", "ask_for_example"],
        "decision_prompt": "How will you reduce ambiguity before handing this feature to the API team?",
        "manager_opening": "The API contract is small, but equal scores must not shuffle between requests. How will you make the behavior predictable?",
        "manager_fallback": "The product partner confirmed stable ties matter to clinic staff. A focused test will make that contract easy to review.",
        "requirement_change": (
            "Mid-mission requirement change from the API team: callers may send limit as null when they "
            "want every ranked skill. Treat null as unlimited, while negative limits still return an empty list."
        ),
        "tests": {
            "beginner": [
                {"input": {"scores": {"Python": 82, "SQL": 95, "React": 82}, "limit": 2}, "expected": ["SQL", "Python"]},
                {"input": {"scores": {"Go": 70, "API Design": 70}, "limit": 5}, "expected": ["API Design", "Go"]},
                {"input": {"scores": {"Python": 1}, "limit": 0}, "expected": []},
                {"input": {"scores": {}, "limit": 4}, "expected": []},
                {"input": {"scores": {"Python": 5, "SQL": 4}, "limit": None}, "expected": ["Python", "SQL"]},
            ],
            "intermediate": [
                {"input": {"scores": {"Python": 82, "SQL": 95, "React": 82}, "limit": 2}, "expected": ["SQL", "Python"]},
                {"input": {"scores": {"Go": 70, "API Design": 70}, "limit": 5}, "expected": ["API Design", "Go"]},
                {"input": {"scores": {"Python": 1}, "limit": 0}, "expected": []},
                {"input": {"scores": {}, "limit": 4}, "expected": []},
                {"input": {"scores": {"Python": 5, "SQL": 4}, "limit": None}, "expected": ["Python", "SQL"]},
                {"input": {"scores": {"rust": 99, "C++": 99, "python": 60}, "limit": 2}, "expected": ["C++", "rust"]},
                {"input": {"scores": {"Java": 4, "Go": 8}, "limit": 99}, "expected": ["Go", "Java"]},
            ],
            "advanced": [
                {"input": {"scores": {"Python": 82, "SQL": 95, "React": 82}, "limit": 2}, "expected": ["SQL", "Python"]},
                {"input": {"scores": {"Go": 70, "API Design": 70}, "limit": 5}, "expected": ["API Design", "Go"]},
                {"input": {"scores": {"Python": 1}, "limit": 0}, "expected": []},
                {"input": {"scores": {}, "limit": 4}, "expected": []},
                {"input": {"scores": {"Python": 5, "SQL": 4}, "limit": None}, "expected": ["Python", "SQL"]},
                {"input": {"scores": {"rust": 99, "C++": 99, "python": 60}, "limit": 2}, "expected": ["C++", "rust"]},
                {"input": {"scores": {"Java": 4, "Go": 8}, "limit": 99}, "expected": ["Go", "Java"]},
                {"input": {"scores": {"api": 8, "API": 8}, "limit": 2}, "expected": ["API", "api"]},
                {"input": {"scores": {"Rust": -2, "SQL": 0}, "limit": -1}, "expected": []},
            ],
        },
    },
    {
        "key": "production_checkout_incident",
        "version": "1.0",
        "type": "incident",
        "title": "Handle a checkout incident",
        "subtitle": "A new release is pushing checkout errors above the alert threshold.",
        "brief": (
            "At 2:14 PM, checkout errors rise from 0.4% to 9.2% just after release 2.8. "
            "Clinics are waiting on invoices. Implement ``recommend_action`` using the stated "
            "error and latency thresholds, then coordinate a safe response with the team."
        ),
        "objectives": [
            "Recommend rollback when the error rate reaches the configured threshold.",
            "Hold the rollout when latency is high but errors remain below threshold.",
            "Choose safe incident actions and give the manager a concise status update.",
        ],
        "skills": ["python", "incident response", "decision making", "communication"],
        "timebox_minutes": 22,
        "starter_code": '''import json\nimport sys\n\ndef recommend_action(metrics):\n    return "monitor"\n\nmetrics = json.load(sys.stdin)\nprint(json.dumps(recommend_action(metrics)))\n''',
        "public_examples": [
            {"input": {"error_rate": 0.092, "error_threshold": 0.03, "p95_ms": 1400, "latency_threshold_ms": 1200}, "output": "rollback"},
            {"input": {"error_rate": 0.012, "error_threshold": 0.03, "p95_ms": 1500, "latency_threshold_ms": 1200}, "output": "hold"},
        ],
        "decisions": [
            {"key": "stop_rollout", "label": "Stop the rollout so the error rate cannot spread"},
            {"key": "rollback", "label": "Roll back release 2.8 to the known stable version"},
            {"key": "page_oncall", "label": "Page the on-call engineer with the error-rate evidence"},
            {"key": "communicate_status", "label": "Post the impact, mitigation, and next update time"},
            {"key": "increase_capacity", "label": "Add capacity without checking whether the release caused the errors"},
        ],
        "recommended_actions": ["stop_rollout", "rollback", "page_oncall", "communicate_status"],
        "decision_prompt": "Choose at least two actions to stabilize checkout and keep the team informed.",
        "manager_opening": "Checkout errors crossed 9% right after release 2.8. Clinics are blocked. What do you do first, and who needs an update?",
        "manager_fallback": "The incident channel is open. Stop further exposure, use the last known stable release if the signal holds, and keep Noor updated with impact and next steps.",
        "requirement_change": (
            "Mid-incident requirement change from Ops: the error threshold is inclusive, so at or above the "
            "threshold now means rollback. Latency exactly at its threshold still requires a hold because the "
            "service has no headroom left."
        ),
        "tests": {
            "beginner": [
                {"input": {"error_rate": 0.092, "error_threshold": 0.03, "p95_ms": 1400, "latency_threshold_ms": 1200}, "expected": "rollback"},
                {"input": {"error_rate": 0.012, "error_threshold": 0.03, "p95_ms": 1500, "latency_threshold_ms": 1200}, "expected": "hold"},
                {"input": {"error_rate": 0.005, "error_threshold": 0.03, "p95_ms": 300, "latency_threshold_ms": 1200}, "expected": "monitor"},
                {"input": {"error_rate": 0.03, "error_threshold": 0.03, "p95_ms": 100, "latency_threshold_ms": 1200}, "expected": "rollback"},
            ],
            "intermediate": [
                {"input": {"error_rate": 0.092, "error_threshold": 0.03, "p95_ms": 1400, "latency_threshold_ms": 1200}, "expected": "rollback"},
                {"input": {"error_rate": 0.012, "error_threshold": 0.03, "p95_ms": 1500, "latency_threshold_ms": 1200}, "expected": "hold"},
                {"input": {"error_rate": 0.005, "error_threshold": 0.03, "p95_ms": 300, "latency_threshold_ms": 1200}, "expected": "monitor"},
                {"input": {"error_rate": 0.03, "error_threshold": 0.03, "p95_ms": 100, "latency_threshold_ms": 1200}, "expected": "rollback"},
                {"input": {"error_rate": 0.01, "error_threshold": 0.05, "p95_ms": 1200, "latency_threshold_ms": 1200}, "expected": "hold"},
                {"input": {"error_rate": 0.01, "error_threshold": 0.05, "p95_ms": 900, "latency_threshold_ms": 1200}, "expected": "monitor"},
            ],
            "advanced": [
                {"input": {"error_rate": 0.092, "error_threshold": 0.03, "p95_ms": 1400, "latency_threshold_ms": 1200}, "expected": "rollback"},
                {"input": {"error_rate": 0.012, "error_threshold": 0.03, "p95_ms": 1500, "latency_threshold_ms": 1200}, "expected": "hold"},
                {"input": {"error_rate": 0.005, "error_threshold": 0.03, "p95_ms": 300, "latency_threshold_ms": 1200}, "expected": "monitor"},
                {"input": {"error_rate": 0.03, "error_threshold": 0.03, "p95_ms": 100, "latency_threshold_ms": 1200}, "expected": "rollback"},
                {"input": {"error_rate": 0.01, "error_threshold": 0.05, "p95_ms": 1200, "latency_threshold_ms": 1200}, "expected": "hold"},
                {"input": {"error_rate": 0.01, "error_threshold": 0.05, "p95_ms": 900, "latency_threshold_ms": 1200}, "expected": "monitor"},
                {"input": {"error_rate": 0.25, "error_threshold": 0.03, "p95_ms": 200, "latency_threshold_ms": 300}, "expected": "rollback"},
                {"input": {"error_rate": 0, "error_threshold": 0.03, "p95_ms": 301, "latency_threshold_ms": 300}, "expected": "hold"},
            ],
        },
    },
    {
        "key": "final_boss_release",
        "version": "1.0",
        "type": "boss",
        "title": "Final challenge: release readiness",
        "subtitle": "Ship, hold, or roll back release 2.9 before the clinic billing window opens.",
        "brief": (
            "It is 4:35 PM. Release 2.9 bundles your billing fix, the ranking endpoint, and a database "
            "migration. Staging is mixed: some critical checks fail, checkout errors are close to the alert "
            "threshold, latency has little headroom, and the rollback runbook has not been exercised. "
            "Implement ``assess_release`` so the team gets a safe, explainable decision instead of a guess."
        ),
        "objectives": [
            "Return rollback when any critical test fails or the error rate reaches its threshold.",
            "Return hold when rollback or the migration dry run is unverified, or latency exceeds its threshold.",
            "Return ship only when every critical test passes, error and latency signals are inside their thresholds, and rollback plus migration evidence exists.",
            "Explain how you prioritized patient impact, release risk, and communication.",
        ],
        "skills": ["python", "debugging", "testing", "decision making", "incident response", "communication"],
        "timebox_minutes": 25,
        "starter_code": '''import json\nimport sys\n\ndef assess_release(report):\n    return "hold"\n\nreport = json.load(sys.stdin)\nprint(json.dumps(assess_release(report)))\n''',
        "public_examples": [
            {
                "input": {
                    "failing_critical_tests": 1,
                    "error_rate": 0.011,
                    "error_threshold": 0.02,
                    "p95_ms": 980,
                    "latency_threshold_ms": 1200,
                    "rollback_verified": True,
                    "migration_dry_run": True,
                },
                "output": "rollback",
            },
            {
                "input": {
                    "failing_critical_tests": 0,
                    "error_rate": 0.004,
                    "error_threshold": 0.02,
                    "p95_ms": 740,
                    "latency_threshold_ms": 1200,
                    "rollback_verified": True,
                    "migration_dry_run": True,
                },
                "output": "ship",
            },
        ],
        "decisions": [
            {"key": "block_release", "label": "Block the release until every critical check is green"},
            {"key": "dry_run_migration", "label": "Run the migration dry run against a copy of production data"},
            {"key": "verify_rollback", "label": "Verify the rollback runbook with the on-call engineer"},
            {"key": "notify_support", "label": "Send support the release window, risk, and rollback plan"},
            {"key": "ship_anyway", "label": "Ship now and let monitoring catch any problems"},
            {"key": "skip_review", "label": "Skip the release review to protect the deadline"},
        ],
        "recommended_actions": ["block_release", "dry_run_migration", "verify_rollback", "notify_support"],
        "decision_prompt": "Choose at least two release actions that protect patients and keep the team aligned.",
        "manager_opening": (
            "This is the release call. I need a recommendation I can defend to Support and to the incident "
            "review. What evidence do you need, and what will you do if it is not there?"
        ),
        "manager_fallback": (
            "I will back a conservative call if the evidence supports it. Protect patients first, make the "
            "rollback path real, and give Support a clear window and owner."
        ),
        "requirement_change": (
            "Late requirement change from Security: the migration dry run is now mandatory, not optional. "
            "If it has not been completed, the release must be held even when every other signal looks green."
        ),
        "tests": {
            "beginner": [
                {"input": {"failing_critical_tests": 1, "error_rate": 0.011, "error_threshold": 0.02, "p95_ms": 980, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "rollback"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.011, "error_threshold": 0.02, "p95_ms": 980, "latency_threshold_ms": 1200, "rollback_verified": False, "migration_dry_run": True}, "expected": "hold"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.005, "error_threshold": 0.02, "p95_ms": 700, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "ship"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.02, "error_threshold": 0.02, "p95_ms": 500, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "rollback"},
            ],
            "intermediate": [
                {"input": {"failing_critical_tests": 1, "error_rate": 0.011, "error_threshold": 0.02, "p95_ms": 980, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "rollback"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.011, "error_threshold": 0.02, "p95_ms": 980, "latency_threshold_ms": 1200, "rollback_verified": False, "migration_dry_run": True}, "expected": "hold"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.005, "error_threshold": 0.02, "p95_ms": 700, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "ship"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.02, "error_threshold": 0.02, "p95_ms": 500, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "rollback"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.01, "error_threshold": 0.02, "p95_ms": 1200, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "ship"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.01, "error_threshold": 0.02, "p95_ms": 1201, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "hold"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.01, "error_threshold": 0.02, "p95_ms": 500, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": False}, "expected": "hold"},
            ],
            "advanced": [
                {"input": {"failing_critical_tests": 1, "error_rate": 0.011, "error_threshold": 0.02, "p95_ms": 980, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "rollback"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.011, "error_threshold": 0.02, "p95_ms": 980, "latency_threshold_ms": 1200, "rollback_verified": False, "migration_dry_run": True}, "expected": "hold"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.005, "error_threshold": 0.02, "p95_ms": 700, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "ship"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.02, "error_threshold": 0.02, "p95_ms": 500, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "rollback"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.01, "error_threshold": 0.02, "p95_ms": 1200, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "ship"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.01, "error_threshold": 0.02, "p95_ms": 1201, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "hold"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0.01, "error_threshold": 0.02, "p95_ms": 500, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": False}, "expected": "hold"},
                {"input": {"failing_critical_tests": 3, "error_rate": 0.5, "error_threshold": 0.02, "p95_ms": 5000, "latency_threshold_ms": 1200, "rollback_verified": False, "migration_dry_run": False}, "expected": "rollback"},
                {"input": {"failing_critical_tests": 0, "error_rate": 0, "error_threshold": 0.02, "p95_ms": 0, "latency_threshold_ms": 1200, "rollback_verified": True, "migration_dry_run": True}, "expected": "ship"},
            ],
        },
    },
]

MISSION_BY_KEY = {mission["key"]: mission for mission in MISSIONS}


def public_mission(mission: dict[str, Any], difficulty: str) -> dict[str, Any]:
    """Return only browser-safe challenge content."""
    return {
        key: deepcopy(mission[key])
        for key in (
            "key", "type", "title", "subtitle", "brief", "objectives", "skills",
            "timebox_minutes", "starter_code", "public_examples", "decisions",
            "decision_prompt", "manager_opening", "manager_fallback",
        )
    } | {"difficulty": difficulty}


def test_cases(mission_key: str, difficulty: str) -> list[dict[str, Any]]:
    mission = MISSION_BY_KEY.get(mission_key)
    if not mission:
        raise KeyError(mission_key)
    return deepcopy(mission["tests"][difficulty])

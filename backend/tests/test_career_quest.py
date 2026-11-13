"""Career Quest state, privacy, scoring, and ownership tests.

These tests replace the isolated runner and Ollama with deterministic doubles.
The production path still requires a separately operated runner; these tests
verify that only actual runner results can unlock missions and award XP.
"""

from __future__ import annotations

import json
import time
from typing import Any

import pytest

from app.services import career_quest as quest_service
from app.services import career_quest_ai
from app.services import career_quest_catalog as catalog
from app.services.career_quest_runner import RunnerUnavailable

TERMINAL_ATTEMPT_STATES = {"COMPLETED", "UNAVAILABLE", "FAILED"}


def _expected_for(input_value: Any) -> Any:
    for mission in catalog.MISSIONS:
        for cases in mission["tests"].values():
            for case in cases:
                if case["input"] == input_value:
                    return case["expected"]
    return "__unknown_input__"


class FakeJudge0Client:
    """Returns the authored expected output for a known test input."""

    def execute(self, source: str, input_value: Any) -> dict[str, Any]:
        expected = _expected_for(input_value)
        if expected == "__unknown_input__":
            return {"job_id": "fake-job", "status_id": 4, "stdout": "null"}
        return {
            "job_id": "fake-job",
            "status_id": 3,
            "stdout": json.dumps(expected),
        }


class UnavailableJudge0Client:
    def execute(self, source: str, input_value: Any) -> dict[str, Any]:
        raise RunnerUnavailable("test runner outage")


def _patch_ai(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        quest_service,
        "_manager_reply",
        lambda *args, **kwargs: ("authored_scenario", "Authored manager reply for the test."),
    )
    monkeypatch.setattr(career_quest_ai, "evaluate_reflection", lambda **kwargs: None)
    monkeypatch.setattr(
        career_quest_ai,
        "match_mission_skills",
        lambda reflection, skills: {"provider": "disabled", "matches": [], "available": False},
    )


def _start_run(client: Any, headers: dict[str, str], difficulty: str = "beginner") -> dict[str, Any]:
    response = client.post(
        "/api/v1/career-quests/runs",
        headers=headers,
        json={"career_key": "software_engineer", "difficulty": difficulty},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _poll_attempt(client: Any, headers: dict[str, str], run_id: str, attempt_id: str) -> dict[str, Any]:
    for _ in range(80):
        response = client.get(
            f"/api/v1/career-quests/runs/{run_id}/attempts/{attempt_id}", headers=headers
        )
        assert response.status_code == 200, response.text
        attempt = response.json()["attempt"]
        if attempt["status"] in TERMINAL_ATTEMPT_STATES:
            return attempt
        time.sleep(0.05)
    raise AssertionError("attempt did not reach a terminal state")


def _save_decision_and_debrief(client: Any, headers: dict[str, str], run: dict[str, Any]) -> dict[str, Any]:
    mission_id = run["current_mission_id"]
    mission_row = next(item for item in run["missions"] if item["id"] == mission_id)
    template = catalog.MISSION_BY_KEY[mission_row["mission"]["key"]]
    required = 2 if template["type"] in {"incident", "boss"} else 1
    choices = template["recommended_actions"][:required]
    decision = client.post(
        f"/api/v1/career-quests/runs/{run['id']}/missions/{mission_id}/interactions",
        headers=headers,
        json={"action": "decision", "choices": choices},
    )
    assert decision.status_code == 200, decision.text
    body = decision.json()
    assert any(item["type"] == "requirement_change" for item in body["interactions"])

    reflection = client.post(
        f"/api/v1/career-quests/runs/{run['id']}/missions/{mission_id}/interactions",
        headers=headers,
        json={
            "action": "reflection",
            "text": "I reproduced the failure, checked the contract, tested edge cases, and verified rollback risk before shipping.",
        },
    )
    assert reflection.status_code == 200, reflection.text
    return reflection.json()


def _run_attempt(client: Any, headers: dict[str, str], run: dict[str, Any]) -> dict[str, Any]:
    mission_id = run["current_mission_id"]
    mission_row = next(item for item in run["missions"] if item["id"] == mission_id)
    response = client.post(
        f"/api/v1/career-quests/runs/{run['id']}/missions/{mission_id}/attempts",
        headers=headers,
        json={
            "language": "python",
            "source_code": "print('solution')",
            "idempotency_key": f"test-{mission_id}-first",
        },
    )
    assert response.status_code == 202, response.text
    return _poll_attempt(client, headers, run["id"], response.json()["attempt"]["id"])


def _complete_current(client: Any, headers: dict[str, str], run: dict[str, Any]) -> dict[str, Any]:
    response = client.post(
        f"/api/v1/career-quests/runs/{run['id']}/missions/{run['current_mission_id']}/complete",
        headers=headers,
        json={},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_catalog_and_authorization_contract(
    client: Any, create_account: Any, auth_headers: Any
) -> None:
    catalog_response = client.get("/api/v1/career-quests/catalog")
    assert catalog_response.status_code == 200
    body = catalog_response.json()
    assert body["careers"][0]["key"] == "software_engineer"
    assert any(career["key"] == "ai_engineer" for career in body["careers"])
    assert "boss" in body["mission_types"]
    assert body["ai_status"]["models"]["manager_dialogue"]["model"] == "qwen2.5:7b"

    assert client.get("/api/v1/career-quests/progression").status_code == 401
    recruiter = create_account(email="recruiter-cq@example.test", role="recruiter", company="Test Co")
    assert client.get(
        "/api/v1/career-quests/progression", headers=auth_headers(recruiter)
    ).status_code == 403

    candidate = create_account(email="candidate-cq@example.test")
    smuggled = client.post(
        "/api/v1/career-quests/runs",
        headers=auth_headers(candidate),
        json={"career_key": "software_engineer", "difficulty": "beginner", "xp": 9999},
    )
    assert smuggled.status_code == 422
    unsupported = client.post(
        "/api/v1/career-quests/runs",
        headers=auth_headers(candidate),
        json={"career_key": "data_scientist", "difficulty": "beginner"},
    )
    assert unsupported.status_code == 422


def test_run_creation_privacy_and_ownership(
    client: Any, create_account: Any, auth_headers: Any
) -> None:
    first = create_account(email="cq-owner@example.test")
    second = create_account(email="cq-other@example.test")
    run = _start_run(client, auth_headers(first))

    assert run["company"]["name"] == "BrightLayer Health"
    assert run["company"]["mission"]
    assert run["progress"] == {"completed": 0, "total": 4, "percent": 0}
    assert [item["status"] for item in run["missions"]] == ["AVAILABLE", "LOCKED", "LOCKED", "LOCKED"]
    current = run["missions"][0]["mission"]
    assert "tests" not in current
    assert "requirement_change" not in current
    assert "manager_fallback" in current
    assert current["starter_code"].startswith("import json")

    assert client.get(
        f"/api/v1/career-quests/runs/{run['id']}", headers=auth_headers(second)
    ).status_code == 404
    assert client.get(
        f"/api/v1/career-quests/runs/{run['id']}", headers=auth_headers(first)
    ).status_code == 200


def test_decision_requirement_change_and_execution_gate(
    client: Any,
    create_account: Any,
    auth_headers: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_ai(monkeypatch)
    account = create_account(email="cq-flow@example.test")
    headers = auth_headers(account)
    run = _start_run(client, headers)
    mission_id = run["current_mission_id"]

    no_evidence = client.post(
        f"/api/v1/career-quests/runs/{run['id']}/missions/{mission_id}/complete",
        headers=headers,
        json={},
    )
    assert no_evidence.status_code == 409
    assert no_evidence.json()["error"]["code"] == "objective_incomplete"

    run = _save_decision_and_debrief(client, headers, run)
    assert any(item["type"] == "decision" for item in run["interactions"])
    assert any(item["type"] == "reflection" for item in run["interactions"])
    assert any(item["type"] == "requirement_change" for item in run["interactions"])
    assert any(item["provider"].startswith("authored") for item in run["interactions"])

    duplicate = client.post(
        f"/api/v1/career-quests/runs/{run['id']}/missions/{mission_id}/interactions",
        headers=headers,
        json={"action": "decision", "choices": ["check_contract"]},
    )
    assert duplicate.status_code == 409

    still_blocked = client.post(
        f"/api/v1/career-quests/runs/{run['id']}/missions/{mission_id}/complete",
        headers=headers,
        json={},
    )
    assert still_blocked.status_code == 409
    assert still_blocked.json()["error"]["code"] == "execution_required"


def test_full_arc_uses_runner_results_report_and_idempotent_xp(
    client: Any,
    create_account: Any,
    auth_headers: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_ai(monkeypatch)
    monkeypatch.setattr(quest_service, "Judge0Client", FakeJudge0Client)
    account = create_account(email="cq-full@example.test")
    headers = auth_headers(account)
    run = _start_run(client, headers)

    first_attempt_id: str | None = None
    for _ in range(4):
        run = _save_decision_and_debrief(client, headers, run)
        mission_id = run["current_mission_id"]
        response = client.post(
            f"/api/v1/career-quests/runs/{run['id']}/missions/{mission_id}/attempts",
            headers=headers,
            json={
                "language": "python",
                "source_code": "print('solution')",
                "idempotency_key": f"test-{mission_id}-first",
            },
        )
        assert response.status_code == 202, response.text
        attempt_id = response.json()["attempt"]["id"]
        attempt = _poll_attempt(client, headers, run["id"], attempt_id)
        assert attempt["status"] == "COMPLETED"
        assert attempt["score"] == 100
        assert attempt["result"]["total_tests"] >= 4
        assert attempt["result"]["source_retained"] is False
        if first_attempt_id is None:
            first_attempt_id = attempt_id
            repeat = client.post(
                f"/api/v1/career-quests/runs/{run['id']}/missions/{mission_id}/attempts",
                headers=headers,
                json={
                    "language": "python",
                    "source_code": "print('solution')",
                    "idempotency_key": f"test-{mission_id}-first",
                },
            )
            assert repeat.status_code == 200
            assert repeat.json()["attempt"]["id"] == attempt_id

        completion = _complete_current(client, headers, run)
        run = completion["run"]
        assert completion["xp_earned"] > 0
        assert completion["mission_score"]["technical_correctness"] == 100
        assert completion["mission_score"]["test_evidence"]["passed"] >= 4

    assert run["status"] == "COMPLETED"
    assert run["progress"] == {"completed": 4, "total": 4, "percent": 100}
    report = client.get(f"/api/v1/career-quests/runs/{run['id']}/report", headers=headers)
    assert report.status_code == 200
    payload = report.json()
    assert payload["type"] == "practice_simulation"
    assert payload["mission_completion"] == {"completed": 4, "total": 4}
    assert payload["catalog_version"] == catalog.CATALOG_VERSION
    assert payload["rubric_version"] == catalog.RUBRIC_VERSION
    assert payload["career_readiness"]["band"]
    assert len(payload["mission_evidence"]) == 4
    assert payload["mission_evidence"][-1]["title"] == "Final challenge: release readiness"
    assert payload["skillbridge_learning_roadmap"] is not None
    assert payload["skillbridge_learning_roadmap"]["items"]
    assert all("passed" in str(item["score"].get("test_evidence")) for item in payload["mission_evidence"])

    progression = client.get("/api/v1/career-quests/progression", headers=headers).json()
    assert progression["xp_total"] > 0
    assert progression["completed_missions"] == 4
    achievement_keys = {item["achievement_key"] for item in progression["achievements"]}
    assert {"first_mission", "clean_execution", "incident_responder", "boss_cleared", "career_quest_complete"} <= achievement_keys
    assert progression["skills"]

    # A repeated completion request cannot award XP twice.
    assert client.get(
        f"/api/v1/career-quests/runs/{run['id']}/report", headers=auth_headers(create_account(email="cq-third@example.test"))
    ).status_code == 404


def test_runner_outage_blocks_completion_without_fake_score(
    client: Any,
    create_account: Any,
    auth_headers: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_ai(monkeypatch)
    monkeypatch.setattr(quest_service, "Judge0Client", UnavailableJudge0Client)
    account = create_account(email="cq-outage@example.test")
    headers = auth_headers(account)
    run = _start_run(client, headers)
    run = _save_decision_and_debrief(client, headers, run)
    mission_id = run["current_mission_id"]

    response = client.post(
        f"/api/v1/career-quests/runs/{run['id']}/missions/{mission_id}/attempts",
        headers=headers,
        json={
            "language": "python",
            "source_code": "print('solution')",
            "idempotency_key": f"test-{mission_id}-outage",
        },
    )
    assert response.status_code == 202
    attempt = _poll_attempt(client, headers, run["id"], response.json()["attempt"]["id"])
    assert attempt["status"] == "UNAVAILABLE"
    assert attempt["score"] is None

    completion = client.post(
        f"/api/v1/career-quests/runs/{run['id']}/missions/{mission_id}/complete",
        headers=headers,
        json={},
    )
    assert completion.status_code == 503
    assert completion.json()["error"]["code"] == "runner_unavailable"
    progression = client.get("/api/v1/career-quests/progression", headers=headers).json()
    assert progression["xp_total"] == 0
    assert progression["completed_missions"] == 0

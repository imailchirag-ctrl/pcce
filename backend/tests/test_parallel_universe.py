from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

from app.services import parallel_universe


def _account(email: str) -> tuple[dict[str, Any], dict[str, str]]:
    from app import db
    from app.security import new_session_token, token_digest

    user = db.create_user(email=email, name="Parallel Universe Test", password_hash=None)
    token = new_session_token()
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    db.create_session(user["id"], token_digest(token), expires_at)
    return user, {"Authorization": f"Bearer {token}"}


def _future(identifier: str, name: str, direction: str, existing: str) -> dict[str, Any]:
    milestone = {
        "target": f"Build a {name.lower()} foundation",
        "required_skills": ["Python", "testing"],
        "action": f"Complete a small project related to {direction}.",
        "evidence": "A working project with tests and a short README.",
        "effort_hours": 80,
        "dependencies": ["Choose a scoped project."],
    }
    return {
        "id": identifier,
        "name": name,
        "direction": direction,
        "archetype": name,
        "personality": f"A distinctive {name.lower()} approach.",
        "career_strategy": f"Build evidence in {direction} through scoped work.",
        "technical_strengths": ["Testing", "Problem decomposition", "Documentation"],
        "existing_skills": [existing] if existing else [],
        "new_skills": ["Python", "testing", direction],
        "suggested_projects": [f"A small {direction} project", "A project evaluation report"],
        "weaknesses": ["Could over-focus on one technique."],
        "risks": ["The available evidence may be incomplete."],
        "why_it_fits": "This is a hypothetical direction to test with a project.",
        "milestones": {"six_months": milestone, "one_year": milestone, "three_years": milestone},
    }


async def _fake_model(prompt: str, **_: Any) -> dict[str, Any]:
    if "three-agent career debate" in prompt:
        return {
            "ok": True,
            "model": "qwen2.5-coder:3b",
            "data": {
                "turns": [
                    {"future_id": f"future-{letter}", "argument": f"{letter} makes a distinct argument", "challenge": f"{letter} challenges the other strategies", "question": f"What evidence would test {letter}?"}
                    for letter in ("a", "b", "c")
                ],
                "summary": {"best_arguments": ["Choose a small experiment."], "disagreements": ["The paths prioritize different outcomes."], "tradeoffs": ["Time spent learning one area delays another."], "next_action": "Build one small project and review the result.", "uncertainties": ["The profile contains little evidence."]},
            },
        }
    if "hypothetical choice" in prompt:
        return {
            "ok": True,
            "model": "qwen2.5-coder:3b",
            "data": {
                "outcomes": [
                    {"future_id": f"future-{letter}", "stance": "supports" if letter == "a" else "questions", "impact": "medium", "skills_developed": ["Python"], "tradeoff": "This uses time that could go to another path.", "timeline_update": "Try a four-week project and collect an artifact."}
                    for letter in ("a", "b", "c")
                ],
                "opportunity_cost": "Time is finite across paths.",
                "review_point": "Review the project after four weeks.",
            },
        }
    return {
        "ok": True,
        "model": "qwen2.5-coder:3b",
        "data": {"futures": [
            _future("future-a", "AI Explorer", "applied machine learning", ""),
            _future("future-b", "Systems Builder", "backend systems", ""),
            _future("future-c", "Product Maker", "product engineering", ""),
        ]},
    }


def test_parallel_universe_flow_is_authenticated_persisted_and_hypothetical(
    client: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(parallel_universe.registry, "generate_json", _fake_model)
    monkeypatch.setattr(parallel_universe.registry, "generate_json_async", _fake_model)
    monkeypatch.setattr(parallel_universe, "_similarity", lambda _left, _right: 0.5)
    _, headers = _account("candidate-one@example.test")

    assert client.get("/api/v1/parallel-universe/profile").status_code == 401
    current = client.get("/api/v1/parallel-universe/profile", headers=headers)
    assert current.status_code == 200
    assert current.json()["verified_skills"] == []

    created = client.post("/api/v1/parallel-universe/sessions", headers=headers, json={})
    assert created.status_code == 201, created.text
    session = created.json()
    assert session["provider"] == "ollama"
    assert [future["id"] for future in session["futures"]] == ["future-a", "future-b", "future-c"]
    assert len({future["direction"] for future in session["futures"]}) == 3
    assert session["futures"][0]["milestones"]["six_months"]["simulated"] is True
    assert session["comparison"]["scores_are_predictions"] is False

    debate = client.post(f"/api/v1/parallel-universe/sessions/{session['id']}/debate", headers=headers, json={})
    assert debate.status_code == 200, debate.text
    assert len(debate.json()["turns"]) == 3
    assert len({turn["argument"] for turn in debate.json()["turns"]}) == 3

    decision = client.post(
        f"/api/v1/parallel-universe/sessions/{session['id']}/decisions",
        headers=headers,
        json={"decision": "Build a full-stack application"},
    )
    assert decision.status_code == 200, decision.text
    assert decision.json()["scenario_revision"] is True
    assert all("baseline_alignment" in outcome and "scenario_alignment" in outcome for outcome in decision.json()["outcomes"])

    reopened = client.get(f"/api/v1/parallel-universe/sessions/{session['id']}", headers=headers)
    assert reopened.status_code == 200
    assert reopened.json()["debate"] is not None
    assert len(reopened.json()["scenarios"]) == 1
    assert reopened.json()["scenarios"][0]["decision"] == "Build a full-stack application"
    assert client.get(f"/api/v1/parallel-universe/sessions/{session['id']}").status_code == 401


def test_parallel_universe_session_is_owned_by_its_authenticated_user(
    client: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(parallel_universe.registry, "generate_json", _fake_model)
    monkeypatch.setattr(parallel_universe.registry, "generate_json_async", _fake_model)
    _, first_headers = _account("first@example.test")
    _, second_headers = _account("second@example.test")
    created = client.post("/api/v1/parallel-universe/sessions", headers=first_headers, json={})
    assert created.status_code == 201, created.text
    session_id = created.json()["id"]

    denied = client.get(f"/api/v1/parallel-universe/sessions/{session_id}", headers=second_headers)
    assert denied.status_code == 404

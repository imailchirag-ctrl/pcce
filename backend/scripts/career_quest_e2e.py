"""Play the complete Career Quest arc against a running backend.

Usage:
    python backend/scripts/career_quest_e2e.py [base_url]

Requires the FastAPI service, a configured isolated runner, and local Ollama.
The script registers a throwaway candidate, plays all four missions with real
runner submissions, and prints the final report summary.
"""

from __future__ import annotations

import sys
import time
import uuid

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8001").rstrip("/")
API = f"{BASE}/api/v1"
REFERENCE = (
    "I reproduced the failure, checked the contract, tested the malformed and boundary "
    "cases, verified rollback readiness, and communicated risk and ownership before shipping."
)

SOLUTIONS = {
    "debug_billing_api": '''import json
import sys

def calculate_total(items):
    total = 0.0
    for item in items:
        try:
            if not item.get("active", False):
                continue
            price = item.get("unit_price")
            quantity = item.get("quantity", 0)
            if price is None or quantity is None:
                continue
            price = float(price)
            quantity = int(quantity)
            if price <= 0 or quantity <= 0:
                continue
            total += price * quantity
        except (TypeError, ValueError):
            continue
    return round(total, 2)

items = json.load(sys.stdin)
print(json.dumps(calculate_total(items)))
''',
    "implement_skill_ranking": '''import json
import sys

def rank_skills(scores, limit):
    ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0].lower(), item[0]))
    names = [name for name, _ in ranked]
    if limit is None:
        return names
    try:
        count = int(limit)
    except (TypeError, ValueError):
        return []
    if count < 0:
        return []
    return names[:count]

payload = json.load(sys.stdin)
print(json.dumps(rank_skills(payload["scores"], payload["limit"])))
''',
    "production_checkout_incident": '''import json
import sys

def recommend_action(metrics):
    if metrics["error_rate"] >= metrics["error_threshold"]:
        return "rollback"
    if metrics["p95_ms"] >= metrics["latency_threshold_ms"]:
        return "hold"
    return "monitor"

metrics = json.load(sys.stdin)
print(json.dumps(recommend_action(metrics)))
''',
    "final_boss_release": '''import json
import sys

def assess_release(report):
    if report["failing_critical_tests"] > 0 or report["error_rate"] >= report["error_threshold"]:
        return "rollback"
    if not report["rollback_verified"] or not report["migration_dry_run"]:
        return "hold"
    if report["p95_ms"] > report["latency_threshold_ms"]:
        return "hold"
    return "ship"

report = json.load(sys.stdin)
print(json.dumps(assess_release(report)))
''',
}


def fail(message: str, response: httpx.Response | None = None) -> None:
    print(f"FAIL: {message}")
    if response is not None:
        print(response.status_code, response.text[:1200])
    raise SystemExit(1)


def main() -> None:
    email = f"career-quest-e2e-{uuid.uuid4().hex[:10]}@example.test"
    client = httpx.Client(timeout=180)
    register = client.post(
        f"{API}/auth/register",
        json={
            "name": "Career Quest E2E",
            "email": email,
            "password": "local-test-password-123",
            "role": "candidate",
        },
    )
    if register.status_code != 200:
        fail("registration", register)
    headers = {"Authorization": f"Bearer {register.json()['token']}"}
    print(f"account: {email}")

    start = client.post(
        f"{API}/career-quests/runs",
        headers=headers,
        json={"career_key": "software_engineer", "difficulty": "beginner"},
    )
    if start.status_code != 201:
        fail("start run", start)
    run = start.json()
    print(f"run: {run['id']} · {run['company']['name']} · {run['progress']['total']} missions")

    for index in range(run["progress"]["total"]):
        mission_id = run["current_mission_id"]
        row = next(item for item in run["missions"] if item["id"] == mission_id)
        template = row["mission"]
        key = template["key"]
        print(f"\nMission {row['sequence']}: {template['title']} [{key}]")

        started = time.time()
        decision = client.post(
            f"{API}/career-quests/runs/{run['id']}/missions/{mission_id}/interactions",
            headers=headers,
            json={"action": "decision", "choices": [item["key"] for item in template["decisions"] if item["key"] in template.get("recommended_actions", [])] or [item["key"] for item in template["decisions"]][:2]},
        )
        if decision.status_code != 200:
            fail("decision", decision)
        run = decision.json()
        print(f"  decision + changing requirement  ({time.time() - started:.1f}s)")

        started = time.time()
        reflection = client.post(
            f"{API}/career-quests/runs/{run['id']}/missions/{mission_id}/interactions",
            headers=headers,
            json={"action": "reflection", "text": REFERENCE},
        )
        if reflection.status_code != 200:
            fail("reflection", reflection)
        run = reflection.json()
        print(f"  reflected debrief                ({time.time() - started:.1f}s)")

        started = time.time()
        attempt = client.post(
            f"{API}/career-quests/runs/{run['id']}/missions/{mission_id}/attempts",
            headers=headers,
            json={
                "language": "python",
                "source_code": SOLUTIONS[key],
                "idempotency_key": f"e2e-{mission_id}-{uuid.uuid4().hex[:8]}",
            },
        )
        if attempt.status_code != 202:
            fail("submit attempt", attempt)
        attempt_id = attempt.json()["attempt"]["id"]
        status = "QUEUED"
        for _ in range(180):
            result = client.get(
                f"{API}/career-quests/runs/{run['id']}/attempts/{attempt_id}", headers=headers
            )
            if result.status_code != 200:
                fail("poll attempt", result)
            payload = result.json()["attempt"]
            status = payload["status"]
            if status in {"COMPLETED", "UNAVAILABLE", "FAILED"}:
                break
            time.sleep(0.4)
        if status != "COMPLETED":
            fail(f"runner did not verify the solution ({status}): {payload}", result)
        print(
            f"  isolated tests: {payload['result']['passed_tests']}/{payload['result']['total_tests']} · {payload['score']}% ({time.time() - started:.1f}s)"
        )

        started = time.time()
        completion = client.post(
            f"{API}/career-quests/runs/{run['id']}/missions/{mission_id}/complete",
            headers=headers,
            json={},
        )
        if completion.status_code != 200:
            fail("complete mission", completion)
        body = completion.json()
        run = body["run"]
        print(
            f"  complete · +{body['xp_earned']} XP · overall {body['mission_score']['overall']}% ({time.time() - started:.1f}s)"
        )

    report_response = client.get(f"{API}/career-quests/runs/{run['id']}/report", headers=headers)
    if report_response.status_code != 200:
        fail("final report", report_response)
    report = report_response.json()
    progression = client.get(f"{API}/career-quests/progression", headers=headers).json()

    print("\n=== FINAL RESULT ===")
    print(f"run status: {run['status']} · progress {run['progress']['completed']}/{run['progress']['total']}")
    print(f"overall practice score: {report['overall_score']}%")
    print(f"career readiness: {report['career_readiness']['label']}")
    print(f"dimensions: {report['dimensions']}")
    print(f"level {progression['level']} · {progression['xp_total']} XP · {progression['completed_missions']} missions")
    print(f"achievements: {[item['achievement_key'] for item in progression['achievements']]}")
    print(f"report missions: {[item['title'] for item in report['mission_evidence']]}")
    print(f"roadmap linked: {bool(report.get('skillbridge_learning_roadmap'))}")
    print(f"resume after reload: {client.get(f'{API}/career-quests/runs/{run['id']}', headers=headers).status_code == 200}")


if __name__ == "__main__":
    main()

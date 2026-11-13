"""End-to-end tests for the connected Digital Twin -> Market -> Skill Exchange loop.

Embeddings are replaced by a deterministic double so no model download is needed;
live job providers are replaced by an in-process fake (no network).
"""

from __future__ import annotations

from typing import Any

import pytest

RESUME_ANALYSIS_A = {
    "target_role": "AI Engineer",
    "skills": [
        {"skill": "python", "confidence": 0.99, "evidence": "Built ML pipelines in Python"},
        {"skill": "machine learning", "confidence": 0.95, "evidence": "Trained machine learning models"},
        {"skill": "pytorch", "confidence": 0.9, "evidence": "PyTorch image classifier project"},
    ],
    "projects": {"lines": ["Image classifier in PyTorch reaching 92% accuracy"]},
}
RESUME_ANALYSIS_B = {
    "target_role": "Frontend Engineer",
    "skills": [
        {"skill": "react", "confidence": 0.99, "evidence": "Built React dashboards"},
        {"skill": "javascript", "confidence": 0.99, "evidence": "JavaScript"},
    ],
    "projects": {"lines": []},
}


@pytest.fixture(autouse=True)
def fake_models(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.ml import model_registry

    def embed(texts: list[str]) -> list[list[float]]:
        # Bag-of-characters vector: identical strings -> similarity 1, unrelated -> low.
        out = []
        for text in texts:
            vec = [0.0] * 26
            for ch in text.lower():
                if "a" <= ch <= "z":
                    vec[ord(ch) - 97] += 1
            out.append(vec)
        return out

    monkeypatch.setattr(model_registry.registry, "embed", embed)
    monkeypatch.setattr(model_registry.registry, "extract_keywords", lambda text, top_n=10: {"keywords": [], "method": "test"})


def _seed_resume(user_id: str, analysis: dict[str, Any]) -> None:
    from app import db

    db.save_resume(user_id, "resume.pdf", "application/pdf", "resume text", analysis)


def test_resume_claims_never_become_verified_and_quest_evidence_does(client: Any, create_account: Any, auth_headers: Any) -> None:
    from app import db
    from app.services import digital_twin

    account = create_account()
    uid = account["user"]["id"]
    _seed_resume(uid, RESUME_ANALYSIS_A)
    twin = client.post("/api/v1/twin/rebuild", headers=auth_headers(account)).json()
    statuses = {s["skill"]: s["status"] for s in twin["skills"]}
    assert statuses == {"python": "claimed", "machine learning": "claimed", "pytorch": "claimed"}
    assert all(s["proficiency"] < 40 for s in twin["skills"])
    pytorch = next(s for s in twin["skills"] if s["skill"] == "pytorch")
    assert "resume_project" in pytorch["sources"]

    # Runner-verified Career Quest evidence upgrades python to verified.
    with db.connection() as conn:
        conn.execute("INSERT INTO career_quest_runs (id, user_id, career_key, difficulty, catalog_version, started_at, updated_at) "
                     "VALUES ('run1', ?, 'software_engineer', 'easy', 'v1', ?, ?)", (uid, db.utcnow(), db.utcnow()))
        conn.execute("INSERT INTO career_quest_missions (id, run_id, sequence, template_key, template_version, mission_type, status, public_state_json) "
                     "VALUES ('m1', 'run1', 1, 'bugfix', 'v1', 'code', 'COMPLETED', '{}')")
        conn.execute("INSERT INTO career_quest_skill_evidence (id, run_id, mission_id, skill_key, dimension, score, rubric_version, evidence_refs_json, created_at) "
                     "VALUES ('e1', 'run1', 'm1', 'python', 'observed', 85, 'r1', '[]', ?)", (db.utcnow(),))
        conn.execute("INSERT INTO career_quest_skill_evidence (id, run_id, mission_id, skill_key, dimension, score, rubric_version, evidence_refs_json, created_at) "
                     "VALUES ('e2', 'run1', 'm1', 'communication', 'observed', 90, 'r1', '[]', ?)", (db.utcnow(),))
    twin = digital_twin.rebuild(uid, "assessment_completed")
    statuses = {s["skill"]: s["status"] for s in twin["skills"]}
    assert statuses["python"] == "verified"
    assert statuses["communication"] == "demonstrated"  # rubric-scored, not test-backed

    # Rebuilding twice does not duplicate evidence.
    digital_twin.rebuild(uid, "manual_refresh")
    with db.connection() as conn:
        n = conn.execute("SELECT COUNT(*) AS n FROM skill_evidence WHERE user_id = ? AND skill_key = 'python'", (uid,)).fetchone()["n"]
    assert n == 2  # one resume row + one quest row, deduplicated across rebuilds
    timeline = client.get("/api/v1/twin/timeline", headers=auth_headers(account)).json()["events"]
    assert any(e["kind"] == "snapshot" and "Python → verified" in e["detail"]["upgraded"] for e in timeline)


def test_graph_readiness_and_chat_are_grounded(client: Any, create_account: Any, auth_headers: Any) -> None:
    account = create_account()
    _seed_resume(account["user"]["id"], RESUME_ANALYSIS_A)
    headers = auth_headers(account)
    client.post("/api/v1/twin/rebuild", headers=headers)

    graph = client.get("/api/v1/twin/graph?role=ai engineer", headers=headers).json()
    ids = {n["id"] for n in graph["nodes"]}
    assert {"python", "llm", "rag"} <= ids
    assert any(p["skill"] == "statistics" for p in graph["missing_prerequisites"])
    assert any(e["kind"] == "prerequisite" for e in graph["edges"])

    ready = client.post("/api/v1/twin/readiness", headers=headers, json={"question": "Am I ready for an AI Engineer internship?"}).json()
    assert ready["comparison"]["role"]["role_key"] == "ai engineer"
    assert ready["verdict"] == "not_yet"
    assert "Python" in ready["unverified_claims"]
    assert "Rag" in ready["missing"] or "RAG" in ready["missing"]
    assert ready["next_steps"]

    chat = client.post("/api/v1/twin/chat", headers=headers, json={"question": "Which skills have I actually demonstrated?"}).json()
    assert chat["intent"] == "proven"
    assert "None yet" in chat["answer"]  # resume claims are not demonstrations
    chat = client.post("/api/v1/twin/chat", headers=headers, json={"question": "Which projects demonstrate my ML knowledge?"}).json()
    assert "PyTorch" in chat["answer"]


def test_market_providers_jd_analysis_and_comparison(client: Any, create_account: Any, auth_headers: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import market_intel

    class FakeProvider:
        key, label, homepage = "remotive", "fake", "https://example.test"
        calls = 0

        def fetch(self, query: str, limit: int) -> list[dict[str, Any]]:
            FakeProvider.calls += 1
            return [
                {"external_id": f"x{i}", "title": "Junior AI Engineer", "company": "Acme", "url": "https://example.test",
                 "text": "Python, PyTorch, LLM, RAG, FastAPI and Docker. Machine learning."}
                for i in range(4)
            ]

    class BrokenProvider:
        key, label, homepage = "arbeitnow", "broken", "https://example.test"

        def fetch(self, query: str, limit: int) -> list[dict[str, Any]]:
            raise TimeoutError("provider down")

    monkeypatch.setattr(market_intel, "PROVIDERS", {"remotive": FakeProvider(), "arbeitnow": BrokenProvider()})
    account = create_account()
    headers = auth_headers(account)
    _seed_resume(account["user"]["id"], RESUME_ANALYSIS_A)
    client.post("/api/v1/twin/rebuild", headers=headers)

    refreshed = client.post("/api/v1/market/refresh", headers=headers, json={"query": "ai engineer"}).json()
    by_provider = {r["provider"]: r for r in refreshed["results"]}
    assert by_provider["remotive"]["status"] == "ok" and by_provider["remotive"]["new_postings"] == 4
    assert by_provider["arbeitnow"]["status"] == "failed"  # graceful failure
    again = client.post("/api/v1/market/refresh", headers=headers, json={"query": "ai engineer"}).json()
    assert {r["provider"]: r["status"] for r in again["results"]}["remotive"] == "cached"
    assert FakeProvider.calls == 1

    dash = client.get("/api/v1/market/dashboard", headers=headers).json()
    assert dash["kinds"].get("live") == 4
    assert "sample" not in dash["kinds"]  # seed jobs never counted as market data
    assert dash["entry_level"]["postings"] == 4

    role = client.get("/api/v1/market/role/ai-engineer", headers=headers).json()
    assert role["requirements"]["source"] == "market"
    groups = role["comparison"]["groups"]
    assert "Python" in groups["claimed"] and "Docker" in groups["missing"]

    jd = client.post("/api/v1/market/analyze-jd", headers=headers, json={
        "title": "ML Intern", "text": "We need Python, SQL and scikit-learn experience. Exposure to Docker is a plus for this intern role."}).json()
    assert {"python", "sql", "scikit-learn"} <= {s["skill"] for s in jd["skills"]}

    other = create_account(email="other@example.test")
    other_dash = client.get("/api/v1/market/dashboard?scope=mine", headers=auth_headers(other)).json()
    assert other_dash["total_postings"] == 0  # pasted JDs stay private

    recs = client.get("/api/v1/market/recommendations", headers=headers).json()["roles"]
    assert recs and recs[0]["reasons"]


def test_exchange_matching_consent_safety_and_twin_feedback(client: Any, create_account: Any, auth_headers: Any) -> None:
    a = create_account(email="a@example.test", name="Asha Rao")
    b = create_account(email="b@example.test", name="Ben Lee")
    c = create_account(email="c@example.test", name="Cara Diaz")
    ha, hb, hc = auth_headers(a), auth_headers(b), auth_headers(c)
    _seed_resume(a["user"]["id"], RESUME_ANALYSIS_A)
    _seed_resume(b["user"]["id"], RESUME_ANALYSIS_B)

    # Twin -> Exchange suggestions.
    profile = client.get("/api/v1/exchange/profile", headers=ha).json()
    assert "Python" in profile["suggestions"]["teach"]

    base = {"level": "intermediate", "visibility": "members", "interests": ["ai products"]}
    assert client.put("/api/v1/exchange/profile", headers=ha, json={**base, "display_name": "Asha", "teach": ["Python", "Machine Learning"], "learn": ["React"]}).status_code == 200
    assert client.put("/api/v1/exchange/profile", headers=hb, json={**base, "display_name": "Ben", "teach": ["React", "JavaScript"], "learn": ["Machine Learning"]}).status_code == 200
    # Hidden profile never appears.
    client.put("/api/v1/exchange/profile", headers=hc, json={**base, "display_name": "Cara", "teach": ["React"], "learn": ["Python"], "visibility": "hidden"})

    # Moderation rejects contact details.
    bad = client.put("/api/v1/exchange/profile", headers=ha, json={**base, "display_name": "Asha", "headline": "mail me at a@x.com"})
    assert bad.status_code == 422

    found = client.get("/api/v1/exchange/matches", headers=ha).json()
    names = [m["member"]["display_name"] for m in found["matches"]]
    assert names == ["Ben"]
    match = found["matches"][0]
    assert match["mutual"] is True and "React" in match["they_can_teach"]
    assert "email" not in str(match).lower() and "b@example.test" not in str(match)

    # Project: create, request to join (consent), accept, tasks -> contribution -> twin.
    project = client.post("/api/v1/exchange/projects", headers=ha, json={
        "title": "Resume ranker", "description": "Rank resumes against job descriptions with embeddings.",
        "roles": [{"role": "Frontend", "skills": ["React"]}], "skills": ["Python", "React"]}).json()
    pid = project["id"]
    outsider_view = client.get(f"/api/v1/exchange/projects/{pid}", headers=hb).json()
    assert "tasks" not in outsider_view  # workspace hidden from non-members
    cands = client.get(f"/api/v1/exchange/projects/{pid}/candidates", headers=ha).json()["candidates"]
    assert [x["member"]["display_name"] for x in cands] == ["Ben"]
    assert client.post(f"/api/v1/exchange/projects/{pid}/tasks", headers=hb, json={"title": "Hack"}).status_code == 404

    req = client.post(f"/api/v1/exchange/projects/{pid}/join", headers=hb, json={"role": "Frontend", "message": "Happy to build the UI"}).json()
    assert client.post(f"/api/v1/exchange/requests/{req['id']}/decision", headers=hb, json={"accept": True}).status_code == 404  # only owner decides
    assert client.post(f"/api/v1/exchange/requests/{req['id']}/decision", headers=ha, json={"accept": True}).json()["status"] == "ACCEPTED"

    detail = client.post(f"/api/v1/exchange/projects/{pid}/tasks", headers=ha, json={
        "title": "Build upload UI", "skills": ["React", "TypeScript"], "assignee_id": b["user"]["id"]}).json()
    task_id = detail["tasks"][0]["id"]
    done = client.patch(f"/api/v1/exchange/projects/{pid}/tasks/{task_id}", headers=ha, json={"status": "DONE"}).json()
    assert done["contributions"][0]["peer_confirmed"] is True
    twin_b = client.get("/api/v1/twin", headers=hb).json()
    statuses = {s["skill"]: s["status"] for s in twin_b["skills"]}
    assert statuses["react"] == "demonstrated" and statuses["typescript"] == "demonstrated"

    # Block hides both ways and blocks requests.
    client.post("/api/v1/exchange/block", headers=hb, json={"member_id": a["user"]["id"]})
    assert client.get("/api/v1/exchange/matches", headers=ha).json()["matches"] == []
    assert client.post("/api/v1/exchange/connect", headers=ha, json={"member_id": b["user"]["id"]}).status_code == 404
    assert client.post("/api/v1/exchange/report", headers=hc, json={"target_type": "project", "target_id": pid, "reason": "spam content"}).status_code == 200


def test_intelligence_routes_require_auth(client: Any) -> None:
    for path in ("/api/v1/twin", "/api/v1/market/dashboard", "/api/v1/exchange/matches"):
        assert client.get(path).status_code == 401

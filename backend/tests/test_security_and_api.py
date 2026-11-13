from __future__ import annotations

import asyncio
import base64
import re
from tempfile import SpooledTemporaryFile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from starlette.datastructures import Headers
from starlette.requests import Request

REPO_DIR = Path(__file__).resolve().parents[2]


def _analysis(text: str, target_role: str, job_description: str) -> dict[str, Any]:
    return {
        "profile": {"name": "Synthetic Candidate", "summary": text[:80] or None},
        "target_role": target_role,
        "skill_names": ["python", "sql"],
        "required_skills": ["python", "sql"],
        "matched_skills": ["Python"],
        "partial_skills": [],
        "missing_skills": ["SQL"],
        "weighted_match_percent": 50.0,
        "readiness": {"score": 68},
        "job_description": job_description,
    }


def _request(url: str = "/api/v1/events") -> Request:
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": url,
        "raw_path": url.encode(),
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
        "root_path": "",
    }

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, receive)


def test_password_hashing_and_opaque_session_token() -> None:
    from app.security import hash_password, new_session_token, token_digest, verify_password

    encoded = hash_password("local-only-password")
    assert encoded.startswith("pbkdf2_sha256$320000$")
    assert verify_password("local-only-password", encoded)
    assert not verify_password("wrong-password", encoded)
    assert not verify_password("anything", None)

    first = new_session_token()
    second = new_session_token()
    assert first != second
    assert len(first) >= 60
    assert re.fullmatch(r"[0-9a-f]{64}", token_digest(first))
    assert token_digest(first) != first


def test_register_login_invalid_credentials_and_logout(
    client: TestClient, create_account: Any, auth_headers: Any, caplog: pytest.LogCaptureFixture
) -> None:
    account = create_account()
    assert account["user"]["email"] == "candidate@example.test"

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "CANDIDATE@example.test", "password": account["password"]},
    )
    assert login.status_code == 200
    token = login.json()["token"]
    assert token != account["token"]

    invalid = client.post(
        "/api/v1/auth/login",
        json={"email": "candidate@example.test", "password": "incorrect"},
    )
    assert invalid.status_code == 401
    assert "incorrect" in invalid.json()["error"]["message"].lower()
    assert account["password"] not in caplog.text
    assert "candidate@example.test" not in caplog.text

    logout = client.post("/api/v1/auth/logout", headers=auth_headers(account))
    assert logout.status_code == 200
    assert client.get("/api/v1/auth/session", headers=auth_headers(account)).status_code == 401


def test_session_expiration_is_enforced_with_temporary_database(
    client: TestClient, create_account: Any, auth_headers: Any
) -> None:
    from app import db
    from app.security import token_digest

    account = create_account()
    expired_token = "test-expired-token"
    expired_at = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    db.create_session(account["user"]["id"], token_digest(expired_token), expired_at)

    response = client.get("/api/v1/auth/session", headers={"Authorization": f"Bearer {expired_token}"})
    assert response.status_code == 401
    assert client.get("/api/v1/auth/session", headers=auth_headers(account)).status_code == 200


def test_session_table_stores_only_token_digest(client: TestClient, create_account: Any) -> None:
    from app import db

    account = create_account()
    with db.connection() as conn:
        row = conn.execute("SELECT token_hash FROM sessions WHERE user_id = ?", (account["user"]["id"],)).fetchone()
    assert row is not None
    assert row["token_hash"] != account["token"]
    assert re.fullmatch(r"[0-9a-f]{64}", row["token_hash"])


def test_profile_retrieval_and_edit_are_scoped_to_authenticated_user(
    client: TestClient, create_account: Any, auth_headers: Any
) -> None:
    account = create_account()
    session = client.get("/api/v1/auth/session", headers=auth_headers(account))
    assert session.status_code == 200
    assert session.json()["user"]["id"] == account["user"]["id"]

    update = client.put(
        "/api/v1/auth/profile",
        headers=auth_headers(account),
        json={"headline": "Local test profile", "years_experience": 3},
    )
    assert update.status_code == 200
    assert update.json()["user"]["headline"] == "Local test profile"
    assert "password_hash" not in update.json()["user"]


def test_upload_and_base64_resume_parse_validate_filename_and_size(
    client: TestClient, create_account: Any, auth_headers: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api import product

    monkeypatch.setattr(product, "analyze_resume", _analysis)
    account = create_account()
    headers = auth_headers(account)
    text = b"Synthetic resume\nPython and SQL experience"

    uploaded = client.post(
        "/api/v1/resume/upload",
        headers=headers,
        files={"file": ("../../synthetic.txt", text, "text/plain")},
        data={"target_role": "software engineer"},
    )
    assert uploaded.status_code == 200
    assert uploaded.json()["document"]["filename"] == "synthetic.txt"
    assert uploaded.json()["analysis"]["readiness"]["score"] == 68

    parsed = client.post(
        "/api/v1/resume/parse",
        headers=headers,
        json={
            "filename": "portable.txt",
            "content_base64": base64.b64encode(text).decode(),
            "target_role": "data analyst",
        },
    )
    assert parsed.status_code == 200
    assert parsed.json()["document"]["parser"] == "plain_text"

    invalid = client.post(
        "/api/v1/resume/parse",
        headers=headers,
        json={"filename": "../../unsafe.exe", "content_base64": "YWJj"},
    )
    assert invalid.status_code == 422

    oversized_content = b"x" * (10 * 1024 * 1024 + 1)
    upload_buffer = SpooledTemporaryFile(max_size=20 * 1024 * 1024)
    upload_buffer.write(oversized_content)
    upload_buffer.seek(0)
    oversized_file = UploadFile(file=upload_buffer, filename="large.txt", headers=Headers({"content-type": "text/plain"}))
    with pytest.raises(HTTPException) as error:
        asyncio.run(product.resume_upload(oversized_file, "software engineer", "", account["user"]))
    assert error.value.status_code == 413


def test_resume_analysis_readiness_and_skill_gap_scores(
    client: TestClient, create_account: Any, auth_headers: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app import db
    from app.api import product
    from app.ml import skill_extractor
    from app.ml.skill_extractor import match_skills

    monkeypatch.setattr(product, "analyze_resume", _analysis)
    monkeypatch.setattr(
        skill_extractor.registry,
        "embed",
        lambda texts: [[1.0, 0.0] if text.lower() == "python" else [0.0, 1.0] for text in texts],
    )
    account = create_account()
    response = client.post(
        "/api/v1/career/analyze",
        headers=auth_headers(account),
        json={"resume_text": "Python developer", "target_role": "software engineer"},
    )
    assert response.status_code == 200
    assert response.json()["readiness"]["score"] == 68
    assert response.json()["weighted_match_percent"] == 50.0
    assert db.latest_analysis(account["user"]["id"])["readiness"]["score"] == 68

    exact = match_skills(["python"], ["python", "sql"])
    assert exact["coverage"] == 50.0
    assert exact["weighted_coverage"] == 50.0
    assert exact["matched_names"] == ["python"]
    assert exact["missing_names"] == ["sql"]


def test_job_matching_and_saved_jobs_are_user_scoped(
    client: TestClient, create_account: Any, auth_headers: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app import db
    from app.api import product

    monkeypatch.setattr(
        product,
        "rank_jobs",
        lambda skills, text, **kwargs: {
            "jobs": [], "count": 0, "candidate_skills": skills, "method": "test-double",
            "reranker": {"method": "disabled"}, "inference_ms": 0, "notice": "test",
        },
    )
    account_a = create_account(email="a@example.test")
    account_b = create_account(email="b@example.test")
    job = db.get_job("j1")
    assert job is not None

    matched = client.post(
        "/api/v1/jobs/match",
        headers=auth_headers(account_a),
        json={"candidate_skills": ["react"], "resume_text": "React work"},
    )
    assert matched.status_code == 200
    assert matched.json()["method"] == "test-double"

    saved = client.post(f"/api/v1/jobs/{job['id']}/save", headers=auth_headers(account_a))
    assert saved.status_code == 200
    assert job["id"] in saved.json()["saved_job_ids"]
    assert client.get("/api/v1/jobs/saved/list", headers=auth_headers(account_b)).json()["saved_job_ids"] == []


def test_job_application_and_notifications(client: TestClient, create_account: Any, auth_headers: Any) -> None:
    from app import db

    account = create_account()
    job = db.get_job("j1")
    assert job is not None
    applied = client.post(f"/api/v1/jobs/{job['id']}/apply", headers=auth_headers(account))
    assert applied.status_code == 200
    assert applied.json()["application"]["user_id"] == account["user"]["id"]
    listed = client.get("/api/v1/applications", headers=auth_headers(account))
    assert listed.status_code == 200
    assert len(listed.json()["applications"]) == 1

    notifications = client.get("/api/v1/notifications", headers=auth_headers(account)).json()
    assert notifications["unread"] >= 1
    marked = client.post("/api/v1/notifications/read", headers=auth_headers(account))
    assert marked.status_code == 200
    assert client.get("/api/v1/notifications", headers=auth_headers(account)).json()["unread"] == 0


def test_learning_roadmap_is_persisted_and_user_isolated(
    client: TestClient, create_account: Any, auth_headers: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api import product

    roadmap = {
        "target_role": "Software Engineer",
        "items": [{"id": "gap-1", "skill": "SQL", "completed": False, "estimated_hours": 3}],
        "courses": [], "projects": [], "weekly_focus": [], "total_hours": 3,
        "provider": "deterministic", "llm": {"used_llm": False}, "inference_ms": 0, "notice": "test",
    }
    monkeypatch.setattr(product, "generate_roadmap", lambda *args, **kwargs: roadmap.copy())
    first = create_account(email="roadmap-a@example.test")
    second = create_account(email="roadmap-b@example.test")
    generated = client.post(
        "/api/v1/learning/roadmap",
        headers=auth_headers(first),
        json={"missing_skills": ["sql"], "target_role": "software engineer", "use_llm": False},
    )
    assert generated.status_code == 200
    assert client.get("/api/v1/learning/roadmap", headers=auth_headers(second)).json()["roadmap"] is None
    toggled = client.patch(
        "/api/v1/learning/roadmap/items/gap-1",
        headers=auth_headers(first),
        json={"completed": True},
    )
    assert toggled.status_code == 200
    assert toggled.json()["roadmap"]["items"][0]["completed"] is True


def test_interview_generation_evaluation_and_completion_are_owned(
    client: TestClient, create_account: Any, auth_headers: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api import product

    monkeypatch.setattr(
        product,
        "generate_questions",
        lambda *args, **kwargs: {
            "role": "Engineer", "mode": "technical", "difficulty": "intermediate",
            "questions": [{"prompt": "How would you test an API?", "topic": "testing", "why": "test"}],
            "provider": "test-double", "llm": {"used_llm": False}, "inference_ms": 0, "notice": "test",
        },
    )
    monkeypatch.setattr(
        product,
        "evaluate_answer",
        lambda *args, **kwargs: {"overall": 75, "dimensions": {}, "weights": {}, "word_count": 10,
                                 "strengths": [], "improvements": [], "rubric": "test", "llm": {"used_llm": False},
                                 "inference_ms": 0, "method": "test-double", "notice": "test"},
    )
    first = create_account(email="interview-a@example.test")
    second = create_account(email="interview-b@example.test")
    started = client.post(
        "/api/v1/interviews/questions",
        headers=auth_headers(first),
        json={"role": "Engineer", "mode": "technical", "use_llm": False},
    )
    assert started.status_code == 200
    session_id = started.json()["session_id"]
    question_id = started.json()["questions"][0]["id"]
    evaluated = client.post(
        "/api/v1/interviews/evaluate",
        headers=auth_headers(first),
        json={"question": "How would you test an API?", "answer": "I would test it carefully.",
              "session_id": session_id, "question_id": question_id, "use_llm": False},
    )
    assert evaluated.status_code == 200
    assert evaluated.json()["overall"] == 75
    assert client.get(f"/api/v1/interviews/sessions/{session_id}", headers=auth_headers(second)).status_code == 404
    complete = client.post(
        "/api/v1/interviews/complete", headers=auth_headers(first),
        json={"session_id": session_id, "score": 75},
    )
    assert complete.status_code == 200
    assert complete.json()["status"] == "COMPLETED"


def test_unauthorized_resource_access_and_user_data_isolation(
    client: TestClient, create_account: Any, auth_headers: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api import product

    monkeypatch.setattr(product, "analyze_resume", _analysis)
    first = create_account(email="isolation-a@example.test")
    second = create_account(email="isolation-b@example.test")
    no_auth = client.get("/api/v1/resume/latest")
    assert no_auth.status_code == 401

    uploaded = client.post(
        "/api/v1/resume/upload", headers=auth_headers(first),
        files={"file": ("resume.txt", b"Python developer", "text/plain")},
    )
    resume_id = uploaded.json()["resume_id"]
    assert client.get("/api/v1/resume/latest", headers=auth_headers(second)).json()["resume"] is None
    assert client.delete(f"/api/v1/resume/{resume_id}", headers=auth_headers(second)).status_code == 404
    assert client.get("/api/v1/resume/history", headers=auth_headers(second)).json()["resumes"] == []


def test_sse_requires_authentication_and_closes_subscriber(client: TestClient) -> None:
    from app.api.auth import events
    from app.realtime import hub

    assert client.get("/api/v1/events").status_code == 401
    assert hub.count() == 0
    response = asyncio.run(events(_request(), {"id": "local-test-user"}))

    async def consume_first_frame() -> str:
        frame = await anext(response.body_iterator)
        await response.body_iterator.aclose()
        return frame

    assert asyncio.run(consume_first_frame()) == "retry: 3000\n\n"
    assert hub.count() == 0


def test_sql_injection_payload_is_treated_as_data(
    client: TestClient, create_account: Any, auth_headers: Any
) -> None:
    recruiter = create_account(email="recruiter@example.test", role="recruiter", company="Test Co")
    response = client.get(
        "/api/v1/recruiter/candidates",
        headers=auth_headers(recruiter),
        params={"q": "' OR 1=1 --"},
    )
    assert response.status_code == 200
    assert response.json()["candidates"] == []


def test_frontend_cookie_and_oauth_state_contracts_are_present() -> None:
    cookie = (REPO_DIR / "src/lib/session-constants.ts").read_text()
    oauth_callback = (REPO_DIR / "src/app/api/auth/google/callback/route.ts").read_text()

    assert "httpOnly: true" in cookie
    assert 'sameSite: "lax"' in cookie
    assert 'secure: process.env.NODE_ENV === "production"' in cookie
    assert "state !== storedState" in oauth_callback
    assert "!code || !state || !storedState" in oauth_callback


@pytest.mark.xfail(strict=True, reason="Audit finding A-04: the bridge verifies an existing email even when the payload is unverified.")
def test_oauth_bridge_does_not_verify_an_unverified_google_identity(
    client: TestClient, create_account: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app import db
    from app.api import auth

    account = create_account(email="oauth-link@example.test")
    monkeypatch.setattr(auth.settings, "internal_api_secret", "local-test-internal-secret")
    payload = auth.OAuthPayload(
        email="oauth-link@example.test", name="Unverified Local Profile", email_verified=False
    )
    asyncio.run(auth.oauth_session(payload, _request("/api/v1/auth/oauth"), "local-test-internal-secret"))
    record = db.get_user_record(account["user"]["id"])
    assert record["email_verified"] == 0


@pytest.mark.xfail(strict=True, reason="Audit finding A-05: no explicit CSRF/Origin guard on cookie-backed mutations.")
def test_cookie_mutation_proxy_has_explicit_csrf_guard() -> None:
    proxy = (REPO_DIR / "src/app/api/backend/[...path]/route.ts").read_text()
    assert "Origin" in proxy or "csrf" in proxy.lower()


@pytest.mark.xfail(strict=True, reason="Audit finding A-01: candidate job detail currently returns draft records.")
def test_candidate_cannot_read_draft_job(
    client: TestClient, create_account: Any, auth_headers: Any
) -> None:
    from app import db

    recruiter = create_account(email="draft-owner@example.test", role="recruiter")
    candidate = create_account(email="draft-reader@example.test")
    draft = db.create_job({
        "id": "private-draft", "title": "Private Draft", "description": "Internal role description",
        "required_skills": [], "tags": [], "recruiter_id": recruiter["user"]["id"], "status": "DRAFT",
    })
    assert draft["status"] == "DRAFT"
    response = client.get(f"/api/v1/jobs/{draft['id']}", headers=auth_headers(candidate))
    assert response.status_code == 404


@pytest.mark.xfail(strict=True, reason="Audit finding A-02: update helper returns a job after an ownership miss.")
def test_recruiter_cannot_read_or_report_success_for_another_recruiters_job(
    client: TestClient, create_account: Any, auth_headers: Any
) -> None:
    from app import db

    owner = create_account(email="job-owner@example.test", role="recruiter")
    other = create_account(email="other-recruiter@example.test", role="recruiter")
    job = db.create_job({
        "id": "owned-by-first", "title": "Owned Job", "description": "A role owned by the first recruiter.",
        "required_skills": [], "tags": [], "recruiter_id": owner["user"]["id"], "status": "DRAFT",
    })
    response = client.patch(
        f"/api/v1/jobs/{job['id']}", headers=auth_headers(other), json={"status": "CLOSED"}
    )
    assert response.status_code == 404

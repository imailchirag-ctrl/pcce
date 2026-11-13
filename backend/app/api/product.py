from __future__ import annotations

import base64
import binascii
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from app import db
from app.deps import current_user
from app.ml.interview_evaluator import evaluate_answer
from app.ml.interview_generator import generate_questions
from app.ml.job_recommender import rank_jobs, recommend_courses
from app.ml.model_registry import registry
from app.ml.resume_analyzer import analyze_resume
from app.ml.roadmap_generator import generate_roadmap
from app.ml.skill_extractor import extract_skill_details, match_skills, semantic_similarity
from app.ml.skill_taxonomy import ROLE_CATALOG, role_profile
from app.realtime import hub
from app.services import digital_twin
from app.services.document import DocumentError, extract_text, safe_filename

router = APIRouter()


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class ResumePayload(BaseModel):
    filename: str = Field(min_length=1, max_length=240)
    content_base64: str = Field(min_length=1)
    target_role: str = Field(default="software engineer", max_length=120)


class ResumeTextPayload(BaseModel):
    resume_text: str = Field(default="", max_length=60_000)
    target_role: str = Field(default="software engineer", max_length=120)
    job_description: str = Field(default="", max_length=30_000)
    use_latest_resume: bool = True


class ComparePayload(BaseModel):
    resume_text: str = Field(default="", max_length=60_000)
    job_description: str = Field(default="", max_length=30_000)


class RoadmapPayload(BaseModel):
    missing_skills: list[str] = Field(default_factory=list, max_length=30)
    target_role: str = Field(default="software engineer", max_length=120)
    learner_context: str = Field(default="", max_length=3000)
    use_llm: bool = True


class RoadmapTogglePayload(BaseModel):
    completed: bool


class InterviewPayload(BaseModel):
    role: str = Field(default="Frontend Engineer", min_length=2, max_length=120)
    mode: str = Field(default="technical", max_length=60)
    difficulty: str = Field(default="intermediate", max_length=30)
    resume_context: str = Field(default="", max_length=6000)
    skills: list[str] = Field(default_factory=list, max_length=40)
    use_llm: bool = True
    save_session: bool = True


class AnswerPayload(BaseModel):
    question: str = Field(min_length=4, max_length=1500)
    answer: str = Field(min_length=4, max_length=12_000)
    role: str = Field(default="the target role", max_length=120)
    session_id: str | None = Field(default=None, max_length=80)
    question_id: str | None = Field(default=None, max_length=80)
    use_llm: bool = True


class CompleteInterviewPayload(BaseModel):
    session_id: str = Field(min_length=4, max_length=80)
    score: int = Field(ge=0, le=100)


class JobMatchPayload(BaseModel):
    candidate_skills: list[str] = Field(default_factory=list, max_length=120)
    resume_text: str = Field(default="", max_length=60_000)
    use_reranker: bool = False
    limit: int = Field(default=12, ge=1, le=50)


class JobCreatePayload(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    company: str = Field(default="", max_length=160)
    location: str = Field(default="Remote", max_length=160)
    employment_type: str = Field(default="Full-time", max_length=60)
    salary: str = Field(default="Not disclosed", max_length=80)
    description: str = Field(min_length=20, max_length=20_000)
    required_skills: list[str] = Field(default_factory=list, max_length=40)
    tags: list[str] = Field(default_factory=list, max_length=20)


class JobStatusPayload(BaseModel):
    status: str = Field(pattern="^(DRAFT|PUBLISHED|CLOSED)$")


class ApplicationStatusPayload(BaseModel):
    status: str = Field(
        pattern="^(APPLIED|REVIEWING|SHORTLISTED|INTERVIEW|OFFER|REJECTED|WITHDRAWN)$"
    )


class WarmPayload(BaseModel):
    models: list[str] = Field(default_factory=lambda: ["embeddings", "spacy"], max_length=8)


def _require_recruiter(user: dict[str, Any]) -> None:
    if user.get("role") != "recruiter":
        raise HTTPException(403, "This action is available to recruiter accounts.")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Health, model status, public counters
# ---------------------------------------------------------------------------
@router.get("/health", tags=["health"])
async def health_check() -> dict[str, Any]:
    ollama = registry.ollama_status()
    return {
        "status": "ok",
        "service": "skillbridge-ai",
        "database": "sqlite",
        "realtime_clients": hub.count(),
        "models": {
            "embeddings_loaded": registry._embedder is not None,
            "spacy_loaded": registry._nlp is not None,
            "llm_reachable": ollama.get("reachable", False),
            "llm_model_available": ollama.get("available", False),
        },
    }


@router.get("/models/status", tags=["models"])
async def models_status() -> dict[str, Any]:
    return registry.status()


@router.post("/models/warm", tags=["models"])
async def warm_models(payload: WarmPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """Explicitly load selected models. Never downloads every model at once."""
    del user
    started = time.perf_counter()
    results: dict[str, Any] = {}
    for model in payload.models:
        key = model.lower().strip()
        try:
            if key in {"embeddings", "embedding", "minilm"}:
                registry.load_embedder()
                results[key] = {"loaded": True}
            elif key in {"spacy", "ner"}:
                registry.load_spacy()
                results[key] = {"loaded": True}
            elif key in {"llm", "qwen", "ollama"}:
                results[key] = registry.ollama_status(force=True)
            elif key in {"reranker", "bge"}:
                registry.rerank("warmup query", ["warmup document"])
                results[key] = {"loaded": registry._reranker is not None, "error": registry._reranker_error}
            elif key in {"whisper", "voice"}:
                results[key] = {
                    "loaded": registry._whisper is not None,
                    "enabled": registry.status()["hardware"]["whisper_enabled"],
                }
            else:
                results[key] = {"error": "Unknown model key."}
        except Exception as exc:  # noqa: BLE001
            results[key] = {"loaded": False, "error": str(exc)}
    return {
        "results": results,
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
        "status": registry.status(),
    }


@router.get("/public/stats", tags=["public"])
async def public_stats() -> dict[str, Any]:
    return db.public_stats()


# ---------------------------------------------------------------------------
# Resume
# ---------------------------------------------------------------------------
def _analyze_and_store(
    user_id: str,
    text: str,
    filename: str,
    mime_type: str,
    target_role: str,
    job_description: str,
) -> dict[str, Any]:
    analysis = analyze_resume(text, target_role, job_description)
    resume_id = db.save_resume(user_id, filename, mime_type, text, analysis)
    digital_twin.refresh_quietly(user_id, "resume_upload")
    return {"resume_id": resume_id, "analysis": analysis, "text_preview": text[:1200]}


@router.post("/resume/upload", tags=["resume"])
async def resume_upload(
    file: UploadFile = File(...),
    target_role: str = Form("software engineer"),
    job_description: str = Form(""),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    started = time.perf_counter()
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "Keep your resume under 10 MB.")
    try:
        text, parser = extract_text(file.filename or "resume", data)
    except DocumentError as exc:
        raise HTTPException(422, str(exc)) from exc
    result = _analyze_and_store(
        user["id"],
        text,
        safe_filename(file.filename or "resume"),
        file.content_type or "application/octet-stream",
        target_role,
        job_description,
    )
    result["document"] = {
        "filename": safe_filename(file.filename or "resume"),
        "bytes": len(data),
        "parser": parser,
        "characters": len(text),
    }
    result["elapsed_ms"] = round((time.perf_counter() - started) * 1000, 1)
    db.log_event(
        user["id"],
        "resume",
        "Resume analyzed",
        f"{result['analysis']['skill_names'].__len__()} skills detected · "
        f"{result['analysis']['readiness']['score']}% readiness",
        {"resume_id": result["resume_id"]},
    )
    hub.publish(user["id"], "resume", {"resume_id": result["resume_id"]})
    hub.publish(user["id"], "dashboard", {})
    return result


@router.post("/resume/parse", tags=["resume"])
async def resume_parse(payload: ResumePayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        data = base64.b64decode(payload.content_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(422, "Resume content must be valid base64.") from exc
    try:
        text, parser = extract_text(payload.filename, data)
    except DocumentError as exc:
        raise HTTPException(422, str(exc)) from exc
    result = _analyze_and_store(
        user["id"],
        text,
        safe_filename(payload.filename),
        "application/octet-stream",
        payload.target_role,
        "",
    )
    result["document"] = {"filename": payload.filename, "bytes": len(data), "parser": parser}
    hub.publish(user["id"], "resume", {})
    return result


@router.post("/resume/analyze", tags=["resume"])
async def resume_analyze(payload: ResumeTextPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    text = payload.resume_text.strip()
    if not text and payload.use_latest_resume:
        latest = db.latest_resume(user["id"])
        text = (latest or {}).get("text", "")
    if not text:
        raise HTTPException(422, "Provide resume text or upload a resume first.")
    analysis = analyze_resume(text, payload.target_role, payload.job_description)
    db.save_analysis(user["id"], analysis)
    hub.publish(user["id"], "resume", {})
    return {"analysis": analysis}


@router.get("/resume/latest", tags=["resume"])
async def resume_latest(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    latest = db.latest_resume(user["id"])
    if not latest:
        return {"analysis": None, "resume": None}
    return {
        "analysis": latest["analysis"],
        "resume": {
            "id": latest["id"],
            "filename": latest["filename"],
            "mime_type": latest["mime_type"],
            "created_at": latest["created_at"],
        },
    }


@router.get("/resume/history", tags=["resume"])
async def resume_history(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"resumes": db.list_resumes(user["id"])}


@router.delete("/resume/{resume_id}", tags=["resume"])
async def resume_delete(resume_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    removed = db.delete_resume(user["id"], resume_id)
    if not removed:
        raise HTTPException(404, "Resume not found.")
    db.log_event(user["id"], "resume", "Resume removed", "The stored resume was deleted from your account.")
    hub.publish(user["id"], "resume", {})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Career intelligence
# ---------------------------------------------------------------------------
@router.get("/career/roles", tags=["career"])
async def career_roles() -> dict[str, Any]:
    return {
        "roles": [
            {
                "key": key,
                "title": value["title"],
                "summary": value["summary"],
                "skills": value["skills"],
            }
            for key, value in ROLE_CATALOG.items()
        ]
    }


@router.post("/career/analyze", tags=["career"])
async def career_analyze(payload: ResumeTextPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    text = payload.resume_text.strip()
    if not text and payload.use_latest_resume:
        latest = db.latest_resume(user["id"])
        text = (latest or {}).get("text", "")
    if not text:
        raise HTTPException(422, "Upload a resume first or provide resume text.")
    analysis = analyze_resume(text, payload.target_role, payload.job_description)
    db.save_analysis(user["id"], analysis)
    db.log_event(
        user["id"],
        "career",
        f"Matched against {analysis['target_role']}",
        f"{analysis['weighted_match_percent']}% weighted skill coverage",
        {"target_role": analysis["target_role"]},
    )
    hub.publish(user["id"], "resume", {})
    hub.publish(user["id"], "dashboard", {})
    return analysis


@router.post("/career/compare", tags=["career"])
async def career_compare(payload: ComparePayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    text = payload.resume_text.strip()
    if not text:
        latest = db.latest_resume(user["id"])
        text = (latest or {}).get("text", "")
    if not text or not payload.job_description.strip():
        raise HTTPException(422, "A resume and job description are required.")
    resume_skills = extract_skill_details(text, semantic=True)["names"]
    jd_skills = extract_skill_details(payload.job_description, semantic=True)["names"]
    match = match_skills(resume_skills, jd_skills)
    semantic = semantic_similarity(text, payload.job_description) * 100
    return {
        "semantic_similarity": round(semantic, 1),
        "matched_skills": [item["display"] for item in match["matched"]],
        "partial_skills": [item["display"] for item in match["partial"]],
        "missing_skills": [item["display"] for item in match["missing"]],
        "skill_coverage": match["coverage"],
        "weighted_coverage": match["weighted_coverage"],
        "job_description_skills": jd_skills,
        "method": "minilm_semantic_similarity_plus_skill_taxonomy",
        "notice": "Semantic similarity is not a hiring probability.",
    }


@router.get("/profile/analysis", tags=["career"])
async def profile_analysis(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"analysis": db.latest_analysis(user["id"])}


@router.get("/career/role/{role_key}", tags=["career"])
async def career_role(role_key: str) -> dict[str, Any]:
    return role_profile(role_key)


# ---------------------------------------------------------------------------
# Jobs and applications
# ---------------------------------------------------------------------------
@router.get("/jobs", tags=["jobs"])
async def jobs_list(
    scope: str = Query(default="published", pattern="^(published|mine|all)$"),
    limit: int = Query(default=40, ge=1, le=100),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    if scope == "mine":
        if user.get("role") != "recruiter":
            return {"jobs": []}
        return {"jobs": db.list_recruiter_jobs(user["id"])[:limit]}
    if scope == "all":
        _require_recruiter(user)
        return {"jobs": db.list_jobs(published_only=False)[:limit]}
    return {"jobs": db.list_jobs()[:limit]}


@router.post("/jobs", tags=["jobs"])
async def jobs_create(payload: JobCreatePayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    _require_recruiter(user)
    data = payload.model_dump()
    data["company"] = data.get("company") or user.get("company") or f"{user['name']}'s company"
    data["recruiter_id"] = user["id"]
    data["created_by_name"] = user["name"]
    job = db.create_job(data)
    db.log_event(user["id"], "job", f"Published {job['title']}", f"{job['location']} · {job['employment_type']}")
    hub.publish(user["id"], "recruiter", {"job_id": job["id"]})
    return job


@router.patch("/jobs/{job_id}", tags=["jobs"])
async def jobs_update_status(
    job_id: str,
    payload: JobStatusPayload,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    _require_recruiter(user)
    job = db.update_job_status(job_id, user["id"], payload.status)
    if not job:
        raise HTTPException(404, "Job not found for this recruiter.")
    db.log_event(user["id"], "job", f"{job['title']} set to {payload.status.lower()}", None)
    hub.publish(user["id"], "recruiter", {"job_id": job_id})
    return job


@router.post("/jobs/match", tags=["jobs"])
async def jobs_match(payload: JobMatchPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if not payload.candidate_skills and not payload.resume_text.strip():
        latest = db.latest_resume(user["id"])
        analysis = (latest or {}).get("analysis") or {}
        payload.candidate_skills = analysis.get("skill_names", [])
        payload.resume_text = (latest or {}).get("text", "")[:20_000]
    if not payload.candidate_skills and not payload.resume_text.strip():
        raise HTTPException(422, "Upload a resume or add skills before matching jobs.")
    candidates = db.list_jobs()
    if user.get("role") == "recruiter":
        owned = {job["id"] for job in db.list_recruiter_jobs(user["id"])}
        candidates = [job for job in candidates if job["id"] not in owned]
    return rank_jobs(
        payload.candidate_skills,
        payload.resume_text,
        jobs=candidates,
        use_reranker=payload.use_reranker,
        limit=payload.limit,
    )


@router.get("/jobs/saved/list", tags=["jobs"])
async def jobs_saved(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {
        "saved_job_ids": db.list_saved_jobs(user["id"]),
        "jobs": [job for job in db.list_jobs() if job["id"] in set(db.list_saved_jobs(user["id"]))],
    }


@router.post("/jobs/{job_id}/save", tags=["jobs"])
async def job_save(job_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found.")
    saved = db.toggle_saved_job(user["id"], job_id)
    hub.publish(user["id"], "jobs", {"job_id": job_id})
    return {"saved_job_ids": saved}


@router.post("/jobs/{job_id}/apply", tags=["jobs"])
async def job_apply(job_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found.")
    application = db.apply_to_job(user["id"], job_id)
    db.log_event(user["id"], "application", f"Applied to {job['title']}", f"{job['company']} · {job['location']}")
    hub.publish(user["id"], "applications", {"job_id": job_id})
    hub.publish(user["id"], "dashboard", {})
    if job.get("recruiter_id"):
        hub.publish(job["recruiter_id"], "recruiter", {"job_id": job_id})
    return {"application": application}


@router.get("/applications", tags=["jobs"])
async def applications_list(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"applications": db.list_applications(user["id"])}


@router.get("/jobs/{job_id}", tags=["jobs"])
async def job_detail(job_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    del user
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found.")
    return job


# ---------------------------------------------------------------------------
# Recruiter
# ---------------------------------------------------------------------------
@router.get("/recruiter/overview", tags=["recruiter"])
async def recruiter_overview(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    _require_recruiter(user)
    overview = db.recruiter_overview(user["id"])
    overview["candidates"] = len(db.list_candidates(limit=100))
    return overview


@router.get("/recruiter/candidates", tags=["recruiter"])
async def recruiter_candidates(
    q: str = Query(default="", max_length=120),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    _require_recruiter(user)
    return {"candidates": db.list_candidates(query=q)}


@router.get("/recruiter/pipeline", tags=["recruiter"])
async def recruiter_pipeline(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    _require_recruiter(user)
    return {"applications": db.recruiter_applications(user["id"])}


@router.patch("/recruiter/applications/{application_id}", tags=["recruiter"])
async def recruiter_update_application(
    application_id: str,
    payload: ApplicationStatusPayload,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    _require_recruiter(user)
    updated = db.update_application_status(application_id, user["id"], payload.status)
    if not updated:
        raise HTTPException(404, "Application not found for this recruiter.")
    job = db.get_job(updated["job_id"]) or {}
    db.log_event(
        updated["user_id"],
        "application",
        f"Application moved to {payload.status.title()}",
        f"{job.get('title', 'Your application')} · {job.get('company', '')}".strip(" ·"),
    )
    hub.publish(updated["user_id"], "applications", {"application_id": application_id})
    hub.publish(updated["user_id"], "dashboard", {})
    hub.publish(user["id"], "recruiter", {"application_id": application_id})
    return updated


# ---------------------------------------------------------------------------
# Learning
# ---------------------------------------------------------------------------
@router.post("/learning/roadmap", tags=["learning"])
async def learning_roadmap(payload: RoadmapPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    missing = payload.missing_skills
    if not missing:
        latest = db.latest_analysis(user["id"])
        missing = (latest or {}).get("missing_skills", [])
    roadmap = generate_roadmap(
        missing,
        payload.target_role,
        use_llm=payload.use_llm,
        learner_context=payload.learner_context,
    )
    db.save_roadmap(user["id"], payload.target_role, roadmap)
    db.log_event(
        user["id"],
        "learning",
        "Learning roadmap generated",
        f"{len(roadmap['items'])} steps · {roadmap['total_hours']} hours",
    )
    hub.publish(user["id"], "roadmap", {})
    hub.publish(user["id"], "dashboard", {})
    return roadmap


@router.get("/learning/roadmap", tags=["learning"])
async def learning_roadmap_get(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"roadmap": db.get_roadmap(user["id"])}


@router.patch("/learning/roadmap/items/{item_id}", tags=["learning"])
async def learning_roadmap_toggle(
    item_id: str,
    payload: RoadmapTogglePayload,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    roadmap = db.toggle_roadmap_item(user["id"], item_id, payload.completed)
    if roadmap is None:
        raise HTTPException(404, "Generate a roadmap before updating progress.")
    digital_twin.refresh_quietly(user["id"], "learning_milestone")
    hub.publish(user["id"], "roadmap", {"item_id": item_id})
    hub.publish(user["id"], "dashboard", {})
    return {"roadmap": roadmap}


@router.post("/learning/courses", tags=["learning"])
async def learning_courses(payload: RoadmapPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    del user
    return {"courses": recommend_courses(payload.missing_skills)}


# ---------------------------------------------------------------------------
# Interviews
# ---------------------------------------------------------------------------
@router.post("/interviews/questions", tags=["interviews"])
async def interview_questions(payload: InterviewPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    result = generate_questions(
        payload.role,
        payload.mode,
        payload.difficulty,
        payload.resume_context,
        payload.skills,
        use_llm=payload.use_llm,
    )
    if payload.save_session and result["questions"]:
        session_id = db.create_interview_session(
            user["id"],
            payload.role,
            payload.mode,
            payload.difficulty,
            result["questions"],
            str(result.get("provider") or "unknown"),
        )
        session = db.get_interview_session(session_id)
        result["session_id"] = session_id
        result["questions"] = session["questions"] if session else result["questions"]
        db.log_event(user["id"], "interview", f"Started a {payload.mode} interview", payload.role)
        hub.publish(user["id"], "interviews", {"session_id": session_id})
    return result


@router.post("/interviews/evaluate", tags=["interviews"])
async def interview_evaluate(payload: AnswerPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if payload.session_id:
        session = db.get_interview_session(payload.session_id)
        if session and session["user_id"] != user["id"]:
            raise HTTPException(403, "This interview session belongs to another account.")
    result = evaluate_answer(payload.question, payload.answer, role=payload.role, use_llm=payload.use_llm)
    if payload.session_id and payload.question_id:
        db.save_interview_answer(payload.session_id, payload.question_id, payload.answer, result)
    hub.publish(user["id"], "interviews", {"session_id": payload.session_id})
    return result


@router.post("/interviews/complete", tags=["interviews"])
async def interview_complete(payload: CompleteInterviewPayload, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    session = db.get_interview_session(payload.session_id)
    if not session or session["user_id"] != user["id"]:
        raise HTTPException(404, "Interview session not found.")
    db.complete_interview_session(payload.session_id, payload.score)
    db.log_event(
        user["id"],
        "interview",
        f"Completed a {session['mode']} interview",
        f"Score {payload.score}% · {session['role']}",
        {"session_id": payload.session_id, "score": payload.score},
    )
    hub.publish(user["id"], "interviews", {"session_id": payload.session_id})
    hub.publish(user["id"], "dashboard", {})
    return db.get_interview_session(payload.session_id) or {}


@router.get("/interviews/history", tags=["interviews"])
async def interview_history(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"sessions": db.interview_history(user["id"])}


@router.get("/interviews/sessions/{session_id}", tags=["interviews"])
async def interview_session(session_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    session = db.get_interview_session(session_id)
    if not session or session["user_id"] != user["id"]:
        raise HTTPException(404, "Interview session not found.")
    return session


# ---------------------------------------------------------------------------
# Voice
# ---------------------------------------------------------------------------
@router.post("/voice/transcribe", tags=["voice"])
async def voice_transcribe(
    file: UploadFile = File(...),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    del user
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(413, "Audio must be 15 MB or smaller.")
    suffix = ".webm"
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()[:5]
    return registry.transcribe(data, suffix=suffix if suffix in {".webm", ".wav", ".mp3", ".m4a", ".ogg"} else ".webm")


# ---------------------------------------------------------------------------
# Dashboard and notifications
# ---------------------------------------------------------------------------
def _profile_completeness(user: dict[str, Any]) -> int:
    fields = [
        user.get("name"),
        user.get("headline"),
        user.get("location"),
        user.get("bio"),
        user.get("target_role"),
        user.get("avatar_url"),
        user.get("website") or user.get("linkedin") or user.get("github"),
        user.get("phone"),
    ]
    return round(sum(1 for value in fields if value) / len(fields) * 100)


@router.get("/dashboard", tags=["dashboard"])
async def dashboard(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    latest = db.latest_resume(user["id"])
    analysis = (latest or {}).get("analysis")
    roadmap = db.get_roadmap(user["id"])
    interviews = db.interview_history(user["id"])
    analyses = db.list_analyses(user["id"])
    applications = db.application_status_counts(user["id"])
    saved = db.saved_job_count(user["id"])
    events = db.list_events(user["id"], limit=12)
    completed_interviews = [item for item in interviews if item.get("status") == "COMPLETED" and item.get("score") is not None]
    roadmap_items = (roadmap or {}).get("items", [])
    completed_items = [item for item in roadmap_items if item.get("completed")]
    learning_hours = sum(int(item.get("estimated_hours") or 0) for item in completed_items)
    total_hours = sum(int(item.get("estimated_hours") or 0) for item in roadmap_items)
    skills_by_category: dict[str, list[str]] = (analysis or {}).get("skills_by_category", {})
    skill_total = len((analysis or {}).get("skill_names", []))
    readiness_trend = [
        {
            "date": item["created_at"][:10],
            "readiness": item["readiness"],
            "match": item["weighted_match"],
            "role": item["target_role"],
        }
        for item in reversed(analyses)
        if item.get("readiness") is not None
    ]
    interview_trend = [
        {
            "date": (item.get("completed_at") or item.get("created_at") or "")[:10],
            "score": item.get("score"),
            "type": item.get("mode") or item.get("role"),
        }
        for item in reversed(completed_interviews)
        if item.get("score") is not None
    ]
    return {
        "profile_completeness": _profile_completeness(user),
        "profile": user,
        "resume": None
        if not latest
        else {
            "id": latest["id"],
            "filename": latest["filename"],
            "created_at": latest["created_at"],
        },
        "analysis": analysis,
        "match": (analysis or {}).get("match"),
        "skills": {
            "total": skill_total,
            "matched": len((analysis or {}).get("matched_skills", [])),
            "partial": len((analysis or {}).get("partial_skills", [])),
            "missing": len((analysis or {}).get("missing_skills", [])),
            "by_category": skills_by_category,
        },
        "readiness": (analysis or {}).get("readiness"),
        "readiness_trend": readiness_trend,
        "interview_trend": interview_trend,
        "interviews": {
            "total": len(interviews),
            "completed": len(completed_interviews),
            "average_score": round(
                sum(item["score"] for item in completed_interviews) / len(completed_interviews)
            )
            if completed_interviews
            else None,
        },
        "applications": {"counts": applications, "total": sum(applications.values())},
        "saved_jobs": saved,
        "roadmap": {
            "exists": bool(roadmap),
            "items": len(roadmap_items),
            "completed": len(completed_items),
            "percent": round(len(completed_items) / len(roadmap_items) * 100) if roadmap_items else 0,
            "learning_hours": learning_hours,
            "total_hours": total_hours,
            "target_role": (roadmap or {}).get("target_role"),
        },
        "activity": events,
        "generated_at": _now(),
    }


@router.get("/notifications", tags=["notifications"])
async def notifications(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    items = db.list_events(user["id"], limit=30)
    return {"notifications": items, "unread": sum(1 for item in items if not item["read"])}


@router.post("/notifications/read", tags=["notifications"])
async def notifications_read(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    count = db.mark_events_read(user["id"])
    hub.publish(user["id"], "notifications", {"read": count})
    return {"marked": count}

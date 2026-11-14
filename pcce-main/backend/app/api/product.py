from __future__ import annotations

import base64
import binascii
import time
from typing import Any

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from app import db
from app.ml.interview_evaluator import evaluate_answer
from app.ml.interview_generator import generate_questions
from app.ml.job_recommender import rank_jobs, recommend_courses
from app.ml.model_registry import registry
from app.ml.resume_analyzer import analyze_resume
from app.ml.roadmap_generator import generate_roadmap
from app.ml.skill_extractor import extract_skill_details, match_skills, semantic_similarity
from app.ml.skill_taxonomy import ROLE_CATALOG, role_profile
from app.services.document import DocumentError, extract_text, safe_filename

router = APIRouter()


def demo_user(x_demo_user: str | None = Header(default=None)) -> str:
    return (x_demo_user or "demo-candidate").strip()[:80] or "demo-candidate"


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


class InterviewPayload(BaseModel):
    role: str = Field(default="Frontend Engineer", min_length=2, max_length=120)
    mode: str = Field(default="technical", max_length=60)
    difficulty: str = Field(default="intermediate", max_length=30)
    count: int = Field(default=12, ge=5, le=25)
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
    company: str = Field(default="SkillBridge Partner", max_length=160)
    location: str = Field(default="Remote", max_length=160)
    employment_type: str = Field(default="Full-time", max_length=60)
    salary: str = Field(default="Not disclosed", max_length=80)
    description: str = Field(min_length=20, max_length=20_000)
    required_skills: list[str] = Field(default_factory=list, max_length=40)
    tags: list[str] = Field(default_factory=list, max_length=20)


class ProfilePayload(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    email: str | None = Field(default=None, max_length=240)
    target_role: str | None = Field(default=None, max_length=120)


class WarmPayload(BaseModel):
    models: list[str] = Field(default_factory=lambda: ["embeddings", "spacy"], max_length=8)


class FramePayload(BaseModel):
    frame_b64: str = Field(min_length=10)
    session_id: str | None = Field(default=None, max_length=120)
    timestamp: float | None = Field(default=None)


class ProctorActionPayload(BaseModel):
    session_id: str = Field(min_length=1, max_length=120)
    action: str = Field(min_length=2, max_length=40)
    message: str | None = Field(default=None, max_length=500)
    sender: str | None = Field(default="Interviewer", max_length=80)


# ---------------------------------------------------------------------------
# Health and model status
# ---------------------------------------------------------------------------
@router.get("/health", tags=["health"])
async def health_check() -> dict[str, Any]:
    ollama = registry.ollama_status()
    return {
        "status": "ok",
        "service": "skillbridge-ai",
        "database": "sqlite",
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
async def warm_models(payload: WarmPayload) -> dict[str, Any]:
    """Explicitly load selected models. Never downloads every model at once."""
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
    return {"resume_id": resume_id, "analysis": analysis, "text_preview": text[:1200]}


@router.post("/resume/upload", tags=["resume"])
async def resume_upload(
    file: UploadFile = File(...),
    target_role: str = Form("software engineer"),
    job_description: str = Form(""),
    x_demo_user: str | None = Header(default=None),
) -> dict[str, Any]:
    started = time.perf_counter()
    data = await file.read()
    try:
        text, parser = extract_text(file.filename or "resume", data)
    except DocumentError as exc:
        raise HTTPException(422, str(exc)) from exc
    user_id = demo_user(x_demo_user)
    result = _analyze_and_store(
        user_id,
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
    return result


@router.post("/resume/parse", tags=["resume"])
async def resume_parse(payload: ResumePayload, x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    try:
        data = base64.b64decode(payload.content_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(422, "Resume content must be valid base64.") from exc
    try:
        text, parser = extract_text(payload.filename, data)
    except DocumentError as exc:
        raise HTTPException(422, str(exc)) from exc
    user_id = demo_user(x_demo_user)
    result = _analyze_and_store(
        user_id,
        text,
        safe_filename(payload.filename),
        "application/octet-stream",
        payload.target_role,
        "",
    )
    result["document"] = {"filename": payload.filename, "bytes": len(data), "parser": parser}
    return result


@router.post("/resume/analyze", tags=["resume"])
async def resume_analyze(payload: ResumeTextPayload, x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    text = payload.resume_text.strip()
    if not text and payload.use_latest_resume:
        latest = db.latest_resume(demo_user(x_demo_user))
        text = (latest or {}).get("text", "")
    if not text:
        raise HTTPException(422, "Provide resume text or upload a resume first.")
    user_id = demo_user(x_demo_user)
    analysis = analyze_resume(text, payload.target_role, payload.job_description)
    db.save_analysis(user_id, analysis)
    return {"analysis": analysis}


@router.get("/resume/latest", tags=["resume"])
async def resume_latest(x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    latest = db.latest_resume(demo_user(x_demo_user))
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
async def resume_history(x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    return {"resumes": db.list_resumes(demo_user(x_demo_user))}


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
async def career_analyze(payload: ResumeTextPayload, x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    user_id = demo_user(x_demo_user)
    text = payload.resume_text.strip()
    if not text and payload.use_latest_resume:
        latest = db.latest_resume(user_id)
        text = (latest or {}).get("text", "")
    if not text:
        raise HTTPException(422, "Upload a resume first or provide resume text.")
    analysis = analyze_resume(text, payload.target_role, payload.job_description)
    db.save_analysis(user_id, analysis)
    return analysis


@router.post("/career/compare", tags=["career"])
async def career_compare(payload: ComparePayload, x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    text = payload.resume_text.strip()
    if not text:
        latest = db.latest_resume(demo_user(x_demo_user))
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
async def profile_analysis(x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    return {"analysis": db.latest_analysis(demo_user(x_demo_user))}


# ---------------------------------------------------------------------------
# Jobs and applications
# ---------------------------------------------------------------------------
@router.get("/jobs", tags=["jobs"])
async def jobs_list(limit: int = Query(default=20, ge=1, le=50)) -> dict[str, Any]:
    return {"jobs": db.list_jobs()[:limit]}


@router.post("/jobs", tags=["jobs"])
async def jobs_create(payload: JobCreatePayload) -> dict[str, Any]:
    return db.create_job(payload.model_dump())


@router.post("/jobs/match", tags=["jobs"])
async def jobs_match(payload: JobMatchPayload) -> dict[str, Any]:
    if not payload.candidate_skills and not payload.resume_text.strip():
        raise HTTPException(422, "Provide candidate skills or resume text.")
    return rank_jobs(
        payload.candidate_skills,
        payload.resume_text,
        use_reranker=payload.use_reranker,
        limit=payload.limit,
    )


@router.get("/jobs/saved/list", tags=["jobs"])
async def jobs_saved(x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    return {"saved_job_ids": db.list_saved_jobs(demo_user(x_demo_user))}


@router.post("/jobs/{job_id}/save", tags=["jobs"])
async def job_save(job_id: str, x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    if not db.get_job(job_id):
        raise HTTPException(404, "Job not found.")
    return {"saved_job_ids": db.toggle_saved_job(demo_user(x_demo_user), job_id)}


@router.post("/jobs/{job_id}/apply", tags=["jobs"])
async def job_apply(job_id: str, x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    if not db.get_job(job_id):
        raise HTTPException(404, "Job not found.")
    return {"application": db.apply_to_job(demo_user(x_demo_user), job_id)}


@router.get("/applications", tags=["jobs"])
async def applications_list(x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    return {"applications": db.list_applications(demo_user(x_demo_user))}


@router.get("/jobs/{job_id}", tags=["jobs"])
async def job_detail(job_id: str) -> dict[str, Any]:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found.")
    return job


# ---------------------------------------------------------------------------
# Learning
# ---------------------------------------------------------------------------
@router.post("/learning/roadmap", tags=["learning"])
async def learning_roadmap(payload: RoadmapPayload, x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    missing = payload.missing_skills
    if not missing:
        latest = db.latest_analysis(demo_user(x_demo_user))
        missing = (latest or {}).get("missing_skills", [])
    return generate_roadmap(
        missing,
        payload.target_role,
        use_llm=payload.use_llm,
        learner_context=payload.learner_context,
    )


@router.post("/learning/courses", tags=["learning"])
async def learning_courses(payload: RoadmapPayload) -> dict[str, Any]:
    return {"courses": recommend_courses(payload.missing_skills)}


# ---------------------------------------------------------------------------
# Interviews
# ---------------------------------------------------------------------------
@router.post("/interviews/questions", tags=["interviews"])
async def interview_questions(payload: InterviewPayload, x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    result = generate_questions(
        payload.role,
        payload.mode,
        payload.difficulty,
        payload.resume_context,
        payload.skills,
        count=payload.count,
        use_llm=payload.use_llm,
    )
    if payload.save_session and result["questions"]:
        session_id = db.create_interview_session(
            demo_user(x_demo_user),
            payload.role,
            payload.mode,
            payload.difficulty,
            result["questions"],
            str(result.get("provider") or "unknown"),
        )
        session = db.get_interview_session(session_id)
        result["session_id"] = session_id
        result["questions"] = session["questions"] if session else result["questions"]
    return result


@router.post("/interviews/evaluate", tags=["interviews"])
async def interview_evaluate(payload: AnswerPayload) -> dict[str, Any]:
    result = evaluate_answer(payload.question, payload.answer, role=payload.role, use_llm=payload.use_llm)
    if payload.session_id and payload.question_id:
        db.save_interview_answer(payload.session_id, payload.question_id, payload.answer, result)
    return result


@router.post("/interviews/complete", tags=["interviews"])
async def interview_complete(payload: CompleteInterviewPayload) -> dict[str, Any]:
    db.complete_interview_session(payload.session_id, payload.score)
    session = db.get_interview_session(payload.session_id)
    if not session:
        raise HTTPException(404, "Interview session not found.")
    return session


@router.get("/interviews/history", tags=["interviews"])
async def interview_history(x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    return {"sessions": db.interview_history(demo_user(x_demo_user))}


@router.get("/interviews/sessions/{session_id}", tags=["interviews"])
async def interview_session(session_id: str) -> dict[str, Any]:
    session = db.get_interview_session(session_id)
    if not session:
        raise HTTPException(404, "Interview session not found.")
    return session


@router.post("/interviews/anticheat", tags=["interviews"])
async def interview_anticheat(payload: FramePayload) -> dict[str, Any]:
    from app.ml.anti_cheat import analyze_frame
    return analyze_frame(payload.frame_b64, session_id=payload.session_id, timestamp=payload.timestamp)


@router.post("/interviews/anticheat/reset/{session_id}", tags=["interviews"])
async def interview_anticheat_reset(session_id: str) -> dict[str, Any]:
    from app.ml.anti_cheat import reset_session
    reset_session(session_id)
    return {"status": "ok", "message": f"Proctoring session {session_id} reset"}


@router.get("/interviews/anticheat/proctor/{session_id}", tags=["interviews"])
async def interview_anticheat_proctor(session_id: str) -> dict[str, Any]:
    from app.ml.anti_cheat import get_session
    session = get_session(session_id)
    if not session:
        return {
            "session_id": session_id,
            "connected": False,
            "latest_frame_b64": "",
            "latest_telemetry": {},
            "latest_boxes": {},
            "multi_face_strikes": 0,
            "terminated": False,
            "negative_marking": None,
            "events_log": [],
            "proctor_messages": [],
            "integrity_score": 100,
        }
    negative_marking = None
    if session.terminated_for_cheating:
        negative_marking = {
            "penalty_score": -25,
            "status": "DISQUALIFIED",
            "verdict": "FAIL - Disqualified for Repeated Multiple Candidates Malpractice",
            "strike_records": session.strike_records,
            "incident_summary": (
                "Candidate detected with secondary unauthorized individuals in the examination room on 3 separate occasions. "
                "Automatic termination triggered under strict academic and interview proctoring guidelines."
            ),
        }
    return {
        "session_id": session.session_id,
        "connected": True,
        "latest_frame_b64": session.latest_frame_b64,
        "latest_telemetry": session.latest_telemetry,
        "latest_boxes": session.latest_boxes,
        "multi_face_strikes": session.multi_face_strikes,
        "terminated": session.terminated_for_cheating,
        "negative_marking": negative_marking,
        "events_log": [
            {
                "id": ev.id,
                "rule": ev.rule,
                "event_type": ev.event_type,
                "severity": ev.severity,
                "description": ev.description,
                "duration_seconds": ev.duration_seconds,
                "active": True,
            }
            for ev in session.active_events.values()
        ] + session.completed_events[-15:],
        "proctor_messages": session.proctor_messages[-10:],
        "integrity_score": session.integrity_score,
    }


@router.post("/interviews/anticheat/proctor/action", tags=["interviews"])
async def interview_anticheat_proctor_action(payload: ProctorActionPayload) -> dict[str, Any]:
    from datetime import datetime, timezone
    from app.ml.anti_cheat import add_proctor_message, get_or_create_session
    session = get_or_create_session(payload.session_id)
    action = payload.action.upper()
    sender = payload.sender or "Interviewer"
    msg = payload.message or f"Proctor action: {action}"

    if action == "WARN":
        add_proctor_message(payload.session_id, f"WARNING: {msg}", sender=sender)
        session.integrity_score = max(0, session.integrity_score - 10)
    elif action == "ADD_STRIKE":
        session.multi_face_strikes += 1
        now_str = datetime.now(timezone.utc).strftime("%H:%M:%S")
        session.strike_records.append({
            "strike_number": session.multi_face_strikes,
            "timestamp": now_str,
            "reason": msg,
        })
        add_proctor_message(payload.session_id, f"STRIKE {session.multi_face_strikes}/3 ISSUED: {msg}", sender=sender)
        if session.multi_face_strikes >= 3:
            session.terminated_for_cheating = True
            session.integrity_score = 0
    elif action == "TERMINATE":
        session.multi_face_strikes = max(3, session.multi_face_strikes)
        session.terminated_for_cheating = True
        session.integrity_score = 0
        add_proctor_message(payload.session_id, f"TERMINATION DISPATCHED: {msg}", sender=sender)
    elif action == "RESET_STRIKES":
        session.multi_face_strikes = 0
        session.terminated_for_cheating = False
        add_proctor_message(payload.session_id, "Strikes have been reset by proctor.", sender=sender)
    elif action == "MESSAGE":
        add_proctor_message(payload.session_id, msg, sender=sender)

    return {
        "status": "ok",
        "action": action,
        "session_id": payload.session_id,
        "multi_face_strikes": session.multi_face_strikes,
        "terminated": session.terminated_for_cheating,
    }


# ---------------------------------------------------------------------------
# Voice
# ---------------------------------------------------------------------------
@router.post("/voice/transcribe", tags=["voice"])
async def voice_transcribe(file: UploadFile = File(...)) -> dict[str, Any]:
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(413, "Audio must be 15 MB or smaller.")
    suffix = ".webm"
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()[:5]
    result = registry.transcribe(data, suffix=suffix if suffix in {".webm", ".wav", ".mp3", ".m4a", ".ogg"} else ".webm")
    return result


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------
@router.get("/profile", tags=["profile"])
async def get_profile(x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    return {"profile": db.profile(demo_user(x_demo_user))}


@router.put("/profile", tags=["profile"])
async def put_profile(payload: ProfilePayload, x_demo_user: str | None = Header(default=None)) -> dict[str, Any]:
    return {"profile": db.upsert_profile(demo_user(x_demo_user), **payload.model_dump())}


@router.get("/career/role/{role_key}", tags=["career"])
async def career_role(role_key: str) -> dict[str, Any]:
    role = role_profile(role_key)
    return role

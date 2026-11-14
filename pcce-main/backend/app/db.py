"""Small SQLite persistence layer for the local-first demo.

The production data contract lives in ``prisma/schema.prisma``. This module keeps
the hackathon build runnable without a hosted database while preserving clean
repository boundaries: API routes never talk to SQL directly.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from app.core.config import get_settings

_lock = threading.RLock()
_initialized = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  target_role TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resumes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  text TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  resume_id TEXT,
  target_role TEXT,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  employment_type TEXT,
  salary TEXT,
  description TEXT NOT NULL,
  required_skills_json TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  posted TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_jobs (
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'APPLIED',
  created_at TEXT NOT NULL,
  UNIQUE (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  mode TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  score INTEGER,
  provider TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_interviews_user ON interview_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS interview_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  topic TEXT,
  why TEXT
);

CREATE TABLE IF NOT EXISTS interview_answers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  evaluation_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
"""

SEED_JOBS: list[dict[str, Any]] = [
    {
        "id": "j1",
        "title": "Frontend Engineer",
        "company": "Northstar Labs",
        "location": "Remote · India",
        "employment_type": "Full-time",
        "salary": "₹12–18 LPA",
        "posted": "2 days ago",
        "tags": ["React", "TypeScript", "Design systems"],
        "required_skills": ["react", "typescript", "javascript", "git", "rest apis", "communication"],
        "description": (
            "Build accessible, high-performance product experiences with React and TypeScript. "
            "You will own reusable component systems, collaborate with designers, review code, "
            "and improve Core Web Vitals across customer-facing journeys. Experience with testing, "
            "REST APIs and design systems is valued."
        ),
    },
    {
        "id": "j2",
        "title": "Product Engineer",
        "company": "Orbit Health",
        "location": "Bengaluru · Hybrid",
        "employment_type": "Full-time",
        "salary": "₹14–20 LPA",
        "posted": "1 day ago",
        "tags": ["React", "Node.js", "SQL"],
        "required_skills": ["react", "node.js", "sql", "typescript", "rest apis", "problem solving"],
        "description": (
            "Join a small product team shipping patient-facing healthcare workflows. You will move "
            "between React interfaces, Node.js services and PostgreSQL queries, instrument features, "
            "and partner with clinical operations. Strong product judgement and clear communication matter."
        ),
    },
    {
        "id": "j3",
        "title": "UI Developer",
        "company": "Fable Studio",
        "location": "Remote · India",
        "employment_type": "Contract",
        "salary": "₹9–14 LPA",
        "posted": "4 days ago",
        "tags": ["JavaScript", "CSS", "Accessibility"],
        "required_skills": ["javascript", "css", "html", "accessibility", "git", "teamwork"],
        "description": (
            "Translate expressive visual designs into resilient interfaces. The role focuses on CSS "
            "architecture, animation, semantic HTML, accessibility audits and close collaboration with "
            "motion designers. Portfolio examples of shipped interfaces are required."
        ),
    },
    {
        "id": "j4",
        "title": "Full-stack Developer",
        "company": "Pebble Finance",
        "location": "Pune · Hybrid",
        "employment_type": "Full-time",
        "salary": "₹16–22 LPA",
        "posted": "3 days ago",
        "tags": ["TypeScript", "PostgreSQL", "AWS"],
        "required_skills": ["typescript", "node.js", "postgresql", "aws", "docker", "rest apis"],
        "description": (
            "Own features end to end across a TypeScript frontend and Node.js services. You will model "
            "financial data in PostgreSQL, deploy containers to AWS, add observability and work with "
            "compliance partners on secure data handling."
        ),
    },
    {
        "id": "j5",
        "title": "Machine Learning Engineer",
        "company": "Signal Craft",
        "location": "Remote · India",
        "employment_type": "Full-time",
        "salary": "₹18–26 LPA",
        "posted": "5 days ago",
        "tags": ["Python", "PyTorch", "MLOps"],
        "required_skills": ["python", "pytorch", "machine learning", "numpy", "docker", "sql"],
        "description": (
            "Take recommendation and ranking models from notebook to production. You will build data "
            "pipelines in Python, train and evaluate PyTorch models, package services with Docker, and "
            "monitor model quality. Experience with embeddings and vector search is a plus."
        ),
    },
    {
        "id": "j6",
        "title": "Data Analyst",
        "company": "Loom Analytics",
        "location": "Hyderabad · On-site",
        "employment_type": "Full-time",
        "salary": "₹8–13 LPA",
        "posted": "1 week ago",
        "tags": ["SQL", "Python", "Dashboards"],
        "required_skills": ["sql", "python", "pandas", "statistics", "communication", "data visualization"],
        "description": (
            "Turn operational data into decisions. You will write SQL, build dashboards, design "
            "experiments, and explain findings to non-technical partners. Comfort with pandas and "
            "statistical reasoning is essential."
        ),
    },
]


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    settings = get_settings()
    settings.ensure_directories()
    conn = sqlite3.connect(settings.database_path, check_same_thread=False, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    global _initialized
    with _lock:
        if _initialized:
            return
        with connection() as conn:
            conn.executescript(SCHEMA)
            count = conn.execute("SELECT COUNT(*) AS count FROM jobs").fetchone()["count"]
            if not count:
                for job in SEED_JOBS:
                    conn.execute(
                        """
                        INSERT INTO jobs (id, title, company, location, employment_type, salary,
                                          description, required_skills_json, tags_json, posted, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            job["id"],
                            job["title"],
                            job["company"],
                            job["location"],
                            job["employment_type"],
                            job["salary"],
                            job["description"],
                            json.dumps(job["required_skills"]),
                            json.dumps(job["tags"]),
                            job["posted"],
                            utcnow(),
                        ),
                    )
        _initialized = True


def _row_to_job(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "company": row["company"],
        "location": row["location"],
        "employment_type": row["employment_type"],
        "salary": row["salary"],
        "description": row["description"],
        "required_skills": json.loads(row["required_skills_json"]),
        "tags": json.loads(row["tags_json"]),
        "posted": row["posted"],
    }


def list_jobs() -> list[dict[str, Any]]:
    init_db()
    with connection() as conn:
        rows = conn.execute("SELECT * FROM jobs ORDER BY created_at ASC").fetchall()
    return [_row_to_job(row) for row in rows]


def get_job(job_id: str) -> dict[str, Any] | None:
    init_db()
    with connection() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return _row_to_job(row) if row else None


def create_job(job: dict[str, Any]) -> dict[str, Any]:
    init_db()
    job_id = job.get("id") or f"job-{uuid.uuid4().hex[:10]}"
    with connection() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO jobs (id, title, company, location, employment_type, salary,
                                         description, required_skills_json, tags_json, posted, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                job["title"],
                job.get("company", "SkillBridge Partner"),
                job.get("location", "Remote"),
                job.get("employment_type", "Full-time"),
                job.get("salary", "Not disclosed"),
                job["description"],
                json.dumps(job.get("required_skills", [])),
                json.dumps(job.get("tags", [])),
                "Just now",
                utcnow(),
            ),
        )
    stored = get_job(job_id)
    assert stored is not None
    return stored


def save_resume(
    user_id: str,
    filename: str,
    mime_type: str,
    text: str,
    analysis: dict[str, Any],
) -> str:
    init_db()
    resume_id = f"resume-{uuid.uuid4().hex[:12]}"
    with connection() as conn:
        conn.execute(
            "INSERT INTO resumes (id, user_id, filename, mime_type, text, analysis_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (resume_id, user_id, filename, mime_type, text, json.dumps(analysis), utcnow()),
        )
        conn.execute(
            "INSERT INTO analyses (id, user_id, resume_id, target_role, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                f"analysis-{uuid.uuid4().hex[:12]}",
                user_id,
                resume_id,
                analysis.get("target_role"),
                json.dumps(analysis),
                utcnow(),
            ),
        )
    return resume_id


def latest_analysis(user_id: str) -> dict[str, Any] | None:
    init_db()
    with connection() as conn:
        row = conn.execute(
            "SELECT result_json FROM analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
            (user_id,),
        ).fetchone()
    return json.loads(row["result_json"]) if row else None


def save_analysis(user_id: str, analysis: dict[str, Any], resume_id: str | None = None) -> None:
    init_db()
    with connection() as conn:
        conn.execute(
            "INSERT INTO analyses (id, user_id, resume_id, target_role, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                f"analysis-{uuid.uuid4().hex[:12]}",
                user_id,
                resume_id,
                analysis.get("target_role"),
                json.dumps(analysis),
                utcnow(),
            ),
        )


def list_resumes(user_id: str) -> list[dict[str, Any]]:
    init_db()
    with connection() as conn:
        rows = conn.execute(
            "SELECT id, filename, mime_type, created_at FROM resumes WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def latest_resume(user_id: str) -> dict[str, Any] | None:
    init_db()
    with connection() as conn:
        row = conn.execute(
            "SELECT id, filename, mime_type, text, analysis_json, created_at FROM resumes "
            "WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
            (user_id,),
        ).fetchone()
    if not row:
        return None
    result = dict(row)
    result["analysis"] = json.loads(result.pop("analysis_json"))
    return result


def profile(user_id: str) -> dict[str, Any] | None:
    init_db()
    with connection() as conn:
        row = conn.execute("SELECT * FROM profiles WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def upsert_profile(user_id: str, **values: Any) -> dict[str, Any]:
    init_db()
    now = utcnow()
    with connection() as conn:
        conn.execute(
            "INSERT INTO profiles (id, name, email, target_role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET name=COALESCE(excluded.name, profiles.name), "
            "email=COALESCE(excluded.email, profiles.email), "
            "target_role=COALESCE(excluded.target_role, profiles.target_role), updated_at=excluded.updated_at",
            (user_id, values.get("name"), values.get("email"), values.get("target_role"), now, now),
        )
    stored = profile(user_id)
    assert stored is not None
    return stored


def toggle_saved_job(user_id: str, job_id: str) -> list[str]:
    init_db()
    with connection() as conn:
        exists = conn.execute(
            "SELECT 1 FROM saved_jobs WHERE user_id = ? AND job_id = ?", (user_id, job_id)
        ).fetchone()
        if exists:
            conn.execute("DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?", (user_id, job_id))
        else:
            conn.execute(
                "INSERT INTO saved_jobs (user_id, job_id, created_at) VALUES (?, ?, ?)",
                (user_id, job_id, utcnow()),
            )
        rows = conn.execute("SELECT job_id FROM saved_jobs WHERE user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
    return [row["job_id"] for row in rows]


def list_saved_jobs(user_id: str) -> list[str]:
    init_db()
    with connection() as conn:
        rows = conn.execute("SELECT job_id FROM saved_jobs WHERE user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
    return [row["job_id"] for row in rows]


def apply_to_job(user_id: str, job_id: str) -> dict[str, Any]:
    init_db()
    with connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO applications (id, user_id, job_id, status, created_at) VALUES (?, ?, ?, 'APPLIED', ?)",
            (f"app-{uuid.uuid4().hex[:12]}", user_id, job_id, utcnow()),
        )
        row = conn.execute(
            "SELECT * FROM applications WHERE user_id = ? AND job_id = ?", (user_id, job_id)
        ).fetchone()
    return dict(row) if row else {}


def list_applications(user_id: str) -> list[dict[str, Any]]:
    init_db()
    with connection() as conn:
        rows = conn.execute(
            "SELECT a.id, a.job_id, a.status, a.created_at, j.title, j.company FROM applications a "
            "LEFT JOIN jobs j ON j.id = a.job_id WHERE a.user_id = ? ORDER BY a.created_at DESC",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def create_interview_session(
    user_id: str, role: str, mode: str, difficulty: str, questions: list[dict[str, Any]], provider: str
) -> str:
    init_db()
    session_id = f"iv-{uuid.uuid4().hex[:12]}"
    with connection() as conn:
        conn.execute(
            "INSERT INTO interview_sessions (id, user_id, role, mode, difficulty, status, provider, created_at) "
            "VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?)",
            (session_id, user_id, role, mode, difficulty, provider, utcnow()),
        )
        for index, item in enumerate(questions):
            conn.execute(
                "INSERT INTO interview_questions (id, session_id, sequence, prompt, topic, why) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    f"q-{uuid.uuid4().hex[:10]}",
                    session_id,
                    index,
                    item["prompt"],
                    item.get("topic"),
                    item.get("why"),
                ),
            )
    return session_id


def get_interview_session(session_id: str) -> dict[str, Any] | None:
    init_db()
    with connection() as conn:
        row = conn.execute("SELECT * FROM interview_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            return None
        questions = conn.execute(
            "SELECT * FROM interview_questions WHERE session_id = ? ORDER BY sequence ASC", (session_id,)
        ).fetchall()
    return {**dict(row), "questions": [dict(question) for question in questions]}


def save_interview_answer(session_id: str, question_id: str, answer_text: str, evaluation: dict[str, Any]) -> None:
    init_db()
    with connection() as conn:
        conn.execute(
            "INSERT INTO interview_answers (id, session_id, question_id, answer_text, evaluation_json, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (f"a-{uuid.uuid4().hex[:12]}", session_id, question_id, answer_text, json.dumps(evaluation), utcnow()),
        )


def complete_interview_session(session_id: str, score: int) -> None:
    init_db()
    with connection() as conn:
        conn.execute(
            "UPDATE interview_sessions SET status = 'COMPLETED', score = ?, completed_at = ? WHERE id = ?",
            (score, utcnow(), session_id),
        )


def interview_history(user_id: str) -> list[dict[str, Any]]:
    init_db()
    with connection() as conn:
        rows = conn.execute(
            "SELECT id, role, mode, difficulty, status, score, provider, created_at, completed_at "
            "FROM interview_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]

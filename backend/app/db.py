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
from app.intelligence_schema import INTELLIGENCE_SCHEMA

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

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  name TEXT NOT NULL,
  avatar_url TEXT,
  provider TEXT NOT NULL DEFAULT 'password',
  role TEXT NOT NULL DEFAULT 'candidate',
  email_verified INTEGER NOT NULL DEFAULT 0,
  headline TEXT,
  location TEXT,
  phone TEXT,
  bio TEXT,
  website TEXT,
  linkedin TEXT,
  github TEXT,
  company TEXT,
  job_title TEXT,
  years_experience INTEGER,
  target_role TEXT,
  open_to_work INTEGER NOT NULL DEFAULT 1,
  onboarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  meta_json TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS roadmaps (
  user_id TEXT PRIMARY KEY,
  target_role TEXT,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS career_quest_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  career_key TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  catalog_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  score_json TEXT,
  report_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_cq_runs_user_started ON career_quest_runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cq_runs_user_status ON career_quest_runs(user_id, status);

CREATE TABLE IF NOT EXISTS career_quest_missions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES career_quest_runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  template_key TEXT NOT NULL,
  template_version TEXT NOT NULL,
  mission_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'LOCKED',
  public_state_json TEXT NOT NULL,
  score_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE (run_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_cq_missions_run_sequence ON career_quest_missions(run_id, sequence);

CREATE TABLE IF NOT EXISTS career_quest_interactions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES career_quest_runs(id) ON DELETE CASCADE,
  mission_id TEXT REFERENCES career_quest_missions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  actor TEXT NOT NULL,
  interaction_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cq_interactions_run_sequence ON career_quest_interactions(run_id, sequence);

CREATE TABLE IF NOT EXISTS career_quest_attempts (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES career_quest_missions(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL,
  runner_job_id TEXT,
  submission_fingerprint TEXT NOT NULL,
  result_summary_json TEXT,
  score REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (mission_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_cq_attempt_mission_created ON career_quest_attempts(mission_id, created_at DESC);

CREATE TABLE IF NOT EXISTS career_quest_skill_evidence (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES career_quest_runs(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES career_quest_missions(id) ON DELETE CASCADE,
  skill_key TEXT NOT NULL,
  dimension TEXT NOT NULL,
  score REAL NOT NULL,
  rubric_version TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (mission_id, skill_key, dimension)
);
CREATE INDEX IF NOT EXISTS idx_cq_skill_evidence_run ON career_quest_skill_evidence(run_id, skill_key);

CREATE TABLE IF NOT EXISTS career_quest_xp_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES career_quest_runs(id) ON DELETE CASCADE,
  mission_id TEXT REFERENCES career_quest_missions(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  xp_delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, event_key)
);
CREATE INDEX IF NOT EXISTS idx_cq_xp_user_created ON career_quest_xp_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS career_quest_achievement_awards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES career_quest_runs(id) ON DELETE CASCADE,
  awarded_at TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  UNIQUE (user_id, achievement_key)
);
CREATE INDEX IF NOT EXISTS idx_cq_achievements_user ON career_quest_achievement_awards(user_id, awarded_at DESC);
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


def _migrate(conn: sqlite3.Connection) -> None:
    """Apply additive compatibility migrations for existing local databases."""
    jobs_columns = {row["name"] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()}
    if "recruiter_id" not in jobs_columns:
        conn.execute("ALTER TABLE jobs ADD COLUMN recruiter_id TEXT")
    if "status" not in jobs_columns:
        conn.execute("ALTER TABLE jobs ADD COLUMN status TEXT DEFAULT 'PUBLISHED'")
    if "created_by_name" not in jobs_columns:
        conn.execute("ALTER TABLE jobs ADD COLUMN created_by_name TEXT")
    applications_columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(applications)").fetchall()
    }
    if "updated_at" not in applications_columns:
        conn.execute("ALTER TABLE applications ADD COLUMN updated_at TEXT")


def init_db() -> None:
    global _initialized
    with _lock:
        if _initialized:
            return
        with connection() as conn:
            conn.executescript(SCHEMA)
            conn.executescript(INTELLIGENCE_SCHEMA)
            _migrate(conn)
            count = conn.execute("SELECT COUNT(*) AS count FROM jobs").fetchone()["count"]
            if not count:
                for job in SEED_JOBS:
                    conn.execute(
                        """
                        INSERT INTO jobs (id, title, company, location, employment_type, salary,
                                          description, required_skills_json, tags_json, posted, created_at,
                                          status, created_by_name)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', ?)
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
                            job["company"],
                        ),
                    )
        _initialized = True


def _row_to_job(row: sqlite3.Row) -> dict[str, Any]:
    keys = set(row.keys())
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
        "recruiter_id": row["recruiter_id"] if "recruiter_id" in keys else None,
        "status": (row["status"] if "status" in keys else None) or "PUBLISHED",
        "created_by_name": row["created_by_name"] if "created_by_name" in keys else row["company"],
    }


def list_jobs(published_only: bool = True) -> list[dict[str, Any]]:
    init_db()
    with connection() as conn:
        if published_only:
            rows = conn.execute(
                "SELECT * FROM jobs WHERE COALESCE(status, 'PUBLISHED') = 'PUBLISHED' "
                "ORDER BY created_at DESC"
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM jobs ORDER BY created_at DESC").fetchall()
    return [_row_to_job(row) for row in rows]


def list_recruiter_jobs(recruiter_id: str) -> list[dict[str, Any]]:
    init_db()
    with connection() as conn:
        rows = conn.execute(
            "SELECT * FROM jobs WHERE recruiter_id = ? ORDER BY created_at DESC", (recruiter_id,)
        ).fetchall()
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
                                         description, required_skills_json, tags_json, posted, created_at,
                                         recruiter_id, status, created_by_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                job.get("recruiter_id"),
                job.get("status", "PUBLISHED"),
                job.get("created_by_name") or job.get("company", "SkillBridge Partner"),
            ),
        )
    stored = get_job(job_id)
    assert stored is not None
    return stored


def update_job_status(job_id: str, recruiter_id: str, status: str) -> dict[str, Any] | None:
    init_db()
    with connection() as conn:
        conn.execute(
            "UPDATE jobs SET status = ? WHERE id = ? AND recruiter_id = ?",
            (status, job_id, recruiter_id),
        )
    return get_job(job_id)


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


# ---------------------------------------------------------------------------
# Identity, sessions, and activity
# ---------------------------------------------------------------------------
ROLE_VALUES = {"candidate", "recruiter"}


def _user_public(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    data.pop("password_hash", None)
    data["open_to_work"] = bool(data.get("open_to_work", 1))
    data["onboarded"] = bool(data.get("onboarded", 0))
    data["email_verified"] = bool(data.get("email_verified", 0))
    return data


def create_user(
    *,
    email: str,
    name: str,
    password_hash: str | None,
    role: str = "candidate",
    provider: str = "password",
    avatar_url: str | None = None,
    company: str | None = None,
    email_verified: bool = False,
) -> dict[str, Any]:
    init_db()
    role = role if role in ROLE_VALUES else "candidate"
    user_id = f"usr-{uuid.uuid4().hex[:16]}"
    now = utcnow()
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name, avatar_url, provider, role,
                               email_verified, company, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                email.lower().strip(),
                password_hash,
                name.strip()[:120],
                avatar_url,
                provider,
                role,
                1 if email_verified else 0,
                company,
                now,
                now,
            ),
        )
    stored = get_user(user_id)
    assert stored is not None
    return stored


def get_user(user_id: str) -> dict[str, Any] | None:
    init_db()
    with connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _user_public(row) if row else None


def get_user_record(user_id: str) -> dict[str, Any] | None:
    init_db()
    with connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def get_user_by_email(email: str) -> dict[str, Any] | None:
    init_db()
    with connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE lower(email) = lower(?)", (email.strip(),)).fetchone()
    return dict(row) if row else None


def update_user(user_id: str, **values: Any) -> dict[str, Any]:
    init_db()
    allowed = {
        "name", "avatar_url", "role", "headline", "location", "phone", "bio",
        "website", "linkedin", "github", "company", "job_title", "years_experience",
        "target_role", "open_to_work", "onboarded", "email_verified", "password_hash",
    }
    fields = {key: value for key, value in values.items() if key in allowed}
    if not fields:
        return get_user(user_id) or {}
    assignments = ", ".join(f"{key} = ?" for key in fields)
    with connection() as conn:
        conn.execute(
            f"UPDATE users SET {assignments}, updated_at = ? WHERE id = ?",
            (*fields.values(), utcnow(), user_id),
        )
    stored = get_user(user_id)
    assert stored is not None
    return stored


def create_session(user_id: str, token_hash: str, expires_at: str, user_agent: str | None = None) -> None:
    init_db()
    with connection() as conn:
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)",
            (token_hash, user_id, utcnow(), expires_at, (user_agent or "")[:300] or None),
        )


def get_session_user(token_hash: str) -> dict[str, Any] | None:
    init_db()
    with connection() as conn:
        row = conn.execute(
            "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.token_hash = ? AND s.expires_at > ?",
            (token_hash, utcnow()),
        ).fetchone()
    return _user_public(row) if row else None


def delete_session(token_hash: str) -> None:
    init_db()
    with connection() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


def delete_user_sessions(user_id: str, keep: str | None = None) -> None:
    init_db()
    with connection() as conn:
        if keep:
            conn.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user_id, keep))
        else:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def purge_expired_sessions() -> None:
    init_db()
    with connection() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (utcnow(),))


# ---------------------------------------------------------------------------
# Activity feed / notifications
# ---------------------------------------------------------------------------
def log_event(
    user_id: str,
    kind: str,
    title: str,
    detail: str | None = None,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    init_db()
    event_id = f"evt-{uuid.uuid4().hex[:12]}"
    with connection() as conn:
        conn.execute(
            "INSERT INTO events (id, user_id, kind, title, detail, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (event_id, user_id, kind[:40], title[:180], (detail or "")[:400] or None, json.dumps(meta or {}), utcnow()),
        )
    return {
        "id": event_id,
        "kind": kind,
        "title": title,
        "detail": detail,
        "read": False,
        "created_at": utcnow(),
        "meta": meta or {},
    }


def list_events(user_id: str, limit: int = 25) -> list[dict[str, Any]]:
    init_db()
    with connection() as conn:
        rows = conn.execute(
            "SELECT * FROM events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "kind": row["kind"],
            "title": row["title"],
            "detail": row["detail"],
            "read": bool(row["read"]),
            "created_at": row["created_at"],
            "meta": json.loads(row["meta_json"] or "{}"),
        }
        for row in rows
    ]


def mark_events_read(user_id: str) -> int:
    init_db()
    with connection() as conn:
        cursor = conn.execute("UPDATE events SET read = 1 WHERE user_id = ? AND read = 0", (user_id,))
    return cursor.rowcount


# ---------------------------------------------------------------------------
# Learning roadmap persistence
# ---------------------------------------------------------------------------
def save_roadmap(user_id: str, target_role: str, roadmap: dict[str, Any]) -> dict[str, Any]:
    init_db()
    now = utcnow()
    with connection() as conn:
        conn.execute(
            "INSERT INTO roadmaps (user_id, target_role, result_json, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET "
            "target_role=excluded.target_role, result_json=excluded.result_json, updated_at=excluded.updated_at",
            (user_id, target_role, json.dumps(roadmap), now, now),
        )
    return roadmap


def get_roadmap(user_id: str) -> dict[str, Any] | None:
    init_db()
    with connection() as conn:
        row = conn.execute("SELECT result_json FROM roadmaps WHERE user_id = ?", (user_id,)).fetchone()
    return json.loads(row["result_json"]) if row else None


def toggle_roadmap_item(user_id: str, item_id: str, completed: bool) -> dict[str, Any] | None:
    roadmap = get_roadmap(user_id)
    if not roadmap:
        return None
    for item in roadmap.get("items", []):
        if item.get("id") == item_id:
            item["completed"] = completed
    save_roadmap(user_id, roadmap.get("target_role", ""), roadmap)
    return roadmap


# ---------------------------------------------------------------------------
# Recruiter directory and dashboards
# ---------------------------------------------------------------------------
def list_candidates(query: str = "", limit: int = 40) -> list[dict[str, Any]]:
    init_db()
    like = f"%{query.strip().lower()}%"
    with connection() as conn:
        rows = conn.execute(
            "SELECT * FROM users WHERE role = 'candidate' AND (lower(name) LIKE ? OR lower(headline) LIKE ? "
            "OR lower(target_role) LIKE ? OR lower(location) LIKE ?) ORDER BY updated_at DESC LIMIT ?",
            (like, like, like, like, limit),
        ).fetchall()
    candidates = []
    for row in rows:
        user = _user_public(row)
        analysis = latest_analysis(user["id"])
        latest = latest_resume(user["id"])
        candidates.append(
            {
                **user,
                "skills": (analysis or {}).get("skill_names", [])[:8],
                "readiness": (analysis or {}).get("readiness", {}).get("score"),
                "experience_years": (analysis or {}).get("experience", {}).get("years")
                or user.get("years_experience"),
                "resume": {
                    "id": (latest or {}).get("id"),
                    "filename": (latest or {}).get("filename"),
                    "created_at": (latest or {}).get("created_at"),
                }
                if latest
                else None,
                "summary": (analysis or {}).get("profile", {}).get("summary") or user.get("bio"),
            }
        )
    return candidates


def recruiter_overview(recruiter_id: str) -> dict[str, Any]:
    init_db()
    with connection() as conn:
        jobs = conn.execute(
            "SELECT id, title, status, created_at FROM jobs WHERE recruiter_id = ? ORDER BY created_at DESC",
            (recruiter_id,),
        ).fetchall()
        job_ids = [row["id"] for row in jobs]
        pipeline: list[sqlite3.Row] = []
        if job_ids:
            placeholders = ",".join("?" for _ in job_ids)
            pipeline = conn.execute(
                f"SELECT a.status, COUNT(*) AS count FROM applications a WHERE a.job_id IN ({placeholders}) "
                "GROUP BY a.status",
                tuple(job_ids),
            ).fetchall()
        applicants = conn.execute(
            f"SELECT COUNT(*) AS count FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.recruiter_id = ?",
            (recruiter_id,),
        ).fetchone()["count"]
    return {
        "jobs": [
            {**dict(row), "status": dict(row)["status"] or "PUBLISHED"} for row in jobs
        ],
        "pipeline": {row["status"]: row["count"] for row in pipeline},
        "applicants": applicants,
        "candidates": 0,
    }


def recruiter_applications(recruiter_id: str) -> list[dict[str, Any]]:
    init_db()
    with connection() as conn:
        rows = conn.execute(
            "SELECT a.id, a.status, a.created_at, j.id AS job_id, j.title AS job_title, "
            "u.id AS candidate_id, u.name AS candidate_name, u.email AS candidate_email, "
            "u.headline, u.location, u.avatar_url "
            "FROM applications a JOIN jobs j ON j.id = a.job_id JOIN users u ON u.id = a.user_id "
            "WHERE j.recruiter_id = ? ORDER BY a.created_at DESC LIMIT 200",
            (recruiter_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def update_application_status(application_id: str, recruiter_id: str, status: str) -> dict[str, Any] | None:
    init_db()
    allowed = {"APPLIED", "REVIEWING", "SHORTLISTED", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"}
    if status not in allowed:
        return None
    with connection() as conn:
        row = conn.execute(
            "SELECT a.id FROM applications a JOIN jobs j ON j.id = a.job_id "
            "WHERE a.id = ? AND j.recruiter_id = ?",
            (application_id, recruiter_id),
        ).fetchone()
        if not row:
            return None
        conn.execute(
            "UPDATE applications SET status = ?, updated_at = ? WHERE id = ?",
            (status, utcnow(), application_id),
        )
        updated = conn.execute("SELECT * FROM applications WHERE id = ?", (application_id,)).fetchone()
    return dict(updated) if updated else None


def public_stats() -> dict[str, Any]:
    init_db()
    with connection() as conn:
        candidates = conn.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'candidate'").fetchone()["count"]
        recruiters = conn.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'recruiter'").fetchone()["count"]
        resumes = conn.execute("SELECT COUNT(*) AS count FROM resumes").fetchone()["count"]
        analyses = conn.execute("SELECT COUNT(*) AS count FROM analyses").fetchone()["count"]
        interviews = conn.execute("SELECT COUNT(*) AS count FROM interview_sessions").fetchone()["count"]
        completed = conn.execute(
            "SELECT COUNT(*) AS count FROM interview_sessions WHERE status = 'COMPLETED'"
        ).fetchone()["count"]
        jobs = conn.execute(
            "SELECT COUNT(*) AS count FROM jobs WHERE COALESCE(status, 'PUBLISHED') = 'PUBLISHED'"
        ).fetchone()["count"]
        applications = conn.execute("SELECT COUNT(*) AS count FROM applications").fetchone()["count"]
    return {
        "candidates": candidates,
        "recruiters": recruiters,
        "resumes_analyzed": resumes,
        "analyses": analyses,
        "interviews": interviews,
        "interviews_completed": completed,
        "jobs": jobs,
        "applications": applications,
    }


def list_analyses(user_id: str, limit: int = 24) -> list[dict[str, Any]]:
    init_db()
    with connection() as conn:
        rows = conn.execute(
            "SELECT target_role, result_json, created_at FROM analyses WHERE user_id = ? "
            "ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    results = []
    for row in rows:
        analysis = json.loads(row["result_json"])
        results.append(
            {
                "target_role": row["target_role"] or analysis.get("target_role"),
                "readiness": analysis.get("readiness", {}).get("score"),
                "weighted_match": analysis.get("weighted_match_percent"),
                "created_at": row["created_at"],
            }
        )
    return results


def delete_resume(user_id: str, resume_id: str) -> bool:
    init_db()
    with connection() as conn:
        cursor = conn.execute("DELETE FROM resumes WHERE id = ? AND user_id = ?", (resume_id, user_id))
    return cursor.rowcount > 0


def application_status_counts(user_id: str) -> dict[str, int]:
    init_db()
    with connection() as conn:
        rows = conn.execute(
            "SELECT status, COUNT(*) AS count FROM applications WHERE user_id = ? GROUP BY status",
            (user_id,),
        ).fetchall()
    return {row["status"]: row["count"] for row in rows}


def saved_job_count(user_id: str) -> int:
    init_db()
    with connection() as conn:
        return conn.execute(
            "SELECT COUNT(*) AS count FROM saved_jobs WHERE user_id = ?", (user_id,)
        ).fetchone()["count"]


def roadmaps_count(user_id: str) -> int:
    init_db()
    with connection() as conn:
        return conn.execute(
            "SELECT COUNT(*) AS count FROM roadmaps WHERE user_id = ?", (user_id,)
        ).fetchone()["count"]


def get_application(application_id: str) -> dict[str, Any] | None:
    init_db()
    with connection() as conn:
        row = conn.execute("SELECT * FROM applications WHERE id = ?", (application_id,)).fetchone()
    return dict(row) if row else None

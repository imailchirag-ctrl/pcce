"""SQLite repository functions for Career Quest state."""

from __future__ import annotations

import json
import sqlite3
import uuid
from typing import Any

from app import db


def _decode(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    return json.loads(value)


def create_run(user_id: str, career_key: str, difficulty: str, missions: list[dict[str, Any]]) -> str:
    db.init_db()
    run_id = f"cqrun-{uuid.uuid4().hex[:20]}"
    now = db.utcnow()
    with db.connection() as conn:
        conn.execute(
            "INSERT INTO career_quest_runs (id, user_id, career_key, difficulty, status, catalog_version, started_at, updated_at) "
            "VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?)",
            (run_id, user_id, career_key, difficulty, missions[0]["catalog_version"], now, now),
        )
        for sequence, mission in enumerate(missions, start=1):
            mission_id = f"cqmis-{uuid.uuid4().hex[:20]}"
            status = "AVAILABLE" if sequence == 1 else "LOCKED"
            conn.execute(
                "INSERT INTO career_quest_missions (id, run_id, sequence, template_key, template_version, mission_type, status, public_state_json, started_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    mission_id, run_id, sequence, mission["key"], mission["version"], mission["type"],
                    status, json.dumps({"difficulty": difficulty}), now if sequence == 1 else None,
                ),
            )
        first = conn.execute(
            "SELECT id FROM career_quest_missions WHERE run_id = ? AND sequence = 1", (run_id,)
        ).fetchone()
        conn.execute(
            "INSERT INTO career_quest_interactions (id, run_id, mission_id, sequence, actor, interaction_type, content, metadata_json, created_at) "
            "VALUES (?, ?, ?, 0, 'manager', 'briefing', ?, ?, ?)",
            (
                f"cqint-{uuid.uuid4().hex[:20]}", run_id, first["id"], missions[0]["manager_opening"],
                json.dumps({"provider": "authored_scenario"}), now,
            ),
        )
    return run_id


def fetch_run(run_id: str, user_id: str) -> dict[str, Any] | None:
    db.init_db()
    with db.connection() as conn:
        row = conn.execute(
            "SELECT * FROM career_quest_runs WHERE id = ? AND user_id = ?", (run_id, user_id)
        ).fetchone()
        if not row:
            return None
        missions = conn.execute(
            "SELECT * FROM career_quest_missions WHERE run_id = ? ORDER BY sequence", (run_id,)
        ).fetchall()
        interactions = conn.execute(
            "SELECT * FROM career_quest_interactions WHERE run_id = ? ORDER BY sequence", (run_id,)
        ).fetchall()
        attempts = conn.execute(
            "SELECT a.* FROM career_quest_attempts a JOIN career_quest_missions m ON m.id = a.mission_id "
            "WHERE m.run_id = ? ORDER BY a.created_at DESC", (run_id,)
        ).fetchall()
    return {
        **dict(row),
        "score": _decode(row["score_json"], None),
        "report": _decode(row["report_json"], None),
        "missions": [
            {**dict(mission), "public_state": _decode(mission["public_state_json"], {}) , "score": _decode(mission["score_json"], None)}
            for mission in missions
        ],
        "interactions": [
            {**dict(item), "metadata": _decode(item["metadata_json"], {})} for item in interactions
        ],
        "attempts": [
            {**dict(item), "result_summary": _decode(item["result_summary_json"], None)} for item in attempts
        ],
    }


def list_runs(user_id: str) -> list[dict[str, Any]]:
    db.init_db()
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT r.id, r.career_key, r.difficulty, r.status, r.started_at, r.updated_at, r.completed_at, "
            "(SELECT COUNT(*) FROM career_quest_missions m WHERE m.run_id = r.id AND m.status = 'COMPLETED') AS completed_missions, "
            "(SELECT COUNT(*) FROM career_quest_missions m WHERE m.run_id = r.id) AS total_missions "
            "FROM career_quest_runs r WHERE r.user_id = ? ORDER BY r.started_at DESC LIMIT 30",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def progression(user_id: str) -> dict[str, Any]:
    db.init_db()
    with db.connection() as conn:
        xp = conn.execute(
            "SELECT COALESCE(SUM(xp_delta), 0) AS total FROM career_quest_xp_events WHERE user_id = ?", (user_id,)
        ).fetchone()["total"]
        completed = conn.execute(
            "SELECT COUNT(*) AS total FROM career_quest_missions m JOIN career_quest_runs r ON r.id = m.run_id "
            "WHERE r.user_id = ? AND m.status = 'COMPLETED'", (user_id,)
        ).fetchone()["total"]
        achievements = conn.execute(
            "SELECT achievement_key, run_id, awarded_at, evidence_json FROM career_quest_achievement_awards "
            "WHERE user_id = ? ORDER BY awarded_at DESC", (user_id,)
        ).fetchall()
        skills = conn.execute(
            "SELECT e.skill_key, ROUND(AVG(e.score), 1) AS score, COUNT(DISTINCT e.mission_id) AS evidence_count "
            "FROM career_quest_skill_evidence e JOIN career_quest_runs r ON r.id = e.run_id "
            "WHERE r.user_id = ? GROUP BY e.skill_key ORDER BY score DESC", (user_id,)
        ).fetchall()
        events = conn.execute(
            "SELECT xp_delta, reason, created_at FROM career_quest_xp_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
            (user_id,),
        ).fetchall()
    total_xp = int(xp)
    level = 1 + int((total_xp / 100) ** 0.5)
    next_level_xp = level * level * 100
    return {
        "xp_total": total_xp,
        "level": level,
        "xp_into_level": total_xp - ((level - 1) ** 2 * 100),
        "xp_to_next_level": max(0, next_level_xp - total_xp),
        "next_level_total_xp": next_level_xp,
        "completed_missions": int(completed),
        "achievements": [
            {**dict(row), "evidence": _decode(row["evidence_json"], {})} for row in achievements
        ],
        "skills": [dict(row) for row in skills],
        "recent_xp_events": [dict(row) for row in events],
    }


def add_interaction(
    run_id: str,
    mission_id: str,
    actor: str,
    interaction_type: str,
    content: str,
    metadata: dict[str, Any] | None = None,
) -> str:
    db.init_db()
    interaction_id = f"cqint-{uuid.uuid4().hex[:20]}"
    now = db.utcnow()
    with db.connection() as conn:
        sequence = conn.execute(
            "SELECT COALESCE(MAX(sequence), -1) + 1 AS value FROM career_quest_interactions WHERE run_id = ?", (run_id,)
        ).fetchone()["value"]
        conn.execute(
            "INSERT INTO career_quest_interactions (id, run_id, mission_id, sequence, actor, interaction_type, content, metadata_json, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (interaction_id, run_id, mission_id, sequence, actor, interaction_type, content[:1200], json.dumps(metadata or {}), now),
        )
        conn.execute("UPDATE career_quest_runs SET updated_at = ? WHERE id = ?", (now, run_id))
    return interaction_id


def mission_evidence(run_id: str, mission_id: str) -> dict[str, Any]:
    db.init_db()
    with db.connection() as conn:
        interactions = conn.execute(
            "SELECT actor, interaction_type, content, metadata_json, created_at FROM career_quest_interactions "
            "WHERE run_id = ? AND mission_id = ? ORDER BY sequence", (run_id, mission_id)
        ).fetchall()
        attempts = conn.execute(
            "SELECT * FROM career_quest_attempts WHERE mission_id = ? ORDER BY created_at DESC", (mission_id,)
        ).fetchall()
    return {
        "interactions": [{**dict(row), "metadata": _decode(row["metadata_json"], {})} for row in interactions],
        "attempts": [{**dict(row), "result_summary": _decode(row["result_summary_json"], None)} for row in attempts],
    }


def create_attempt(
    mission_id: str,
    idempotency_key: str,
    fingerprint: str,
    *,
    max_attempts: int,
) -> tuple[dict[str, Any] | None, bool, bool]:
    db.init_db()
    with db.connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            "SELECT * FROM career_quest_attempts WHERE mission_id = ? AND idempotency_key = ?",
            (mission_id, idempotency_key),
        ).fetchone()
        if existing:
            return {**dict(existing), "result_summary": _decode(existing["result_summary_json"], None)}, False, False
        count = conn.execute(
            "SELECT COUNT(*) AS total FROM career_quest_attempts WHERE mission_id = ?", (mission_id,)
        ).fetchone()["total"]
        if int(count) >= max_attempts:
            return None, False, True
        attempt_id = f"cqattempt-{uuid.uuid4().hex[:20]}"
        now = db.utcnow()
        try:
            conn.execute(
                "INSERT INTO career_quest_attempts (id, mission_id, attempt_number, idempotency_key, status, submission_fingerprint, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, 'QUEUED', ?, ?, ?)",
                (attempt_id, mission_id, int(count) + 1, idempotency_key, fingerprint, now, now),
            )
        except sqlite3.IntegrityError:
            existing = conn.execute(
                "SELECT * FROM career_quest_attempts WHERE mission_id = ? AND idempotency_key = ?",
                (mission_id, idempotency_key),
            ).fetchone()
            if existing:
                return {**dict(existing), "result_summary": _decode(existing["result_summary_json"], None)}, False, False
            raise
        row = conn.execute("SELECT * FROM career_quest_attempts WHERE id = ?", (attempt_id,)).fetchone()
    return {**dict(row), "result_summary": None}, True, False


def update_attempt(
    attempt_id: str,
    *,
    status: str,
    summary: dict[str, Any] | None = None,
    score: float | None = None,
    runner_job_id: str | None = None,
) -> None:
    db.init_db()
    now = db.utcnow()
    with db.connection() as conn:
        conn.execute(
            "UPDATE career_quest_attempts SET status = ?, result_summary_json = ?, score = ?, runner_job_id = COALESCE(?, runner_job_id), updated_at = ? WHERE id = ?",
            (status, json.dumps(summary) if summary is not None else None, score, runner_job_id, now, attempt_id),
        )
        conn.execute(
            "UPDATE career_quest_runs SET updated_at = ? WHERE id = (SELECT m.run_id FROM career_quest_missions m "
            "JOIN career_quest_attempts a ON a.mission_id = m.id WHERE a.id = ?)", (now, attempt_id)
        )


def get_attempt_for_user(run_id: str, attempt_id: str, user_id: str) -> dict[str, Any] | None:
    db.init_db()
    with db.connection() as conn:
        row = conn.execute(
            "SELECT a.*, m.run_id FROM career_quest_attempts a JOIN career_quest_missions m ON m.id = a.mission_id "
            "JOIN career_quest_runs r ON r.id = m.run_id WHERE a.id = ? AND m.run_id = ? AND r.user_id = ?",
            (attempt_id, run_id, user_id),
        ).fetchone()
    return {**dict(row), "result_summary": _decode(row["result_summary_json"], None)} if row else None


def complete_mission(
    *,
    run_id: str,
    mission_id: str,
    score: dict[str, Any],
    xp: int,
    xp_reason: str,
    evidence: list[dict[str, Any]],
    achievements: list[dict[str, Any]],
    report: dict[str, Any] | None,
) -> bool:
    """Commit completion, progression ledger, and next unlock atomically."""
    db.init_db()
    now = db.utcnow()
    with db.connection() as conn:
        mission = conn.execute(
            "SELECT m.*, r.user_id, r.status AS run_status, r.difficulty FROM career_quest_missions m "
            "JOIN career_quest_runs r ON r.id = m.run_id WHERE m.id = ? AND m.run_id = ?", (mission_id, run_id)
        ).fetchone()
        if not mission or mission["status"] != "AVAILABLE" or mission["run_status"] != "IN_PROGRESS":
            return False
        conn.execute(
            "UPDATE career_quest_missions SET status = 'COMPLETED', score_json = ?, completed_at = ? WHERE id = ?",
            (json.dumps(score), now, mission_id),
        )
        for item in evidence:
            conn.execute(
                "INSERT OR IGNORE INTO career_quest_skill_evidence "
                "(id, run_id, mission_id, skill_key, dimension, score, rubric_version, evidence_refs_json, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    f"cqskill-{uuid.uuid4().hex[:20]}", run_id, mission_id, item["skill_key"], item["dimension"],
                    item["score"], item["rubric_version"], json.dumps(item["evidence_refs"]), now,
                ),
            )
        conn.execute(
            "INSERT OR IGNORE INTO career_quest_xp_events (id, user_id, run_id, mission_id, event_key, xp_delta, reason, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (f"cqxp-{uuid.uuid4().hex[:20]}", mission["user_id"], run_id, mission_id, f"mission:{mission_id}:complete", xp, xp_reason, now),
        )
        for item in achievements:
            conn.execute(
                "INSERT OR IGNORE INTO career_quest_achievement_awards (id, user_id, achievement_key, run_id, awarded_at, evidence_json) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (f"cqach-{uuid.uuid4().hex[:20]}", mission["user_id"], item["key"], run_id, now, json.dumps(item["evidence"])),
            )
        next_mission = conn.execute(
            "SELECT id FROM career_quest_missions WHERE run_id = ? AND sequence = ?", (run_id, mission["sequence"] + 1)
        ).fetchone()
        if next_mission:
            conn.execute(
                "UPDATE career_quest_missions SET status = 'AVAILABLE', started_at = ? WHERE id = ? AND status = 'LOCKED'",
                (now, next_mission["id"]),
            )
            conn.execute("UPDATE career_quest_runs SET updated_at = ? WHERE id = ?", (now, run_id))
        else:
            conn.execute(
                "UPDATE career_quest_runs SET status = 'COMPLETED', updated_at = ?, completed_at = ?, score_json = ?, report_json = ? WHERE id = ?",
                (now, now, json.dumps(score.get("dimensions", {})), json.dumps(report or {}), run_id),
            )
    return True


def abandon_run(run_id: str, user_id: str) -> bool:
    db.init_db()
    now = db.utcnow()
    with db.connection() as conn:
        cursor = conn.execute(
            "UPDATE career_quest_runs SET status = 'ABANDONED', updated_at = ?, completed_at = ? "
            "WHERE id = ? AND user_id = ? AND status = 'IN_PROGRESS'",
            (now, now, run_id, user_id),
        )
    return cursor.rowcount == 1

"""AI Digital Twin: an evidence-backed model of a user's professional capabilities.

Evidence tiers (never collapsed):
- claimed:       self-reported (resume text, profile bio, self-marked learning).
- demonstrated:  observed work (peer-confirmed project contributions, rubric-scored
                 Career Quest behaviours).
- verified:      objective tests (Career Quest code missions executed by the isolated
                 runner and scored >= VERIFIED_THRESHOLD).

A resume keyword alone can only ever produce a *claimed* skill.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections import defaultdict
from typing import Any

from app import db
from app.ml.skill_extractor import extract_skill_details
from app.ml.skill_taxonomy import SKILL_TAXONOMY, display_name

VERIFIED_THRESHOLD = 60.0
TIER_RANK = {"claimed": 1, "demonstrated": 2, "verified": 3}

# Career Quest skills judged by executed unit tests (runner) vs. rubric.
QUEST_TEST_BACKED = {"python", "testing", "algorithms", "debugging", "api debugging"}

# Hand-curated prerequisite edges: skill -> skills it builds on.
PREREQUISITES: dict[str, list[str]] = {
    "deep learning": ["machine learning", "python"],
    "machine learning": ["python", "statistics", "numpy"],
    "pytorch": ["deep learning", "python"],
    "tensorflow": ["deep learning", "python"],
    "scikit-learn": ["machine learning", "python"],
    "transformers": ["deep learning", "pytorch"],
    "llm": ["transformers", "python"],
    "rag": ["llm", "vector databases"],
    "sentence transformers": ["transformers"],
    "vector databases": ["sql"],
    "natural language processing": ["machine learning", "python"],
    "computer vision": ["deep learning"],
    "mlops": ["docker", "machine learning"],
    "model evaluation": ["machine learning", "statistics"],
    "pandas": ["python"],
    "numpy": ["python"],
    "fastapi": ["python", "rest apis"],
    "django": ["python", "sql"],
    "flask": ["python", "rest apis"],
    "react": ["javascript", "html", "css"],
    "next.js": ["react"],
    "typescript": ["javascript"],
    "redux": ["react"],
    "node.js": ["javascript"],
    "express.js": ["node.js"],
    "postgresql": ["sql"],
    "kubernetes": ["docker", "linux"],
    "docker": ["linux"],
    "terraform": ["aws"],
    "ci/cd": ["git"],
    "tailwind css": ["css"],
    "data visualization": ["pandas"],
}

ML_CLUSTER = {key for key, value in SKILL_TAXONOMY.items() if value.get("category") == "AI/ML"} | {
    "numpy",
    "pandas",
    "statistics",
}


def _now() -> str:
    return db.utcnow()


def _category(skill: str) -> str:
    return SKILL_TAXONOMY.get(skill, {}).get("category", "Other")


def related_skills(skill: str) -> list[str]:
    related = list(SKILL_TAXONOMY.get(skill, {}).get("related", []))
    related += PREREQUISITES.get(skill, [])
    related += [child for child, parents in PREREQUISITES.items() if skill in parents]
    return list(dict.fromkeys(item for item in related if item != skill))


# ---------------------------------------------------------------------------
# Evidence collection from existing SkillBridge modules
# ---------------------------------------------------------------------------
def _collect_resume_evidence(user_id: str) -> tuple[list[dict[str, Any]], str | None]:
    resume = db.latest_resume(user_id)
    if not resume:
        return [], None
    analysis = resume.get("analysis") or {}
    project_lines = " \n".join((analysis.get("projects") or {}).get("lines", [])).lower()
    items: list[dict[str, Any]] = []
    for detail in analysis.get("skills", []):
        skill = str(detail.get("skill", "")).lower()
        if not skill:
            continue
        in_project = bool(project_lines) and any(
            alias in project_lines for alias in SKILL_TAXONOMY.get(skill, {}).get("aliases", [skill])
        )
        items.append(
            {
                "skill_key": skill,
                "source_type": "resume_project" if in_project else "resume",
                "source_ref": resume["id"],
                "tier": "claimed",
                "strength": round(float(detail.get("confidence", 0.8)) * (0.45 if in_project else 0.35), 3),
                "excerpt": (detail.get("evidence") or "")[:280] or f"Mentioned in {resume['filename']}",
                "observed_at": resume["created_at"],
            }
        )
    return items, resume["id"]


def _collect_profile_evidence(user_id: str) -> list[dict[str, Any]]:
    user = db.get_user_record(user_id) or {}
    text = " . ".join(str(user.get(field) or "") for field in ("headline", "bio", "job_title"))
    if not text.strip(" ."):
        return []
    details = extract_skill_details(text, semantic=False)["skills"]
    return [
        {
            "skill_key": item["skill"],
            "source_type": "profile",
            "source_ref": "profile",
            "tier": "claimed",
            "strength": 0.3,
            "excerpt": item.get("evidence", "")[:280],
            "observed_at": user.get("updated_at") or _now(),
        }
        for item in details
    ]


def _collect_roadmap_evidence(user_id: str) -> list[dict[str, Any]]:
    roadmap = db.get_roadmap(user_id) or {}
    items = []
    for item in roadmap.get("items", []):
        if not item.get("completed"):
            continue
        skill = str(item.get("skill_key") or item.get("skill") or "").lower()
        if skill not in SKILL_TAXONOMY:
            continue
        items.append(
            {
                "skill_key": skill,
                "source_type": "learning_milestone",
                "source_ref": str(item.get("id")),
                "tier": "claimed",
                "strength": 0.25,
                "excerpt": f"Marked complete: {item.get('title') or item.get('resource') or 'roadmap item'}",
                "observed_at": roadmap.get("updated_at") or _now(),
            }
        )
    return items


def _collect_quest_evidence(user_id: str) -> list[dict[str, Any]]:
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT e.skill_key, e.score, e.mission_id, e.created_at, m.template_key "
            "FROM career_quest_skill_evidence e "
            "JOIN career_quest_runs r ON r.id = e.run_id "
            "JOIN career_quest_missions m ON m.id = e.mission_id "
            "WHERE r.user_id = ?",
            (user_id,),
        ).fetchall()
    items = []
    for row in rows:
        skill = str(row["skill_key"]).lower()
        score = float(row["score"] or 0)
        test_backed = skill in QUEST_TEST_BACKED
        tier = "verified" if test_backed and score >= VERIFIED_THRESHOLD else "demonstrated"
        items.append(
            {
                "skill_key": skill,
                "source_type": "career_quest",
                "source_ref": row["mission_id"],
                "tier": tier,
                "strength": round(score / 100, 3),
                "excerpt": (
                    f"Career Quest mission '{row['template_key']}' scored {score:.0f}/100 "
                    + ("on runner-executed tests" if test_backed else "on the behaviour rubric")
                ),
                "observed_at": row["created_at"],
            }
        )
    return items


def _collect_contribution_evidence(user_id: str) -> list[dict[str, Any]]:
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT c.id, c.skills_json, c.summary, c.confirmed_by, c.created_at, p.title "
            "FROM exchange_contributions c JOIN exchange_projects p ON p.id = c.project_id "
            "WHERE c.user_id = ?",
            (user_id,),
        ).fetchall()
    items = []
    for row in rows:
        peer_confirmed = row["confirmed_by"] != user_id
        for skill in json.loads(row["skills_json"] or "[]"):
            items.append(
                {
                    "skill_key": skill,
                    "source_type": "team_project",
                    "source_ref": row["id"],
                    "tier": "demonstrated" if peer_confirmed else "claimed",
                    "strength": 0.7 if peer_confirmed else 0.35,
                    "excerpt": f"{row['summary']} — project '{row['title']}'"
                    + (" (confirmed by a teammate)" if peer_confirmed else " (self-reported)"),
                    "observed_at": row["created_at"],
                }
            )
    return items


def _persist_evidence(user_id: str, evidence: list[dict[str, Any]], resume_id: str | None) -> None:
    now = _now()
    with db.connection() as conn:
        # Resume/profile/roadmap evidence mirrors the *current* source; drop stale rows.
        if resume_id:
            conn.execute(
                "DELETE FROM skill_evidence WHERE user_id = ? AND source_type IN ('resume', 'resume_project') AND source_ref != ?",
                (user_id, resume_id),
            )
        else:
            conn.execute(
                "DELETE FROM skill_evidence WHERE user_id = ? AND source_type IN ('resume', 'resume_project')",
                (user_id,),
            )
        current_keys = {(item["skill_key"], item["source_type"], item["source_ref"]) for item in evidence}
        for row in conn.execute(
            "SELECT id, skill_key, source_type, source_ref FROM skill_evidence WHERE user_id = ? "
            "AND source_type IN ('profile', 'learning_milestone', 'team_project')",
            (user_id,),
        ).fetchall():
            if (row["skill_key"], row["source_type"], row["source_ref"]) not in current_keys:
                conn.execute("DELETE FROM skill_evidence WHERE id = ?", (row["id"],))
        for item in evidence:
            conn.execute(
                "INSERT INTO skill_evidence (id, user_id, skill_key, source_type, source_ref, tier, strength, excerpt, observed_at, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(user_id, skill_key, source_type, source_ref) DO UPDATE SET "
                "tier = excluded.tier, strength = excluded.strength, excerpt = excluded.excerpt",
                (
                    f"ev-{uuid.uuid4().hex[:16]}",
                    user_id,
                    item["skill_key"],
                    item["source_type"],
                    item["source_ref"],
                    item["tier"],
                    item["strength"],
                    item["excerpt"],
                    item["observed_at"],
                    now,
                ),
            )


def _score_skill(rows: list[dict[str, Any]]) -> dict[str, Any]:
    tiers = [row["tier"] for row in rows]
    status = max(tiers, key=lambda tier: TIER_RANK[tier])
    sources = {row["source_type"] for row in rows}
    if status == "verified":
        verified = [row["strength"] for row in rows if row["tier"] == "verified"]
        proficiency = round(100 * sum(verified) / len(verified))
    elif status == "demonstrated":
        demos = [row["strength"] for row in rows if row["tier"] == "demonstrated"]
        proficiency = min(78, round(40 + 35 * max(demos) + 4 * (len(demos) - 1)))
    else:
        proficiency = min(38, 15 + 8 * len(rows))
    confidence = min(0.95, 0.25 + 0.18 * len(sources) + (0.2 if status == "verified" else 0.0))
    demonstrated_at = [row["observed_at"] for row in rows if row["tier"] != "claimed"]
    return {
        "status": status,
        "proficiency": max(5, min(98, proficiency)),
        "confidence": round(confidence, 2),
        "evidence_count": len(rows),
        "last_demonstrated_at": max(demonstrated_at) if demonstrated_at else None,
    }


def rebuild(user_id: str, reason: str = "refresh") -> dict[str, Any]:
    """Re-derive the twin from every evidence source and persist a snapshot if it changed."""
    db.init_db()
    resume_items, resume_id = _collect_resume_evidence(user_id)
    evidence = (
        resume_items
        + _collect_profile_evidence(user_id)
        + _collect_roadmap_evidence(user_id)
        + _collect_quest_evidence(user_id)
        + _collect_contribution_evidence(user_id)
    )
    _persist_evidence(user_id, evidence, resume_id)

    with db.connection() as conn:
        rows = [dict(row) for row in conn.execute("SELECT * FROM skill_evidence WHERE user_id = ?", (user_id,)).fetchall()]
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            grouped[row["skill_key"]].append(row)
        conn.execute("DELETE FROM twin_skills WHERE user_id = ?", (user_id,))
        now = _now()
        for skill, skill_rows in grouped.items():
            scored = _score_skill(skill_rows)
            conn.execute(
                "INSERT INTO twin_skills (user_id, skill_key, category, status, proficiency, confidence, evidence_count, last_demonstrated_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    user_id,
                    skill,
                    _category(skill),
                    scored["status"],
                    scored["proficiency"],
                    scored["confidence"],
                    scored["evidence_count"],
                    scored["last_demonstrated_at"],
                    now,
                ),
            )
    twin = get_twin(user_id)
    _maybe_snapshot(user_id, twin, reason)
    return twin


def refresh_quietly(user_id: str, reason: str) -> None:
    """Hook for other modules: keep the twin current without ever failing the caller."""
    try:
        rebuild(user_id, reason=reason)
    except Exception:  # noqa: BLE001
        import logging

        logging.getLogger("skillbridge.twin").exception("Digital Twin refresh failed (%s)", reason)


def _maybe_snapshot(user_id: str, twin: dict[str, Any], reason: str) -> None:
    skills = {item["skill"]: [item["status"], item["proficiency"]] for item in twin["skills"]}
    fingerprint = hashlib.sha1(json.dumps(skills, sort_keys=True).encode()).hexdigest()
    with db.connection() as conn:
        last = conn.execute(
            "SELECT fingerprint FROM twin_snapshots WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", (user_id,)
        ).fetchone()
        if last and last["fingerprint"] == fingerprint:
            return
        summary = {"counts": twin["counts"], "average_proficiency": twin["average_proficiency"], "skills": skills}
        conn.execute(
            "INSERT INTO twin_snapshots (id, user_id, fingerprint, summary_json, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (f"snap-{uuid.uuid4().hex[:16]}", user_id, fingerprint, json.dumps(summary), reason, _now()),
        )


# ---------------------------------------------------------------------------
# Read models
# ---------------------------------------------------------------------------
def get_twin(user_id: str) -> dict[str, Any]:
    db.init_db()
    with db.connection() as conn:
        skill_rows = conn.execute(
            "SELECT * FROM twin_skills WHERE user_id = ? ORDER BY proficiency DESC, skill_key", (user_id,)
        ).fetchall()
        evidence_rows = conn.execute(
            "SELECT skill_key, source_type, source_ref, tier, strength, excerpt, observed_at FROM skill_evidence "
            "WHERE user_id = ? ORDER BY strength DESC",
            (user_id,),
        ).fetchall()
        snapshot_count = conn.execute(
            "SELECT COUNT(*) AS n FROM twin_snapshots WHERE user_id = ?", (user_id,)
        ).fetchone()["n"]
    evidence: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in evidence_rows:
        evidence[row["skill_key"]].append(dict(row))
    skills = []
    for row in skill_rows:
        skill = row["skill_key"]
        skills.append(
            {
                "skill": skill,
                "display": display_name(skill),
                "category": row["category"],
                "status": row["status"],
                "proficiency": row["proficiency"],
                "confidence": row["confidence"],
                "evidence_count": row["evidence_count"],
                "last_demonstrated_at": row["last_demonstrated_at"],
                "related": [display_name(item) for item in related_skills(skill)[:6]],
                "evidence": evidence.get(skill, [])[:6],
                "sources": sorted({item["source_type"] for item in evidence.get(skill, [])}),
            }
        )
    counts = {tier: sum(1 for item in skills if item["status"] == tier) for tier in TIER_RANK}
    user = db.get_user(user_id) or {}
    return {
        "skills": skills,
        "counts": counts,
        "total": len(skills),
        "average_proficiency": round(sum(item["proficiency"] for item in skills) / len(skills), 1) if skills else 0.0,
        "target_role": user.get("target_role"),
        "snapshots": snapshot_count,
        "has_resume": db.latest_resume(user_id) is not None,
    }


def ensure(user_id: str) -> dict[str, Any]:
    """Return the twin, building it on first access."""
    twin = get_twin(user_id)
    if not twin["skills"] and twin["snapshots"] == 0:
        twin = rebuild(user_id, reason="initial_build")
    return twin


def skill_map(user_id: str) -> dict[str, dict[str, Any]]:
    return {item["skill"]: item for item in get_twin(user_id)["skills"]}


def build_graph(user_id: str, focus_skills: list[str]) -> dict[str, Any]:
    """Nodes = owned skills + required skills + missing prerequisites; edges = taxonomy/prereq links."""
    owned = skill_map(user_id)
    focus = [skill for skill in focus_skills if skill]
    node_keys: dict[str, str] = {key: "owned" for key in owned}
    for skill in focus:
        node_keys.setdefault(skill, "required_missing")
    # Missing prerequisites of anything owned or required.
    missing_prereqs: list[dict[str, str]] = []
    for skill in list(node_keys):
        for prereq in PREREQUISITES.get(skill, []):
            if prereq not in owned:
                if prereq not in node_keys:
                    node_keys[prereq] = "prerequisite_missing"
                missing_prereqs.append({"skill": prereq, "display": display_name(prereq), "needed_for": display_name(skill)})
    nodes = []
    for key, kind in node_keys.items():
        twin_item = owned.get(key)
        nodes.append(
            {
                "id": key,
                "label": display_name(key),
                "category": _category(key),
                "kind": kind,
                "status": twin_item["status"] if twin_item else "missing",
                "proficiency": twin_item["proficiency"] if twin_item else 0,
                "confidence": twin_item["confidence"] if twin_item else 0,
                "required": key in focus,
                "evidence": twin_item["evidence"] if twin_item else [],
                "last_demonstrated_at": twin_item["last_demonstrated_at"] if twin_item else None,
            }
        )
    edges: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for key in node_keys:
        for prereq in PREREQUISITES.get(key, []):
            if prereq in node_keys and (prereq, key) not in seen:
                seen.add((prereq, key))
                edges.append({"source": prereq, "target": key, "kind": "prerequisite"})
        for rel in SKILL_TAXONOMY.get(key, {}).get("related", []):
            pair = tuple(sorted((key, rel)))
            if rel in node_keys and pair not in seen and (rel, key) not in seen and (key, rel) not in seen:
                seen.add(pair)  # type: ignore[arg-type]
                edges.append({"source": key, "target": rel, "kind": "related"})
    unique_prereqs = list({item["skill"]: item for item in missing_prereqs}.values())
    return {"nodes": nodes, "edges": edges, "missing_prerequisites": unique_prereqs}


def timeline(user_id: str, limit: int = 40) -> list[dict[str, Any]]:
    db.init_db()
    with db.connection() as conn:
        snaps = conn.execute(
            "SELECT summary_json, reason, created_at FROM twin_snapshots WHERE user_id = ? ORDER BY created_at ASC",
            (user_id,),
        ).fetchall()
        evidence = conn.execute(
            "SELECT skill_key, source_type, tier, excerpt, observed_at FROM skill_evidence "
            "WHERE user_id = ? AND source_type IN ('career_quest', 'team_project', 'learning_milestone') "
            "ORDER BY observed_at DESC LIMIT 60",
            (user_id,),
        ).fetchall()
    events: list[dict[str, Any]] = []
    previous: dict[str, list[Any]] = {}
    for snap in snaps:
        summary = json.loads(snap["summary_json"])
        current = summary.get("skills", {})
        added = [display_name(key) for key in current if key not in previous]
        upgraded = [
            f"{display_name(key)} → {value[0]}"
            for key, value in current.items()
            if key in previous and TIER_RANK.get(value[0], 0) > TIER_RANK.get(previous[key][0], 0)
        ]
        removed = [display_name(key) for key in previous if key not in current]
        events.append(
            {
                "kind": "snapshot",
                "at": snap["created_at"],
                "title": f"Twin updated ({snap['reason'].replace('_', ' ')})",
                "detail": {
                    "counts": summary.get("counts", {}),
                    "average_proficiency": summary.get("average_proficiency"),
                    "added": added[:12],
                    "upgraded": upgraded[:12],
                    "removed": removed[:12],
                },
            }
        )
        previous = current
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for row in evidence:
        key = (row["source_type"], row["observed_at"][:16])
        item = grouped.setdefault(
            key,
            {
                "kind": row["source_type"],
                "at": row["observed_at"],
                "title": {
                    "career_quest": "Assessment completed",
                    "team_project": "Project contribution",
                    "learning_milestone": "Learning milestone",
                }[row["source_type"]],
                "detail": {"skills": [], "tier": row["tier"], "excerpt": row["excerpt"]},
            },
        )
        item["detail"]["skills"].append(display_name(row["skill_key"]))
    events.extend(grouped.values())
    events.sort(key=lambda item: item["at"], reverse=True)
    return events[:limit]

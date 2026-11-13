"""AI Skill Exchange Network: consent-based peer matching and project teams.

Safety rules enforced here (not in the UI):
- Profiles are hidden until the owner opts in (visibility='members').
- Only public profile fields are ever returned for other users — never email,
  phone, links or resume text. Matching uses the same public fields.
- Joining a team needs a request from the user AND acceptance by the owner.
- Blocking hides both users from each other and closes pending requests.
- Free text is moderated; contact details and abusive content are rejected.
- There is no direct messaging; requests carry one short moderated note.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

import numpy as np

from app import db
from app.errors import DomainError
from app.ml.model_registry import registry
from app.ml.skill_taxonomy import SKILL_TAXONOMY, canonical_role, display_name
from app.services import career_intel, digital_twin

LEVELS = {"beginner": 1, "intermediate": 2, "advanced": 3}

_CONTACT = re.compile(
    r"([\w.+-]+@[\w-]+\.[\w.-]+)|(\+?\d[\d\s().-]{8,}\d)|\b(whats\s?app|telegram|snapchat|instagram|insta|discord\.gg|t\.me|wa\.me)\b",
    re.I,
)
_ABUSE = re.compile(
    r"\b(idiot|stupid|moron|loser|kill yourself|kys|nude|nudes|porn|sexy|hook\s?up|dating|send pics|retard)\b", re.I
)


def moderate(*values: str | None) -> None:
    for value in values:
        if not value:
            continue
        if _CONTACT.search(value):
            raise DomainError(422, "contact_details_blocked",
                              "Remove contact details (email, phone, social handles). SkillBridge never shares them through the exchange.")
        if _ABUSE.search(value):
            raise DomainError(422, "content_rejected", "This text breaks the community guidelines. Please rephrase it respectfully.")


def _clean_list(values: list[str], limit: int = 20) -> list[str]:
    out = []
    for value in values:
        cleaned = re.sub(r"\s+", " ", str(value)).strip()[:60]
        if cleaned and cleaned.lower() not in {item.lower() for item in out}:
            out.append(cleaned)
    return out[:limit]


def _skill_key(value: str) -> str:
    lowered = value.strip().lower()
    for key, data in SKILL_TAXONOMY.items():
        if lowered == key or lowered in data.get("aliases", []):
            return key
    return lowered


def _profile_row(user_id: str) -> dict[str, Any] | None:
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM exchange_profiles WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        return None
    data = dict(row)
    for field in ("teach", "learn", "tech", "interests", "roles"):
        data[field] = json.loads(data.pop(f"{field}_json"))
    data["show_evidence"] = bool(data["show_evidence"])
    return data


def _blocked_pairs(user_id: str) -> set[str]:
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT blocked_user_id AS other FROM exchange_blocks WHERE user_id = ? "
            "UNION SELECT user_id AS other FROM exchange_blocks WHERE blocked_user_id = ?",
            (user_id, user_id),
        ).fetchall()
    return {row["other"] for row in rows}


def suggestions_from_twin(user_id: str) -> dict[str, Any]:
    """Digital Twin -> Exchange: what you can teach (evidence-backed) and what to learn (market gaps)."""
    twin = digital_twin.ensure(user_id)
    ranked = sorted(twin["skills"], key=lambda s: (-digital_twin.TIER_RANK[s["status"]], -s["proficiency"]))
    teach = [s["display"] for s in ranked][:10]
    teach_tiers = {s["display"]: s["status"] for s in ranked[:10]}
    user = db.get_user(user_id) or {}
    learn: list[str] = []
    if twin["skills"]:
        comparison = career_intel.compare(user_id, canonical_role(user.get("target_role")))
        learn = [row["display"] for row in comparison["requirements"] if row["state"] in {"missing", "adjacent"}][:10]
    return {"teach": teach, "teach_tiers": teach_tiers, "learn": learn, "target_role": user.get("target_role")}


def get_profile(user_id: str) -> dict[str, Any]:
    db.init_db()
    profile = _profile_row(user_id)
    user = db.get_user(user_id) or {}
    if not profile:
        profile = {
            "user_id": user_id, "visibility": "hidden", "display_name": (user.get("name") or "Member").split()[0],
            "headline": None, "teach": [], "learn": [], "tech": [], "interests": [], "roles": [],
            "availability": None, "level": "beginner", "show_evidence": True, "updated_at": None, "exists": False,
        }
    else:
        profile["exists"] = True
    return {"profile": profile, "suggestions": suggestions_from_twin(user_id)}


def save_profile(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    db.init_db()
    fields = {key: _clean_list(payload.get(key) or []) for key in ("teach", "learn", "tech", "interests", "roles")}
    display = re.sub(r"\s+", " ", payload.get("display_name") or "").strip()[:40]
    headline = (payload.get("headline") or "").strip()[:140] or None
    availability = (payload.get("availability") or "").strip()[:80] or None
    if not display:
        raise DomainError(422, "display_name_required", "Choose a display name for the exchange.")
    moderate(display, headline, availability, *[item for values in fields.values() for item in values])
    level = payload.get("level") if payload.get("level") in LEVELS else "beginner"
    visibility = "members" if payload.get("visibility") == "members" else "hidden"
    with db.connection() as conn:
        conn.execute(
            "INSERT INTO exchange_profiles (user_id, visibility, display_name, headline, teach_json, learn_json, tech_json, interests_json, "
            "roles_json, availability, level, show_evidence, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET visibility=excluded.visibility, display_name=excluded.display_name, headline=excluded.headline, "
            "teach_json=excluded.teach_json, learn_json=excluded.learn_json, tech_json=excluded.tech_json, interests_json=excluded.interests_json, "
            "roles_json=excluded.roles_json, availability=excluded.availability, level=excluded.level, show_evidence=excluded.show_evidence, "
            "updated_at=excluded.updated_at",
            (user_id, visibility, display, headline, *(json.dumps(fields[k]) for k in ("teach", "learn", "tech", "interests", "roles")),
             availability, level, int(bool(payload.get("show_evidence", True))), db.utcnow()),
        )
    return get_profile(user_id)


def _public(profile: dict[str, Any], twin_statuses: dict[str, str] | None = None) -> dict[str, Any]:
    evidence = {}
    if profile["show_evidence"] and twin_statuses:
        evidence = {item: twin_statuses[_skill_key(item)] for item in profile["teach"] if _skill_key(item) in twin_statuses}
    return {
        "member_id": profile["user_id"],
        "display_name": profile["display_name"],
        "headline": profile["headline"],
        "teach": profile["teach"],
        "learn": profile["learn"],
        "tech": profile["tech"],
        "interests": profile["interests"],
        "roles": profile["roles"],
        "availability": profile["availability"],
        "level": profile["level"],
        "teach_evidence": evidence,
    }


class _Similarity:
    """Pairwise similarity over short skill/interest strings via MiniLM, with a labeled fallback."""

    def __init__(self, texts: list[str]) -> None:
        self.method = "exact+taxonomy"
        self.vectors: dict[str, np.ndarray] = {}
        unique = list(dict.fromkeys(t.lower() for t in texts if t))
        if not unique:
            return
        try:
            vectors = registry.embed([display_name(_skill_key(t)) if _skill_key(t) in SKILL_TAXONOMY else t for t in unique])
            for text, vector in zip(unique, vectors):
                arr = np.asarray(vector, dtype=float)
                norm = np.linalg.norm(arr) or 1.0
                self.vectors[text] = arr / norm
            self.method = "semantic (all-MiniLM-L6-v2)"
        except Exception:  # noqa: BLE001
            self.vectors = {}

    def score(self, a: str, b: str) -> float:
        ka, kb = _skill_key(a), _skill_key(b)
        if ka == kb:
            return 1.0
        if kb in SKILL_TAXONOMY.get(ka, {}).get("related", []) or ka in SKILL_TAXONOMY.get(kb, {}).get("related", []):
            base = 0.7
        else:
            base = 0.0
        va, vb = self.vectors.get(a.lower()), self.vectors.get(b.lower())
        if va is not None and vb is not None:
            base = max(base, float(va @ vb))
        return base

    def coverage(self, wants: list[str], offers: list[str], threshold: float = 0.72) -> list[tuple[str, str, float]]:
        pairs = []
        for want in wants:
            best = max(((offer, self.score(want, offer)) for offer in offers), key=lambda x: x[1], default=(None, 0.0))
            if best[0] and best[1] >= threshold:
                pairs.append((want, best[0], round(best[1], 2)))
        return pairs


def matches(user_id: str, limit: int = 12) -> dict[str, Any]:
    db.init_db()
    mine = _profile_row(user_id)
    if not mine:
        return {"matches": [], "method": None, "note": "Create your exchange profile to get matches."}
    gaps = suggestions_from_twin(user_id)["learn"]
    my_wants = _clean_list(mine["learn"] + gaps)
    blocked = _blocked_pairs(user_id)
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT user_id FROM exchange_profiles WHERE visibility = 'members' AND user_id != ?", (user_id,)
        ).fetchall()
    others = [p for p in (_profile_row(r["user_id"]) for r in rows) if p and p["user_id"] not in blocked]
    corpus = my_wants + mine["teach"] + mine["interests"]
    for other in others:
        corpus += other["teach"] + other["learn"] + other["interests"]
    sim = _Similarity(corpus)
    results = []
    for other in others:
        they_teach = sim.coverage(my_wants, other["teach"])
        i_teach = sim.coverage(other["learn"], mine["teach"])
        interest_pairs = sim.coverage(mine["interests"], other["interests"], threshold=0.6)
        if not (they_teach or i_teach or interest_pairs):
            continue
        level_gap = abs(LEVELS[mine["level"]] - LEVELS[other["level"]])
        score = (
            40 * min(1.0, len(they_teach) / max(1, min(3, len(my_wants))))
            + 30 * min(1.0, len(i_teach) / max(1, min(3, len(other["learn"]))))
            + 20 * min(1.0, len(interest_pairs) / 2)
            + 10 * (1 - level_gap / 2)
        )
        twin_statuses = {}
        if other["show_evidence"]:
            twin_statuses = {item["skill"]: item["status"] for item in digital_twin.get_twin(other["user_id"])["skills"] if item["status"] != "claimed"}
        reasons = []
        if they_teach:
            reasons.append("Can help you with " + ", ".join(f"{w} (via {o})" if w.lower() != o.lower() else w for w, o, _ in they_teach[:3]))
        if i_teach:
            reasons.append("Wants to learn what you teach: " + ", ".join(w for w, _, _ in i_teach[:3]))
        if interest_pairs:
            reasons.append("Shared interests: " + ", ".join(w for w, _, _ in interest_pairs[:3]))
        if they_teach and i_teach:
            reasons.insert(0, "Two-way skill swap")
        results.append({
            "member": _public(other, twin_statuses),
            "score": round(score, 1),
            "reasons": reasons,
            "they_can_teach": [w for w, _, _ in they_teach],
            "you_can_teach": [w for w, _, _ in i_teach],
            "mutual": bool(they_teach and i_teach),
        })
    results.sort(key=lambda r: r["score"], reverse=True)
    return {"matches": results[:limit], "method": sim.method, "your_learning_goals": my_wants, "gap_skills_from_twin": gaps}


# ---------------------------------------------------------------------------
# Requests (peer connect + project join) — consent on both sides
# ---------------------------------------------------------------------------
def _get_project(project_id: str) -> dict[str, Any] | None:
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM exchange_projects WHERE id = ?", (project_id,)).fetchone()
    if not row:
        return None
    data = dict(row)
    data["roles"] = json.loads(data.pop("roles_json"))
    data["skills"] = json.loads(data.pop("skills_json"))
    return data


def _is_member(project_id: str, user_id: str) -> bool:
    with db.connection() as conn:
        return conn.execute(
            "SELECT 1 FROM exchange_members WHERE project_id = ? AND user_id = ?", (project_id, user_id)
        ).fetchone() is not None


def create_request(user_id: str, *, kind: str, member_id: str | None, project_id: str | None, role: str | None, message: str | None) -> dict[str, Any]:
    db.init_db()
    message = (message or "").strip()[:400] or None
    role = (role or "").strip()[:60] or None
    moderate(message, role)
    if kind == "PROJECT_JOIN":
        project = _get_project(project_id or "")
        if not project or project["status"] != "OPEN":
            raise DomainError(404, "project_not_found", "This project is not open for requests.")
        recipient = project["owner_id"]
        if _is_member(project["id"], user_id):
            raise DomainError(409, "already_member", "You are already on this team.")
    else:
        recipient = member_id or ""
        target = _profile_row(recipient)
        if not target or target["visibility"] != "members":
            raise DomainError(404, "member_not_found", "This member is not available.")
    if recipient == user_id:
        raise DomainError(422, "self_request", "You cannot send a request to yourself.")
    if recipient in _blocked_pairs(user_id):
        raise DomainError(404, "member_not_found", "This member is not available.")
    with db.connection() as conn:
        existing = conn.execute(
            "SELECT id FROM exchange_requests WHERE requester_id = ? AND recipient_id = ? AND kind = ? "
            "AND COALESCE(project_id, '') = COALESCE(?, '') AND status = 'PENDING'",
            (user_id, recipient, kind, project_id if kind == "PROJECT_JOIN" else None),
        ).fetchone()
        if existing:
            raise DomainError(409, "request_pending", "You already have a pending request here.")
        request_id = f"xr-{uuid.uuid4().hex[:16]}"
        conn.execute(
            "INSERT INTO exchange_requests (id, kind, requester_id, recipient_id, project_id, role, message, status, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)",
            (request_id, kind, user_id, recipient, project_id if kind == "PROJECT_JOIN" else None, role, message, db.utcnow()),
        )
    me = _profile_row(user_id)
    db.log_event(recipient, "exchange", "New collaboration request",
                 f"{me['display_name'] if me else 'A member'} sent a {'team join' if kind == 'PROJECT_JOIN' else 'learning partner'} request.")
    return {"id": request_id, "status": "PENDING"}


def list_requests(user_id: str) -> dict[str, Any]:
    db.init_db()
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT r.*, p.title AS project_title FROM exchange_requests r LEFT JOIN exchange_projects p ON p.id = r.project_id "
            "WHERE r.requester_id = ? OR r.recipient_id = ? ORDER BY r.created_at DESC LIMIT 100",
            (user_id, user_id),
        ).fetchall()
    out = {"incoming": [], "outgoing": []}
    for row in rows:
        data = dict(row)
        other_id = data["recipient_id"] if data["requester_id"] == user_id else data["requester_id"]
        other = _profile_row(other_id)
        data["other"] = {"member_id": other_id, "display_name": other["display_name"] if other else "Member",
                         "headline": other["headline"] if other else None}
        data.pop("requester_id"), data.pop("recipient_id")
        (out["outgoing"] if row["requester_id"] == user_id else out["incoming"]).append(data)
    return out


def decide_request(user_id: str, request_id: str, accept: bool) -> dict[str, Any]:
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM exchange_requests WHERE id = ? AND recipient_id = ?", (request_id, user_id)).fetchone()
        if not row:
            raise DomainError(404, "request_not_found", "Request not found.")
        if row["status"] != "PENDING":
            raise DomainError(409, "request_closed", "This request was already decided.")
        status = "ACCEPTED" if accept else "REJECTED"
        conn.execute("UPDATE exchange_requests SET status = ?, decided_at = ? WHERE id = ?", (status, db.utcnow(), request_id))
        if accept and row["kind"] == "PROJECT_JOIN":
            conn.execute(
                "INSERT OR IGNORE INTO exchange_members (project_id, user_id, role, responsibility, joined_at) VALUES (?, ?, ?, NULL, ?)",
                (row["project_id"], row["requester_id"], row["role"] or "Contributor", db.utcnow()),
            )
    db.log_event(row["requester_id"], "exchange", f"Request {status.lower()}", "Your Skill Exchange request was " + status.lower() + ".")
    return {"id": request_id, "status": status}


def withdraw_request(user_id: str, request_id: str) -> dict[str, Any]:
    with db.connection() as conn:
        cursor = conn.execute(
            "UPDATE exchange_requests SET status = 'WITHDRAWN', decided_at = ? WHERE id = ? AND requester_id = ? AND status = 'PENDING'",
            (db.utcnow(), request_id, user_id),
        )
    if not cursor.rowcount:
        raise DomainError(404, "request_not_found", "No pending request to withdraw.")
    return {"id": request_id, "status": "WITHDRAWN"}


def block(user_id: str, member_id: str) -> dict[str, Any]:
    if member_id == user_id or not db.get_user(member_id):
        raise DomainError(404, "member_not_found", "This member is not available.")
    with db.connection() as conn:
        conn.execute("INSERT OR IGNORE INTO exchange_blocks (user_id, blocked_user_id, created_at) VALUES (?, ?, ?)", (user_id, member_id, db.utcnow()))
        conn.execute(
            "UPDATE exchange_requests SET status = 'REJECTED', decided_at = ? WHERE status = 'PENDING' AND "
            "((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?))",
            (db.utcnow(), user_id, member_id, member_id, user_id),
        )
    return {"blocked": True}


def unblock(user_id: str, member_id: str) -> dict[str, Any]:
    with db.connection() as conn:
        conn.execute("DELETE FROM exchange_blocks WHERE user_id = ? AND blocked_user_id = ?", (user_id, member_id))
    return {"blocked": False}


def list_blocks(user_id: str) -> list[dict[str, Any]]:
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT b.blocked_user_id, p.display_name FROM exchange_blocks b LEFT JOIN exchange_profiles p ON p.user_id = b.blocked_user_id "
            "WHERE b.user_id = ?", (user_id,)
        ).fetchall()
    return [{"member_id": r["blocked_user_id"], "display_name": r["display_name"] or "Member"} for r in rows]


def report(user_id: str, target_type: str, target_id: str, reason: str) -> dict[str, Any]:
    reason = reason.strip()[:500]
    if len(reason) < 5:
        raise DomainError(422, "reason_required", "Describe the problem in a few words.")
    with db.connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO exchange_reports (id, reporter_id, target_type, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (f"rep-{uuid.uuid4().hex[:12]}", user_id, target_type, target_id, reason, db.utcnow()),
        )
        if target_type == "project":
            count = conn.execute(
                "SELECT COUNT(*) AS n FROM exchange_reports WHERE target_type = 'project' AND target_id = ?", (target_id,)
            ).fetchone()["n"]
            if count >= 3:  # auto-hide pending moderator review
                conn.execute("UPDATE exchange_projects SET status = 'HIDDEN' WHERE id = ?", (target_id,))
    return {"reported": True}


# ---------------------------------------------------------------------------
# Projects, teams and workspace
# ---------------------------------------------------------------------------
def create_project(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    db.init_db()
    title = re.sub(r"\s+", " ", payload.get("title") or "").strip()[:120]
    description = (payload.get("description") or "").strip()[:3000]
    if len(title) < 4 or len(description) < 20:
        raise DomainError(422, "project_invalid", "Give the project a title and a description of at least 20 characters.")
    roles = [
        {"role": re.sub(r"\s+", " ", str(r.get("role", ""))).strip()[:60], "skills": _clean_list(r.get("skills") or [], 8)}
        for r in (payload.get("roles") or [])[:8] if str(r.get("role", "")).strip()
    ]
    skills = _clean_list(payload.get("skills") or [], 16)
    moderate(title, description, *[r["role"] for r in roles], *skills, *[s for r in roles for s in r["skills"]])
    project_id = f"xp-{uuid.uuid4().hex[:12]}"
    now = db.utcnow()
    with db.connection() as conn:
        conn.execute(
            "INSERT INTO exchange_projects (id, owner_id, title, description, roles_json, skills_json, status, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)",
            (project_id, user_id, title, description, json.dumps(roles), json.dumps(skills), now, now),
        )
        conn.execute(
            "INSERT INTO exchange_members (project_id, user_id, role, responsibility, joined_at) VALUES (?, ?, 'Owner', 'Project lead', ?)",
            (project_id, user_id, now),
        )
    return project_detail(user_id, project_id)


def list_projects(user_id: str) -> dict[str, Any]:
    db.init_db()
    blocked = _blocked_pairs(user_id)
    mine_profile = _profile_row(user_id)
    my_teach = (mine_profile or {}).get("teach", []) + [s["display"] for s in digital_twin.get_twin(user_id)["skills"] if s["status"] != "claimed"]
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT p.*, (SELECT COUNT(*) FROM exchange_members m WHERE m.project_id = p.id) AS member_count, "
            "EXISTS(SELECT 1 FROM exchange_members m WHERE m.project_id = p.id AND m.user_id = ?) AS is_member "
            "FROM exchange_projects p WHERE p.status = 'OPEN' OR EXISTS(SELECT 1 FROM exchange_members m WHERE m.project_id = p.id AND m.user_id = ?) "
            "ORDER BY p.created_at DESC LIMIT 100",
            (user_id, user_id),
        ).fetchall()
    projects = []
    for row in rows:
        if row["owner_id"] in blocked:
            continue
        data = dict(row)
        data["roles"] = json.loads(data.pop("roles_json"))
        data["skills"] = json.loads(data.pop("skills_json"))
        wanted = data["skills"] + [s for r in data["roles"] for s in r["skills"]]
        my_keys = {_skill_key(s) for s in my_teach}
        overlap = [s for s in wanted if _skill_key(s) in my_keys]
        data["fit"] = {"overlap": list(dict.fromkeys(overlap)), "score": round(len(set(overlap)) / max(1, len(set(wanted))) * 100)}
        data["is_owner"] = data.pop("owner_id") == user_id
        data["is_member"] = bool(data["is_member"])
        data["description"] = data["description"][:280]
        projects.append(data)
    return {
        "mine": [p for p in projects if p["is_member"]],
        "discover": sorted([p for p in projects if not p["is_member"]], key=lambda p: -p["fit"]["score"]),
    }


def project_detail(user_id: str, project_id: str) -> dict[str, Any]:
    project = _get_project(project_id)
    if not project or (project["status"] == "HIDDEN" and project["owner_id"] != user_id):
        raise DomainError(404, "project_not_found", "Project not found.")
    member = _is_member(project_id, user_id)
    if not member and (project["status"] != "OPEN" or project["owner_id"] in _blocked_pairs(user_id)):
        raise DomainError(404, "project_not_found", "Project not found.")
    is_owner = project["owner_id"] == user_id
    base = {
        "id": project["id"], "title": project["title"], "description": project["description"], "roles": project["roles"],
        "skills": project["skills"], "status": project["status"], "created_at": project["created_at"],
        "is_owner": is_owner, "is_member": member,
    }
    with db.connection() as conn:
        members = conn.execute(
            "SELECT m.user_id, m.role, m.responsibility, m.joined_at, p.display_name FROM exchange_members m "
            "LEFT JOIN exchange_profiles p ON p.user_id = m.user_id WHERE m.project_id = ? ORDER BY m.joined_at", (project_id,)
        ).fetchall()
        base["team"] = [
            {"member_id": m["user_id"], "display_name": m["display_name"] or "Member", "role": m["role"],
             "responsibility": m["responsibility"], "joined_at": m["joined_at"], "is_you": m["user_id"] == user_id}
            for m in members
        ]
        if not member:
            pending = conn.execute(
                "SELECT id FROM exchange_requests WHERE project_id = ? AND requester_id = ? AND status = 'PENDING'", (project_id, user_id)
            ).fetchone()
            base["pending_request"] = bool(pending)
            return base
        base["milestones"] = [dict(r) for r in conn.execute(
            "SELECT id, title, due_date, done, created_at FROM exchange_milestones WHERE project_id = ? ORDER BY COALESCE(due_date, created_at)",
            (project_id,)).fetchall()]
        base["tasks"] = [
            {**dict(r), "skills": json.loads(r["skills_json"])}
            for r in conn.execute("SELECT * FROM exchange_tasks WHERE project_id = ? ORDER BY created_at", (project_id,)).fetchall()
        ]
        for task in base["tasks"]:
            task.pop("skills_json", None)
        base["contributions"] = [
            {**dict(r), "skills": [display_name(s) for s in json.loads(r["skills_json"])]}
            for r in conn.execute(
                "SELECT c.id, c.user_id AS member_id, c.confirmed_by, c.summary, c.skills_json, c.created_at, p.display_name "
                "FROM exchange_contributions c LEFT JOIN exchange_profiles p ON p.user_id = c.user_id "
                "WHERE c.project_id = ? ORDER BY c.created_at DESC", (project_id,)).fetchall()
        ]
        for item in base["contributions"]:
            item["peer_confirmed"] = item.pop("confirmed_by") != item["member_id"]
            item.pop("skills_json", None)
    return base


def _require_member(project_id: str, user_id: str) -> dict[str, Any]:
    project = _get_project(project_id)
    if not project or not _is_member(project_id, user_id):
        raise DomainError(404, "project_not_found", "Project not found.")
    return project


def update_project(user_id: str, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    project = _require_member(project_id, user_id)
    if project["owner_id"] != user_id:
        raise DomainError(403, "owner_only", "Only the project owner can change project settings.")
    status = payload.get("status")
    with db.connection() as conn:
        if status in {"OPEN", "CLOSED"}:
            conn.execute("UPDATE exchange_projects SET status = ?, updated_at = ? WHERE id = ?", (status, db.utcnow(), project_id))
        for assignment in payload.get("responsibilities") or []:
            text = str(assignment.get("responsibility") or "").strip()[:140]
            moderate(text)
            conn.execute(
                "UPDATE exchange_members SET responsibility = ? WHERE project_id = ? AND user_id = ?",
                (text or None, project_id, str(assignment.get("member_id"))),
            )
    return project_detail(user_id, project_id)


def add_milestone(user_id: str, project_id: str, title: str, due_date: str | None) -> dict[str, Any]:
    _require_member(project_id, user_id)
    title = title.strip()[:120]
    moderate(title)
    if len(title) < 3:
        raise DomainError(422, "milestone_invalid", "Milestone title is too short.")
    with db.connection() as conn:
        conn.execute(
            "INSERT INTO exchange_milestones (id, project_id, title, due_date, done, created_at) VALUES (?, ?, ?, ?, 0, ?)",
            (f"xm-{uuid.uuid4().hex[:12]}", project_id, title, (due_date or None), db.utcnow()),
        )
    return project_detail(user_id, project_id)


def toggle_milestone(user_id: str, project_id: str, milestone_id: str, done: bool) -> dict[str, Any]:
    _require_member(project_id, user_id)
    with db.connection() as conn:
        conn.execute("UPDATE exchange_milestones SET done = ? WHERE id = ? AND project_id = ?", (int(done), milestone_id, project_id))
    return project_detail(user_id, project_id)


def add_task(user_id: str, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    _require_member(project_id, user_id)
    title = (payload.get("title") or "").strip()[:160]
    skills = [_skill_key(s) for s in _clean_list(payload.get("skills") or [], 6)]
    moderate(title, *skills)
    if len(title) < 3:
        raise DomainError(422, "task_invalid", "Task title is too short.")
    assignee = payload.get("assignee_id")
    if assignee and not _is_member(project_id, assignee):
        raise DomainError(422, "assignee_invalid", "Tasks can only be assigned to team members.")
    milestone = payload.get("milestone_id") or None
    now = db.utcnow()
    with db.connection() as conn:
        if milestone and not conn.execute("SELECT 1 FROM exchange_milestones WHERE id = ? AND project_id = ?", (milestone, project_id)).fetchone():
            milestone = None
        conn.execute(
            "INSERT INTO exchange_tasks (id, project_id, milestone_id, title, skills_json, assignee_id, status, created_by, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 'TODO', ?, ?, ?)",
            (f"xt-{uuid.uuid4().hex[:12]}", project_id, milestone, title, json.dumps(skills), assignee or None, user_id, now, now),
        )
    return project_detail(user_id, project_id)


def update_task(user_id: str, project_id: str, task_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Completing a task records a contribution and feeds the assignee's Digital Twin."""
    _require_member(project_id, user_id)
    with db.connection() as conn:
        task = conn.execute("SELECT * FROM exchange_tasks WHERE id = ? AND project_id = ?", (task_id, project_id)).fetchone()
    if not task:
        raise DomainError(404, "task_not_found", "Task not found.")
    assignee = payload.get("assignee_id", task["assignee_id"])
    if assignee and not _is_member(project_id, assignee):
        raise DomainError(422, "assignee_invalid", "Tasks can only be assigned to team members.")
    status = payload.get("status") if payload.get("status") in {"TODO", "DOING", "DONE"} else task["status"]
    rebuild_for = None
    with db.connection() as conn:
        conn.execute(
            "UPDATE exchange_tasks SET status = ?, assignee_id = ?, updated_at = ? WHERE id = ?",
            (status, assignee or None, db.utcnow(), task_id),
        )
        skills = [s for s in json.loads(task["skills_json"]) if s in SKILL_TAXONOMY]
        if status == "DONE" and assignee and skills:
            conn.execute(
                "INSERT OR IGNORE INTO exchange_contributions (id, project_id, task_id, user_id, confirmed_by, skills_json, summary, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (f"xc-{uuid.uuid4().hex[:12]}", project_id, task_id, assignee, user_id, json.dumps(skills), f"Completed task '{task['title']}'", db.utcnow()),
            )
            rebuild_for = assignee
        elif status != "DONE":
            conn.execute("DELETE FROM exchange_contributions WHERE task_id = ?", (task_id,))
            rebuild_for = task["assignee_id"]
    if rebuild_for:
        digital_twin.rebuild(rebuild_for, reason="project_contribution")
    return project_detail(user_id, project_id)


def project_candidates(user_id: str, project_id: str) -> list[dict[str, Any]]:
    """Compatible collaborators for the project's open roles (owner/members only)."""
    project = _require_member(project_id, user_id)
    blocked = _blocked_pairs(user_id)
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT p.user_id FROM exchange_profiles p WHERE p.visibility = 'members' AND p.user_id NOT IN "
            "(SELECT user_id FROM exchange_members WHERE project_id = ?)", (project_id,)
        ).fetchall()
    others = [p for p in (_profile_row(r["user_id"]) for r in rows) if p and p["user_id"] not in blocked]
    wanted = project["skills"] + [s for r in project["roles"] for s in r["skills"]]
    sim = _Similarity(wanted + [s for o in others for s in o["teach"] + o["tech"]])
    out = []
    for other in others:
        cover = sim.coverage(wanted, other["teach"] + other["tech"])
        if not cover:
            continue
        best_role = max(project["roles"], key=lambda r: len(sim.coverage(r["skills"], other["teach"] + other["tech"])), default=None)
        out.append({"member": _public(other), "covers": [w for w, _, _ in cover], "suggested_role": best_role["role"] if best_role else None,
                    "score": round(len(cover) / max(1, len(set(wanted))) * 100)})
    out.sort(key=lambda r: -r["score"])
    return out[:10]

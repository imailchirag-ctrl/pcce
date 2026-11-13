"""Career Market Intelligence: provider adapters + skill-demand aggregation.

Data provenance is explicit on every row (``data_kind``):
- live:          fetched from a public job API (Remotive, Arbeitnow) with retrieval timestamp.
- platform:      jobs posted by recruiters inside SkillBridge.
- sample:        the bundled demo seed jobs — never presented as market data.
- user_provided: job descriptions a user pasted (private to that user).

Only extracted skills, title, company, URL and timestamps are stored — never the
full posting body — and statistics are computed from stored rows only.
"""

from __future__ import annotations

import hashlib
import html
import json
import logging
import re
import urllib.parse
import urllib.request
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from itertools import combinations
from typing import Any, Protocol

from app import db
from app.ml.skill_extractor import extract_skill_details
from app.ml.skill_taxonomy import ROLE_ALIASES, ROLE_CATALOG, SKILL_TAXONOMY, display_name

logger = logging.getLogger("skillbridge.market")

SEED_JOB_IDS = {"j1", "j2", "j3", "j4", "j5", "j6"}
FETCH_TTL = timedelta(hours=6)
MIN_ROLE_POSTINGS = 3
ENTRY_LEVEL = re.compile(r"\b(intern|internship|junior|jr\.?|entry[- ]level|graduate|new grad|trainee|fresher)\b", re.I)
# Curated list of frontier technologies; the frequencies shown next to them are observed.
FRONTIER = ["llm", "rag", "vector databases", "transformers", "sentence transformers", "mlops", "prompt engineering",
            "kubernetes", "terraform", "next.js", "rust", "computer vision"]
USER_AGENT = "SkillBridge-MarketIntel/1.0 (+local)"


def _now() -> str:
    return db.utcnow()


def classify_role(title: str) -> str | None:
    lowered = f" {title.lower()} "
    candidates = {**{key: key for key in ROLE_CATALOG}, **ROLE_ALIASES}
    for alias in sorted(candidates, key=len, reverse=True):
        if f" {alias} " in lowered or lowered.strip().startswith(alias):
            return candidates[alias]
    if re.search(r"\b(ml|machine learning)\b", lowered):
        return "machine learning engineer"
    if re.search(r"\b(ai|llm|genai)\b", lowered):
        return "ai engineer"
    if re.search(r"\bdata scien", lowered):
        return "data scientist"
    if re.search(r"\b(front[- ]?end|react)\b", lowered):
        return "frontend engineer"
    if re.search(r"\b(back[- ]?end)\b", lowered):
        return "backend developer"
    if re.search(r"\bfull[- ]?stack\b", lowered):
        return "full stack developer"
    if re.search(r"\bdevops|sre|platform engineer\b", lowered):
        return "devops engineer"
    return None


def _strip_html(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value or ""))).strip()


# ---------------------------------------------------------------------------
# Provider adapters
# ---------------------------------------------------------------------------
class JobProvider(Protocol):
    key: str
    label: str
    homepage: str

    def fetch(self, query: str, limit: int) -> list[dict[str, Any]]: ...


def _http_json(url: str, timeout: int = 12) -> Any:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed https hosts
        return json.loads(response.read().decode("utf-8"))


class RemotiveProvider:
    key = "remotive"
    label = "Remotive public API"
    homepage = "https://remotive.com"

    def fetch(self, query: str, limit: int) -> list[dict[str, Any]]:
        params = urllib.parse.urlencode({"search": query, "limit": limit})
        payload = _http_json(f"https://remotive.com/api/remote-jobs?{params}")
        return [
            {
                "external_id": str(job.get("id")),
                "title": job.get("title") or "",
                "company": job.get("company_name"),
                "location": job.get("candidate_required_location"),
                "url": job.get("url"),
                "published_at": job.get("publication_date"),
                "text": f"{job.get('title', '')}. {' '.join(job.get('tags') or [])}. {_strip_html(job.get('description', ''))}",
            }
            for job in (payload or {}).get("jobs", [])[:limit]
        ]


class ArbeitnowProvider:
    key = "arbeitnow"
    label = "Arbeitnow job board API"
    homepage = "https://www.arbeitnow.com"

    def fetch(self, query: str, limit: int) -> list[dict[str, Any]]:
        payload = _http_json("https://www.arbeitnow.com/api/job-board-api")
        terms = [term for term in query.lower().split() if len(term) > 1]
        results = []
        for job in (payload or {}).get("data", []):
            haystack = f"{job.get('title', '')} {' '.join(job.get('tags') or [])}".lower()
            if terms and not all(term in haystack for term in terms):
                continue
            created = job.get("created_at")
            results.append(
                {
                    "external_id": str(job.get("slug")),
                    "title": job.get("title") or "",
                    "company": job.get("company_name"),
                    "location": job.get("location"),
                    "url": job.get("url"),
                    "published_at": datetime.fromtimestamp(created, timezone.utc).isoformat() if isinstance(created, (int, float)) else None,
                    "text": f"{job.get('title', '')}. {' '.join(job.get('tags') or [])}. {_strip_html(job.get('description', ''))}",
                }
            )
            if len(results) >= limit:
                break
        return results


PROVIDERS: dict[str, JobProvider] = {provider.key: provider for provider in (RemotiveProvider(), ArbeitnowProvider())}


def _store_posting(
    conn: Any, *, provider: str, data_kind: str, owner_id: str | None, raw: dict[str, Any], skills: list[str], role_key: str | None
) -> bool:
    title = (raw.get("title") or "Untitled").strip()[:200]
    entry = bool(ENTRY_LEVEL.search(title)) or bool(ENTRY_LEVEL.search((raw.get("text") or "")[:600]))
    cursor = conn.execute(
        "INSERT OR IGNORE INTO market_postings (id, owner_id, provider, data_kind, external_id, title, company, location, url, "
        "published_at, retrieved_at, role_key, entry_level, skills_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            f"mp-{uuid.uuid4().hex[:16]}",
            owner_id,
            provider,
            data_kind,
            raw["external_id"],
            title,
            (raw.get("company") or None),
            (raw.get("location") or None),
            raw.get("url"),
            raw.get("published_at"),
            _now(),
            role_key or classify_role(title),
            int(entry),
            json.dumps(sorted(set(skills))),
        ),
    )
    return cursor.rowcount > 0


def sync_platform_jobs() -> None:
    """Mirror recruiter jobs (platform) and seed jobs (sample) into the market table."""
    db.init_db()
    jobs = db.list_jobs(published_only=True)
    with db.connection() as conn:
        for job in jobs:
            skills = [skill.lower() for skill in job.get("required_skills", [])]
            skills += extract_skill_details(job.get("description", ""), semantic=False)["names"]
            _store_posting(
                conn,
                provider="skillbridge_jobs",
                data_kind="sample" if job["id"] in SEED_JOB_IDS else "platform",
                owner_id=None,
                raw={"external_id": job["id"], "title": job["title"], "company": job.get("company"), "location": job.get("location"),
                     "url": f"/jobs?job={job['id']}", "published_at": job.get("created_at"), "text": job.get("description", "")},
                skills=[skill for skill in skills if skill in SKILL_TAXONOMY],
                role_key=None,
            )


def refresh_live(query: str, providers: list[str] | None = None, limit: int = 40, force: bool = False) -> list[dict[str, Any]]:
    """Fetch public postings. Throttled per provider+query; failures are logged, never raised."""
    db.init_db()
    query = re.sub(r"\s+", " ", query.strip().lower())[:60] or "software engineer"
    results = []
    for key in providers or list(PROVIDERS):
        provider = PROVIDERS.get(key)
        if not provider:
            continue
        with db.connection() as conn:
            last = conn.execute(
                "SELECT fetched_at, postings FROM market_fetch_log WHERE provider = ? AND query = ? AND status = 'ok' "
                "ORDER BY fetched_at DESC LIMIT 1",
                (key, query),
            ).fetchone()
        if last and not force and datetime.fromisoformat(last["fetched_at"]) > datetime.now(timezone.utc) - FETCH_TTL:
            results.append({"provider": key, "label": provider.label, "status": "cached", "fetched_at": last["fetched_at"], "new_postings": 0})
            continue
        status, error, added = "ok", None, 0
        try:
            raw_jobs = provider.fetch(query, limit)
            with db.connection() as conn:
                for raw in raw_jobs:
                    if not raw.get("external_id") or not raw.get("title"):
                        continue
                    skills = extract_skill_details(raw.get("text", "")[:20000], semantic=False)["names"]
                    added += int(_store_posting(conn, provider=key, data_kind="live", owner_id=None, raw=raw, skills=skills, role_key=None))
        except Exception as exc:  # noqa: BLE001 - provider outages must not break the app
            status, error = "failed", f"{type(exc).__name__}: {exc}"[:300]
            logger.warning("Market provider %s failed: %s", key, error)
        fetched_at = _now()
        with db.connection() as conn:
            conn.execute(
                "INSERT INTO market_fetch_log (id, provider, query, status, postings, error, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (f"mf-{uuid.uuid4().hex[:12]}", key, query, status, added, error, fetched_at),
            )
        results.append({"provider": key, "label": provider.label, "status": status, "error": error, "fetched_at": fetched_at, "new_postings": added})
    return results


def add_user_posting(user_id: str, *, title: str, text: str, role_key: str | None) -> dict[str, Any]:
    db.init_db()
    details = extract_skill_details(text, semantic=True)
    skills = [item["skill"] for item in details["skills"]]
    external_id = hashlib.sha1(text.strip().encode()).hexdigest()[:20]
    with db.connection() as conn:
        _store_posting(
            conn,
            provider="pasted",
            data_kind="user_provided",
            owner_id=user_id,
            raw={"external_id": external_id, "title": title, "text": text},
            skills=skills,
            role_key=role_key,
        )
    return {"skills": details["skills"], "skill_keys": skills, "role_key": role_key or classify_role(title)}


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------
KIND_FILTERS = {
    "market": ("live", "platform", "user_provided"),
    "live": ("live",),
    "platform": ("platform",),
    "mine": ("user_provided",),
    "sample": ("sample",),
}


def _postings(viewer_id: str, scope: str = "market", role_key: str | None = None) -> list[dict[str, Any]]:
    kinds = KIND_FILTERS.get(scope, KIND_FILTERS["market"])
    placeholders = ",".join("?" for _ in kinds)
    sql = (
        f"SELECT * FROM market_postings WHERE data_kind IN ({placeholders}) "
        "AND (owner_id IS NULL OR owner_id = ?)"
    )
    params: list[Any] = [*kinds, viewer_id]
    if role_key:
        sql += " AND role_key = ?"
        params.append(role_key)
    with db.connection() as conn:
        rows = conn.execute(sql + " ORDER BY retrieved_at DESC LIMIT 2000", params).fetchall()
    return [{**dict(row), "skills": json.loads(row["skills_json"])} for row in rows]


def _skill_shares(postings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counter: Counter[str] = Counter()
    for posting in postings:
        counter.update(set(posting["skills"]))
    total = len(postings) or 1
    return [
        {"skill": skill, "display": display_name(skill), "category": SKILL_TAXONOMY.get(skill, {}).get("category", "Other"),
         "postings": count, "share": round(count / total * 100, 1)}
        for skill, count in counter.most_common()
    ]


def _trend(postings: list[dict[str, Any]], skills: list[str]) -> dict[str, Any]:
    by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for posting in postings:
        by_day[posting["retrieved_at"][:10]].append(posting)
    days = sorted(by_day)
    if len(days) < 2:
        return {"available": False, "days": days, "series": [],
                "note": "Demand trends appear after market data has been retrieved on at least two different days."}
    series = []
    for day in days:
        rows = by_day[day]
        point: dict[str, Any] = {"day": day, "postings": len(rows)}
        for skill in skills:
            point[skill] = round(sum(1 for row in rows if skill in row["skills"]) / len(rows) * 100, 1)
        series.append(point)
    return {"available": True, "days": days, "series": series, "skills": skills}


def provenance(viewer_id: str) -> dict[str, Any]:
    with db.connection() as conn:
        kinds = conn.execute(
            "SELECT data_kind, provider, COUNT(*) AS n, MAX(retrieved_at) AS last FROM market_postings "
            "WHERE owner_id IS NULL OR owner_id = ? GROUP BY data_kind, provider",
            (viewer_id,),
        ).fetchall()
        fetches = conn.execute(
            "SELECT provider, query, status, postings, error, fetched_at FROM market_fetch_log ORDER BY fetched_at DESC LIMIT 8"
        ).fetchall()
    return {
        "sources": [dict(row) for row in kinds],
        "recent_fetches": [dict(row) for row in fetches],
        "providers": [{"key": p.key, "label": p.label, "homepage": p.homepage} for p in PROVIDERS.values()],
    }


def dashboard(viewer_id: str, scope: str = "market") -> dict[str, Any]:
    sync_platform_jobs()
    postings = _postings(viewer_id, scope)
    shares = _skill_shares(postings)
    pair_counter: Counter[tuple[str, str]] = Counter()
    for posting in postings:
        pair_counter.update(combinations(sorted(set(posting["skills"]))[:25], 2))
    combos = [
        {"skills": [display_name(a), display_name(b)], "postings": count, "share": round(count / max(1, len(postings)) * 100, 1)}
        for (a, b), count in pair_counter.most_common(10) if count >= 2
    ]
    roles = Counter(posting["role_key"] for posting in postings if posting["role_key"])
    entry = [posting for posting in postings if posting["entry_level"]]
    share_map = {item["skill"]: item for item in shares}
    return {
        "scope": scope,
        "total_postings": len(postings),
        "kinds": dict(Counter(posting["data_kind"] for posting in postings)),
        "top_skills": shares[:20],
        "frontier": [share_map.get(skill) or {"skill": skill, "display": display_name(skill), "postings": 0, "share": 0.0}
                     for skill in FRONTIER],
        "combinations": combos,
        "roles": [{"role_key": key, "title": ROLE_CATALOG.get(key, {}).get("title", key.title()), "postings": count}
                  for key, count in roles.most_common(12)],
        "entry_level": {"postings": len(entry), "share": round(len(entry) / max(1, len(postings)) * 100, 1),
                        "top_skills": _skill_shares(entry)[:8]},
        "trend": _trend(postings, [item["skill"] for item in shares[:5]]),
        "recent": [
            {"title": p["title"], "company": p["company"], "url": p["url"], "data_kind": p["data_kind"], "provider": p["provider"],
             "retrieved_at": p["retrieved_at"], "skills": [display_name(s) for s in p["skills"][:8]], "role_key": p["role_key"]}
            for p in postings[:12]
        ],
        "provenance": provenance(viewer_id),
    }


def role_requirements(role_key: str, viewer_id: str) -> dict[str, Any]:
    """Market-derived requirements when >= MIN_ROLE_POSTINGS exist, else the curated baseline (labeled)."""
    sync_platform_jobs()
    postings = _postings(viewer_id, "market", role_key)
    baseline = ROLE_CATALOG.get(role_key, ROLE_CATALOG["software engineer"])
    if len(postings) >= MIN_ROLE_POSTINGS:
        shares = [item for item in _skill_shares(postings) if item["share"] >= 15][:16]
        requirements = [
            {**item, "essential": item["share"] >= 50 or item["skill"] in baseline["skills"][:3], "weight": round(max(0.3, item["share"] / 100), 2)}
            for item in shares
        ]
        top = {item["skill"] for item in requirements}
        related_counter: Counter[str] = Counter()
        for posting in postings:
            related_counter.update(skill for skill in posting["skills"] if skill not in top)
        source = "market"
        related = [display_name(skill) for skill, _ in related_counter.most_common(8)]
    else:
        requirements = [
            {"skill": skill, "display": display_name(skill), "category": SKILL_TAXONOMY.get(skill, {}).get("category", "Other"),
             "postings": 0, "share": None, "essential": index < 5, "weight": 1.0 if index < 5 else 0.6}
            for index, skill in enumerate(baseline["skills"])
        ]
        source = "curated_baseline"
        related = []
    return {
        "role_key": role_key,
        "title": baseline["title"],
        "summary": baseline["summary"],
        "source": source,
        "postings_analyzed": len(postings),
        "data_kinds": dict(Counter(p["data_kind"] for p in postings)),
        "requirements": requirements,
        "related_skills": related,
        "trend": _trend(postings, [item["skill"] for item in requirements[:4]]) if postings else {"available": False, "series": [], "note": "No postings for this role yet."},
        "note": None if source == "market" else (
            f"Only {len(postings)} posting(s) for this role are stored, so requirements come from SkillBridge's curated role "
            "profile, not market statistics. Refresh live data or paste job descriptions to switch to market-derived requirements."
        ),
    }


def demand_weight(viewer_id: str) -> dict[str, float]:
    postings = _postings(viewer_id, "market")
    roles = Counter(p["role_key"] for p in postings if p["role_key"])
    total = sum(roles.values())
    return {key: count / total for key, count in roles.items()} if total else {}

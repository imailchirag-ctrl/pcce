"""Connects the Digital Twin with Market Intelligence (and feeds Skill Exchange).

Readiness, recommendations and twin chat are computed deterministically from
stored evidence. The local LLM (Ollama) is only ever asked to *phrase* a grounded
fact sheet, and its output is discarded if it names skills absent from the facts.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app import db
from app.core.config import get_settings
from app.ml.model_registry import registry
from app.ml.skill_extractor import extract_skill_details, match_skills
from app.ml.skill_taxonomy import LEARNING_RESOURCES, ROLE_ALIASES, ROLE_CATALOG, SKILL_TAXONOMY, canonical_role, display_name
from app.services import digital_twin, market_intel

TIER_CREDIT = {"verified": 1.0, "demonstrated": 0.8, "claimed": 0.35}


def detect_role(text: str, fallback: str | None = None) -> str:
    lowered = f" {text.lower()} "
    candidates = {**{key: key for key in ROLE_CATALOG}, **ROLE_ALIASES}
    for alias in sorted(candidates, key=len, reverse=True):
        if re.search(rf"\b{re.escape(alias)}\b", lowered):
            return candidates[alias]
    guessed = market_intel.classify_role(text)
    return guessed or canonical_role(fallback)


def compare(user_id: str, role_key: str) -> dict[str, Any]:
    """Personal market comparison: requirement-by-requirement evidence status."""
    reqs = market_intel.role_requirements(role_key, user_id)
    twin = digital_twin.skill_map(user_id)
    required_keys = [item["skill"] for item in reqs["requirements"]]
    semantic = match_skills(list(twin.keys()), [key for key in required_keys if key not in twin]) if twin else None
    adjacent = {item["skill"]: item.get("closest_skill") for item in (semantic or {}).get("partial", [])}
    rows, earned, possible = [], 0.0, 0.0
    for req in reqs["requirements"]:
        key = req["skill"]
        weight = req["weight"] * (1.3 if req["essential"] else 1.0)
        possible += weight
        owned = twin.get(key)
        if owned:
            state = owned["status"]
            credit = TIER_CREDIT[state] * (0.6 + 0.4 * owned["proficiency"] / 100)
        elif key in adjacent:
            state, credit = "adjacent", 0.25
        else:
            state, credit = "missing", 0.0
        earned += weight * credit
        rows.append(
            {
                **req,
                "state": state,
                "proficiency": owned["proficiency"] if owned else 0,
                "closest_skill": display_name(adjacent[key]) if key in adjacent and adjacent[key] else None,
                "evidence": owned["evidence"][:2] if owned else [],
            }
        )
    alignment = round(earned / possible * 100, 1) if possible else 0.0
    groups = {
        state: [row["display"] for row in rows if row["state"] == state]
        for state in ("verified", "demonstrated", "claimed", "adjacent", "missing")
    }
    return {
        "role": {k: reqs[k] for k in ("role_key", "title", "summary", "source", "postings_analyzed", "data_kinds", "note", "related_skills")},
        "alignment": alignment,
        "requirements": rows,
        "groups": groups,
        "method": "semantic" if semantic else "exact",
    }


def next_steps(comparison: dict[str, Any], limit: int = 5) -> list[dict[str, Any]]:
    twin_keys = {row["skill"] for row in comparison["requirements"] if row["state"] in TIER_CREDIT}
    steps = []
    for row in sorted(
        comparison["requirements"],
        key=lambda r: (not r["essential"], -(r["share"] or 0), r["skill"]),
    ):
        if row["state"] in {"missing", "adjacent"}:
            prereqs = [p for p in digital_twin.PREREQUISITES.get(row["skill"], []) if p not in twin_keys]
            resource = LEARNING_RESOURCES.get(row["skill"])
            steps.append(
                {
                    "skill": row["skill"],
                    "display": row["display"],
                    "action": "learn",
                    "why": ("Essential" if row["essential"] else "Optional")
                    + (f" — in {row['share']}% of analysed postings" if row["share"] else " in the role profile")
                    + (f"; you already have related {row['closest_skill']}" if row.get("closest_skill") else ""),
                    "missing_prerequisites": [display_name(p) for p in prereqs],
                    "resource": resource,
                }
            )
        elif row["state"] == "claimed" and row["essential"]:
            steps.append(
                {
                    "skill": row["skill"],
                    "display": row["display"],
                    "action": "verify",
                    "why": "Claimed on your resume but not yet backed by a project, assessment or test.",
                    "missing_prerequisites": [],
                    "resource": None,
                }
            )
    return steps[:limit]


def readiness(user_id: str, question: str = "", role: str | None = None) -> dict[str, Any]:
    user = db.get_user(user_id) or {}
    role_key = canonical_role(role) if role else detect_role(question, user.get("target_role"))
    comparison = compare(user_id, role_key)
    alignment = comparison["alignment"]
    groups = comparison["groups"]
    essential_missing = [r["display"] for r in comparison["requirements"] if r["essential"] and r["state"] == "missing"]
    if alignment >= 75 and not essential_missing:
        verdict, label = "ready", "Ready to apply"
    elif alignment >= 50:
        verdict, label = "close", "Close — targeted gaps"
    else:
        verdict, label = "not_yet", "Not yet ready"
    proven = groups["verified"] + groups["demonstrated"]
    explanation = [
        f"Assessed against {comparison['role']['title']} requirements "
        + (f"derived from {comparison['role']['postings_analyzed']} stored job postings."
           if comparison["role"]["source"] == "market" else "from the curated role profile (not enough market postings yet)."),
        f"Evidence-weighted alignment is {alignment}% — verified skills count fully, demonstrated 80%, resume claims only 35%.",
    ]
    if proven:
        explanation.append(f"Backed by evidence: {', '.join(proven[:6])}.")
    if groups["claimed"]:
        explanation.append(f"Claimed but unverified: {', '.join(groups['claimed'][:6])}.")
    if essential_missing:
        explanation.append(f"Essential skills with no evidence: {', '.join(essential_missing[:6])}.")
    return {
        "question": question,
        "verdict": verdict,
        "label": label,
        "alignment": alignment,
        "strengths": proven,
        "unverified_claims": groups["claimed"],
        "missing": groups["missing"],
        "adjacent": groups["adjacent"],
        "explanation": explanation,
        "next_steps": next_steps(comparison),
        "comparison": comparison,
    }


def recommendations(user_id: str, limit: int = 5) -> list[dict[str, Any]]:
    user = db.get_user(user_id) or {}
    target = canonical_role(user.get("target_role")) if user.get("target_role") else None
    demand = market_intel.demand_weight(user_id)
    exchange = None
    with db.connection() as conn:
        row = conn.execute("SELECT interests_json, roles_json FROM exchange_profiles WHERE user_id = ?", (user_id,)).fetchone()
        if row:
            exchange = " ".join(json.loads(row["interests_json"]) + json.loads(row["roles_json"])).lower()
    twin = digital_twin.skill_map(user_id)
    results = []
    for key, role in ROLE_CATALOG.items():
        required = role["skills"]
        credit = sum(TIER_CREDIT[twin[s]["status"]] for s in required if s in twin)
        alignment = credit / len(required) * 100
        proven = [display_name(s) for s in required if s in twin and twin[s]["status"] != "claimed"]
        missing = [display_name(s) for s in required if s not in twin]
        interest = 1.0 if key == target else (0.6 if exchange and any(word in exchange for word in key.split()) else 0.0)
        market = demand.get(key, 0.0)
        score = 0.65 * alignment + 15 * interest + 20 * min(1.0, market * 4)
        reasons = []
        if proven:
            reasons.append(f"Evidence-backed: {', '.join(proven[:4])}")
        if market:
            reasons.append(f"{round(market * 100, 1)}% of stored market postings map to this role")
        if interest >= 1.0:
            reasons.append("Matches your stated target role")
        elif interest:
            reasons.append("Matches your Skill Exchange interests")
        reasons.append(f"{len(missing)} required skill(s) still missing" if missing else "Every core skill is present")
        results.append({"role_key": key, "title": role["title"], "score": round(score, 1), "alignment": round(alignment, 1),
                         "market_share": round(market * 100, 1), "missing": missing[:5], "reasons": reasons})
    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:limit] if twin else []


# ---------------------------------------------------------------------------
# Twin chat (grounded)
# ---------------------------------------------------------------------------
def _facts_answer(user_id: str, question: str) -> dict[str, Any]:
    q = question.lower()
    twin = digital_twin.get_twin(user_id)
    skills = twin["skills"]
    if not skills:
        return {"intent": "empty", "answer": "Your Digital Twin has no evidence yet. Upload a resume or complete a Career Quest mission, then rebuild the twin.", "facts": []}
    proven = [s for s in skills if s["status"] != "claimed"]
    claimed = [s for s in skills if s["status"] == "claimed"]

    def fmt(item: dict[str, Any]) -> str:
        return f"{item['display']} ({item['status']}, {item['proficiency']}/100)"

    mentioned = extract_skill_details(question, semantic=False)["names"]
    if any(word in q for word in ("ready", "missing", "lack", "gap", "become", "need for")):
        result = readiness(user_id, question)
        lines = [f"{result['label']} for {result['comparison']['role']['title']} — {result['alignment']}% evidence-weighted alignment.", *result["explanation"][2:]]
        if result["next_steps"]:
            lines.append("Next: " + "; ".join(f"{s['action']} {s['display']}" for s in result["next_steps"][:4]) + ".")
        return {"intent": "readiness", "answer": " ".join(lines), "facts": result["explanation"], "readiness": result}
    if "project" in q:
        cluster = digital_twin.ML_CLUSTER if re.search(r"\b(ml|machine learning|ai)\b", q) else set(mentioned) or {s["skill"] for s in skills}
        hits = []
        for item in skills:
            if item["skill"] not in cluster:
                continue
            for ev in item["evidence"]:
                if ev["source_type"] in {"resume_project", "team_project", "career_quest"}:
                    hits.append(f"{item['display']}: {ev['excerpt']} [{ev['tier']}, {ev['source_type'].replace('_', ' ')}]")
        if not hits:
            return {"intent": "projects", "answer": "I found no project or assessment evidence for those skills. Only resume mentions exist, which count as claims.", "facts": []}
        return {"intent": "projects", "answer": "Evidence I can point to:\n- " + "\n- ".join(hits[:8]), "facts": hits[:8]}
    if any(word in q for word in ("demonstrat", "verified", "proven", "actually", "proof")):
        if not proven:
            return {"intent": "proven", "answer": f"None yet. All {len(claimed)} skills are resume/profile claims. Complete a Career Quest mission or a peer-confirmed team task to demonstrate one.", "facts": []}
        facts = [fmt(s) + " — " + (s["evidence"][0]["excerpt"] if s["evidence"] else "") for s in proven[:8]]
        return {"intent": "proven", "answer": "Demonstrated or verified:\n- " + "\n- ".join(facts), "facts": facts}
    if any(word in q for word in ("unverified", "claim")):
        facts = [fmt(s) for s in claimed[:12]]
        return {"intent": "claims", "answer": "Claimed without independent evidence:\n- " + "\n- ".join(facts) if facts else "No unverified claims.", "facts": facts}
    if any(word in q for word in ("learn next", "next", "should i learn", "improve")):
        result = readiness(user_id, question)
        facts = [f"{s['action'].title()} {s['display']}: {s['why']}" for s in result["next_steps"]]
        return {"intent": "next", "answer": f"For {result['comparison']['role']['title']}:\n- " + "\n- ".join(facts) if facts else "No gaps found for your target role.", "facts": facts}
    if mentioned:
        facts = []
        owned = {s["skill"]: s for s in skills}
        for key in mentioned:
            item = owned.get(key)
            facts.append(fmt(item) + (f" — {item['evidence'][0]['excerpt']}" if item["evidence"] else "") if item else f"{display_name(key)}: no evidence in your twin")
        return {"intent": "skill_lookup", "answer": "\n- ".join(["What your twin knows:", *facts]), "facts": facts}
    top = sorted(skills, key=lambda s: (-digital_twin.TIER_RANK[s["status"]], -s["proficiency"]))[:6]
    facts = [fmt(s) for s in top]
    return {"intent": "strengths", "answer": "Your strongest evidence-ranked skills:\n- " + "\n- ".join(facts), "facts": facts}


def chat(user_id: str, question: str, use_llm: bool = False) -> dict[str, Any]:
    grounded = _facts_answer(user_id, question)
    response = {**grounded, "provider": "deterministic", "model": None}
    if not use_llm or not grounded["facts"] or not get_settings().enable_llm:
        return response
    known = {name.lower() for name in SKILL_TAXONOMY} | {display_name(n).lower() for n in SKILL_TAXONOMY}
    prompt = (
        "Rewrite this answer to the student's question in 2-4 friendly sentences. Use ONLY the facts provided. "
        "Do not add skills, projects, employers or numbers that are not in the facts.\n"
        f"QUESTION: {question}\nFACTS: {json.dumps(grounded['facts'][:10])}\nDRAFT: {grounded['answer']}\n"
        'Return JSON: {"answer": string}'
    )
    result = registry.generate_json(prompt, timeout=45, num_predict=220)
    text = str((result.get("data") or {}).get("answer") or "").strip()
    if result.get("ok") and text:
        fact_blob = (grounded["answer"] + " " + " ".join(grounded["facts"])).lower()
        invented = [term for term in known if len(term) > 3 and re.search(rf"\b{re.escape(term)}\b", text.lower()) and term not in fact_blob]
        if not invented:
            return {**response, "answer": text, "provider": "ollama", "model": result.get("model")}
        response["llm_note"] = "Local model output was discarded because it mentioned skills not in your evidence."
    else:
        response["llm_note"] = result.get("error") or "Local model unavailable; showing the grounded answer."
    return response

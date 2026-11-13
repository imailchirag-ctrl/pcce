"""Skill extraction and semantic matching.

Skill extraction is hybrid and transparent:
1. A curated alias dictionary finds explicit mentions.
2. spaCy noun chunks provide candidate phrases.
3. all-MiniLM-L6-v2 compares those phrases with the taxonomy to catch variants
   such as "component libraries" -> "design systems".

Base BERT is intentionally not used as a skill classifier: it has no task-specific
classification head, so claiming that would be misleading.
"""

from __future__ import annotations

import math
import re
from typing import Any

from app.ml.model_registry import registry
from app.ml.skill_taxonomy import SKILL_TAXONOMY, alias_map, display_name

_ALIASES = alias_map()
_ALIAS_PATTERNS = [
    (re.compile(r"(?<![\w+#.])" + re.escape(alias) + r"(?![\w+#])", re.I), canonical)
    for alias, canonical in _ALIASES
]

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "with", "without", "for", "from", "to",
    "of", "in", "on", "at", "as", "by", "is", "are", "was", "were", "be", "been",
    "using", "used", "use", "built", "build", "worked", "work", "experience",
    "experienced", "strong", "good", "excellent", "knowledge", "familiar",
    "familiarity", "understanding", "ability", "skills", "skill", "team", "teams",
    "project", "projects", "role", "years", "year", "plus", "etc", "including",
    "across", "within", "into", "their", "our", "your", "my", "we", "they", "it",
    "this", "that", "these", "those", "will", "can", "should", "must", "have",
    "has", "had", "do", "does", "did", "not", "more", "most", "other", "such",
    "about", "over", "under", "between", "through", "per", "also", "very",
}

_semantic_cache: dict[str, list[float]] = {}
_semantic_cache_lock = __import__("threading").RLock()


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _evidence(text: str, start: int, end: int, radius: int = 80) -> str:
    left = max(0, start - radius)
    right = min(len(text), end + radius)
    snippet = text[left:right]
    return _normalize_space(snippet)[:220]


def _alias_details(text: str) -> dict[str, dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for pattern, canonical in _ALIAS_PATTERNS:
        for match in pattern.finditer(text):
            evidence = _evidence(text, match.start(), match.end())
            current = found.get(canonical)
            confidence = 0.99 if len(match.group(0)) >= 4 else 0.92
            if current is None or confidence > current["confidence"]:
                found[canonical] = {
                    "skill": canonical,
                    "display": display_name(canonical),
                    "category": SKILL_TAXONOMY[canonical]["category"],
                    "confidence": confidence,
                    "method": "alias_match",
                    "evidence": evidence,
                }
    return found


def _candidate_phrases(text: str, noun_chunks: list[str]) -> list[str]:
    candidates: list[str] = []
    # Prefer explicit skills sections and short, noun-like lines.
    lines = [line.strip(" •·-\t") for line in text.splitlines() if line.strip()]
    for line in lines:
        if len(line) > 160:
            continue
        parts = re.split(r"[,|/;•·]", line)
        if len(parts) > 1:
            candidates.extend(part.strip() for part in parts if 2 <= len(part.strip()) <= 60)
        elif len(line.split()) <= 7:
            candidates.append(line)
    candidates.extend(noun_chunks)
    # Add n-grams from short lines to catch "component library" style phrases.
    for line in lines:
        words = re.findall(r"[A-Za-z][A-Za-z0-9+#./-]*", line)
        if 2 <= len(words) <= 10:
            for size in (2, 3):
                for index in range(0, len(words) - size + 1):
                    phrase = " ".join(words[index : index + size])
                    if not all(word.lower() in STOPWORDS for word in words[index : index + size]):
                        candidates.append(phrase)
    cleaned: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        value = _normalize_space(candidate).strip(" .,:;-")
        lower = value.lower()
        if not (3 <= len(value) <= 64):
            continue
        if lower in seen:
            continue
        words = lower.split()
        if words and all(word in STOPWORDS or len(word) < 2 for word in words):
            continue
        if len(words) > 6:
            continue
        seen.add(lower)
        cleaned.append(value)
    return cleaned[:140]


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return max(-1.0, min(1.0, dot / (norm_a * norm_b)))


def _skill_embeddings() -> dict[str, list[float]]:
    with _semantic_cache_lock:
        missing = [skill for skill in SKILL_TAXONOMY if f"skill:{skill}" not in _semantic_cache]
        if missing:
            names = [display_name(skill) for skill in missing]
            vectors = registry.embed(names)
            for skill, vector in zip(missing, vectors):
                _semantic_cache[f"skill:{skill}"] = vector
        return {skill: _semantic_cache[f"skill:{skill}"] for skill in SKILL_TAXONOMY}


def _semantic_details(text: str, already: dict[str, dict[str, Any]], noun_chunks: list[str]) -> dict[str, dict[str, Any]]:
    if not text.strip():
        return {}
    try:
        candidates = _candidate_phrases(text, noun_chunks)
        if not candidates:
            return {}
        candidate_vectors = registry.embed(candidates)
        skill_vectors = _skill_embeddings()
    except Exception:  # noqa: BLE001
        return {}
    results: dict[str, dict[str, Any]] = {}
    for candidate, vector in zip(candidates, candidate_vectors):
        best_skill = None
        best_score = 0.0
        for skill, skill_vector in skill_vectors.items():
            score = _cosine(vector, skill_vector)
            if score > best_score:
                best_score = score
                best_skill = skill
        if best_skill is None:
            continue
        threshold = 0.82 if len(candidate.split()) > 1 else 0.9
        if best_score < threshold or best_skill in already:
            continue
        if best_skill in results and results[best_skill]["confidence"] >= round(best_score, 3):
            continue
        results[best_skill] = {
            "skill": best_skill,
            "display": display_name(best_skill),
            "category": SKILL_TAXONOMY[best_skill]["category"],
            "confidence": round(best_score, 3),
            "method": "minilm_semantic",
            "evidence": candidate,
        }
    return results


def extract_skill_details(text: str, *, semantic: bool = True) -> dict[str, Any]:
    text = text or ""
    alias_hits = _alias_details(text)
    semantic_hits: dict[str, dict[str, Any]] = {}
    noun_chunks: list[str] = []
    if semantic and text.strip():
        try:
            spacy_data = registry.spacy_entities(text)
            noun_chunks = spacy_data["noun_chunks"]
        except Exception:  # noqa: BLE001
            noun_chunks = []
        semantic_hits = _semantic_details(text, alias_hits, noun_chunks)
    merged = {**semantic_hits, **alias_hits}
    details = sorted(merged.values(), key=lambda item: (-item["confidence"], item["display"]))
    return {
        "skills": details,
        "names": [item["skill"] for item in details],
        "methods": {
            "alias_matches": len(alias_hits),
            "semantic_matches": len(semantic_hits),
        },
    }


def extract_skills(text: str) -> list[str]:
    """Backward-compatible helper used by older modules."""
    return extract_skill_details(text, semantic=False)["names"]


def extract_skills_semantic(text: str) -> list[str]:
    return extract_skill_details(text, semantic=True)["names"]


def match_skills(candidate_skills: list[str], required_skills: list[str]) -> dict[str, Any]:
    """Return strong, partial, and missing requirements with confidence."""
    candidate_set = {skill.lower() for skill in candidate_skills}
    required = [skill.lower() for skill in required_skills]
    matched: list[dict[str, Any]] = []
    partial: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []

    exact = [skill for skill in required if skill in candidate_set]
    remaining = [skill for skill in required if skill not in candidate_set]

    candidate_vectors: dict[str, list[float]] = {}
    required_vectors: dict[str, list[float]] = {}
    if remaining and candidate_skills:
        try:
            names = list(dict.fromkeys(list(candidate_set) + remaining))
            vectors = registry.embed([display_name(name) for name in names])
            vector_map = dict(zip(names, vectors))
            candidate_vectors = {name: vector_map[name] for name in candidate_set}
            required_vectors = {name: vector_map[name] for name in remaining}
        except Exception:  # noqa: BLE001
            candidate_vectors = {}
            required_vectors = {}

    matched_names: set[str] = set()
    for requirement in required:
        if requirement in candidate_set:
            matched.append(
                {
                    "skill": requirement,
                    "display": display_name(requirement),
                    "confidence": 1.0,
                    "method": "exact",
                }
            )
            matched_names.add(requirement)

    for requirement in remaining:
        best_name = None
        best_score = 0.0
        requirement_vector = required_vectors.get(requirement)
        if requirement_vector:
            for candidate in candidate_vectors:
                score = _cosine(requirement_vector, candidate_vectors[candidate])
                if score > best_score:
                    best_score = score
                    best_name = candidate
        # Related taxonomy skills also count as partial evidence.
        related_bonus = 0.0
        for candidate in candidate_set:
            if candidate in SKILL_TAXONOMY.get(requirement, {}).get("related", []):
                related_bonus = max(related_bonus, 0.8)
            if requirement in SKILL_TAXONOMY.get(candidate, {}).get("related", []):
                related_bonus = max(related_bonus, 0.8)
        score = max(best_score, related_bonus)
        item = {
            "skill": requirement,
            "display": display_name(requirement),
            "confidence": round(score, 3),
            "closest_skill": best_name,
            "method": "semantic" if best_name and best_score >= related_bonus else "related_taxonomy",
        }
        if score >= 0.72:
            partial.append(item)
        else:
            missing.append(item)

    return {
        "matched": matched,
        "partial": sorted(partial, key=lambda item: item["confidence"], reverse=True),
        "missing": sorted(missing, key=lambda item: item["skill"]),
        "matched_names": [item["skill"] for item in matched],
        "partial_names": [item["skill"] for item in partial],
        "missing_names": [item["skill"] for item in missing],
        "coverage": round(len(matched) / len(required) * 100, 1) if required else 0.0,
        "weighted_coverage": round(
            (len(matched) + 0.5 * len(partial)) / len(required) * 100, 1
        )
        if required
        else 0.0,
    }


def semantic_similarity(left: str, right: str) -> float:
    try:
        vectors = registry.embed([left[:8000], right[:8000]])
        return round(_cosine(vectors[0], vectors[1]), 4)
    except Exception:  # noqa: BLE001
        return 0.0

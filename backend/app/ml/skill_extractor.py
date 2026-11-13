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

import re
from typing import Any

import numpy as np

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


def _matrix(vectors: list[list[float]]) -> np.ndarray:
    """Stack embeddings into a normalized float32 matrix for fast similarity."""
    matrix = np.asarray(vectors, dtype=np.float32)
    if matrix.ndim == 1:
        matrix = matrix.reshape(1, -1)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return matrix / norms


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    denominator = float(np.linalg.norm(va) * np.linalg.norm(vb))
    if denominator == 0:
        return 0.0
    return float(np.clip(np.dot(va, vb) / denominator, -1.0, 1.0))


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
        candidate_matrix = _matrix(candidate_vectors)
        skill_names = list(skill_vectors)
        skill_matrix = _matrix([skill_vectors[skill] for skill in skill_names])
        if candidate_matrix.shape[1] != skill_matrix.shape[1]:
            return {}
        similarities = candidate_matrix @ skill_matrix.T
        best_indices = similarities.argmax(axis=1)
        best_scores = similarities[np.arange(len(candidates)), best_indices]
    except Exception:  # noqa: BLE001
        return {}
    results: dict[str, dict[str, Any]] = {}
    for candidate, best_index, best_score in zip(
        candidates, best_indices.tolist(), best_scores.tolist()
    ):
        best_skill = skill_names[best_index]
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


def extract_skill_details(
    text: str,
    *,
    semantic: bool = True,
    spacy_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    text = text or ""
    alias_hits = _alias_details(text)
    semantic_hits: dict[str, dict[str, Any]] = {}
    noun_chunks: list[str] = []
    if semantic and text.strip():
        if spacy_data is None:
            try:
                spacy_data = registry.spacy_entities(text)
            except Exception:  # noqa: BLE001
                spacy_data = {}
        noun_chunks = spacy_data.get("noun_chunks", [])
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

    semantic_best: dict[str, tuple[str | None, float]] = {}
    if remaining and candidate_skills:
        try:
            names = list(dict.fromkeys(list(candidate_set) + remaining))
            vectors = registry.embed([display_name(name) for name in names])
            vector_map = dict(zip(names, vectors))
            candidate_names = [name for name in candidate_set if name in vector_map]
            required_names = [name for name in remaining if name in vector_map]
            if candidate_names and required_names:
                candidate_matrix = _matrix([vector_map[name] for name in candidate_names])
                required_matrix = _matrix([vector_map[name] for name in required_names])
                if candidate_matrix.shape[1] == required_matrix.shape[1]:
                    similarities = required_matrix @ candidate_matrix.T
                    for requirement, row in zip(required_names, similarities):
                        best_index = int(row.argmax())
                        semantic_best[requirement] = (
                            candidate_names[best_index],
                            float(row[best_index]),
                        )
        except Exception:  # noqa: BLE001
            semantic_best = {}

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
        best_name, best_score = semantic_best.get(requirement, (None, 0.0))
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

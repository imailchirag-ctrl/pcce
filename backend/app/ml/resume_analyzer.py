"""Resume intelligence pipeline.

Outputs are structured, explainable, and JSON-safe. Every inference step reports
which model or heuristic produced it so the UI never implies more than happened.
"""

from __future__ import annotations

import re
import time
from typing import Any

from app.core.config import get_settings
from app.ml.model_registry import registry
from app.ml.skill_extractor import extract_skill_details, match_skills, semantic_similarity
from app.ml.skill_taxonomy import (
    ROLE_CATALOG,
    SKILL_TAXONOMY,
    canonical_role,
    display_name,
    role_profile,
)

SECTION_ALIASES = {
    "summary": ["summary", "professional summary", "profile", "objective", "about me", "career objective"],
    "skills": ["skills", "technical skills", "core skills", "core competencies", "technologies", "tech stack", "expertise"],
    "experience": ["experience", "work experience", "professional experience", "employment", "employment history", "career history"],
    "education": ["education", "academic background", "qualifications", "academics"],
    "projects": ["projects", "personal projects", "selected projects", "portfolio", "case studies"],
    "certifications": ["certifications", "certificates", "licenses", "credentials"],
    "achievements": ["achievements", "awards", "honors", "accomplishments"],
    "publications": ["publications", "research", "papers"],
    "languages": ["languages", "language proficiency"],
    "interests": ["interests", "hobbies", "activities"],
}

_HEADING_LOOKUP = {alias: key for key, aliases in SECTION_ALIASES.items() for alias in aliases}
_HEADING_PATTERN = re.compile(
    r"^\s*(?:" + "|".join(re.escape(alias) for alias in sorted(_HEADING_LOOKUP, key=len, reverse=True)) + r")\s*:?\s*$",
    re.I,
)

DEGREE_PATTERN = re.compile(
    r"\b(b\.?tech|b\.?e\.?|bachelor(?:'s)?|b\.?sc|m\.?tech|m\.?e\.?|master(?:'s)?|m\.?sc|mba|ph\.?d|diploma|b\.?com|m\.?com)\b",
    re.I,
)
YEAR_PATTERN = re.compile(r"\b(19|20)\d{2}\b")
YEARS_EXPERIENCE_PATTERN = re.compile(r"(\d{1,2})(?:\s*\+)?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)?", re.I)
DATE_RANGE_PATTERN = re.compile(
    r"((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4})\s*(?:-|–|—|to)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4}|present|current)",
    re.I,
)
ACTION_VERBS = {
    "built", "led", "designed", "implemented", "improved", "reduced", "increased",
    "launched", "shipped", "migrated", "automated", "optimized", "created",
    "developed", "delivered", "owned", "mentored", "collaborated", "architected",
    "scaled", "streamlined", "tested", "deployed", "analyzed", "researched",
}

JOB_TITLE_PATTERN = re.compile(
    r"\b(engineer|developer|designer|analyst|scientist|manager|architect|consultant|intern|specialist|lead|director|administrator|researcher)\b",
    re.I,
)


def split_sections(text: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {"header": []}
    current = "header"
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        cleaned = re.sub(r"^[#*•·\-\s]+", "", line).strip()
        if len(cleaned) <= 80:
            match = _HEADING_PATTERN.match(cleaned)
            if match:
                current = _HEADING_LOOKUP[re.sub(r":$", "", cleaned).strip().lower()]
                sections.setdefault(current, [])
                continue
            # All-caps short headings are common in PDFs.
            if cleaned.isupper() and 2 <= len(cleaned.split()) <= 4 and not any(char.isdigit() for char in cleaned):
                normalized = cleaned.lower().replace("&", "and")
                if normalized in _HEADING_LOOKUP:
                    current = _HEADING_LOOKUP[normalized]
                    sections.setdefault(current, [])
                    continue
        sections.setdefault(current, []).append(line)
    return sections


def _clean_lines(lines: list[str], limit: int = 12) -> list[str]:
    cleaned: list[str] = []
    for line in lines:
        value = re.sub(r"^[•·*\-–—\s]+", "", line).strip()
        if not value:
            continue
        if len(value) > 320:
            value = value[:320] + "…"
        cleaned.append(value)
        if len(cleaned) >= limit:
            break
    return cleaned


def extract_contact(text: str) -> dict[str, Any]:
    email = re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", text)
    phone = re.search(r"(?:\+?\d[\d ()-]{7,}\d)", text)
    linkedin = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/[^\s,;]+", text, re.I)
    github = re.search(r"(?:https?://)?(?:www\.)?github\.com/[^\s,;]+", text, re.I)
    website = re.search(r"https?://(?!www\.linkedin|www\.github)[^\s,;]+", text)
    return {
        "email": email.group(0) if email else None,
        "phone": phone.group(0).strip() if phone else None,
        "linkedin": linkedin.group(0).rstrip(".)") if linkedin else None,
        "github": github.group(0).rstrip(".)") if github else None,
        "website": website.group(0).rstrip(".)") if website else None,
    }


def extract_name(text: str, sections: dict[str, list[str]], ner_entities: list[dict[str, Any]]) -> str:
    for entity in ner_entities:
        if entity["label"] == "PERSON" and 1 <= len(entity["text"].split()) <= 4:
            return entity["text"].strip()
    for line in sections.get("header", [])[:6] + [line for line in text.splitlines()[:6] if line.strip()]:
        candidate = line.strip(" •·-|")
        if "@" in candidate or re.search(r"\d{3}", candidate):
            continue
        if len(candidate.split()) <= 5 and not _HEADING_PATTERN.match(candidate):
            alpha = re.sub(r"[^A-Za-z ]", "", candidate)
            if len(alpha.strip()) >= 3:
                return candidate.title() if candidate.isupper() else candidate
    return "Candidate"


def extract_years_experience(text: str) -> float:
    explicit = [int(value) for value in YEARS_EXPERIENCE_PATTERN.findall(text) if int(value) <= 40]
    date_span_years = 0.0
    for start, end in DATE_RANGE_PATTERN.findall(text):
        start_year = _to_year(start)
        end_year = 2026 if end.lower() in {"present", "current"} else _to_year(end)
        if start_year and end_year and end_year >= start_year:
            date_span_years = max(date_span_years, float(end_year - start_year))
    if explicit:
        return float(max(explicit))
    return round(date_span_years, 1)


def _to_year(value: str) -> int | None:
    match = YEAR_PATTERN.search(value)
    return int(match.group(0)) if match else None


def extract_education(sections: dict[str, list[str]]) -> dict[str, Any]:
    lines = sections.get("education", [])
    degrees: list[str] = []
    institutions: list[str] = []
    for line in lines:
        if DEGREE_PATTERN.search(line):
            degrees.append(line)
        elif re.search(r"\b(university|college|institute|school|academy)\b", line, re.I):
            institutions.append(line)
    years = [int(year) for line in lines for year in re.findall(r"\b(?:19|20)\d{2}\b", line)] if lines else []
    return {
        "degrees": _clean_lines(degrees, 5),
        "institutions": _clean_lines(institutions, 5),
        "lines": _clean_lines(lines, 8),
        "latest_year": max(years) if years else None,
        "present": bool(degrees or institutions),
    }


def extract_experience(
    sections: dict[str, list[str]],
    text: str,
    entities: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    lines = sections.get("experience", [])
    date_ranges = DATE_RANGE_PATTERN.findall("\n".join(lines) or text)
    titles = [line for line in lines if JOB_TITLE_PATTERN.search(line) and len(line) <= 140]
    if entities is None:
        entities = _safe_ner(text)
    companies = [
        entity["text"]
        for entity in entities
        if entity["label"] == "ORG" and 2 <= len(entity["text"]) <= 60
    ]
    return {
        "lines": _clean_lines(lines, 14),
        "titles": _clean_lines(list(dict.fromkeys(titles)), 8),
        "companies": _clean_lines(list(dict.fromkeys(companies)), 8),
        "date_ranges": [f"{start} – {end}" for start, end in date_ranges[:8]],
        "years": extract_years_experience(text),
        "present": bool(lines or titles),
    }


def extract_projects(sections: dict[str, list[str]]) -> dict[str, Any]:
    lines = sections.get("projects", [])
    return {"lines": _clean_lines(lines, 10), "count": len(lines), "present": bool(lines)}


def extract_certifications(sections: dict[str, list[str]]) -> dict[str, Any]:
    lines = sections.get("certifications", [])
    return {"lines": _clean_lines(lines, 8), "present": bool(lines)}


def _safe_spacy(text: str) -> dict[str, Any]:
    try:
        return registry.spacy_entities(text)
    except Exception:  # noqa: BLE001
        return {"entities": [], "noun_chunks": []}


def _safe_ner(text: str) -> list[dict[str, Any]]:
    return _safe_spacy(text)["entities"]


def ats_checks(text: str, sections: dict[str, list[str]], contact: dict[str, Any]) -> dict[str, Any]:
    lower = text.lower()
    words = re.findall(r"[A-Za-z][A-Za-z+#./-]*", text)
    word_count = len(words)
    quantified = len(re.findall(r"\b\d+(?:\.\d+)?\s*(?:%|percent|x|users|clients|customers|hours|days|weeks|months|₹|\$|lakh|crore)", text, re.I))
    action_hits = sum(1 for word in words if word.lower() in ACTION_VERBS)
    checks = {
        "contact_information": bool(contact.get("email") or contact.get("phone")),
        "professional_summary": bool(sections.get("summary")),
        "skills_section": bool(sections.get("skills")),
        "experience_section": bool(sections.get("experience")),
        "education_section": bool(sections.get("education")),
        "projects_section": bool(sections.get("projects")),
        "quantified_achievements": quantified >= 2,
        "action_verbs": action_hits >= 4,
        "reasonable_length": 180 <= word_count <= 1100,
        "no_placeholder_text": not any(
            marker in lower for marker in ("lorem ipsum", "your name here", "insert ", "xxx")
        ),
    }
    weights = {
        "contact_information": 10,
        "professional_summary": 8,
        "skills_section": 14,
        "experience_section": 16,
        "education_section": 8,
        "projects_section": 8,
        "quantified_achievements": 12,
        "action_verbs": 8,
        "reasonable_length": 10,
        "no_placeholder_text": 6,
    }
    score = sum(weight for key, weight in weights.items() if checks[key])
    recommendations = []
    suggestions = {
        "contact_information": "Add a professional email and phone number near the top.",
        "professional_summary": "Add a 2–3 line summary naming your target role and strongest evidence.",
        "skills_section": "Add a focused skills section grouped by category.",
        "experience_section": "Add a clearly labelled experience section with role, company, and dates.",
        "education_section": "Add your degree, institution, and graduation year.",
        "projects_section": "Add 2–3 projects with the problem, stack, and measurable outcome.",
        "quantified_achievements": "Quantify at least two outcomes (percentage, time saved, users, revenue).",
        "action_verbs": "Start bullets with strong action verbs such as built, led, improved.",
        "reasonable_length": "Keep the resume between roughly 180 and 1,100 words for this demo.",
        "no_placeholder_text": "Remove placeholder text before sharing the resume.",
    }
    for key, passed in checks.items():
        if not passed:
            recommendations.append(suggestions[key])
    return {
        "score": score,
        "checks": checks,
        "recommendations": recommendations[:6],
        "word_count": word_count,
        "quantified_achievements": quantified,
        "action_verb_hits": action_hits,
    }


def _role_fit(skills: list[str]) -> list[dict[str, Any]]:
    candidate = set(skills)
    ranked = []
    for key, role in ROLE_CATALOG.items():
        required = role["skills"]
        exact = sum(1 for skill in required if skill in candidate)
        related = 0
        for skill in required:
            if skill in candidate:
                continue
            if any(
                skill in SKILL_TAXONOMY.get(candidate_skill, {}).get("related", [])
                or candidate_skill in SKILL_TAXONOMY.get(skill, {}).get("related", [])
                for candidate_skill in candidate
            ):
                related += 1
        score = round((exact + 0.45 * related) / len(required) * 100, 1) if required else 0
        ranked.append(
            {
                "role": key,
                "title": role["title"],
                "summary": role["summary"],
                "fit_percent": score,
                "matched_skills": [display_name(skill) for skill in required if skill in candidate][:6],
                "to_build": [display_name(skill) for skill in required if skill not in candidate][:5],
            }
        )
    return sorted(ranked, key=lambda item: item["fit_percent"], reverse=True)


def analyze_resume(
    text: str,
    target_role: str = "software engineer",
    job_description: str = "",
) -> dict[str, Any]:
    started = time.perf_counter()
    text = text.strip()
    sections = split_sections(text)
    contact = extract_contact(text)
    spacy_data = _safe_spacy(text)
    ner = spacy_data["entities"]
    skills_data = extract_skill_details(text, semantic=True, spacy_data=spacy_data)
    detected = skills_data["names"]
    role = role_profile(target_role)

    required: list[str] = list(dict.fromkeys(role["skills"]))
    jd_skills: list[str] = []
    if job_description.strip():
        jd_data = extract_skill_details(job_description, semantic=True)
        jd_skills = jd_data["names"]
        required = list(dict.fromkeys(required + jd_skills))

    match = match_skills(detected, required)
    experience = extract_experience(sections, text, ner)
    education = extract_education(sections)
    projects = extract_projects(sections)
    certifications = extract_certifications(sections)
    ats = ats_checks(text, sections, contact)
    keywords = registry.extract_keywords(text + "\n" + job_description, top_n=14)

    experience_score = min(100.0, 25.0 + experience["years"] * 12.0 + (18 if experience["present"] else 0))
    project_score = min(100.0, projects["count"] * 18.0 + (10 if projects["present"] else 0))
    education_score = min(100.0, 45.0 + (45 if education["present"] else 0) + (10 if education["latest_year"] else 0))
    skill_score = match["weighted_coverage"]

    jd_similarity = 0.0
    if job_description.strip():
        jd_similarity = semantic_similarity(text, job_description) * 100

    contributing = {
        "skills": 0.48,
        "resume_quality": 0.17,
        "experience": 0.15,
        "projects": 0.10,
        "education": 0.10,
    }
    readiness = round(
        skill_score * contributing["skills"]
        + ats["score"] * contributing["resume_quality"]
        + experience_score * contributing["experience"]
        + project_score * contributing["projects"]
        + education_score * contributing["education"]
    )
    readiness = max(0, min(100, readiness))

    role_recommendations = _role_fit(detected)[:4]
    inferred_title = role["title"]
    if experience["titles"]:
        inferred_title = experience["titles"][0]

    name = extract_name(text, sections, ner)
    elapsed = round((time.perf_counter() - started) * 1000, 1)

    return {
        "profile": {
            "name": name,
            "headline": inferred_title,
            "email": contact.get("email"),
            "phone": contact.get("phone"),
            "links": {key: contact.get(key) for key in ("linkedin", "github", "website") if contact.get(key)},
            "location": next((entity["text"] for entity in ner if entity["label"] in {"GPE", "LOC"}), None),
            "summary": " ".join(sections.get("summary", [])[:3])[:600] or None,
        },
        "skills": skills_data["skills"],
        "detected_skills": detected,
        "skill_names": [display_name(skill) for skill in detected],
        "skills_by_category": _group_skills(detected),
        "target_role": role["title"],
        "target_role_key": role["key"],
        "role_summary": role["summary"],
        "required_skills": [display_name(skill) for skill in required],
        "required_skill_keys": required,
        "job_description_skills": [display_name(skill) for skill in jd_skills],
        "match": match,
        "matched_skills": [display_name(skill) for skill in match["matched_names"]],
        "partial_skills": [display_name(skill) for skill in match["partial_names"]],
        "missing_skills": [display_name(skill) for skill in match["missing_names"]],
        "skill_match_percent": match["coverage"],
        "weighted_match_percent": match["weighted_coverage"],
        "jd_semantic_similarity": round(jd_similarity, 1),
        "experience": experience,
        "education": education,
        "projects": projects,
        "certifications": certifications,
        "sections": {key: _clean_lines(value, 12) for key, value in sections.items() if value},
        "section_names": sorted(key for key in sections if sections[key]),
        "entities": {
            "persons": _unique([entity["text"] for entity in ner if entity["label"] == "PERSON"], 8),
            "organizations": _unique([entity["text"] for entity in ner if entity["label"] == "ORG"], 10),
            "locations": _unique([entity["text"] for entity in ner if entity["label"] in {"GPE", "LOC"}], 8),
            "dates": _unique([entity["text"] for entity in ner if entity["label"] == "DATE"], 10),
        },
        "keywords": keywords,
        "ats": ats,
        "readiness": {
            "score": readiness,
            "contributing_weights": contributing,
            "breakdown": {
                "skills": round(skill_score, 1),
                "resume_quality": ats["score"],
                "experience": round(experience_score, 1),
                "projects": round(project_score, 1),
                "education": round(education_score, 1),
            },
            "explanation": (
                "Transparent weighted score from semantic skill coverage, ATS-style resume checks, "
                "experience evidence, projects, and education. It is not a hiring probability."
            ),
        },
        "career_recommendations": role_recommendations,
        "inference": {
            "elapsed_ms": elapsed,
            "embedding_model": "all-MiniLM-L6-v2",
            "ner_model": get_settings().spacy_model,
            "keyword_method": keywords["method"],
            "skill_methods": skills_data["methods"],
            "llm_used": False,
        },
        "notices": [
            "Skill extraction is hybrid (taxonomy aliases + MiniLM semantic similarity + spaCy noun chunks), not base BERT classification.",
            "Resume parsing is best-effort. Review extracted fields before sharing.",
            "Readiness is a transparent coaching score, not a hiring probability.",
        ],
    }


def _group_skills(skills: list[str]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for skill in skills:
        category = SKILL_TAXONOMY.get(skill, {}).get("category", "Other")
        grouped.setdefault(category, []).append(display_name(skill))
    return {category: sorted(values) for category, values in sorted(grouped.items())}


def _unique(values: list[str], limit: int) -> list[str]:
    return list(dict.fromkeys(value.strip() for value in values if value.strip()))[:limit]

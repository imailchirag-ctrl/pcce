from app.ml.skill_extractor import extract_skills

ROLE_SKILLS = {
    "software engineer": ["python", "git", "sql", "rest apis", "problem solving", "teamwork"],
    "frontend engineer": ["javascript", "typescript", "react", "git", "rest apis", "teamwork"],
    "product engineer": ["javascript", "typescript", "react", "node.js", "sql", "communication"],
    "ui developer": ["javascript", "typescript", "react", "git", "teamwork"],
    "data scientist": ["python", "statistics", "pandas", "numpy", "machine learning", "sql"],
    "machine learning engineer": ["python", "statistics", "numpy", "scikit-learn", "deep learning", "docker"],
    "ai engineer": ["python", "machine learning", "deep learning", "pytorch", "rest apis", "docker"],
    "frontend developer": ["javascript", "typescript", "react", "git", "rest apis", "teamwork"],
    "backend developer": ["python", "sql", "rest apis", "docker", "aws", "git"],
    "full stack developer": ["javascript", "typescript", "react", "node.js", "sql", "rest apis"],
    "cybersecurity analyst": ["python", "aws", "network security", "linux", "problem solving"],
    "data analyst": ["sql", "python", "statistics", "pandas", "communication"],
}


def analyze_gaps(resume_text: str, target_role: str, job_description: str = "") -> dict:
    detected = set(extract_skills(resume_text))
    requested = ROLE_SKILLS.get(target_role.lower(), [])
    if job_description.strip():
        requested = list(dict.fromkeys(requested + extract_skills(job_description)))
    matched = [skill for skill in requested if skill in detected]
    missing = [skill for skill in requested if skill not in detected]
    requirements = [{"skill": skill, "importance": "high" if i < 3 else "medium", "priority": i + 1, "estimated_hours": 6 if i < 3 else 3} for i, skill in enumerate(missing)]
    total = len(requested)
    score = round(100 * len(matched) / total) if total else 0
    return {
        "target_role": target_role,
        "detected_skills": sorted(detected),
        "matched_skills": matched,
        "partial_matches": [],
        "missing_skills": missing,
        "priorities": requirements,
        "skill_match_percent": score,
        "explanation": f"{len(matched)} of {total} detected role skills matched by exact keyword. This is not a hiring probability.",
        "source": "deterministic_keyword_match",
    }

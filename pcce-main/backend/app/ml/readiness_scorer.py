def score_readiness(skill_match: int, resume_text: str, projects_count: int = 0) -> dict:
    resume_quality = min(100, 35 + min(len(resume_text.strip()) // 20, 35) + (20 if "experience" in resume_text.lower() else 0) + (10 if "education" in resume_text.lower() else 0))
    project_readiness = min(100, projects_count * 25)
    soft_readiness = 60
    score = round(skill_match * 0.55 + resume_quality * 0.2 + project_readiness * 0.15 + soft_readiness * 0.1)
    return {"readiness_score": score, "skill_match": skill_match, "resume_quality": resume_quality, "project_readiness": project_readiness, "soft_skill_readiness": soft_readiness, "weights": {"skills": 0.55, "resume_quality": 0.2, "projects": 0.15, "soft_skills": 0.1}, "explanation": "A transparent demo score based on keyword coverage, text completeness, project count, and a neutral soft-skill baseline. Not a hiring probability."}

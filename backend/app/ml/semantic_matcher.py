import os


def matcher_status() -> dict:
    return {
        "bge_model_configured": bool(os.getenv("BGE_MODEL_NAME")),
        "minilm_model_configured": bool(os.getenv("MINILM_MODEL_NAME")),
        "note": "No embedding model loads automatically. Current matching uses deterministic keyword overlap.",
    }


def compare_text(resume_text: str, job_text: str) -> dict:
    from app.ml.skill_extractor import extract_skills
    resume = set(extract_skills(resume_text))
    job = set(extract_skills(job_text))
    overlap = len(resume & job)
    score = round(overlap / len(job) * 100) if job else 0
    return {"overlap_percent": score, "matched_terms": sorted(resume & job), "job_terms_not_detected": sorted(job - resume), "method": "keyword_overlap", "notice": "This is not a semantic embedding score or hiring probability."}

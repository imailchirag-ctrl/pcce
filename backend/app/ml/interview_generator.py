"""Interview question generation with Qwen2.5 and a clearly labeled fallback."""

from __future__ import annotations

import time
from typing import Any

from app.ml.skill_taxonomy import display_name

SYSTEM = (
    "You are SkillBridge AI, a fair interview coach. Generate role-relevant practice questions. "
    "Return valid JSON only: {\"questions\":[{\"prompt\":string,\"topic\":string,\"why\":string}]}. "
    "Do not include answers or discriminatory questions."
)


def _mode_key(mode: str) -> str:
    value = (mode or "technical").lower()
    if "hr" in value or "human resource" in value:
        return "hr"
    if "behav" in value or "star" in value:
        return "behavioural"
    if "resume" in value or "profile" in value:
        return "resume"
    return "technical"


def generate_questions(
    role: str,
    mode: str = "technical",
    difficulty: str = "intermediate",
    resume_context: str = "",
    skills: list[str] | None = None,
    *,
    use_llm: bool = True,
) -> dict[str, Any]:
    started = time.perf_counter()
    key = _mode_key(mode)
    skills = skills or []
    clean_skills = [display_name(skill) if skill.islower() else skill for skill in skills[:8]]
    skill_text = ", ".join(clean_skills) if clean_skills else "the skills listed in the resume"

    llm_meta: dict[str, Any] = {"used_llm": False, "provider": "deterministic_fallback"}
    questions: list[dict[str, Any]] = []
    if use_llm:
        prompt = (
            f"Role: {role}. Interview type: {key}. Difficulty: {difficulty}. "
            f"Candidate skills: {skill_text}. Resume context: {resume_context[:1800] or 'not supplied'}. "
            "Write 4 questions that a real interviewer could ask. For technical mode include one debugging or "
            "trade-off question. For behavioural mode use STAR-friendly prompts. Keep each question under 32 words."
        )
        result = _generate(prompt)
        llm_meta = {
            "used_llm": bool(result.get("ok")),
            "provider": result.get("provider"),
            "model": result.get("model"),
            "elapsed_ms": result.get("elapsed_ms", 0),
            "error": result.get("error"),
        }
        data = result.get("data") or {}
        raw_questions = data.get("questions", []) if isinstance(data, dict) else []
        for item in raw_questions[:5]:
            if isinstance(item, str):
                questions.append({"prompt": item, "topic": key, "why": "Generated from your target role and skills."})
            elif isinstance(item, dict) and item.get("prompt"):
                questions.append(
                    {
                        "prompt": str(item["prompt"])[:500],
                        "topic": str(item.get("topic") or key)[:80],
                        "why": str(item.get("why") or "Generated from your target role and skills.")[:300],
                    }
                )

    if not questions:
        questions = _fallback_questions(role, key, clean_skills)
        llm_meta["notice"] = (
            "Qwen did not respond in time, so these are labeled template questions. "
            "Start Ollama to generate personalized questions."
        )

    return {
        "role": role,
        "mode": key,
        "difficulty": difficulty,
        "questions": questions,
        "provider": llm_meta.get("provider"),
        "llm": llm_meta,
        "inference_ms": round((time.perf_counter() - started) * 1000, 1),
        "notice": "Practice questions only. They are not a prediction of a real interview.",
    }


def _generate(prompt: str) -> dict[str, Any]:
    from app.ml.model_registry import registry

    return registry.generate_json(prompt, system=SYSTEM, timeout=55, num_predict=360)


def _fallback_questions(role: str, mode: str, skills: list[str]) -> list[dict[str, Any]]:
    primary = skills[0] if skills else "your strongest technical skill"
    secondary = skills[1] if len(skills) > 1 else "a recent project"
    if mode == "hr":
        prompts = [
            ("Tell me about yourself and why this role is the right next step.", "motivation"),
            ("What kind of team environment helps you do your best work?", "team fit"),
            ("Describe a time you received difficult feedback. What changed?", "self-awareness"),
            ("What are you hoping to learn in your first six months?", "growth"),
        ]
    elif mode == "behavioural":
        prompts = [
            ("Tell me about a time you disagreed with a teammate. How did you resolve it?", "conflict"),
            ("Describe a project that did not go to plan. What did you change?", "resilience"),
            ("Give an example of a time you had to influence without authority.", "leadership"),
            ("Tell me about a moment when you had to learn something quickly.", "adaptability"),
        ]
    elif mode == "resume":
        prompts = [
            (f"Walk me through the project where you used {primary}. What was your specific contribution?", "resume evidence"),
            (f"What is one decision from {secondary} that you would make differently today?", "reflection"),
            ("Which bullet on your resume best shows measurable impact, and how did you measure it?", "impact"),
            ("What gap in your background should an interviewer probe, and how are you closing it?", "growth"),
        ]
    else:
        prompts = [
            (f"Walk me through how you would use {primary} to solve a real production problem for a {role}.", "applied knowledge"),
            (f"Explain a trade-off you made in {secondary}. What did you optimize for?", "trade-offs"),
            ("A feature you own is slow in production. How do you diagnose and fix it?", "debugging"),
            (f"How would you test and monitor a critical workflow built with {primary}?", "quality"),
        ]
    return [
        {
            "prompt": prompt,
            "topic": topic,
            "why": f"Template question for {role}; Qwen was unavailable.",
        }
        for prompt, topic in prompts
    ]

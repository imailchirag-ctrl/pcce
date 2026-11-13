"""Consistent interview answer evaluation.

The rubric is deterministic and transparent. MiniLM adds semantic relevance,
and Qwen can add qualitative coaching when Ollama is available. The rubric score
is never presented as a hiring decision.
"""

from __future__ import annotations

import re
import time
from typing import Any

from app.ml.skill_extractor import semantic_similarity

SYSTEM = (
    "You are a supportive interview coach. Evaluate only the supplied answer against the question. "
    "Return JSON: {\"summary\":string,\"strengths\":[string],\"improvements\":[string],"
    "\"follow_up\":string}. Be specific, fair, and under 40 words per item."
)

FILLERS = {"um", "uh", "like", "basically", "actually", "literally", "sort of", "kind of", "you know"}


def evaluate_answer(
    question: str,
    answer: str,
    *,
    role: str = "the target role",
    use_llm: bool = True,
) -> dict[str, Any]:
    started = time.perf_counter()
    text = answer.strip()
    lower = text.lower()
    words = re.findall(r"[A-Za-z][A-Za-z'+-]*", text)
    word_count = len(words)
    sentences = [item for item in re.split(r"(?<=[.!?])\s+", text) if item.strip()]
    avg_sentence = word_count / max(1, len(sentences))

    relevance = semantic_similarity(question, text) * 100 if text else 0.0
    # Very short answers cannot demonstrate relevance even if the embedding is close.
    length_factor = min(1.0, word_count / 55)
    relevance = relevance * (0.55 + 0.45 * length_factor)

    structure_signals = sum(
        1
        for term in ("situation", "task", "action", "result", "because", "so that", "first", "then", "finally", "outcome")
        if term in lower
    )
    structure = min(100.0, 32.0 + structure_signals * 9.0 + (12 if 60 <= word_count <= 260 else 0))

    evidence_terms = len(re.findall(r"\b\d+(?:\.\d+)?\s*(?:%|percent|users|ms|seconds|hours|days|weeks|months|₹|\$|x)\b", text, re.I))
    ownership = len(re.findall(r"\b(i|my|we|our)\b", lower))
    specific_tools = len(re.findall(r"\b(react|python|sql|api|docker|aws|typescript|node|postgres|test|monitor|deploy|query|cache)\b", lower))
    evidence = min(100.0, 28.0 + evidence_terms * 14.0 + min(24, ownership * 2.4) + min(18, specific_tools * 3.0))

    filler_count = sum(lower.count(filler) for filler in FILLERS)
    communication = 62.0
    if 30 <= word_count <= 260:
        communication += 12
    if 8 <= avg_sentence <= 28:
        communication += 10
    if filler_count:
        communication -= min(18, filler_count * 3)
    if any(mark in text for mark in (".", "!", "?")):
        communication += 6
    communication = max(0.0, min(100.0, communication))

    depth_signals = sum(
        1
        for term in ("trade-off", "tradeoff", "why", "approach", "test", "monitor", "edge case", "alternative", "constraint", "measure", "learned")
        if term in lower
    )
    depth = min(100.0, 30.0 + depth_signals * 11.0 + min(24, specific_tools * 3.0))

    dimensions = {
        "relevance": round(relevance, 1),
        "structure": round(structure, 1),
        "evidence": round(evidence, 1),
        "communication": round(communication, 1),
        "technical_depth": round(depth, 1),
    }
    weights = {"relevance": 0.28, "structure": 0.2, "evidence": 0.22, "communication": 0.14, "technical_depth": 0.16}
    overall = round(sum(dimensions[key] * weight for key, weight in weights.items()))

    strengths = _strengths(dimensions, word_count)
    improvements = _improvements(dimensions, word_count)

    llm_meta: dict[str, Any] = {"used_llm": False, "provider": "deterministic_rubric"}
    if use_llm and text:
        prompt = (
            f"Role: {role}. Question: {question[:700]}. Answer: {text[:3500]}. "
            "Give 2 strengths and 2 improvements. Do not repeat the rubric numbers."
        )
        from app.ml.model_registry import registry

        result = registry.generate_json(prompt, system=SYSTEM, timeout=40, num_predict=260)
        llm_meta = {
            "used_llm": bool(result.get("ok")),
            "provider": result.get("provider"),
            "model": result.get("model"),
            "elapsed_ms": result.get("elapsed_ms", 0),
            "error": result.get("error"),
        }
        data = result.get("data") if result.get("ok") else None
        if isinstance(data, dict):
            if isinstance(data.get("strengths"), list) and data["strengths"]:
                strengths = [str(item)[:220] for item in data["strengths"]][:3]
            if isinstance(data.get("improvements"), list) and data["improvements"]:
                improvements = [str(item)[:220] for item in data["improvements"]][:3]

    return {
        "overall": overall,
        "dimensions": dimensions,
        "weights": weights,
        "word_count": word_count,
        "strengths": strengths,
        "improvements": improvements,
        "rubric": "relevance + STAR structure + evidence + communication + technical depth",
        "llm": llm_meta,
        "inference_ms": round((time.perf_counter() - started) * 1000, 1),
        "method": "minilm_relevance_plus_deterministic_rubric",
        "notice": "Practice feedback, not an AI hiring assessment or a guarantee of interview performance.",
    }


def _strengths(dimensions: dict[str, float], word_count: int) -> list[str]:
    output: list[str] = []
    if dimensions["relevance"] >= 60:
        output.append("Your answer stays connected to what the question asked.")
    if dimensions["structure"] >= 60:
        output.append("You give the answer a recognizable shape rather than a list of facts.")
    if dimensions["evidence"] >= 60:
        output.append("You include concrete details that make the story credible.")
    if dimensions["communication"] >= 68:
        output.append("The answer is easy to follow at a conversational pace.")
    if word_count >= 70:
        output.append("You provide enough context for the interviewer to evaluate your thinking.")
    return output[:3] or ["You submitted a complete answer, which is the first step to improving it."]


def _improvements(dimensions: dict[str, float], word_count: int) -> list[str]:
    output: list[str] = []
    if word_count < 55:
        output.append("Add one specific example with the situation, your action, and the result.")
    if dimensions["structure"] < 62:
        output.append("Use a simple Situation → Action → Result structure so the interviewer can follow you.")
    if dimensions["evidence"] < 62:
        output.append("Quantify at least one outcome: time saved, users affected, latency reduced, or revenue changed.")
    if dimensions["technical_depth"] < 62:
        output.append("Explain one trade-off or why you chose that approach over an alternative.")
    if dimensions["communication"] < 64:
        output.append("Slow down and shorten long sentences; one idea per sentence is easier to follow.")
    return output[:3] or ["Turn the final result into one measurable sentence to make the story memorable."]

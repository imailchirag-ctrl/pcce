"""Evaluate local SkillBridge AI behavior against a small synthetic dataset.

This script never downloads model weights. Embedding/NLP flags are disabled so
unavailable MiniLM/spaCy packages fall back transparently. Pass --ollama to run
one small Qwen roadmap prompt against the configured local Ollama instance.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import resource
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.ml.job_recommender import rank_jobs
from app.ml.model_registry import _directory_size_mb, registry
from app.ml.resume_analyzer import analyze_resume
from app.ml.roadmap_generator import generate_roadmap
from app.ml.skill_extractor import extract_skill_details


ROOT = Path(__file__).resolve().parents[2]
BACKEND = Path(__file__).resolve().parents[1]
DATASET = BACKEND / "tests" / "fixtures" / "ai_quality_dataset.json"


def peak_rss_mb() -> float:
    # Linux reports ru_maxrss in KiB.
    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)


def ollama_process_info() -> dict[str, Any] | None:
    settings = get_settings()
    url = f"{settings.ollama_base_url.rstrip('/')}/api/ps"
    try:
        request = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=3) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ollama", action="store_true", help="Run one Qwen prompt using local Ollama.")
    args = parser.parse_args()

    settings = get_settings()
    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    installed = {
        name: importlib.util.find_spec(name) is not None
        for name in ("sentence_transformers", "spacy", "keybert")
    }
    embedding_cache_mb = _directory_size_mb(settings.model_cache_dir / "sentence-transformers")
    spacy_cache_mb = _directory_size_mb(settings.model_cache_dir / "spacy")

    # Do not trigger downloads or load large weights during this evaluation.
    settings.enable_embeddings = False
    settings.enable_spacy = False

    totals = {"tp": 0, "fp": 0, "fn": 0}
    extraction_results = []
    matching_results = []
    extraction_started = time.perf_counter()
    for resume in dataset["resumes"]:
        details = extract_skill_details(resume["text"], semantic=True)
        predicted = set(details["names"])
        expected = set(resume["expected_skills"])
        totals["tp"] += len(predicted & expected)
        totals["fp"] += len(predicted - expected)
        totals["fn"] += len(expected - predicted)
        extraction_results.append(
            {
                "id": resume["id"],
                "expected": len(expected),
                "predicted": len(predicted),
                "false_positive_skills": sorted(predicted - expected),
                "false_negative_skills": sorted(expected - predicted),
                "methods": details["methods"],
            }
        )

        first = rank_jobs(list(predicted), resume["text"], jobs=dataset["jobs"], limit=len(dataset["jobs"]))
        second = rank_jobs(list(predicted), resume["text"], jobs=dataset["jobs"], limit=len(dataset["jobs"]))
        ordering_a = [(item["id"], item["match_percent"]) for item in first["jobs"]]
        ordering_b = [(item["id"], item["match_percent"]) for item in second["jobs"]]
        formula_ok = True
        for item in first["jobs"]:
            calculated = item["skill_coverage"] * 0.72 + item["semantic_similarity"] * 0.23
            calculated += min(100, len(item["matched_skills"]) * 4) * 0.05
            calculated = round(max(0, min(100, calculated)), 1)
            formula_ok = formula_ok and calculated == item["match_percent"]
        matching_results.append(
            {
                "resume_id": resume["id"],
                "top_job": first["jobs"][0]["id"] if first["jobs"] else None,
                "expected_top_job": resume["target_job"],
                "repeatable_order_and_scores": ordering_a == ordering_b,
                "score_formula_valid": formula_ok,
                "reported_method": first["method"],
                "semantic_score_range": [
                    min(item["semantic_similarity"] for item in first["jobs"]),
                    max(item["semantic_similarity"] for item in first["jobs"]),
                ] if first["jobs"] else [],
            }
        )
    extraction_elapsed_ms = round((time.perf_counter() - extraction_started) * 1000, 1)

    precision = totals["tp"] / (totals["tp"] + totals["fp"]) if totals["tp"] + totals["fp"] else 0.0
    recall = totals["tp"] / (totals["tp"] + totals["fn"]) if totals["tp"] + totals["fn"] else 0.0

    missing_sections_started = time.perf_counter()
    minimal_analysis = analyze_resume("Eli Park\nEntry-level candidate seeking software roles.")
    missing_sections = {
        "no_summary": minimal_analysis["profile"]["summary"] is None,
        "no_experience": not minimal_analysis["experience"]["present"],
        "no_education": not minimal_analysis["education"]["present"],
        "readiness_bounded": 0 <= minimal_analysis["readiness"]["score"] <= 100,
    }
    missing_sections_ms = round((time.perf_counter() - missing_sections_started) * 1000, 1)

    qwen: dict[str, Any] = {"requested": args.ollama, "tested": False}
    before_rss = peak_rss_mb()
    if args.ollama:
        before_ollama = ollama_process_info()
        started = time.perf_counter()
        roadmap = generate_roadmap(
            ["sql", "docker"],
            "software engineer",
            use_llm=True,
            learner_context="Fictional learner with basic Python and no professional experience.",
        )
        qwen_ms = round((time.perf_counter() - started) * 1000, 1)
        after_ollama = ollama_process_info()
        llm = roadmap.get("llm") or {}
        qwen["tested"] = True
        qwen.update(
            {
                "used_llm": bool(llm.get("used_llm")),
                "provider": llm.get("provider"),
                "model": llm.get("model"),
                "elapsed_ms": qwen_ms,
                "reported_llm_ms": llm.get("elapsed_ms"),
                "error": llm.get("error"),
                "valid_roadmap_shape": (
                    isinstance(roadmap.get("items"), list)
                    and isinstance(roadmap.get("weekly_focus"), list)
                    and isinstance(roadmap.get("total_hours"), int)
                    and all(isinstance(item.get("skill"), str) for item in roadmap.get("items", []))
                ),
                "items": len(roadmap.get("items", [])),
                "weekly_focus_items": len(roadmap.get("weekly_focus", [])),
                "ollama_process_before": before_ollama,
                "ollama_process_after": after_ollama,
            }
        )
    qwen["python_peak_rss_before_mb"] = before_rss
    qwen["python_peak_rss_after_mb"] = peak_rss_mb()

    report = {
        "dataset": str(DATASET.relative_to(ROOT)),
        "synthetic_resume_count": len(dataset["resumes"]),
        "synthetic_job_count": len(dataset["jobs"]),
        "runtime": {
            "device": "cpu",
            "installed_packages": installed,
            "embedding_cache_mb": embedding_cache_mb,
            "spacy_cache_mb": spacy_cache_mb,
            "embedding_enabled_for_run": settings.enable_embeddings,
            "spacy_enabled_for_run": settings.enable_spacy,
        },
        "skill_extraction": {
            "method_evaluated": "alias/taxonomy fallback (semantic packages unavailable; downloads disabled)",
            "true_positive": totals["tp"],
            "false_positive": totals["fp"],
            "false_negative": totals["fn"],
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "elapsed_ms": extraction_elapsed_ms,
            "cases": extraction_results,
        },
        "matching": matching_results,
        "resume_missing_sections": {
            "checks": missing_sections,
            "all_checks_passed": all(missing_sections.values()),
            "elapsed_ms": missing_sections_ms,
        },
        "qwen_roadmap": qwen,
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())

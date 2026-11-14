"""Lazy, local-only model registry.

Rules enforced here:
- No weights download at import time.
- Only the models needed by an endpoint are loaded.
- A failed or missing model never crashes the API; callers receive a labeled
  fallback and a clear status.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger("skillbridge.models")

settings = get_settings()
os.environ.setdefault("HF_HOME", str(settings.model_cache_dir / "huggingface"))
os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", str(settings.model_cache_dir / "sentence-transformers"))
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def _directory_size_mb(path: Path) -> float:
    if not path.exists():
        return 0.0
    total = 0
    for child in path.rglob("*"):
        try:
            if child.is_file():
                total += child.stat().st_size
        except OSError:
            continue
    return round(total / (1024 * 1024), 1)


def _embedding_cache_folder(model_name: str | None = None) -> Path:
    """Reuse a matching Hugging Face cache before asking the hub to download weights."""
    model_cache_key = "models--" + (model_name or settings.embedding_model).replace("/", "--")
    candidates = [settings.model_cache_dir / "sentence-transformers"]
    hf_home = os.environ.get("HF_HOME")
    if hf_home:
        home = Path(hf_home).expanduser()
        candidates.extend((home / "hub", home))
    # Ollama/HF runs have historically been launched from either the repo root
    # or backend/, so the same cache can appear under this nested project path.
    candidates.append(settings.model_cache_dir.parent / "backend" / "models" / "sentence-transformers")
    candidates.append(Path.home() / ".cache" / "huggingface" / "hub")
    for candidate in candidates:
        if (candidate / model_cache_key).exists():
            return candidate
    return candidates[0]


class ModelRegistry:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._embedder: Any = None
        self._embedding_error: str | None = None
        self._embedding_load_ms: float | None = None
        self._embedding_calls = 0
        self._embedding_total_ms = 0.0
        self._embedding_dim: int | None = None

        self._nlp: Any = None
        self._spacy_error: str | None = None
        self._spacy_load_ms: float | None = None

        self._keybert: Any = None
        self._keybert_error: str | None = None

        self._reranker: Any = None
        self._reranker_error: str | None = None

        self._whisper: Any = None
        self._whisper_error: str | None = None

        self._ollama_cache_at = 0.0
        self._ollama_cache: dict[str, Any] = {}

    # ------------------------------------------------------------------
    # Embeddings (all-MiniLM-L6-v2)
    # ------------------------------------------------------------------
    def load_embedder(self) -> Any:
        if not settings.enable_embeddings:
            raise RuntimeError("Embedding inference is disabled by configuration.")
        with self._lock:
            if self._embedder is not None:
                return self._embedder
            if self._embedding_error:
                raise RuntimeError(self._embedding_error)
            started = time.perf_counter()
            try:
                from sentence_transformers import SentenceTransformer

                cache_folder = _embedding_cache_folder(settings.embedding_model)
                try:
                    self._embedder = SentenceTransformer(
                        settings.embedding_model,
                        cache_folder=str(cache_folder),
                        device="cpu",
                        local_files_only=(cache_folder / ("models--" + settings.embedding_model.replace("/", "--"))).exists(),
                    )
                except Exception as primary_error:  # noqa: BLE001
                    logger.warning("Primary embedding model failed (%s); trying fallback.", primary_error)
                    fallback_cache = _embedding_cache_folder(settings.embedding_model_fallback)
                    self._embedder = SentenceTransformer(
                        settings.embedding_model_fallback,
                        cache_folder=str(fallback_cache),
                        device="cpu",
                        local_files_only=(fallback_cache / ("models--" + settings.embedding_model_fallback.replace("/", "--"))).exists(),
                    )
                self._embedding_dim = int(self._embedder.get_sentence_embedding_dimension())
                self._embedding_load_ms = round((time.perf_counter() - started) * 1000, 1)
                logger.info("Loaded embedding model in %.0f ms", self._embedding_load_ms)
            except Exception as exc:  # noqa: BLE001
                self._embedding_error = f"Embedding model unavailable: {exc}"
                logger.exception("Could not load embedding model")
                raise RuntimeError(self._embedding_error) from exc
            return self._embedder

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        embedder = self.load_embedder()
        started = time.perf_counter()
        with self._lock:
            vectors = embedder.encode(
                texts,
                normalize_embeddings=True,
                batch_size=16,
                show_progress_bar=False,
                convert_to_numpy=True,
            )
            self._embedding_calls += 1
            self._embedding_total_ms += (time.perf_counter() - started) * 1000
        return [vector.tolist() for vector in vectors]

    def embed_one(self, text: str) -> list[float]:
        vectors = self.embed([text])
        return vectors[0] if vectors else []

    # ------------------------------------------------------------------
    # spaCy NER
    # ------------------------------------------------------------------
    def load_spacy(self) -> Any:
        if not settings.enable_spacy:
            raise RuntimeError("spaCy inference is disabled by configuration.")
        with self._lock:
            if self._nlp is not None:
                return self._nlp
            if self._spacy_error:
                raise RuntimeError(self._spacy_error)
            started = time.perf_counter()
            try:
                import spacy

                try:
                    self._nlp = spacy.load(settings.spacy_model)
                except OSError:
                    logger.warning("spaCy model %s is not installed; using a blank English pipeline.", settings.spacy_model)
                    self._nlp = spacy.blank("en")
                self._spacy_load_ms = round((time.perf_counter() - started) * 1000, 1)
            except Exception as exc:  # noqa: BLE001
                self._spacy_error = f"spaCy unavailable: {exc}"
                logger.warning("spaCy could not load: %s", exc)
                raise RuntimeError(self._spacy_error) from exc
            return self._nlp

    def spacy_entities(self, text: str) -> dict[str, Any]:
        nlp = self.load_spacy()
        doc = nlp(text[:60_000])
        entities = [
            {"text": ent.text.strip(), "label": ent.label_, "start": ent.start_char, "end": ent.end_char}
            for ent in doc.ents
            if ent.text.strip()
        ]
        noun_chunks = []
        try:
            noun_chunks = [chunk.text.strip() for chunk in doc.noun_chunks if len(chunk.text.strip()) > 2]
        except Exception:  # noqa: BLE001
            pass
        return {
            "entities": entities[:120],
            "noun_chunks": list(dict.fromkeys(noun_chunks))[:120],
            "pipeline": self._nlp.meta.get("name", settings.spacy_model) if hasattr(self._nlp, "meta") else settings.spacy_model,
        }

    # ------------------------------------------------------------------
    # KeyBERT (optional)
    # ------------------------------------------------------------------
    def extract_keywords(self, text: str, top_n: int = 12) -> dict[str, Any]:
        if not text.strip():
            return {"keywords": [], "method": "empty"}
        with self._lock:
            if self._keybert is None and self._keybert_error is None:
                try:
                    from keybert import KeyBERT

                    self._keybert = KeyBERT(model=self.load_embedder())
                except Exception as exc:  # noqa: BLE001
                    self._keybert_error = str(exc)
                    logger.info("KeyBERT unavailable; using fallback keyword extraction: %s", exc)
            if self._keybert is not None:
                try:
                    pairs = self._keybert.extract_keywords(
                        text[:20_000],
                        keyphrase_ngram_range=(1, 2),
                        stop_words="english",
                        top_n=top_n,
                        diversity=0.45,
                    )
                    return {
                        "keywords": [{"term": term, "score": round(float(score), 3)} for term, score in pairs],
                        "method": "keybert_minilm",
                    }
                except Exception as exc:  # noqa: BLE001
                    self._keybert_error = str(exc)
        return {"keywords": _fallback_keywords(text, top_n), "method": "frequency_fallback"}

    # ------------------------------------------------------------------
    # Optional reranker (BGE Reranker v2 M3)
    # ------------------------------------------------------------------
    def rerank(self, query: str, documents: list[str], top_k: int | None = None) -> dict[str, Any]:
        if not settings.enable_reranker:
            return {
                "scores": [],
                "method": "disabled",
                "notice": "BGE reranker is optional and not loaded. Set ENABLE_RERANKER=true to download it.",
            }
        with self._lock:
            if self._reranker is None and self._reranker_error is None:
                try:
                    from sentence_transformers import CrossEncoder

                    self._reranker = CrossEncoder(
                        settings.reranker_model,
                        cache_folder=str(settings.model_cache_dir / "sentence-transformers"),
                        device="cpu",
                    )
                except Exception as exc:  # noqa: BLE001
                    self._reranker_error = str(exc)
                    logger.warning("Reranker unavailable: %s", exc)
            if self._reranker is None:
                return {"scores": [], "method": "unavailable", "notice": self._reranker_error}
            scores = self._reranker.predict([(query, document) for document in documents])
            ranked = sorted(
                [
                    {"index": index, "score": round(float(score), 4)}
                    for index, score in enumerate(scores)
                ],
                key=lambda item: item["score"],
                reverse=True,
            )
            if top_k:
                ranked = ranked[:top_k]
            return {"scores": ranked, "method": settings.reranker_model}

    # ------------------------------------------------------------------
    # Optional Whisper
    # ------------------------------------------------------------------
    def transcribe(self, audio_bytes: bytes, suffix: str = ".webm") -> dict[str, Any]:
        if not settings.enable_whisper:
            return {
                "text": "",
                "available": False,
                "notice": "Whisper is disabled. Browser speech recognition is used for the interview demo.",
            }
        with self._lock:
            if self._whisper is None and self._whisper_error is None:
                try:
                    from faster_whisper import WhisperModel

                    self._whisper = WhisperModel(
                        settings.whisper_model,
                        device="cpu",
                        compute_type="int8",
                        download_root=str(settings.model_cache_dir / "whisper"),
                    )
                except Exception as exc:  # noqa: BLE001
                    self._whisper_error = str(exc)
                    logger.warning("Whisper unavailable: %s", exc)
            if self._whisper is None:
                return {"text": "", "available": False, "notice": self._whisper_error}
            tmp = settings.data_dir / f"upload-{int(time.time() * 1000)}{suffix}"
            tmp.write_bytes(audio_bytes)
            try:
                segments, info = self._whisper.transcribe(str(tmp), beam_size=1, vad_filter=True)
                text = " ".join(segment.text.strip() for segment in segments).strip()
                return {
                    "text": text,
                    "available": True,
                    "language": info.language,
                    "duration": round(info.duration, 2),
                    "model": f"faster-whisper/{settings.whisper_model}",
                }
            finally:
                tmp.unlink(missing_ok=True)

    # ------------------------------------------------------------------
    # Ollama / Qwen
    # ------------------------------------------------------------------
    def ollama_status(self, force: bool = False) -> dict[str, Any]:
        now = time.time()
        if not force and now - self._ollama_cache_at < 12:
            return self._ollama_cache
        status: dict[str, Any] = {
            "configured": bool(settings.enable_llm and settings.ollama_base_url),
            "reachable": False,
            "model": settings.ollama_model,
            "available": False,
            "models": [],
            "error": None,
        }
        if not settings.enable_llm:
            status["error"] = "LLM generation is disabled by configuration."
        elif settings.ollama_base_url:
            try:
                request = urllib.request.Request(
                    f"{settings.ollama_base_url.rstrip('/')}/api/tags",
                    headers={"Accept": "application/json"},
                )
                with urllib.request.urlopen(request, timeout=3) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                names = [model.get("name", "") for model in payload.get("models", [])]
                status.update(
                    reachable=True,
                    models=names,
                    available=settings.ollama_model in names,
                )
                if not status["available"]:
                    status["error"] = (
                        f"Ollama is running but {settings.ollama_model} is not installed. "
                        f"Available: {', '.join(names) or 'none'}."
                    )
            except Exception as exc:  # noqa: BLE001
                status["error"] = f"Ollama is not reachable: {exc}"
        self._ollama_cache_at = now
        self._ollama_cache = status
        return status

    def ollama_model_status(self, model: str) -> dict[str, Any]:
        """Check a server-selected model against installed Ollama tags."""
        status = self.ollama_status()
        available = bool(status.get("reachable") and model in status.get("models", []))
        error = None
        if not status.get("reachable"):
            error = status.get("error") or "Ollama is unavailable."
        elif not available:
            error = f"{model} is not installed in Ollama."
        return {
            "configured": bool(settings.enable_llm and settings.ollama_base_url),
            "reachable": bool(status.get("reachable")),
            "model": model,
            "available": available,
            "error": error,
        }

    def generate_json(
        self,
        prompt: str,
        *,
        system: str = "You are SkillBridge AI, a precise career readiness assistant. Return valid JSON only.",
        model: str | None = None,
        timeout: int | None = None,
        num_predict: int | None = None,
        keep_alive: str | int | None = None,
    ) -> dict[str, Any]:
        selected_model = model or settings.ollama_model
        status = self.ollama_model_status(selected_model)
        if not status.get("available"):
            return {
                "ok": False,
                "data": None,
                "provider": "ollama_unavailable",
                "model": None,
                "error": status.get("error") or "Ollama is unavailable.",
                "elapsed_ms": 0,
            }
        started = time.perf_counter()
        payload = {
            "model": selected_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.25,
                "num_predict": num_predict or settings.ollama_num_predict,
                "num_ctx": 4096,
            },
        }
        if keep_alive is not None:
            payload["keep_alive"] = keep_alive
        request = urllib.request.Request(
            f"{settings.ollama_base_url.rstrip('/')}/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout or settings.ollama_timeout_seconds) as response:
                body = json.loads(response.read().decode("utf-8"))
            content = body.get("message", {}).get("content", "") or body.get("response", "")
            data = _parse_json_content(content)
            elapsed = round((time.perf_counter() - started) * 1000, 1)
            if data is None:
                return {
                    "ok": False,
                    "data": None,
                    "provider": "ollama",
                    "model": selected_model,
                    "error": "The model returned text that could not be parsed as JSON.",
                    "raw": content[:1200],
                    "elapsed_ms": elapsed,
                }
            return {
                "ok": True,
                "data": data,
                "provider": "ollama",
                "model": selected_model,
                "elapsed_ms": elapsed,
            }
        except Exception as exc:  # noqa: BLE001
            logger.warning("Ollama generation failed: %s", exc)
            return {
                "ok": False,
                "data": None,
                "provider": "ollama",
                "model": selected_model,
                "error": str(exc),
                "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
            }

    async def generate_json_async(
        self,
        prompt: str,
        *,
        system: str = "You are SkillBridge AI, a precise career readiness assistant. Return valid JSON only.",
        model: str | None = None,
        timeout: int | None = None,
        num_predict: int | None = None,
        keep_alive: str | int | None = None,
    ) -> dict[str, Any]:
        """Async counterpart for API handlers that must not block the event loop."""
        selected_model = model or settings.ollama_model
        if not settings.enable_llm or not settings.ollama_base_url:
            return {"ok": False, "data": None, "provider": "ollama_unavailable", "model": None, "error": "LLM generation is disabled or unconfigured.", "elapsed_ms": 0}
        started = time.perf_counter()
        try:
            import httpx

            client_timeout = httpx.Timeout(timeout or settings.ollama_timeout_seconds, connect=3.0)
            base_url = settings.ollama_base_url.rstrip("/")
            async with httpx.AsyncClient(timeout=client_timeout) as client:
                tags_response = await client.get(f"{base_url}/api/tags")
                tags_response.raise_for_status()
                models = tags_response.json().get("models", [])
                names = [item.get("name", "") for item in models]
                if selected_model not in names:
                    return {
                        "ok": False, "data": None, "provider": "ollama_unavailable", "model": None,
                        "error": f"{selected_model} is not installed in Ollama. Available: {', '.join(names) or 'none'}.",
                        "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
                    }
                payload: dict[str, Any] = {
                    "model": selected_model,
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                    "stream": False,
                    "format": "json",
                    "options": {"temperature": 0.25, "num_predict": num_predict or settings.ollama_num_predict, "num_ctx": 4096},
                }
                if keep_alive is not None:
                    payload["keep_alive"] = keep_alive
                response = await client.post(f"{base_url}/api/chat", json=payload)
                response.raise_for_status()
                body = response.json()
            content = body.get("message", {}).get("content", "") or body.get("response", "")
            data = _parse_json_content(content)
            elapsed = round((time.perf_counter() - started) * 1000, 1)
            if data is None:
                return {"ok": False, "data": None, "provider": "ollama", "model": selected_model, "error": "The model returned text that could not be parsed as JSON.", "raw": content[:1200], "elapsed_ms": elapsed}
            return {"ok": True, "data": data, "provider": "ollama", "model": selected_model, "elapsed_ms": elapsed}
        except Exception as exc:  # noqa: BLE001
            logger.warning("Async Ollama generation failed: %s", exc)
            return {"ok": False, "data": None, "provider": "ollama", "model": selected_model, "error": str(exc), "elapsed_ms": round((time.perf_counter() - started) * 1000, 1)}

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------
    def status(self) -> dict[str, Any]:
        try:
            spacy_loaded = self._nlp is not None
        except Exception:  # noqa: BLE001
            spacy_loaded = False
        avg_embedding_ms = (
            round(self._embedding_total_ms / self._embedding_calls, 1) if self._embedding_calls else None
        )
        ollama = self.ollama_status()
        return {
            "models": [
                {
                    "id": settings.embedding_model,
                    "task": "sentence embeddings + semantic skill matching",
                    "kind": "pretrained",
                    "loaded": self._embedder is not None,
                    "load_ms": self._embedding_load_ms,
                    "avg_inference_ms": avg_embedding_ms,
                    "calls": self._embedding_calls,
                    "dimension": self._embedding_dim,
                    "cache_mb": _directory_size_mb(settings.model_cache_dir / "sentence-transformers"),
                    "error": self._embedding_error,
                },
                {
                    "id": settings.spacy_model,
                    "task": "named entity recognition + noun chunks",
                    "kind": "pretrained",
                    "loaded": spacy_loaded,
                    "load_ms": self._spacy_load_ms,
                    "cache_mb": _directory_size_mb(settings.model_cache_dir / "spacy"),
                    "error": self._spacy_error,
                },
                {
                    "id": "KeyBERT",
                    "task": "resume and job-description keyword extraction",
                    "kind": "library (uses MiniLM embeddings)",
                    "loaded": self._keybert is not None,
                    "error": self._keybert_error,
                },
                {
                    "id": settings.reranker_model,
                    "task": "cross-encoder reranking",
                    "kind": "pretrained (optional)",
                    "loaded": self._reranker is not None,
                    "enabled": settings.enable_reranker,
                    "error": self._reranker_error,
                },
                {
                    "id": f"faster-whisper/{settings.whisper_model}",
                    "task": "speech-to-text",
                    "kind": "pretrained (optional)",
                    "loaded": self._whisper is not None,
                    "enabled": settings.enable_whisper,
                    "error": self._whisper_error,
                },
                {
                    "id": settings.ollama_model,
                    "task": "question generation, gap explanations, roadmap enrichment",
                    "kind": "pretrained LLM served by Ollama",
                    "loaded": ollama.get("available", False),
                    "reachable": ollama.get("reachable", False),
                    "installed_models": ollama.get("models", []),
                    "error": ollama.get("error"),
                    "cache_mb": _directory_size_mb(Path.home() / ".ollama" / "models"),
                },
            ],
            "ollama": ollama,
            "hardware": {
                "device": "cpu",
                "embedding_model": settings.embedding_model,
                "reranker_enabled": settings.enable_reranker,
                "whisper_enabled": settings.enable_whisper,
            },
            "notices": [
                "Base BERT is not used as a skill classifier. Skill extraction combines a curated taxonomy with MiniLM semantic similarity and spaCy entities.",
                "FLAN-T5 and BART-MNLI are not loaded: Qwen2.5 3B already covers generation and BART large would consume ~1.6 GB RAM on this CPU-only machine.",
                "XGBoost/LightGBM are not trained because no suitable labelled career-readiness dataset is present.",
            ],
        }


def _parse_json_content(content: str) -> dict[str, Any] | None:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {"result": parsed}
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if match:
            try:
                parsed = json.loads(match.group(0))
                return parsed if isinstance(parsed, dict) else {"result": parsed}
            except json.JSONDecodeError:
                return None
    return None


def _fallback_keywords(text: str, top_n: int) -> list[dict[str, Any]]:
    stop = {
        "and", "the", "with", "for", "from", "that", "this", "have", "has", "a", "an",
        "of", "to", "in", "on", "at", "as", "by", "is", "are", "was", "were", "be",
        "built", "using", "worked", "team", "experience", "years", "role", "skills",
    }
    words = re.findall(r"[A-Za-z][A-Za-z+#./-]{2,}", text.lower())
    counts: dict[str, int] = {}
    for word in words:
        if word in stop or len(word) < 3:
            continue
        counts[word] = counts.get(word, 0) + 1
    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)[:top_n]
    if not ranked:
        return []
    peak = max(1, ranked[0][1])
    return [{"term": term, "score": round(min(1.0, count / peak), 3)} for term, count in ranked]


registry = ModelRegistry()

# AI Parallel Universe model inventory

Checked for the Parallel Universe implementation on 2026-11-14.

## Hardware and local cache

- RAM: 7.1 GiB total; about 1.3 GiB available at the initial audit.
- Swap: 13 GiB total.
- GPU: no NVIDIA GPU or `nvidia-smi` detected; inference is CPU-bound.
- Disk: about 227 GiB free in the repository filesystem.
- Python environment: repository `.venv`.
- Installed versions: `sentence-transformers 6.3.0`, `transformers 5.22.2`, `torch 2.15.0+cpu`.
- The embedding weights were already cached. The model registry now looks in the configured project cache, the nested backend cache, and the standard Hugging Face cache, and uses local-only loading when it finds the model. This avoids unnecessary Hub requests and duplicate weights.

## Ollama inventory

`ollama list` found these installed models:

| Model | Installed size | Use |
| --- | ---: | --- |
| `qwen2.5-coder:3b` | 1.9 GB | Selected local reasoning model for path generation, debate, and decision simulation. It is already the project's configured model and fits the machine better than the 7B option. |
| `qwen2.5:7b` | 4.7 GB | Available, but not selected because this machine has limited available RAM and no GPU. |
| `gemma2:2b` | 1.6 GB | Installed fallback option in the existing project configuration; the Parallel Universe service currently falls back to an evidence-based scaffold when Qwen is unavailable. |

A local `qwen2.5-coder:3b` inference completed successfully and returned the requested JSON. Model downloads were not needed.

## Semantic model

- Model: `sentence-transformers/all-MiniLM-L6-v2`.
- Cached revision: `1110a243fdf4706b3f48f1d95db1a4f5529b4d4188` (`main` reference observed in the local cache).
- Runtime: CPU, 384-dimensional embeddings.
- Use: semantic fit between current interests, goals, projects and each generated path; comparisons are heuristic, not predictions.
- Inference check: encoded two sentences and returned a 384-dimensional vector with a finite cosine similarity. It loaded from cache with Hub access disabled for that run.

## Other requested model checks

- `bert-base-uncased`: not found in the inspected Hugging Face cache; not installed because this flow has no separate classification need.
- `facebook/bart-large-cnn`: not found in the inspected Hugging Face cache; not installed because the local Qwen model already handles the short generation and summary tasks.
- `sentence-transformers/all-MiniLM-L6-v2`: present and verified, as above.
- No training was performed. No new weights or large dependencies were downloaded.

## Runtime behavior and fallback

The service calls the existing Ollama model registry with `qwen2.5-coder:3b`, JSON output mode, bounded generation length, and a request timeout. Profile generation, the three-agent debate, and each decision revision use one bounded model call apiece. If Ollama is offline or returns unusable JSON, the API labels its evidence-based fallback and does not present it as model output. Semantic comparison uses MiniLM when cached weights load; token overlap is the explicitly logged fallback.

The current generated scenario remains hypothetical. It never records a user's simulated skills or decisions in resume, assessment, interview, or Digital Twin evidence.

# Career Quest Architecture

**Status:** Architecture proposal only. This document adds no product code, database migrations, model downloads, or execution service. It is based on the repository as inspected on 2026-11-13.

## Recommendation

Add Career Quest as an authenticated candidate feature in the existing Next.js and FastAPI application. Keep quest state and scoring in FastAPI, persist it in the active SQLite database, and use the existing session, request proxy, UI shell, model registry, and SSE channel. Start with a versioned, server-owned Software Engineer mission catalog. Add a separately operated, isolated code runner before enabling player code submissions. Use local Ollama models for manager dialogue and optional coaching; never use a model to decide whether submitted code passed.

The first release should remain useful if Ollama or the code runner is unavailable: the mission path can use authored scenarios and non-code missions, while coding missions report a temporary runner outage and allow retry. A run must not silently award technical credit without grader results.

## 1. Existing application architecture

| Area | Current repository implementation | Career Quest fit |
| --- | --- | --- |
| Frontend | Next.js App Router, TypeScript, React 19, Tailwind CSS 4. Workspace routes are mapped in `src/app/[...segments]/page.tsx`. | Add protected workspace routes and feature-owned screens. |
| Shared UI | `AppShell`, UI primitives such as `Card`, `Badge`, `Progress`, `EmptyState`, `Toast`, Lucide icons, and Framer Motion are already used. | Reuse the current shell and primitives; lazy-load Monaco only on coding missions. |
| Frontend service layer | `src/lib/api.ts` calls same-origin `/api/backend/*`; `src/app/api/backend/[...path]/route.ts` forwards requests to FastAPI and adds the session bearer token. | Add typed Career Quest client methods using this path. No browser-held API token is needed. |
| Identity | Next.js auth routes store the opaque session token in the `HttpOnly`, `SameSite=Lax` `sb_session` cookie. FastAPI stores only a digest of the token and authenticates requests through `Depends(current_user)`. | Reuse this identity end to end. Derive `user_id` from `current_user`, never from request data. |
| Backend | FastAPI mounts auth and product routers under `/api/v1`; Pydantic request models and `{error: {code, message}}` responses are established patterns. | Add a Career Quest router and service/repository functions under the same API. |
| Persistence | FastAPI's `backend/app/db.py` initializes SQLite at the configured `DATABASE_PATH` (default `backend/data/skillbridge.db`), uses parameterized SQL, a connection context manager, WAL, and additive schema setup. | Add SQLite tables and repository functions through the existing DB boundary. |
| AI | `backend/app/ml/model_registry.py` lazily loads all-MiniLM-L6-v2 and calls local Ollama through JSON-mode chat. The configured Ollama model defaults to `qwen2.5-coder:3b`; interview generation falls back to templates. | Extend the model selection/configuration boundary for distinct role models and keep templates as the offline path. |
| Existing evaluators | `skill_extractor.py` and `semantic_matcher.py` provide MiniLM semantic matching. `interview_evaluator.py` combines deterministic dimensions with semantic relevance and uses Ollama for qualitative feedback. | Reuse MiniLM and its qualitative feedback approach for reflection; create mission-specific scoring rules rather than copying interview weights. |
| Realtime | FastAPI `hub` broadcasts per-user events through `/api/v1/events`; Next.js exposes `/api/events` using the session cookie. The workspace provider refreshes after events and also polls every 25 seconds. | Publish quest state changes over the existing channel, with API snapshots as the source of truth. |
| Code execution | No Monaco or code execution integration is present in the root app. | Add Monaco for the editor and a separate isolated execution adapter/service. |

### Repository status caveat

Several repository documents, including `README.md`, `docs/ARCHITECTURE.md`, and `docs/DEVELOPMENT_STATUS.md`, describe older states such as demo-only auth or no frontend-to-FastAPI connection. Current source has Next.js auth handlers, FastAPI auth/session storage, protected backend proxy calls, SQLite-backed API operations, and SSE. The Prisma schema at `prisma/schema.prisma` is a PostgreSQL contract, but the active FastAPI product paths use SQLite and do not query Prisma. Treat source code and configuration as the current behavior. Do not dual-write Career Quest data to SQLite and Prisma. If PostgreSQL becomes the deployment system of record, plan a deliberate migration first.

## 2. Target application architecture

```text
Browser
  ├─ Career Quest screens, workspace cookie, Monaco editor
  ├─ /api/backend/career-quests/* ──────────────┐
  └─ /api/events (SSE)                           │
                                                 ▼
Next.js same-origin routes/proxy ─────────────► FastAPI /api/v1
  reads HttpOnly session cookie                  ├─ current_user authorization
  adds bearer token                              ├─ Career Quest domain service
                                                 ├─ SQLite repository and state
                                                 ├─ local model router ──► Ollama
                                                 └─ execution adapter ───► isolated Judge0/worker
```

FastAPI owns quest transitions, persistence, authorization checks, model routing, score calculation, XP awards, and report assembly. Next.js owns presentation and forwards authenticated requests. The execution service owns compilation and execution in its sandbox; it does not own user identity, progression, or final score policy.

## 3. Frontend architecture

Add a `career-quest` feature slice under `src/features/` for request/response types, API wrappers, and quest-specific state. Add page components under `src/components/workspace/pages/` and route entries through the existing catch-all workspace map. Add `/career-quest` to both the protected paths in `src/middleware.ts` and `WORKSPACE_ROOTS` in `src/lib/workspace-provider.tsx` so session checks, initial refresh, and the existing event stream cover the feature.

Keep editor text and active mission interaction state local to the quest page or a quest-specific provider. Do not put every keystroke into the broad workspace provider or use `sessionStorage` as the authoritative run record. Persist drafts through an explicit save/checkpoint API where needed; fetch canonical run state after route changes, reconnects, or event notifications.

Use current `AppShell`, cards, badges, progress, empty states, responsive layout, icons, and motion patterns. Monaco is not currently installed, so the coding screen will need one editor dependency (for example `@monaco-editor/react`) and should load it only when a coding mission is active. Avoid additional UI, state, or socket packages unless a concrete gap appears.

## 4. Backend architecture

Add an `app.api.career_quest` router and include it from `backend/app/api/router.py`. Keep HTTP handling thin:

1. Validate bounded payloads with Pydantic.
2. Require `Depends(current_user)` for all player-specific endpoints.
3. Pass the authenticated user's ID into domain service and repository functions.
4. Check ownership and legal run/mission state before each transition.
5. Return public DTOs only; never serialize private challenge configuration.
6. Publish an event after a committed state change.

Place quest planning/state transitions, generation orchestration, deterministic evaluation, report assembly, and progression calculation in service modules. Add repository functions in `backend/app/db.py` or a focused repository module that uses its existing `connection()` boundary. Do not put SQL or model calls directly in route handlers.

The async API should not perform slow synchronous inference or wait for code execution on the event loop. The current model registry uses synchronous HTTP calls, so route new calls through a bounded worker/thread pool or an async adapter. Code execution should return an attempt ID and finish asynchronously.

## 5. Database schema and required new tables

Use the current SQLite database for the first implementation. Add tables via the existing additive initialization/migration path, with foreign keys, indexes, and ownership scoped to `user_id`. Catalogs and mission/test definitions should be versioned server assets rather than client-provided content.

| Table | Core fields and purpose |
| --- | --- |
| `career_quest_runs` | `id`, `user_id`, `career_key`, `difficulty`, `status`, `catalog_version`, `started_at`, `updated_at`, `completed_at`, `score_json`, `report_json`. One row per run; index `(user_id, started_at)` and `(user_id, status)`. |
| `career_quest_missions` | `id`, `run_id`, `sequence`, `template_key`, `template_version`, `mission_type`, `status`, `public_state_json`, `score_json`, timestamps. Unique `(run_id, sequence)`. Store only browser-safe prompt/state here. |
| `career_quest_interactions` | `id`, `run_id`, optional `mission_id`, `sequence`, `actor`, `interaction_type`, `content`, `metadata_json`, `created_at`. Stores choices, limited player reflections, and teammate/manager dialogue needed to resume and report. Index `(run_id, sequence)`. |
| `career_quest_attempts` | `id`, `mission_id`, `attempt_number`, `idempotency_key`, `status`, `runner_job_id`, `submission_fingerprint`, `result_summary_json`, `score`, timestamps. Unique idempotency key per mission. Avoid retaining full source code by default. |
| `career_quest_skill_evidence` | `id`, `run_id`, `mission_id`, `skill_key`, `dimension`, `score`, `rubric_version`, `evidence_refs_json`, `created_at`. Unique evidence contribution per mission/skill/dimension to prevent repeated attempts inflating mastery. |
| `career_quest_xp_events` | `id`, `user_id`, `run_id`, optional `mission_id`, `event_key`, `xp_delta`, `reason`, `created_at`. Unique `(user_id, event_key)` for idempotent awards; index `(user_id, created_at)`. |
| `career_quest_achievement_awards` | `id`, `user_id`, `achievement_key`, `run_id`, `awarded_at`, `evidence_json`. Unique `(user_id, achievement_key)`. Achievement definitions can remain in versioned application data. |

Hidden test cases and private grading rules belong in backend-only, versioned challenge assets. They are not fields in public mission DTOs. The grader loads private assets by a validated `template_key` and version. If tests are later stored in SQLite, keep them in a separate private table and expose them only to the grader service.

Keep transactions short. Persist a state transition and its XP/evidence ledger rows atomically where possible. Do not keep a SQLite transaction open during LLM inference or runner execution. A run snapshot records the catalog/rubric version so reports can be interpreted after content changes.

## 6. API endpoint design

All paths below are FastAPI paths under `/api/v1`; the browser calls them through the existing same-origin `/api/backend/` proxy. All run endpoints require a valid session. Do not accept `user_id` in any payload or path.

| Method and path | Purpose |
| --- | --- |
| `GET /career-quests/catalog` | Return available careers, difficulty descriptions, and supported mission types. Initially enable Software Engineer; mark other career ideas as unavailable rather than generating unsupported content. |
| `POST /career-quests/runs` | Create a run from `career_key` and `difficulty`; server selects the catalog version, initial mission, and fictional company. Return run ID and public state. |
| `GET /career-quests/runs` | List the authenticated user's runs and status. |
| `GET /career-quests/runs/{run_id}` | Return resumable run state, current public mission, progress, and prior public results after checking ownership. |
| `POST /career-quests/runs/{run_id}/missions/{mission_id}/interactions` | Submit an allowed choice or bounded text response; apply deterministic transition rules and optionally request NPC dialogue. |
| `POST /career-quests/runs/{run_id}/missions/{mission_id}/attempts` | Submit coding source/language with an idempotency key. Validate mission state and limits, enqueue isolated execution, and return `202` plus attempt ID/status. |
| `GET /career-quests/runs/{run_id}/attempts/{attempt_id}` | Poll a user's attempt state and public summary. No hidden inputs, expected outputs, or private test details. |
| `POST /career-quests/runs/{run_id}/missions/{mission_id}/complete` | Request completion; server verifies objective evidence and computes scores. Ignore client-supplied scores or XP. |
| `POST /career-quests/runs/{run_id}/abandon` | Mark an owned in-progress run abandoned; keep history and earned ledger records. |
| `GET /career-quests/runs/{run_id}/report` | Return a completed run's detailed performance report after ownership check. |
| `GET /career-quests/progression` | Return XP total, level, skill progression, and earned achievements for the current user. |

Use the repository's standard error envelope and stable error codes for invalid state, not-found/ownership failures, runner unavailable, throttled, and inference unavailable. A submitted attempt should be idempotent so client retries cannot execute twice or award duplicate XP.

## 7. AI model routing design

Keep inference behind the existing `ModelRegistry`, but configure and validate models by task rather than relying on its single `OLLAMA_MODEL` setting:

| Task | Preferred local model | Allowed responsibility |
| --- | --- | --- |
| Manager and teammate roleplay, scenario narration, requirement-change wording | Qwen2.5 7B | Produce schema-validated dialogue or choice framing from approved scenario state. |
| Technical mission wording or optional code explanation | Qwen2.5-Coder 3B | Clarify authored technical tasks or explain verified results. It does not run or grade code. |
| Lightweight fallback for NPC text | Gemma2 2B, when installed | Short low-cost narration. It cannot replace a missing grader. |
| Skill/reflection semantic signals | Existing all-MiniLM-L6-v2 path | Semantic relevance and skill mapping, reported as one evidence signal rather than ground truth. |

Add explicit model aliases/settings and an allowlist. `generate_json()` already accepts a model argument, but current availability checks are based on the configured default model; an override must also be checked against installed Ollama tags before being routed. Report per-model status. Use the same local Ollama service and JSON validation path; do not introduce a paid AI provider or model SDK.

Bound prompts, output length, timeouts, and concurrent generations. Treat player text as untrusted data, not instructions. Validate every model response against a strict schema and scenario allowlists. Persist the model/provider, prompt/content version, and fallback status for auditability. If a model times out or returns invalid output, use authored dialogue or a neutral fallback and do not block a valid deterministic transition.

## 8. Mission generation architecture

Use a hybrid, server-led approach:

1. Author and version a Software Engineer mission arc with fixed skills, objectives, public briefs, legal transitions, rubrics, and a final boss mission. Include coding, debugging, reasoning, decision-making, teammate communication, and changing requirements.
2. Treat mission templates and difficulty bounds as the source of truth. A run is seeded with a versioned sequence and a fictional company; changing requirements are explicit state transitions authored into that sequence.
3. Ask the selected local model only for bounded dialogue or allowed narrative variants, using the current public facts and approved transition options. The model may phrase an event but cannot add objectives, change grading rules, create rewards, or mark a task complete.
4. Validate structured model output and persist the result with the run. If output fails validation or Ollama is unavailable, render the authored text.
5. Keep the final boss and all hidden grading inputs deterministic and server-owned. Add AI-generated mission templates only after they pass schema, solvability, fairness, and rubric checks before publication.

This gives students a coherent changing workplace scenario without making mission correctness depend on model availability or hallucinated requirements.

## 9. Coding challenge execution architecture

Monaco runs only in the browser as an editor. FastAPI must never run player source with Python `eval`, `exec`, or an unsafe local subprocess. It should not compile or execute submissions in its request process.

Execution flow:

1. FastAPI authenticates the user, verifies run ownership, active mission, supported language, source-size limit, and rate limit.
2. It resolves the challenge and private test bundle from the server catalog; the client submits only a challenge/mission reference and source.
3. An execution adapter sends source and tests to a separately isolated Judge0 deployment or equivalent one-shot worker. Prefer self-hosting an open-source runner to avoid a paid execution API. The runner has no access to the application database, Ollama, credentials, or general network egress.
4. The runner enforces CPU, memory, wall-clock, output, process, filesystem, and language-version limits. It returns a job ID and execution results. Treat runner output as untrusted and validate its schema.
5. The backend grader calculates the technical score from actual passed/failed test results and persists a sanitized summary. The API returns status and aggregate feedback, never hidden case definitions, inputs, expected output, or private grader config.
6. On completion, publish an SSE event and allow the UI to fetch the canonical attempt state. Retry and duplicate-submit behavior is controlled by the idempotency key.

Keep public sample cases separate from hidden cases. Do not send hidden tests to the browser, manager model, coding model, logs, analytics, or client error details. A public result can expose total score and safe diagnostics without revealing secret test data.

## 10. Evaluation and scoring architecture

Separate observed facts from coaching language:

- **Coding/debugging:** score is derived only from actual execution results, using a versioned weighted test manifest. For example, `100 × sum(weights of passed tests) / sum(all test weights)`. If compilation or execution fails, record that outcome; an LLM cannot override it. Keep private test details server-side.
- **Reasoning and decisions:** score against explicit mission rubrics and outcome facts, such as selecting a safe rollout, identifying a dependency, or responding to a stated constraint. Prefer structured choices or observable action flags so scores are reproducible.
- **Written communication/reflection:** use a versioned rubric and optionally MiniLM relevance as one transparent signal. The existing interview evaluator can inform dimensions and feedback style, but its interview-specific weights should not be reused without calibration.
- **Manager and teammate interactions:** grade decisions/actions against an authored behavior rubric. Ollama may produce a grounded explanation from recorded evidence; it must not invent the evidence or change numeric points.
- **Final report:** calculate dimension and overall scores in backend code from persisted mission evidence and versioned weights. Show score components, evidence, limitations, and uncompleted items. Mark the result as a practice simulation, not a hiring decision.

Store raw component scores, evidence references, and rubric version. Do not allow the browser to submit final score, skill level, XP, or achievement state. If a runner is unavailable, classify the mission as pending/retryable or unavailable; do not award a fabricated technical score.

## 11. XP, levels, achievements, and skill progression

Use `career_quest_xp_events` as an append-only ledger and calculate the balance from ledger rows (a cached total may be added later). Award XP only after a server-verified mission completion. Give a fixed completion base plus a bounded performance bonus and optional difficulty multiplier; make exact values configuration/versioned data. Enforce unique event keys so retries and duplicate requests cannot award again. Do not grant repeatable XP for submitting the same mission many times.

Use a simple documented level curve, for example `level = 1 + floor(sqrt(total_xp / 100))`, with level-up thresholds visible in the UI. Keep per-skill progression based on unique, completed mission evidence in `career_quest_skill_evidence`, not self-reported skill values or unlimited retries. Example achievements include completing the first mission, a clean execution, handling a changed requirement, and finishing the boss mission. Award these through deterministic backend rules and unique `(user_id, achievement_key)` records.

Career Quest skill evidence can be shown alongside existing career readiness. Do not write game scores into `UserSkill.confidence` as though they were resume or interview evidence; if a later product decision unifies those records, preserve the source as a distinct type and show how it was measured.

## 12. Realtime event architecture

Reuse the current authenticated SSE path. Publish small per-user `change` messages with topics such as `career_quest.run`, `career_quest.mission`, `career_quest.attempt`, `career_quest.progression`, and `career_quest.report`. Include IDs and version/state hints, not source code, hidden tests, or long transcripts.

The HTTP response or a follow-up GET remains authoritative. SSE is a notification to refresh a run, attempt, or progression view. This matches the existing workspace refresh pattern and its periodic fallback. The current hub is in-memory, queue-backed (64 messages per subscriber), and has no durable replay; reconnecting clients must fetch a current snapshot. It is suitable for a single FastAPI process, but multi-worker deployment will need a shared event broker or database-backed event/outbox design.

## 13. Security and privacy considerations

- Authenticate every run operation with `current_user`; obtain the account ID from that dependency and include it in every query. Check ownership for run, mission, and attempt IDs to prevent IDOR access.
- Treat the Next.js session cookie and backend bearer token as secrets. Keep the current same-origin proxy; never put tokens in local storage or expose backend URLs/secrets to client JavaScript. Validate `Origin`/CSRF protections on state-changing browser requests in addition to relying on `SameSite=Lax`.
- Never execute player code inside FastAPI using `eval`, `exec`, or unsafe subprocess calls. Use a separately isolated runner with strict resource limits, no credentials, and restricted network access.
- Never send hidden tests, private grader fields, or expected answers to the browser. Use dedicated public response schemas and test that serializers cannot include private configuration.
- Do not trust browser-provided user IDs, score values, XP, achievement keys, mission unlock flags, runner job results, or completion status. Verify transitions and runner responses on the server.
- Validate language IDs, source byte length, action types, text lengths, request frequency, and attempt counts. Apply quotas to protect the local runner and Ollama from resource exhaustion.
- Treat user text and model output as untrusted. Bound context, instruct models to treat player text as data, validate JSON and enum values, and render dialogue as escaped text rather than HTML.
- Keep player code out of normal logs. Minimize transcript retention, define deletion/export behavior, and disclose that local models and the isolated runner process submitted content. Keep fictional company/team content synthetic.
- Use prepared SQL parameters and short transactions. Do not expose private code or transcript data in SSE messages, error traces, or aggregate reports for other users.

## 14. Complete frontend screen flow

1. **Career Quest entry:** accessible from candidate navigation and the dashboard. Show what the simulation measures, duration, save/resume behavior, and the practice-only nature of scores.
2. **Career selection:** show Software Engineer as playable. Display AI/ML Engineer, Data Scientist, Cybersecurity Analyst, Product Manager, and Business Analyst as future careers without allowing unsupported runs.
3. **Difficulty selection:** describe beginner/intermediate/advanced expectations. Explain that difficulty changes mission complexity and scoring rubric, not whether technical execution is real.
4. **Company onboarding:** create a fictional employer/team from server data, introduce the manager and teammates, show controls and accessibility options, then begin the run.
5. **Quest workspace:** show mission list, current objective, requirement changes, progress, team/activity panel, autosave state, and a help/briefing affordance. Each mission renders its task type: Monaco coding/debugging editor, structured decision choices, reasoning response, or teammate/manager interaction.
6. **Attempt feedback:** show queued/running state for code, safe execution summary when complete, evidence-based feedback, and retry/continue controls. Keep the player in the mission while an attempt runs.
7. **Mission debrief:** summarize observed outcomes, skill evidence, XP earned, and next mission. Do not reveal future hidden challenges or tests.
8. **Final boss:** present the final integrated Software Engineer scenario after prerequisite missions; combine coding/debugging with requirements and decision-making in the authored mission flow.
9. **Final performance report:** show overall and per-skill dimensions, score methodology, evidence, strengths, improvement recommendations, missed objectives, and clear simulation limitations.
10. **Progression/history:** show level, XP ledger summary, earned achievements, skill progression, and prior runs with resume/review actions where valid.
11. **Resume/reconnect:** on reload, fetch canonical run state. If SSE disconnects, poll or refresh; if code execution is pending, resume status polling using the attempt ID.

## 15. Implementation phases and dependencies

| Phase | Deliverable | Depends on |
| --- | --- | --- |
| 0. Contract and catalog | Approve Software Engineer competencies, run duration, difficulty rubric, mission arc, score dimensions, XP rules, retention, and acceptance examples. Author deterministic challenge manifests including hidden tests. | Product/learning design; runner language decision. |
| 1. Persistence and domain state | Add additive SQLite tables, repository methods, ownership checks, run/mission state machine, catalog endpoint, and migration tests. | Phase 0. |
| 2. Non-code playable slice | Ship career/difficulty/onboarding, scenario progression, manager/teammate choices, save/resume, deterministic rubric, report skeleton, and XP ledger using authored content. | Phase 1. |
| 3. Isolated execution | Operate Judge0 or equivalent, implement adapter, resource/egress policy, supported language set, asynchronous attempt lifecycle, hidden test bundle, and actual-results scoring. | Phase 0 manifests and Phase 1 attempt state. |
| 4. Coding UI and final boss | Add lazy Monaco editor, public sample tests, submit/status/error states, and integrated final boss using real runner results. | Phase 3. |
| 5. AI roleplay and coaching | Add separate Ollama model aliases, model availability checks, bounded NPC generation, deterministic fallbacks, and optional feedback grounded in score evidence. | Stable mission schemas and score rubric. |
| 6. Realtime and progression polish | Add quest topics to the current SSE hub, feature-specific refresh, progression/history, accessibility, responsive polish, and any multi-worker event design required by deployment. | Stable run state and async attempt flow. |
| 7. Release hardening | Run the planned test suite, security review of the runner, model/load checks on target hardware, retention review, and staged enablement for Software Engineer only. | All prior phases. |

Do not introduce database, realtime, or AI SDK dependencies unless implementation reveals the existing boundaries cannot meet a measured requirement. Monaco and the separately operated execution service are the only anticipated new runtime components.

## 16. Testing strategy

The implementation should have deterministic tests that do not require Ollama or a live Judge0 service by default:

- **SQLite and migration tests:** create a temporary database, apply initialization/migrations repeatedly, verify indexes/constraints, atomic completion/XP writes, and isolation between two users.
- **Domain unit tests:** legal run transitions, difficulty/template selection, mission completion requirements, score weights, rubric versions, level boundaries, achievement eligibility, and duplicate/idempotent XP events.
- **API authorization tests:** anonymous rejection, cross-user run/mission/attempt access, forged `user_id`, client-supplied score/XP rejection, invalid state transitions, and bounded payload validation.
- **Privacy contract tests:** public mission, attempt, report, and SSE DTOs omit hidden test cases, expected outputs, private rubric fields, code, and other users' data.
- **Grader tests:** use fixture runner results to verify passed-test weighting, compile/runtime/timeout outcomes, malformed output rejection, and that only verified execution results affect technical scores.
- **Model tests:** stub Ollama responses for valid/invalid JSON, timeout, unavailable models, model allowlists, fallback dialogue, prompt-injection-like player text, and checks that generated feedback cannot change numeric scores.
- **Runner integration/security tests:** separately verify network isolation, CPU/memory/time/output limits, filesystem isolation, compiler version pinning, cleanup, and abuse throttling against the actual isolated runner.
- **Frontend tests:** route protection, loading/error/retry and resume states, editor lazy loading, keyboard/accessibility behavior, responsive workspace, SSE loss/reconnect, and report explanation of score dimensions.
- **End-to-end flow:** create account/session, complete a run with deterministic fake models and runner, verify actual execution-derived score, final report, XP and achievement persistence, refresh the browser, and confirm state remains correct.

Keep live Ollama and real runner checks as opt-in integration/load checks; unit and CI behavior should remain stable without model downloads or paid APIs.

## 17. Risks and performance considerations

- **SQLite write contention:** quest attempts, dialogue, and progress add writes. Keep transactions short, use indexes and idempotency constraints, and never hold a write lock during inference or execution. Reassess SQLite if concurrent usage or multiple API workers exceed the current local-first design.
- **Synchronous inference:** model calls can take seconds and the current registry uses blocking HTTP. A bounded worker queue, per-model timeout, queue depth limit, and fallback path are needed to avoid blocking FastAPI and consuming all CPU/RAM.
- **Model memory and latency:** Coder 3B and manager 7B may compete for memory or cause Ollama model swaps. Measure target hardware; route selectively, cap context/output, and avoid invoking both models for every turn. Gemma is optional and cannot replace code grading.
- **Runner availability and abuse:** a runner outage blocks coding missions. Use async attempts, backpressure, rate limits, cancellation/expiry, job cleanup, and a clear retry path. Never compensate by estimating a code score.
- **Mission quality and fairness:** LLM-authored changes may be incoherent or inconsistent. Keep requirements and rubrics authored, versioned, and stable; test mission paths and disclose that simulation performance is not hiring probability.
- **Score interpretation:** semantic similarity and scripted rubrics are imperfect proxies. Explain dimensions and evidence, retain rubric versions, show uncertainty/limitations, and avoid presenting one score as a definitive readiness verdict.
- **Realtime limits:** current SSE is process-local and non-durable. Clients must reconcile from APIs; scale-out requires shared event delivery.
- **Privacy:** transcripts and code can contain personal details. Minimize stored data, set retention limits, and avoid storing full source when a digest plus sanitized result is sufficient.
- **Documentation drift:** existing repo status docs conflict with current source. Keep this architecture tied to implemented code paths and update older status documents when a later implementation phase changes the system of record.

## Recommended implementation order

1. Define and version the Software Engineer mission catalog, scoring rubrics, difficulty levels, XP rules, and privacy/retention policy.
2. Add SQLite schema/repositories, authenticated ownership checks, and the deterministic run state machine.
3. Build the non-code quest flow and final report using authored scenarios and deterministic fallback behavior.
4. Stand up and security-test the isolated execution service; connect the backend adapter and score only actual test results.
5. Add lazy Monaco coding missions and the integrated final boss.
6. Add Ollama role routing for manager/teammate dialogue and qualitative coaching, preserving authored fallbacks and score invariants.
7. Extend SSE notifications, progression/history views, accessibility, performance controls, and production hardening.

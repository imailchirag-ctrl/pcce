# SkillBridge AI repository audit

**Phase:** 1 — independent source audit  
**Reviewed:** 2026-11-13  
**Review type:** read-only source inspection; no application code changed  
**Scope:** database, auth/session code, FastAPI routes, SSE, Next.js API client/proxies, middleware, and the AI entry points used by those routes.

## Repository state and limits

The repository had extensive uncommitted changes when this review began. In particular, `backend/app/db.py`, `backend/app/api/product.py`, and the requested new auth, dependency, realtime, and frontend session files were modified or untracked. These appear to be in-flight implementation work. This report describes the inspected working tree, which may change while Cline continues. No files in that active set were edited.

Findings below are source-review findings unless the verification column says otherwise. Runtime behavior, exploitability, local model availability, and competing concurrent edits have not yet been tested.

## Findings

| ID | Severity | Finding | Evidence | Verification |
|---|---|---|---|---|
| A-01 | High | **Private job details are readable by any signed-in account.** `GET /jobs/{job_id}` fetches jobs without checking publication state or recruiter ownership. A signed-in candidate or another recruiter can retrieve a draft or closed job by ID. The save and apply routes also accept any existing job, regardless of status. | `backend/app/api/product.py:470-507` | Code path confirmed; request test pending. |
| A-02 | High | **Cross-recruiter job status updates report success and return the other recruiter's job.** The SQL update is ownership constrained, but `update_job_status()` then fetches and returns the job unconditionally. The route treats any returned row as a successful update, logs a success event, and returns job details even when no update matched. | `backend/app/db.py:429-437`; `backend/app/api/product.py:425-438` | Code path confirmed; request test pending. |
| A-03 | Medium | **Upload limits are checked after full request data is read.** Resume and audio endpoints call `await file.read()` before comparing the byte count with the 10 MB / 15 MB limit. The legacy base64 resume parser has no encoded-size bound before decoding. Large requests can therefore consume memory well beyond the intended limit. | `backend/app/api/product.py:31-34,208-216,251-254,686-695` | Code path confirmed; memory behavior not measured. |
| A-04 | Medium | **OAuth callback accepts a missing Google `email_verified` claim and upgrades the account to verified.** The callback rejects only an explicit `false`, then sends `email_verified: true` to the backend. The backend also marks an existing matching email verified without checking the payload value. | `src/app/api/auth/google/callback/route.ts:49-67`; `backend/app/api/auth.py:175-205` | Code path confirmed; no external OAuth call made. |
| A-05 | Medium | **State-changing cookie-backed routes have no explicit CSRF/origin check.** Next.js proxy and auth mutation routes use the HttpOnly `SameSite=Lax` session cookie but do not validate `Origin`/`Referer` or a CSRF token. Lax cookies reduce ordinary cross-site POST exposure, but same-site sibling origins remain relevant. | `src/app/api/backend/[...path]/route.ts:12-45`; `src/app/api/auth/profile/route.ts`; `src/app/api/auth/password/route.ts`; `src/app/api/auth/logout/route.ts`; `src/lib/session-constants.ts:15-25` | Source review only; browser-based CSRF test pending. |
| A-06 | Medium | **Identity and ownership relationships are not enforced by foreign keys.** The schema declares no foreign keys from resumes, analyses, sessions, events, saved jobs, applications, or interview records to their owners/parents. Orphan rows and dangling references can be written if a route or migration misses an ownership check. | `backend/app/db.py:24-165`; `connection()` enables SQLite foreign keys at `:279-288` | Schema inspection confirmed; orphan insertion test pending. |
| A-07 | Medium | **Email uniqueness is case-sensitive while lookups are case-insensitive.** `users.email` has a plain `UNIQUE` constraint, while `get_user_by_email()` compares `lower(email)`. Registration does a lookup followed by insert, so case variants can race or exist as distinct rows and make login lookup ambiguous. | `backend/app/db.py:116-141,672-710,727-731`; `backend/app/api/auth.py:94-115` | Code path confirmed; race/duplicate tests pending. |
| A-08 | Medium | **Saved-job toggles are a read-then-write race.** Two concurrent requests can both observe “not saved” and attempt the same insert. The primary key prevents duplicate rows, but one request can fail with an unhandled integrity error instead of returning a stable toggle result. Roadmap item updates also read/modify/write a JSON document and can overwrite a concurrent change. | `backend/app/db.py:541-556,868-886` | Code path confirmed; concurrency test pending. |
| A-09 | Medium | **Authentication has no visible login or registration throttling.** Password verification uses PBKDF2, which is appropriately expensive for storage but makes unrestricted repeated login attempts costly. Registration/login handlers do not enforce rate limits or progressive delays. | `backend/app/api/auth.py:94-126`; `backend/app/security.py:18-36` | Code inspection only. |
| A-10 | Low | **Model status is unauthenticated and reveals local runtime details.** The model status endpoint returns configured/loaded model, hardware/cache, and Ollama availability information without a `current_user` dependency. Health and aggregate public stats are also public, which may be intentional; model status should be explicitly classified as public or protected. | `backend/app/api/product.py:128-148`; `backend/app/ml/model_registry.py:410-480` | Route dependency inspection confirmed. |
| A-11 | Low | **A few DB access patterns scale with candidate/job count.** Saved jobs call `list_saved_jobs()` once per job in a list comprehension. Candidate listing fetches latest analysis and resume separately for every candidate. This produces repeated connections/queries in recruiter views. | `backend/app/api/product.py:462-468`; `backend/app/db.py:889-921` | Static query-path review; timing pending. |
| A-12 | Low | **OAuth callback URL can be derived from the incoming request host.** If `NEXT_PUBLIC_APP_URL` is unset, `googleRedirectUri()` uses `new URL(requestUrl).origin`. This makes correct OAuth behavior depend on proxy/host-header configuration and may produce an untrusted callback origin in a misconfigured deployment. | `src/lib/server/google.ts:1-4,17-23`; `.env.example` should be checked during the secret/config phase. | Source review only. |
| A-13 | Low | **Model failure fallback is not consistently visible to callers.** Resume analysis catches embedding and NLP failures in helpers and may continue with exact aliases or zero similarity; some metadata reports methods, but individual scoring fields can look like ordinary zero scores. Qwen-backed roadmap/interview flows do include provider/fallback metadata. | `backend/app/ml/skill_extractor.py:136-167,175-190,292-298`; `backend/app/ml/resume_analyzer.py:292-365`; `backend/app/ml/roadmap_generator.py:39-70` | Code path review; failure injection pending. |

## Authentication and ownership map

- Backend product routes generally use `Depends(current_user)`; role-specific recruiter operations also call `_require_recruiter()`.
- Resume, analyses, roadmap, events, applications, and interview history are queried by the authenticated user ID.
- Resume deletion includes both `resume_id` and `user_id` in its delete predicate.
- Interview retrieval and completion check that the session belongs to the authenticated user. Interview evaluation checks an existing foreign session before storing an answer, but does not verify that `question_id` belongs to the supplied session.
- Recruiter application status updates constrain the application through a join to jobs owned by the recruiter.
- Job detail, save, and apply routes are the notable publication/ownership gap described in A-01. Job status update has the response/ownership bug in A-02.
- The Next.js middleware checks only whether the cookie exists; the backend session endpoint is the authority that validates it. A stale cookie can pass middleware and then be rejected by API/session handling, so middleware is not an authorization boundary.

## API contract and integration observations

The main frontend/backend paths inspected align: the browser calls `/api/backend/{path}`, the Next.js proxy adds the session bearer token, and the proxy forwards to `/api/v1/{path}`. Auth operations use Next.js `/api/auth/*` handlers, which keep backend bearer tokens in the `HttpOnly` cookie; the normal auth responses return only the user. The SSE endpoint similarly maps `/api/events` to authenticated backend `/api/v1/events`.

FastAPI normalizes validation and HTTP errors to `{ "error": { "code", "message", ... } }`, matching the frontend client's error parser. Resume upload, job match, roadmap generation, interview generation/evaluation, dashboard, notifications, and the principal job operations have matching paths and request field names in the inspected code.

No definite frontend/backend response-shape mismatch was confirmed during Phase 1. Phase 6 will automate the endpoint inventory and check response fields more systematically. The SSE server emits a named `change` event with JSON data, and the frontend listens for `change`; the frontend refreshes after each event and also polls every 25 seconds. Queue overflow drops events, but periodic refresh provides eventual reconciliation. Reconnection currently relies on the browser's native `EventSource` retry behavior and the server's `retry: 3000` directive.

## Database and reliability observations

- `connection()` enables WAL and foreign-key enforcement, but the schema currently declares no foreign keys.
- Resume creation writes the resume and analysis inside a single `connection()` context, and interview creation writes its session and questions in one context. Those paired writes are transactional.
- `init_db()` uses a process-local `_initialized` flag. A test that changes the configured DB path after the first initialization must reset this flag or run in a fresh process; otherwise the new temporary DB may skip schema initialization. Concurrent multi-worker first-time seeding also deserves a test.
- JSON blobs (resume analysis, roadmap) are read/modified/written as whole values. Concurrent roadmap item updates can lose one update.
- SQLite queries use placeholders for values. The few dynamic SQL fragments are generated from fixed column allowlists or placeholder counts; no direct SQL injection path was found in the reviewed code.

## Immediate recommendations

1. Gate job detail/save/apply on published status for candidates, and return `None` from `update_job_status()` when its ownership-constrained update affects zero rows.
2. Stream uploads with a hard byte cap (and bound request bodies); enforce the same decoded-size cap on the base64 endpoint.
3. Require Google `email_verified === true`; pin the OAuth callback origin to an explicit configured URL in deployed environments.
4. Add explicit Origin validation or a CSRF token to cookie-authenticated mutation routes, while retaining `SameSite=Lax`.
5. Plan safe SQLite migrations for case-insensitive unique email and relevant foreign keys, with orphan cleanup/handling before constraints are applied.
6. Replace check-then-insert toggles and JSON read/modify/write updates with atomic SQL or a transaction strategy that serializes writes.
7. Add local-only tests for the high-severity ownership cases before changing their implementation.

## Phase 1 status

The initial read-only audit is documented. Security behavior, automated backend tests, local AI model quality/performance, full API contract comparison, and performance measurements remain unverified and are assigned to the subsequent phases.

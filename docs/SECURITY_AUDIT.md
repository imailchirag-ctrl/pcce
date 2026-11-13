# SkillBridge AI security audit

**Review date:** 2026-11-13  
**Scope:** local code and test database only. No external attack traffic or real account data was used.  
**Test command:** `rtk pytest -q backend/tests`  
**Result:** 15 passed, 4 expected failures (known defects), 3.02 seconds. The audit tests use temporary SQLite databases and synthetic local accounts. The Google provider itself was not contacted.

## Vulnerabilities and verification

### SEC-01 — Private draft and closed jobs can be read or acted on

- **Severity:** High
- **Affected files:** `backend/app/api/product.py:470-507`
- **Issue:** Authenticated users can read any job by ID. The detail handler does not check `status` or ownership. Save and apply also accept jobs that are not published.
- **Local reproduction:** `backend/tests/test_security_and_api.py::test_candidate_cannot_read_draft_job` creates a synthetic `DRAFT` job in the temporary DB and requests it as a different candidate.
- **Verification:** Expected failure (`XFAIL`): the current route returns the job instead of the expected 404. No production data was touched.
- **Recommended fix:** Only expose published jobs to candidates. Permit draft/closed detail only to the owning recruiter. Reject save/apply unless the job is published.

### SEC-02 — Cross-recruiter status update returns another recruiter's job

- **Severity:** High
- **Affected files:** `backend/app/db.py:429-437`; `backend/app/api/product.py:425-438`
- **Issue:** The SQL `UPDATE` is owner constrained, but the helper returns `get_job(job_id)` whether or not a row was updated. The API therefore reports a false success and returns the job row after an ownership miss. A nonpublic draft can be disclosed to another recruiter.
- **Local reproduction:** `backend/tests/test_security_and_api.py::test_recruiter_cannot_read_or_report_success_for_another_recruiters_job` creates two local recruiter accounts and a draft owned by the first, then attempts a status update as the second.
- **Verification:** Expected failure (`XFAIL`): current endpoint returns a successful response. No change to the owner's job status occurs.
- **Recommended fix:** Check `cursor.rowcount` and return `None` on an ownership miss; the route should return 404 without logging/publishing a success event.

### SEC-03 — OAuth bridge marks a matching account verified without checking the claim

- **Severity:** Medium
- **Affected files:** `backend/app/api/auth.py:175-205`; `src/app/api/auth/google/callback/route.ts:49-67`
- **Issue:** The Next callback rejects `email_verified` only when it is explicitly `false`; a missing claim is accepted and the bridge payload hardcodes `true`. Independently, the backend marks an existing matching email verified even when its trusted bridge payload says `email_verified: false`.
- **Local reproduction:** `backend/tests/test_security_and_api.py::test_oauth_bridge_does_not_verify_an_unverified_google_identity` invokes the backend bridge with a synthetic local account, a local test secret, and `email_verified=False`.
- **Verification:** Expected failure (`XFAIL`): the existing local account becomes verified. No Google endpoint was called.
- **Recommended fix:** Require a present, literal `true` email verification claim in the callback and backend bridge. Do not silently verify an existing password account from an unverified identity.

### SEC-04 — No explicit CSRF or Origin check on cookie-backed mutations

- **Severity:** Medium
- **Affected files:** `src/app/api/backend/[...path]/route.ts:12-45`; `src/app/api/auth/profile/route.ts`; `src/app/api/auth/password/route.ts`; `src/app/api/auth/logout/route.ts`
- **Issue:** Mutation routes accept cookie-authenticated requests without validating `Origin`/`Referer` or a CSRF token. The session cookie is `SameSite=Lax`, which blocks many ordinary cross-site POSTs, but does not replace an explicit policy for same-site sibling origins.
- **Local reproduction:** `backend/tests/test_security_and_api.py::test_cookie_mutation_proxy_has_explicit_csrf_guard` checks the mutation proxy source for an explicit guard.
- **Verification:** Expected failure (`XFAIL`), source-level check only. Browser-based CSRF requests were not sent.
- **Recommended fix:** Validate the request origin against a configured same-origin allowlist for state-changing methods, or add a synchronizer/double-submit CSRF token. Cover the Next.js auth routes as well as the generic proxy.

### SEC-05 — Upload data is fully read before endpoint size checks

- **Severity:** Medium
- **Affected files:** `backend/app/api/product.py:208-216,251-254,686-695`
- **Issue:** Resume and audio handlers call `await file.read()` before applying their byte limits. The base64 parser decodes an unbounded request field before the document parser rejects decoded content over 10 MB. The existing limits reject oversized content but do not bound peak request memory.
- **Local reproduction:** `backend/tests/test_security_and_api.py::test_upload_and_base64_resume_parse_validate_filename_and_size` verifies supported text upload, path sanitization, unsupported extension rejection, and a >10 MB upload at the endpoint function boundary using an in-memory spool.
- **Verification:** Small upload passed; traversal-style filename was reduced to `synthetic.txt`; unsupported `.exe` returned 422; >10 MB resume returned 413. Peak memory and multipart body handling were not measured.
- **Recommended fix:** Enforce a request/body cap and read in bounded chunks; apply an encoded length bound before base64 decode; keep parser-level limits as defense in depth.

### SEC-06 — Database does not declare ownership/parent foreign keys

- **Severity:** Medium
- **Affected file:** `backend/app/db.py:24-165`
- **Issue:** The connection turns SQLite foreign-key enforcement on, but the schema declares no foreign keys for user-owned rows and child records. Application-level checks currently cover many paths, but DB integrity does not protect against future omissions or dangling references.
- **Reproduction:** Inspect `SCHEMA`; it contains no `REFERENCES` or `FOREIGN KEY` clause. No orphan row was written to the development DB.
- **Verification:** Schema inspection only; migration behavior and existing orphan counts were not tested.
- **Recommended fix:** Add foreign keys and indexes through a safe migration after checking/cleaning existing local data. Use cascade behavior only where deletion semantics are intended.

### SEC-07 — Email uniqueness is not normalized at the database layer

- **Severity:** Medium
- **Affected files:** `backend/app/db.py:116-141,672-710,727-731`; `backend/app/api/auth.py:94-115`
- **Issue:** `users.email` is `UNIQUE` with default binary collation, while application lookup is case-insensitive. The pre-insert existence check and insert are separate operations, so concurrent case variants can bypass application-level uniqueness and create ambiguous login lookup results.
- **Reproduction:** Source review of the schema and registration sequence. Sequential case-insensitive registration is currently rejected by the lookup; the concurrency race was not induced.
- **Verification:** Code path confirmed; concurrent race not tested.
- **Recommended fix:** Normalize before insert and add a case-insensitive unique index (with a migration that resolves existing collisions); handle integrity errors as a duplicate account response.

### SEC-08 — No visible throttling for password login or registration

- **Severity:** Medium
- **Affected files:** `backend/app/api/auth.py:94-126`; `backend/app/security.py:18-36`
- **Issue:** Login and registration do not rate-limit attempts. The PBKDF2 password verifier intentionally costs CPU, but repeated guesses can consume the same resource without a request limit.
- **Reproduction:** Handler inspection; no brute-force traffic was generated.
- **Verification:** No rate-limit middleware or handler logic found in the reviewed path.
- **Recommended fix:** Add per-IP and per-account attempt limits, generic failure responses, and monitoring appropriate to the deployment. Avoid introducing persistent lockout that enables account denial of service.

### SEC-09 — Model status is public

- **Severity:** Low
- **Affected file:** `backend/app/api/product.py:145-148`
- **Issue:** `/models/status` has no authentication dependency and returns loaded model/runtime details and Ollama availability. This is an information disclosure concern if the API is exposed beyond localhost.
- **Reproduction:** Route has no `Depends(current_user)`; not queried through a production service.
- **Verification:** Code inspection confirmed.
- **Recommended fix:** Protect the route outside local development or document it as intentionally public and ensure the backend is not exposed to untrusted networks.

### SEC-10 — OAuth callback origin relies on request host when app URL is unset

- **Severity:** Low
- **Affected file:** `src/lib/server/google.ts:1-4,17-23`
- **Issue:** `googleRedirectUri()` falls back to the incoming request origin if `NEXT_PUBLIC_APP_URL` is absent. A reverse proxy or host-header misconfiguration can produce a callback URL outside the intended canonical origin.
- **Reproduction:** Source inspection; no Google authorization was initiated.
- **Verification:** Code path confirmed; deployment configuration was not verified.
- **Recommended fix:** Require a canonical configured app URL when Google OAuth is enabled and validate proxy host configuration.

## Controls that passed local verification

- **Password storage:** PBKDF2-HMAC-SHA256 with 320,000 iterations and a random salt; correct password verifies and incorrect/empty stored hash fails. Test: `test_password_hashing_and_opaque_session_token`.
- **Session tokens:** Random opaque tokens are stored as SHA-256 digests. Test: `test_session_table_stores_only_token_digest`.
- **Session expiration and logout:** Expired sessions return 401; logout deletes the stored digest so the same bearer token no longer authenticates. Tests: `test_session_expiration_is_enforced_with_temporary_database`, `test_register_login_invalid_credentials_and_logout`.
- **Cookie configuration:** Source contract sets `HttpOnly`, `SameSite=Lax`, `Secure` in production, path `/`, and 30-day max age. Test: `test_frontend_cookie_and_oauth_state_contracts_are_present`. The Next.js route was not run in a browser.
- **OAuth state:** Start route creates a random state, stores it in an HttpOnly cookie, and callback requires code/state/cookie equality. Static source contract passed; provider token exchange and callback were not run.
- **SQL injection:** Search payload `\' OR 1=1 --` is treated as a bound `LIKE` value and returns no candidates. Test: `test_sql_injection_payload_is_treated_as_data`.
- **User isolation:** A second local account cannot see/delete the first account's resume. Test: `test_unauthorized_resource_access_and_user_data_isolation`.
- **Unauthorized access:** Resume latest and SSE return 401 without a bearer token. Tests: `test_unauthorized_resource_access_and_user_data_isolation`, `test_sse_requires_authentication_and_closes_subscriber`.
- **File validation/path traversal:** Supported `.txt` uploads parse; `.exe` is rejected; a traversal-style filename is stored as a safe basename; oversized resume input returns 413. Test: `test_upload_and_base64_resume_parse_validate_filename_and_size`.
- **Sensitive logging:** Invalid-login capture did not contain the synthetic email or password. Test: `test_register_login_invalid_credentials_and_logout`. This does not prove that all future exception messages are free of sensitive data.
- **Tracked secret exposure:** No actual `.env`/`.env.local` file is tracked; local `.env` files are ignored. A high-confidence scan of tracked files found no common API-key/private-key signatures. Ignored local environment files were not read, and this scan cannot prove secrets are absent from every possible format.

## Overall security status

**Partially verified.** Password hashing, session digest storage/expiry/logout, bearer authorization, resume ownership, SQL parameterization, cookie flags, OAuth state comparison, and basic upload validation passed the local tests or source checks. Four expected-failure tests reproduce defects in CSRF controls, job visibility, recruiter job ownership response handling, and OAuth verification. Upload memory bounds, foreign-key integrity, login throttling, live Google callback exchange, and browser cookie behavior remain unverified or incomplete.

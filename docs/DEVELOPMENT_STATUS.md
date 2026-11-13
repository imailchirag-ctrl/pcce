# Development Status

**Current scope:** Frontend and service-layer demonstration sprint following Module 1. The original `JobSeeker/` application remains preserved.

## Implemented

- Responsive SkillBridge landing page and candidate/recruiter workspaces in the existing Next.js App Router project.
- Demo sign-up, login, role selection, forgot-password, and profile setup UI. Demo profile and selected workflow state are browser-local; there is no real identity verification.
- Candidate overview, resume upload interaction, career comparison UI, learning roadmap, course filters, quiz interaction, mock interview flow/report, job search, saved jobs, application tracking, and analytics charts.
- Recruiter overview, sample job management, candidate search/filter/profile, shortlisting, and sample pipeline.
- Shared UI primitives, responsive shell, charts, badges, progress, empty states, and toast notifications.
- Central mock data and localStorage service boundary in `src/lib/mock-data.ts` and `src/lib/mock-service.ts`.
- FastAPI deterministic endpoints for resume document text extraction (PDF/DOCX/TXT when optional parsers are installed), skill analysis, explainable readiness, roadmap suggestions, interview questions/evaluation, model status, and job matching.
- Prisma schema includes identity/profile, resume, skill, career, learning, interview, job, saved-job, and application entities. Schema validates; no migration has been applied.

## Demo-only or not connected

- Frontend authentication, candidate/recruiter profiles, uploaded resume state, jobs, applications, course progress, and recruiter pipeline do not use the database. Frontend flows use explicit sample content and local browser state.
- The resume screen simulates upload progress and uses illustrative extracted details. It does not send the selected file to FastAPI.
- FastAPI endpoints are not wired to frontend screens and do not persist records. No auth/session authorization, recruiter CRUD, application CRUD, or database-backed candidate search is implemented.
- Skill match, readiness, and interview feedback are deterministic heuristics. Their responses say they are not hiring probabilities or model evaluations.
- Ollama is an optional interview-question provider only when `OLLAMA_BASE_URL` is set and reachable; otherwise question generation returns labeled templates. No Ollama request was verified in this environment.
- BGE, MiniLM, Hugging Face, spaCy language models, and Qwen weights are not downloaded or loaded. Model status reports no loaded weights. Do not treat demo outputs as AI-generated.

## Database and service status

- Prisma schema and client generation are prepared. `DATABASE_URL` is not configured and no database connection or migration was run.
- FastAPI routes are implemented, but runtime import/API checks require installing `backend/requirements.txt`; FastAPI was not installed in the environment.
- PDF/DOCX parser dependencies are declared, but the FastAPI requirements have not been installed. TXT parser and deterministic Python modules pass bytecode compilation.
- The Next.js `/api/health` scaffold remains in place. The legacy Express/Gemini service remains unchanged under `JobSeeker/`.

## Verification

See [`IMPLEMENTATION_REPORT.md`](IMPLEMENTATION_REPORT.md) for current typecheck, lint, build, schema, and Python checks. A real database, live model, and external recruiter/job provider were not available.

# SkillBridge AI Architecture

## Purpose and scope

This document records the existing repository baseline and the target architecture for the PS-30 SkillBridge AI career readiness platform. Module 1 creates the application and service boundaries, developer tooling, health checks, and an initial relational schema. It does not migrate product workflows, connect a live database, configure sign-in, or download AI models.

## Repository baseline

The repository began as a static web application under `JobSeeker/`, with a small Express server inside `JobSeeker/backend/`. There was no root package manifest, TypeScript setup, relational database, Prisma schema, or Python service. Git was on `main` tracking `origin/main` with a clean working tree when inspection began.

| Area | Existing implementation | Reuse / migration direction |
| --- | --- | --- |
| Frontend | HTML pages, one shared CSS file, and browser JavaScript | Keep runnable as a legacy demo while workflows move incrementally into `src/app` and `src/features` |
| UI and styles | SkillBridge colors, navigation, cards, progress rings, forms, responsive sidebar, toasts | Use as product and interaction reference; rebuild shared primitives in React and Tailwind |
| API | Express routes and a thin Gemini REST client | Keep operational in the legacy app; move application endpoints to Next.js and AI/document work to FastAPI |
| Persistence | Browser `localStorage` | Replace with Supabase PostgreSQL through Prisma after authentication and data ownership are designed |
| Authentication | Client-side signup/login and SHA-256 password digest in `localStorage` | Demo-only; replace with a server-verified identity provider and authorization checks |
| Jobs and courses | Hard-coded sample jobs and generated third-party course search links | Preserve as demo data until live integrations and provenance are specified |
| AI | Gemini API, configured with server-only `GEMINI_API_KEY` | Retain as a legacy provider during transition; target local Ollama/Qwen and Python ML services |

### Existing pages and reusable behavior

- `index.html`: marketing landing page and capability overview.
- `signup.html`, `login.html`: browser-only demo account flow.
- `dashboard.html`: readiness score, role skill coverage, journey steps, and recent interview list.
- `resume.html`: text upload/build/preview and save-to-localStorage flow.
- `career.html`: deterministic skill matching plus AI career insights and roadmap.
- `education.html`: free/paid course search links derived from missing skills.
- `interview.html`: voice interview experience using browser speech APIs, an offline question/evaluation path, and Gemini endpoints when available.
- `jobs.html`: readiness-gated sample listing cards; the “Apply” action is a placeholder toast.
- `css/style.css`: visual tokens and shared responsive components.
- `js/data.js`: sample roles, skill aliases, course links, sample jobs, and offline question bank.
- `js/app.js` and `js/interview.js`: shared browser storage, skill analysis, navigation, voice capture, scoring, and report behavior.

### Existing backend API

The Express service serves the legacy static pages on port `5000` and has these routes:

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Reports service status, whether a Gemini key is configured, and the selected model name |
| `POST /api/interview/questions` | Generate questions for a role and candidate context |
| `POST /api/interview/evaluate` | Score one transcribed spoken answer |
| `POST /api/interview/summary` | Summarize an interview session |
| `POST /api/career/insights` | Generate a career summary and roadmap |
| `POST /api/resume/extract` | Extract text from supported PDF/image payloads using Gemini document input |

The Express dependencies are `express`, `cors`, and `dotenv`. Its rate limit is process-memory and per-IP, CORS is open, and its API does not authenticate users. Resume files are sent to the API as base64 data; the existing upload control accepts PDF, image, or TXT, not DOCX. API keys are read by the server from `JobSeeker/backend/.env` and are not embedded in browser code.

### Gaps and incomplete product work

- Demo users, password digests, resumes, and scores exist only in the current browser's localStorage; there are no real user accounts or shared records.
- Jobs are sample data and applications are not submitted. No recruiter or employer interface exists.
- Course recommendations are search links rather than managed course records or completion tracking.
- Resume extraction is provider-based and limited to PDF/images; there is no PyMuPDF, DOCX, or spaCy pipeline.
- The app has no deployed model service, semantic skill matching, audit trail, database migrations, or persistent interview transcripts.
- The Gemini integration is not the target Ollama/Qwen and Hugging Face stack.

## Target system shape

```text
Browser
  │
  ▼
Next.js App Router (UI, session-aware application APIs, validation)
  ├── Prisma ORM ─── Supabase PostgreSQL
  └── private server-to-server requests ─── FastAPI
                                              ├── document services
                                              └── ML services
                                                  ├── Ollama / Qwen2.5
                                                  ├── Hugging Face Transformers
                                                  └── Sentence Transformers
```

Next.js owns the product UI and application-level APIs. FastAPI owns Python document and ML workloads. PostgreSQL is the system of record; Supabase provides the hosted PostgreSQL platform and can provide identity/storage services when their policies are defined. Prisma is the TypeScript data access layer. Secrets and provider credentials stay on servers.

### Project structure

```text
src/
  app/                         Next.js routes, global layout/styles, route errors
    api/health/route.ts        Web and optional FastAPI health report
  components/
    ui/                        shadcn-compatible shared primitives
    layout/                    shared application shell (next UI module)
    dashboard/                 dashboard-specific visualizations (future)
  features/
    auth/ resume/ career/ education/
    interviews/ jobs/ recruiter/ feature-owned workflows (future)
  hooks/                       shared React hooks
  lib/                         API client, Prisma, class utilities
  types/                       shared TypeScript contracts
backend/
  app/
    api/                       versioned FastAPI routes
    core/                      service settings and configuration
    models/ schemas/            persistence/transport contracts (future)
    services/ ml/ utils/        document, inference, and utility layers (future)
  requirements.txt
prisma/
  schema.prisma                initial PostgreSQL application model
docs/
  ARCHITECTURE.md
  DEVELOPMENT_STATUS.md
JobSeeker/                     preserved legacy HTML/CSS/JS + Express/Gemini demo
```

### Service contracts and failure behavior

- `GET /api/health` (Next.js) returns `status` and service states for the web process, FastAPI, and database configuration. It does not expose connection strings or keys. A configured but unreachable FastAPI service returns HTTP 503 with `status: "degraded"`; an unconfigured optional FastAPI service is reported as `not_configured`.
- `GET /api/v1/health` (FastAPI) returns a minimal service health response. It does not report secrets, model contents, or database credentials.
- The Next.js API client uses same-origin paths, converts network failures and non-2xx responses into a typed `ApiError`, and expects a JSON response.
- FastAPI errors use an `{ "error": { "code", "message", "details?" } }` envelope. Validation details include field paths and error types, not raw submitted values. Unexpected errors are logged server-side and return a generic message.
- Next.js-to-FastAPI calls are server-side. Do not expose `FASTAPI_BASE_URL`, database credentials, or AI credentials through `NEXT_PUBLIC_*` variables.

### Initial data model

`prisma/schema.prisma` lays down profile, resume metadata, career profile, skills, and interview session entities. The `User.id` is a UUID owned by the future Supabase Auth identity. Resume metadata stores a storage key rather than file bytes or extracted resume text. The schema is a starting contract only: it has not been applied to a database, and application code does not query it yet.

Use a Supabase PostgreSQL connection string via `DATABASE_URL`. Database migration commands require a real configured URL; `prisma generate` and `prisma validate` can run without connecting to a database. Define auth, row-level access, retention, and resume storage policies before persisting user documents.

### AI and document pipeline boundary

FastAPI is prepared for the following later modules; these packages/models are intentionally not installed or downloaded in Module 1:

- PDF extraction: PyMuPDF.
- DOCX extraction: `python-docx`.
- Language preprocessing: spaCy with an explicitly selected language package.
- Local generative inference: Ollama serving Qwen2.5; `OLLAMA_BASE_URL` and `OLLAMA_MODEL` are configuration placeholders only.
- Specialized inference and embeddings: Hugging Face Transformers and Sentence Transformers.

Document parsers should be isolated from HTTP routes and validate file type, size, and extraction limits before processing. Inference provider selection should sit behind service interfaces so career and interview features do not depend directly on Ollama or a cloud provider.

## Migration sequence

1. **Foundation (Module 1):** establish Next.js/TypeScript/Tailwind/shadcn conventions, FastAPI health/error contracts, Prisma schema/config, environment examples, and docs. Preserve the demo.
2. **Identity and persistence:** choose Supabase Auth/session handling, authorize server actions/API routes, define storage/retention, apply reviewed Prisma migrations, and move user/profile records.
3. **Resume and skills:** migrate upload and deterministic skill analysis first; add isolated PDF/DOCX parsing and persist versioned analysis results.
4. **Career and education:** port insights and roadmap workflows, then define curated course sources and tracking.
5. **Interview and readiness:** migrate voice UI, scoring contracts, session history, and provider-backed inference with quality evaluation.
6. **Jobs and recruiter:** replace sample listings only after trusted data sources and employer permissions are defined; implement applications and recruiter workflows.
7. **Retire legacy:** only after each existing workflow has a verified replacement and data migration plan.


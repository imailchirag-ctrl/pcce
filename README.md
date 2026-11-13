# SkillBridge AI

SkillBridge AI is a career readiness platform frontend with candidate and recruiter demo workspaces. The current sprint adds interactive Next.js screens, local mock state, deterministic FastAPI service code, and an expanded Prisma schema. It is not yet connected to account authentication, PostgreSQL, or live AI models.

The existing static application and Express service remain available under [`JobSeeker/`](JobSeeker/).

## Run the frontend

Requirements: Node.js 20.9 or newer.

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Use the landing page’s “Explore the demo” action or visit `/dashboard`. Candidate and recruiter records are examples; workflow state is stored in browser localStorage.

## Run the FastAPI service

```sh
python -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
npm run fastapi:dev
```

The service listens at `http://localhost:8000`; API routes are under `/api/v1`. Current routes include `/health`, `/resume/parse`, `/career/analyze`, `/career/compare`, `/learning/roadmap`, `/interviews/questions`, `/interviews/evaluate`, `/jobs/match`, and `/models/status`. No API endpoint is connected to the frontend or a database yet.

Copy `backend/.env.example` to `backend/.env` to configure optional `OLLAMA_BASE_URL` and `OLLAMA_MODEL`. Ollama questions use a deterministic template fallback when the service is not configured or unavailable. No model weights download automatically. BGE/MiniLM environment values only describe model intent; embedding inference is not implemented.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
npm run db:generate
npm run db:validate
```

`DATABASE_URL` is needed before a database connection or migration. No migration has been applied. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DEVELOPMENT_STATUS.md`](docs/DEVELOPMENT_STATUS.md), and [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md).

## Legacy demo

```sh
cd JobSeeker/backend
npm install
npm start
```

It serves the preserved static pages at `http://localhost:5000`.

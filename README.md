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

## Google OAuth Setup

SkillBridge AI supports Google sign-in alongside standard email/password authentication. To enable Google authentication:

1. **Google Cloud Console Setup:**
   - Navigate to the [Google Cloud Console](https://console.cloud.google.com/) and create a project or select an existing one.
   - Go to **APIs & Services** > **OAuth consent screen**. Configure the consent screen with `User support email` and developer contact info. Set the scope to `openid`, `.../auth/userinfo.email`, and `.../auth/userinfo.profile`.
   - Go to **APIs & Services** > **Credentials** > **Create Credentials** > **OAuth client ID**.
   - Choose **Web application** as the application type.
   - Under **Authorized JavaScript origins**, add:
     - `http://localhost:3000` (for local development)
     - `https://yourdomain.com` (for production)
   - Under **Authorized redirect URIs**, add:
     - `http://localhost:3000/api/auth/callback/google`
     - `http://localhost:3000/api/auth/google/callback`
   - Click **Create** and copy the Client ID and Client Secret.

2. **Environment Variables Configuration:**
   Add the following variables to your root `.env` file (see `.env.example`):
   ```env
   GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   INTERNAL_API_SECRET=your_internal_secret_here # Must match INTERNAL_API_SECRET in backend/.env
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
   *Note: Never commit real credentials or secrets to version control.*

3. **Account Linking & New User Flow:**
   - Existing accounts with matching verified email addresses are automatically linked without duplicate accounts.
   - First-time Google sign-ins are routed to `/auth/role` to select candidate or recruiter workspaces, then guided through onboarding.
   - Returning authenticated users proceed directly to `/dashboard` (or `/recruiter` for recruiter accounts).

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

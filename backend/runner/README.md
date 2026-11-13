# Career Quest isolated runner

Career Quest never executes player code inside FastAPI. It sends submissions to
this small Judge0-compatible service, which runs each submission in a fresh
Docker container:

- no network access
- read-only container root filesystem
- a read-only mount of only the temporary source directory
- unprivileged user, no-new-privileges, 64 process limit
- 128 MB memory, 0.5 CPU, 8 second wall-clock limit

## Start it

Docker must be running and the `python:3.12-slim` image must be available
(`docker pull python:3.12-slim` if needed).

```bash
python3 backend/runner/service.py
# or
npm run career-quest:runner
```

Then point the backend at it (already set in `backend/.env` for local use):

```dotenv
CAREER_QUEST_RUNNER_URL=http://127.0.0.1:2358
# Optional: set the same value in the runner process to require X-Auth-Token.
CAREER_QUEST_RUNNER_TOKEN=
```

Check readiness:

```bash
curl http://127.0.0.1:2358/health
```

The service listens on `127.0.0.1` only. It is intentionally separate from
FastAPI and must not be exposed to the public internet.

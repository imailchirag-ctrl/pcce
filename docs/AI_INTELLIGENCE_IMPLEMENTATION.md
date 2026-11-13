# AI Intelligence Frontend — Implementation Guide

The AI Intelligence layer connects three screens into one evidence loop:

```
Digital Twin  →  Market Intelligence  →  Skill Exchange
What you can prove   What employers ask     Who can help you close the gap
        ↑                                             │
        └──────────── contributions become evidence ──┘
```

Every screen reads the same backend evidence ledger. Resume mentions are **claims**; assessments, runner-verified work and peer-confirmed contributions can raise a skill to **demonstrated** or **verified**.

---

## 1. Routes and navigation

| Route | Workspace mode | Page component |
| --- | --- | --- |
| `/twin` | `digitalTwin` | `src/components/workspace/pages/digital-twin.tsx` |
| `/market` | `marketIntel` | `src/components/workspace/pages/market-intel.tsx` |
| `/exchange` | `skillExchange` | `src/components/workspace/pages/skill-exchange.tsx` |

Wiring changes:

- `src/app/[...segments]/page.tsx` maps the three paths.
- `src/components/workspace/workspace-page.tsx` adds modes, imports and page-map entries.
- `src/components/layout/app-shell.tsx` adds candidate navigation entries (`BrainCircuit`, `TrendingUp`, `Users`). The command palette derives its “Go to” items from that navigation list.
- `src/lib/workspace-provider.tsx` adds the routes to `WORKSPACE_ROOTS`, so session checks, event refresh and onboarding behaviour run on the new workspace pages.

A shared `LoopStrip` at the top of each page links the three modules and marks the current step.

---

## 2. Shared frontend layer

### `src/features/intelligence/api.ts`

A typed client over the existing `/api/backend/*` proxy. It:

- attaches JSON headers and disables caching;
- converts transport failures into `ApiError` with code `network_error`;
- surfaces backend error messages (including moderation `422` messages);
- exports response types for every screen (`Twin`, `SkillGraph`, `Readiness`, `MarketDashboard`, `RoleRequirements`, `ProjectDetail`, etc.);
- exports `TIER_STYLE`, the single source of truth for tier colours and labels.

### `src/features/intelligence/components.tsx`

Small shared UI helpers:

- `TierChip` — verified / demonstrated / claimed / adjacent / missing;
- `LoopStrip` — three-module navigation;
- `InlineNote` — info, warning, success and error callouts (`role="alert"` for errors);
- `FieldLabel`, `inputClass`, `selectClass`, `splitList` — consistent form controls and comma-separated list parsing.

### `src/features/intelligence/skill-graph.tsx`

React Flow (`@xyflow/react` v12) graph for the Digital Twin:

- custom skill node with tier dot, category and proficiency bar;
- category columns to avoid an unreadable hairball;
- dashed/animated prerequisite edges and faint related edges;
- search dimming, tier/category filters handled by the page;
- `Controls`, `MiniMap`, dotted `Background`;
- client-only dynamic import to keep React Flow out of server rendering.

---

## 3. Digital Twin (`/twin`)

### Data loaded

`GET /twin`, `GET /twin/graph`, `GET /twin/timeline`, `GET /market/roles`, plus an initial `POST /twin/readiness`.

### UI behaviour

- **Summary metrics** — total skills, verified, demonstrated and claimed-only counts.
- **Evidence graph**
  - target-role selector rebuilds the graph via `GET /twin/graph?role=…`;
  - search highlights matching nodes; tier and category filters narrow the graph;
  - clicking a node opens the evidence inspector;
  - missing prerequisites are listed below the graph with the skill they block.
- **Evidence inspector**
  - status, role requirement flag, proficiency, confidence and last demonstrated date;
  - every stored evidence excerpt, its source and tier;
  - source links: Career Quest for assessments, Skill Exchange for team contributions;
  - missing nodes explain whether they are a role requirement or a prerequisite gap.
- **Source coverage** — how many skills come from resume, resume projects, Career Quest, team projects and learning milestones.
- **Readiness check**
  - default question: “Am I ready for an AI Engineer internship?”;
  - verdict (`ready` / `close` / `not_yet`), evidence-weighted alignment ring and explanation;
  - strengths, unverified claims and missing requirements;
  - next steps with prerequisites and curated learning resources;
  - links to the assessment or peer route that can close each gap.
- **Grounded chat**
  - suggested questions, deterministic answer by default;
  - optional “Phrase with local Qwen” checkbox sends `use_llm: true`;
  - displays whether the answer came from deterministic facts or Ollama, plus any rejected-output note.
- **Growth timeline** — snapshots and evidence events, showing added skills, tier upgrades and excerpts.
- **Rebuild** — `POST /twin/rebuild`, then reload graph and timeline.

Empty, loading and API-error states are handled explicitly. With no skills, the page points to resume upload and Career Quest instead of showing a blank graph.

---

## 4. Market Intelligence (`/market`)

### Data loaded

`GET /market/dashboard?scope=…`, `GET /market/roles`, `GET /market/recommendations`, `GET /market/role/{role_key}`.

### UI behaviour

- **Scopes** — Market, Live feeds, Platform jobs, My postings, Sample. Sample data is labelled as demo data.
- **Live refresh** — query input + `POST /market/refresh`. Each provider result is shown as `ok`, `failed` or `cached`, with new-posting counts and failure tooltip. Cached data remains visible when a provider fails.
- **Metrics** — posting count, top skill, entry-level share, source count.
- **Demand**
  - top requested skills, sorted by share of postings;
  - entry-level share and top entry-level skills;
  - skill combinations;
  - role demand;
  - frontier watchlist;
  - demand trend only when `trend.available`; otherwise the backend note is shown.
- **Provenance**
  - source rows grouped by data kind + provider with counts and last retrieval date;
  - links to provider homepages;
  - recent fetch log with status and posting counts;
  - explicit reminder that sample rows are excluded from the market view and pasted JDs are private.
- **Role analysis**
  - role selector loads market requirements or the labelled curated baseline;
  - alignment ring and requirement table: demand share, essential flag, user tier/proficiency or adjacent skill;
  - baseline note explains when market data is too thin.
- **Role recommendations** — score, alignment, market share, missing skills and reasons; each card can jump to the role comparison.
- **Job-description analyzer**
  - title + description (minimum 60 characters);
  - `POST /market/analyze-jd` returns detected taxonomy skills, keywords and a comparison;
  - user tier chips are joined from the comparison rows;
  - privacy note comes from the backend response.
- **Recent postings** — data-kind label, provider, retrieved time, skills and external link. Zero postings produces an actionable empty state.

---

## 5. Skill Exchange (`/exchange`)

The page has five views. No API response exposes email or phone, and the UI never renders contact fields.

### Matches

- match score, level, availability, roles and reasons;
- “can teach you” skills with evidence tiers when the member opts into evidence sharing;
- “you can teach” skills;
- connect request with an optional message;
- block and report actions;
- learning goals and twin-derived gap skills;
- hidden-profile warning with a shortcut to the privacy view.

### Projects

- create form with title, description, project skills and up to several roles with comma-separated skills;
- “My projects” and “Discover by fit” lists showing status, member count, overlap and fit score;
- selecting a project opens its workspace.

### Workspace (`/exchange?project=<id>`)

The `project` query parameter is read from `window.location` inside a client effect, as required.

- project summary, status, owner/member badges and skills;
- owner can close/reopen the project and edit each member’s responsibility;
- milestones can be added with an optional due date and toggled complete;
- TODO / DOING / DONE task board with add-task form (title, taxonomy skills, assignee, milestone);
- moving a task to DONE triggers backend contribution creation when the task has an assignee and recognized skills; the page states that the resulting tier is decided by the twin;
- contributions show peer-confirmed vs self-logged and note that they feed the assignee’s twin;
- non-members can request to join with a role and optional message; pending state is shown;
- candidate peers are listed with covered skills, suggested role and score;
- owner/member can report the project.

### Requests

- incoming peer-connect and project-join requests with accept/decline;
- outgoing requests with status and withdraw;
- accepting a project join updates the project list.

### Profile & privacy

- display name, headline, availability, level;
- teach / learn / tech / interests / preferred roles;
- one-click prefill from Digital Twin suggestions;
- hidden vs members-only visibility;
- `show_evidence` toggle for teaching evidence tiers;
- blocked-member list with unblock;
- privacy summary: no contact details, contact/abuse text rejected at save time, consent required for connections and joins, projects auto-hide after three reports.

### Moderation errors

All exchange mutations route errors through `actionError()`. A `422` is labelled “Moderation check: …” and displayed inline next to the relevant form or action. Transport and other API errors use the same inline treatment.

---

## 6. Running locally

From the repository root:

```bash
# Frontend + FastAPI together
npm run dev:all

# Or separately
npm run fastapi:dev
npm run dev
```

Optional local phrasing for Twin chat:

```bash
ollama serve
```

The chat still works without Ollama; it simply stays on the deterministic answer.

Useful checks:

```bash
cd backend && ../.venv/bin/python -m pytest tests -q
npm run typecheck
npm run build
npx eslint src/features/intelligence src/components/workspace/pages/digital-twin.tsx \
  src/components/workspace/pages/market-intel.tsx \
  src/components/workspace/pages/skill-exchange.tsx
```

---

## 7. Error and edge-case handling

- Loading skeletons for each page.
- Page-level retry states when the initial API call fails.
- Empty states for no skills, no matches, no projects, no requests, no postings, no trend history and no candidates.
- Per-action inline errors; no silent failures.
- Provider failures during market refresh do not erase cached data.
- Hidden/closed projects return the backend’s 404 message in the workspace.
- No email or phone is displayed anywhere in Skill Exchange.

---

## 8. Known limitations

- GitHub evidence is not ingested; code proof currently comes from resume projects, Career Quest and team contributions.
- Mock-interview scores are not written into the evidence ledger, so they do not raise twin tiers.
- There is no moderator UI. Reports are stored and projects auto-hide after three reports pending review, but a human review queue is not implemented.
- Some moderation/report actions use native `window.prompt` / `window.confirm`, which blocks the browser while the handler runs; a proper dialog should replace them.
- There are no automated frontend tests. Verification for this work is typecheck, lint of the new modules and a production build.
- The full repository lint command still reports pre-existing errors in unrelated workspace pages and providers; targeted lint for the new modules is clean.

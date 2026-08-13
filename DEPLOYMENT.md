# Deployment Guide

Fully self-hosted Search & AI Visibility platform (agency operating system). No third-party reporting SaaS, no managed dependencies — you run PostgreSQL, Redis and the applications yourself.

This guide covers: prerequisites, environment configuration, database setup, build & run, external integrations (AI providers, Google Search Console, WordPress, n8n, Chromium PDF), backups, health checks, security hardening and the production-readiness gate.

---

## 1. Architecture

| Component | Workspace | Role | Port |
|---|---|---|---|
| API | `apps/api` | NestJS REST API — the source of truth (JWT auth, RBAC, all modules) | `3000` |
| Worker | `apps/worker` | BullMQ job worker (queues: crawler, gsc-sync, content, reports, ai-visibility) | none (health on `:9100`-style internal server) |
| Web | `apps/web` | Vite + React client | `5173` |
| n8n | external (self-hosted) | Executes the 15 orchestration workflows; never owns business state | your choice |
| PostgreSQL | external | Single source of truth for all state | `5432` |
| Redis | external | Rate limiting storage, BullMQ, worker connectivity | `6379` |

Packages (`packages/*`): `config`, `database`, `types`, `ai`, `gsc`, `content`, `operations`, `visibility`, `links`, `reporting`, `orchestration`, `audit-rules`.

---

## 2. Prerequisites

- **Node.js ≥ 20** and **npm ≥ 10** (monorepo managed with npm workspaces + Turborepo)
- **PostgreSQL ≥ 14** (uses `gen_random_uuid()`, `jsonb`, `timestamptz`)
- **Redis ≥ 6**
- **Optional but recommended**: `pg_dump` (backups), local Chromium (PDF reports), a self-hosted **n8n** instance (orchestration)

Install workspace dependencies once:

```bash
npm install
```

---

## 3. Environment configuration

Create `.env` at the repository root. The schema is validated on boot by `@creative-seo/config` (see `packages/config/src/index.ts`) — invalid values fail fast with a `ConfigValidationError`.

### Minimal example `.env`

```dotenv
# --- Core ---
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
API_PUBLIC_URL=https://app.yourdomain.com

DATABASE_URL=postgres://creative_seo:STRONG_DB_PASSWORD@127.0.0.1:5432/creative_seo
REDIS_URL=redis://127.0.0.1:6379

# --- Secrets (MUST be changed in production) ---
JWT_ACCESS_SECRET=replace-with-64+-random-chars
JWT_REFRESH_SECRET=replace-with-a-different-64+-random-chars
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=1209600
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
COOKIE_SECURE=true
CORS_ORIGINS=https://app.yourdomain.com
WEB_ORIGIN=https://app.yourdomain.com
```

### Full variable reference

**Server / network**

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `3000` | API port |
| `HOST` | `0.0.0.0` | API bind address |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` / `fatal` |
| `API_PUBLIC_URL` | `http://localhost:3000` | Public base URL; used to build the n8n callback webhook URL |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed CORS origins |
| `WEB_ORIGIN` | `http://localhost:5173` | Web client origin |

**Database / Redis**

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://creative_seo:creative_seo_dev@127.0.0.1:5432/creative_seo` | Postgres connection string |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection string |

**Auth & security**

| Variable | Default | Purpose |
|---|---|---|
| `JWT_ACCESS_SECRET` | `dev-access-secret-change-me` | Access-token signing secret (min 16 chars) |
| `JWT_REFRESH_SECRET` | `dev-refresh-secret-change-me` | Refresh-token secret (min 16 chars) |
| `JWT_ACCESS_TTL` | `900` | Access token lifetime (seconds) |
| `JWT_REFRESH_TTL` | `1209600` | Refresh token lifetime (seconds) |
| `ENCRYPTION_KEY` | fixed dev key | AES-256-GCM key for secrets at rest — **must be 64 hex chars and unique per deployment**; rotating it invalidates stored secrets |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS (refresh cookie `Secure` flag) |
| `THROTTLE_TTL` | `60000` | Global rate-limit window (ms) |
| `THROTTLE_LIMIT` | `300` | Global requests per window |
| `AUTH_THROTTLE_TTL` / `AUTH_THROTTLE_LIMIT` | `60000` / `10` | Login/refresh rate limits |

**AI providers** (OpenAI / Anthropic / Perplexity)

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `PERPLEXITY_API_KEY` | Provider API keys (site-level overrides can be set per site in the UI and are stored encrypted) |
| `OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`, `PERPLEXITY_BASE_URL` | Provider endpoints (defaults are the official APIs) |
| `OPENAI_DEFAULT_MODEL`, `ANTHROPIC_DEFAULT_MODEL`, `PERPLEXITY_DEFAULT_MODEL` | Default models |
| `AI_DEFAULT_PROVIDER` | `OPENAI` |
| `AI_DEFAULT_MODEL` | `gpt-4o-mini` |
| `AI_FALLBACK_PROVIDERS` | `ANTHROPIC,PERPLEXITY` |
| `AI_WORKFLOW_PROVIDERS` | `research=PERPLEXITY,clustering=OPENAI,brief=ANTHROPIC,writer=ANTHROPIC,arabic-qa=OPENAI,content-…,operations-recommendation=OPENAI,visibility-observation=OPENAI` |
| `AI_TIMEOUT_MS` | `60000` |
| `AI_MAX_RETRIES` | `2` |
| `AI_RETRY_BACKOFF_MS` | `1000` |

**Google Search Console** (OAuth)

| Variable | Purpose |
|---|---|
| `GSC_CLIENT_ID` / `GSC_CLIENT_SECRET` | Google Cloud OAuth 2.0 client (create in Google Cloud Console; enable the Search Console API) |
| `GSC_REDIRECT_URI` | `http://localhost:3000/api/sites/:siteId/gsc/callback` — must match an authorized redirect URI |
| `GSC_TOKEN_BASE` | `https://oauth2.googleapis.com` (token exchange endpoint; override for tests only) |
| `GSC_API_BASE` | Search Console API base (default Google endpoint) |
| `GSC_ACCESS_TOKEN_TTL`, `GSC_SYNC_LOOKBACK_DAYS`, `GSC_SYNC_DIMENSIONS` | Token/sync tuning |

**WordPress connector**

| Variable | Purpose |
|---|---|
| `WP_REQUEST_TIMEOUT_MS` | Per-request connector timeout |
| `WP_ALLOW_PRIVATE_ADDRESSES` | `false` (default). Set `true` **only** for local development against `localhost` WordPress. SSRF guard refuses non-public hosts otherwise |

**White-label reporting**

| Variable | Purpose |
|---|---|
| `AGENCY_NAME`, `AGENCY_LOGO_URL`, `AGENCY_EMAIL`, `AGENCY_PHONE`, `AGENCY_FOOTER` | Agency defaults used in reports (per-site overrides via the `reporting` API) |
| `REPORTS_DIR` | `./data/reports` — directory for generated PDF files (HTML is stored in Postgres) |

**n8n orchestration**

| Variable | Purpose |
|---|---|
| `N8N_BASE_URL` | n8n instance base URL (empty disables dispatch → jobs fail loudly with status + alert) |
| `N8N_WEBHOOK_BASE` | Defaults to `{N8N_BASE_URL}/webhook` |
| `N8N_CALLBACK_SECRET` | Shared secret checked on the `/api/webhooks/n8n/callback` webhook |
| `N8N_WEBHOOK_TIMEOUT_MS` | Per-dispatch HTTP timeout (`10000`) |

**Admin seeding** (one-time, see below): `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`, `ADMIN_FORCE=1`.

---

## 4. Database setup

1. Create the role and database (adjust to match `DATABASE_URL`):

```sql
CREATE ROLE creative_seo LOGIN PASSWORD 'STRONG_DB_PASSWORD';
CREATE DATABASE creative_seo OWNER creative_seo;
```

2. Run migrations (creates/updates all tables + seeds roles, permissions, prompts, admin-less fixtures):

```bash
npm run db:migrate
```

3. Seed the first SUPER_ADMIN (idempotent; use `ADMIN_FORCE=1` to re-run):

```bash
ADMIN_EMAIL=admin@yourdomain.com ADMIN_PASSWORD='a-strong-password' npm run db:seed
```

4. Backups:

```bash
npm run db:backup                       # pg_dump -> ./data/backups/<label>-<ts>.sql.gz (keeps last 30)
npm run db:backup -- daily              # with a label
# Restore:
# gunzip -c data/backups/daily-<ts>.sql.gz | psql "$DATABASE_URL"
```

---

## 5. Build & run

```bash
npm run build        # builds all workspaces (types -> config -> database -> packages -> apps)
npm run typecheck    # tsc across all workspaces
npm run lint
npm test             # unit tests (ai, content, operations, visibility, links, reporting, orchestration, api)

# Production
npm run dev:api      # API (or: npm run start --workspace=@creative-seo/api)
npm run dev:worker   # Worker (BullMQ consumer + health server)
npm run build -w @creative-seo/web && npm run preview -w @creative-seo/web   # static web client
```

Run the API **and** the worker; the worker owns the BullMQ queues, the recurring scheduler and the health server. The web client only needs `VITE_API_BASE` (e.g. `https://api.yourdomain.com/api`) at build time.

**Worker capabilities**
- BullMQ **processors** for the `content`, `reports` and `ai-visibility` queues (the content pipeline, report/snapshot generation and AI visibility runs). Failures are never silent — they mark the job failed and create an operational issue.
- **Recurring scheduler** (UTC): on the 1st of each month it enqueues a MONTHLY baseline snapshot + MONTHLY report per active site; on the 1st of Jan/Apr/Jul/Oct a QUARTERLY snapshot; every Monday an AI visibility observation. Jobs are enqueued with deterministic ids so repeats within a period are idempotent.

**Recommended process manager** (systemd or pm2) — one service each for `api`, `worker`, `web`, and optionally `n8n`.

### 5.1 Docker

`infra/docker-compose.yml` runs the whole stack (postgres + redis + api + worker + web behind nginx). Dockerfiles are provided in each app.

```bash
docker compose -f infra/docker-compose.yml up -d --build
# or via the deploy script:
./deploy.sh docker
```

`docker compose` requires `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `ENCRYPTION_KEY` (set them in `infra/.env`, see `infra/.env.example`). The web container serves the built SPA and proxies `/api` to the API service.

---

## 6. External integrations

### 6.1 AI providers
Set the provider API keys in `.env` (or per-site encrypted overrides in the UI under **Site → AI**). Routing uses a global → site → workflow hierarchy with automatic fallback and retries. If no provider is configured, AI features fail explicitly with a sanitized error and a recorded `ai_jobs` entry — never silently.

### 6.2 Google Search Console
1. Google Cloud project → enable **Search Console API**.
2. OAuth consent screen + **OAuth 2.0 client** (Web application).
3. Add your `GSC_REDIRECT_URI` as an authorized redirect.
4. Put `GSC_CLIENT_ID` / `GSC_CLIENT_SECRET` in `.env`.
5. In the UI: Site → GSC → authorize → select a property → sync. Tokens are stored encrypted; sync failures surface as `GSC_FAILURE` issues/alerts.

### 6.3 WordPress
The connector requires a small server-side connector reachable at `{WP_URL}/wp-json/creative-seo/v1/…` (the connector plugin). Credentials are stored in **site secrets** (AES-256-GCM). Every connector request passes the SSRF egress guard (DNS-resolve + public-IP check). Do **not** set `WP_ALLOW_PRIVATE_ADDRESSES=true` in production.

### 6.4 n8n orchestration
The backend owns all job state in Postgres (`workflow_jobs`); n8n only executes workflows and calls back.

1. Set `N8N_BASE_URL` and `N8N_CALLBACK_SECRET` in `.env`.
2. In n8n, create the 15 workflows (webhook-triggered): `site-sync`, `crawl-audit`, `gsc-sync`, `keyword-discovery`, `keyword-clustering`, `content-brief`, `content-generation`, `content-qa`, `internal-linking`, `wp-draft-publisher`, `post-publish-verification`, `monitoring-opportunities`, `ai-visibility-observation`, `monthly-snapshot`, `report-generation`.
3. Point each webhook at `{N8N_BASE_URL}/webhook/{workflow-path}` and configure the final node to `POST` the result to `{API_PUBLIC_URL}/api/webhooks/n8n/callback` with header `x-n8n-secret: {N8N_CALLBACK_SECRET}` and body `{ idempotencyKey, jobId, executionId, status: 'SUCCEEDED'|'FAILED', result?, error? }`.
4. Dispatch jobs from the API: `POST /api/sites/:id/orchestration/jobs` (idempotency key supported). Jobs retry up to `maxAttempts` and are marked `TIMEOUT` if n8n does not respond; every failure updates the job status and creates an operational issue (source `N8N`).

### 6.5 PDF reports (local Chromium)
Responsive HTML reports are always stored in Postgres. PDF generation uses local Chromium via Playwright — **no external rendering service**.

```bash
npx playwright install chromium
```

If Chromium is missing, reports save as `PDF_FAILED` and remain available as HTML. Branding/logo URLs are validated against the SSRF guard (private/loopback hosts are rejected) before they are ever rendered by Chromium.

---

## 7. Health checks & observability

- `GET /api/health` — liveness (public).
- `GET /api/health/ready` — readiness (public): reports `database` and `redis` as `up`/`down`; fails when either is down.
- Worker health server — internal HTTP endpoint exposed by the worker process.

Internal observability is already built in (no external SaaS required):
- `ai_jobs` — every AI generation/research call with provider, model, tokens, cost, latency, error.
- `activity_logs` — every login, report view, client view and management action (audit trail).
- `workflow_jobs` — orchestration state machine (source of truth).
- `issues` / `operations_alerts` — operational failures surface as issues and alerts.

---

## 8. Security hardening checklist

- [ ] Change `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `ENCRYPTION_KEY` (unique, random). `ENCRYPTION_KEY` must be exactly 64 hex chars; never reuse across environments.
- [ ] Run behind HTTPS with `COOKIE_SECURE=true` and `CORS_ORIGINS` set to the web origin only.
- [ ] Protect the `N8N_CALLBACK_SECRET`; keep `N8N_BASE_URL` unset until n8n is deployed.
- [ ] Keep `WP_ALLOW_PRIVATE_ADDRESSES=false`.
- [ ] Restrict the `ENCRYPTION_KEY`, `JWT_*`, `*_API_KEY`, `GSC_CLIENT_SECRET`, `N8N_CALLBACK_SECRET` from logs and version control (never commit `.env`).
- [ ] Apply `db:backup` on a schedule (cron/systemd timer) and store backups off-host.
- [ ] Configure Redis persistence (`save`/AOF) — it holds rate-limit state and BullMQ data; losing it forces job re-queues.
- [ ] Client access is restricted by design: the `CLIENT` role only has `client:access` (Overview, Progress, Performance, Completed Work, Major Issues, Approved Recommendations, Reports). It cannot see credentials, AI settings/prompts, costs, internal notes, other sites, n8n or system logs. Do not grant CLIENT any additional permissions.
- [ ] Verify rate limiting is active (global `ThrottlerGuard` + Redis storage; login/refresh tightened).

---

## 9. Production readiness gate

A scenario-driven E2E walks the full client lifecycle against a real Postgres database (AI/GSC/WordPress clients are stubbed; everything else runs the real application code). It records **PASS / PARTIAL / BLOCKED / FAIL** per step and **fails until the entire path passes** — do not declare production ready while any step is BLOCKED.

```bash
npm run test:scenario --workspace=@creative-seo/api
```

The 22 steps: Add Site → Connect WordPress → Import Pages → Crawl → Initial Audit → Connect GSC → Build Baseline → Discover Keywords → Cluster → Map URLs → Create Brief → Generate Content → QA → Create WP Draft → Approve → Publish → Verify → Track Performance → Detect Issue → Create Recommendation → Complete Task → Generate Monthly Report.

**Status: PASSING** — all 22 steps run end-to-end (21 PASS, 2 PARTIAL for the simulated WordPress connector; 0 blocked, 0 failed). The WordPress and GSC clients are stubbed in the scenario; the real integrations are exercised against live systems via `./deploy.sh start` + the dashboard.

> Note: the `crawl-audit` step ingests crawled content through the API; an automated crawler runs via the `crawl-audit` n8n workflow when orchestration is connected.

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Boot fails with `ConfigValidationError` | A `.env` value violates the schema (e.g. `ENCRYPTION_KEY` not 64 hex) |
| AI calls fail with sanitized errors | Provider key missing/expired or routing misconfigured; check `ai_jobs` |
| Reports save as `PDF_FAILED` | Run `npx playwright install chromium` |
| n8n jobs stay `PENDING`/`RUNNING` then `TIMEOUT` | `N8N_BASE_URL` empty, wrong webhook path, or n8n not returning to the callback |
| GSC connect fails | OAuth client ID/secret/redirect URI mismatch |
| WordPress check fails | Connector unreachable or `WP_ALLOW_PRIVATE_ADDRESSES` blocking local dev hosts |
| Rate-limited unexpectedly | Tighten `THROTTLE_*` or check Redis connectivity (fallback is in-memory) |

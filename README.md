# Creative SEO — Search & AI Visibility Platform

> Self-hosted multi-site Search & AI Visibility platform. Agency operating system for SEO, AEO, GEO, and AI-powered content.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Web (SPA)  │────▶│  API (Nest)  │────▶│  PostgreSQL  │
│  React + Vite│     │  Port 3000   │     │  Port 5432   │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
                    ┌──────┴───────┐     ┌─────────────┐
                    │   Worker     │────▶│    Redis     │
                    │  BullMQ      │     │  Port 6379   │
                    │  Port 3100   │     └─────────────┘
                    └──────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌──────────┐  ┌──────────┐
         │ OpenAI │  │ Anthropic│  │Perplexity│
         └────────┘  └──────────┘  └──────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router v7, TanStack Query v5, TailwindCSS v4, Radix UI, Vite 6, i18next (EN/AR) |
| Backend | NestJS 11, TypeORM 0.3, class-validator, JWT auth, AES-256-GCM encryption |
| Database | PostgreSQL 16 (pgvector extension), 83 entities, 57 migrations |
| Cache/Queue | Redis 7, BullMQ 5 |
| AI | OpenAI, Anthropic, Perplexity — provider-independent routing with fallback |
| Worker | NestJS + BullMQ — background job processing |
| Reporting | HTML templates + Playwright Chromium for PDF generation |
| Orchestration | n8n integration via webhooks |
| Infrastructure | Docker Compose (5 services), nginx reverse proxy |
| Monorepo | Turborepo, npm workspaces |

## Monorepo Structure

```
creative-seo/
├── apps/
│   ├── api/                 # NestJS REST API (source of truth)
│   ├── web/                 # React SPA dashboard
│   └── worker/              # BullMQ background worker
├── packages/
│   ├── ai/                  # AI provider adapters, routing, prompt registry
│   ├── audit-rules/         # Deterministic SEO audit rule registry
│   ├── automation/          # Recurring platform automation scheduler
│   ├── config/              # Environment validation
│   ├── content/             # Content intelligence pipeline
│   ├── crawler/             # Site crawler with SSRF protection
│   ├── database/            # PostgreSQL entities and migrations
│   ├── decision/            # Decision engine (prioritization)
│   ├── gsc/                 # Google Search Console client
│   ├── infra/               # Redis/BullMQ infrastructure helpers
│   ├── keyword-engine/      # Keyword clustering and opportunity scoring
│   ├── links/               # Internal link intelligence + AEO/GEO audits
│   ├── metrics/             # Canonical GSC metric repository
│   ├── operations/          # Issues, tasks, baselines, alerts
│   ├── orchestration/       # n8n webhook dispatch
│   ├── reporting/           # HTML/PDF report generation
│   ├── types/               # Shared types, enums, roles, permissions
│   └── visibility/          # AI visibility observation engine
├── infra/                   # Docker Compose, nginx config
├── wp-plugins/              # WordPress connector plugin
├── deploy.sh                # Production deployment script
└── turbo.json               # Turborepo pipeline config
```

## Prerequisites

- Node.js >= 20
- npm >= 10
- PostgreSQL 16
- Redis 7
- Playwright + Chromium (for PDF reports)

## Quick Start

```bash
# Clone and install
git clone <repo-url> && cd creative-seo
cp .env.example .env        # edit with your credentials
npm install

# Start databases (Docker)
cd infra && docker compose up -d postgres redis && cd ..

# Run migrations and seed admin
npm run db:migrate
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=changeme npm run db:seed

# Install Chromium for reports
npx playwright install chromium

# Start development servers
npm run dev
```

The API runs on `http://localhost:3000`, the web dashboard on `http://localhost:5173`.

## Production Deployment

### Using deploy.sh

```bash
./deploy.sh doctor          # verify prerequisites
./deploy.sh full            # install -> build -> migrate -> start
./deploy.sh status          # check health
./deploy.sh backup my-label # pg_dump backup
```

### Using Docker

```bash
cd infra
cp .env.example .env        # edit credentials
docker compose up -d --build
```

Services: PostgreSQL, Redis, API (3000), Worker (3100), Web via nginx (8080).

### Server Deploy

```bash
ssh root@<server>
cd ~/creatice-seo
git pull && rm -rf .turbo
./deploy.sh build && ./deploy.sh migrate && ./deploy.sh restart
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development` or `production` |
| `PORT` | `3000` | API listen port |
| `HOST` | `0.0.0.0` | API listen host |
| `WORKER_PORT` | `3100` | Worker health port |
| `DATABASE_URL` | `postgres://creative_seo:creative_seo_dev@127.0.0.1:5432/creative_seo` | PostgreSQL connection |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection |
| `JWT_ACCESS_SECRET` | — | JWT signing secret (required) |
| `JWT_REFRESH_SECRET` | — | Refresh token secret (required) |
| `ENCRYPTION_KEY` | — | 64 hex chars (32 bytes) for AES-256-GCM (required) |
| `CORS_ORIGINS` | — | Comma-separated allowed origins |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `PERPLEXITY_API_KEY` | — | Perplexity API key |
| `AI_DEFAULT_PROVIDER` | `OPENAI` | Default AI provider |
| `AI_DEFAULT_MODEL` | — | Default model override |
| `AI_FALLBACK_PROVIDERS` | — | Comma-separated fallback chain |
| `GSC_CLIENT_ID` | — | Google Search Console OAuth client ID |
| `GSC_CLIENT_SECRET` | — | Google Search Console OAuth client secret |
| `GSC_REDIRECT_URI` | — | OAuth callback URL |
| `N8N_BASE_URL` | — | n8n instance URL |
| `N8N_WEBHOOK_BASE` | — | n8n webhook base path |
| `N8N_CALLBACK_SECRET` | — | n8n callback shared secret |
| `ADMIN_EMAIL` | — | Bootstrap admin email (seeded on first run) |
| `ADMIN_PASSWORD` | — | Bootstrap admin password |
| `ADMIN_FULL_NAME` | — | Bootstrap admin display name |

AI provider keys can also be managed through the UI at `/settings` (application-managed credentials stored encrypted in the database). Environment variables serve as fallback.

## Database

**83 entities** across 14 domain groups:

| Domain | Entities |
|--------|----------|
| Auth & Access | User, Role, Permission, RefreshToken, SiteMembership |
| Sites | Site, Organization, SiteSecret, SiteAutomationSettings, SiteActivationStep |
| Integrations | WordPressIntegration, WordPressPost, GoogleAdsIntegration, GscToken, GscProperty, GscSyncState |
| GSC Metrics | GscSiteDailyMetric, GscPageDailyMetric, GscQueryDailyMetric, GscQueryPageDailyMetric, GscOpportunity, GscCanonicalMetrics |
| Keywords | Keyword, KeywordMetric, KeywordSource, KeywordOpportunity, KeywordPlannerMetric, KeywordDiscoveryJob, Cluster, ClusterKeyword, CannibalizationCase, UrlMapping |
| Content | ContentPackage, ContentPublication |
| AI | AiJob, AiPrompt, AiProviderConfig, AiProviderCapability, AiCrawlerRegistry, GlobalAiProviderCredential |
| AI Visibility | AiVisibilityRun, AiVisibilityPrompt, AiVisibilityPromptSet(V2), AiVisibilityObservation(V2), AiVisibilityCompetitor, AiVisibilityBudget, AiVisibilitySnapshot, AiVisibilitySourceProvenance, AiVisibilityBaseline |
| Crawling | CrawlRun, CrawlPage, CrawledPage, CrawlLink, CrawlError, CrawlerPolicyResult |
| Auditing | AuditRun, AuditResult, LighthouseRun, LinkAnalysis, LinkSuggestion, AeoPageAudit, GeoPageAudit, PageEntity, PageQuestion |
| Operations | Issue, Recommendation, OperationsTask, OperationsAlert, ChangeLog, BaselineSnapshot, AutomationRun, WorkflowJob |
| Decision Engine | DecisionRecommendation, DecisionRecommendationOutcome, DecisionRecommendationDependency, DecisionWorkPackage, DecisionPriorityWeight |
| Monitoring | SiteSnapshot |
| Reporting | Report, ReportBranding |
| Knowledge | KnowledgeFact, FactEvidence |
| Work Queue | WorkItemState, WorkFilter |
| Activity | ActivityLog |
| Entity Relations | EntityRelation |

**57 migrations** (0001 through 0057). Run with:

```bash
npm run db:migrate
```

## API Reference

All routes prefixed with `/api`. Authentication via JWT Bearer token or HTTP-only cookie.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login (returns JWT) |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Current user profile |

### Sites

| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| GET | `/api/sites` | `sites:read` | List sites |
| POST | `/api/sites` | `sites:create` | Create site |
| GET | `/api/sites/:id` | `sites:read` | Get site |
| PATCH | `/api/sites/:id` | `sites:update` | Update site (name, status, locale, etc.) |
| DELETE | `/api/sites/:id` | `sites:delete` | Archive site (soft) |
| POST | `/api/sites/:id/purge` | `sites:purge` | Permanently delete site and all data |

### AI

| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| GET | `/api/ai/providers` | `ai:manage` | List global AI provider statuses |
| PUT | `/api/ai/providers/:provider` | `ai:manage` | Update provider credentials/config |
| POST | `/api/ai/providers/:provider/test` | `ai:manage` | Test provider connection |
| POST | `/api/ai/providers/:provider/disconnect` | `ai:manage` | Disconnect provider |
| GET | `/api/ai/health` | `ai:read` | Provider health check |
| GET | `/api/ai/prompts` | `ai:read` | List prompt registry |
| POST | `/api/ai/prompts` | `ai:manage` | Register new prompt |
| POST | `/api/ai/prompts/:name/activate` | `ai:manage` | Activate prompt version |
| GET | `/api/sites/:id/ai/config` | `ai:read` | Get site AI config |
| PUT | `/api/sites/:id/ai/config` | `ai:manage` | Update site AI config |
| POST | `/api/sites/:id/ai/generate` | `ai:manage` | Run AI generation |

### Integrations

| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| POST | `/api/sites/:id/wordpress/check` | `wordpress:manage` | Check WordPress connection |
| POST | `/api/sites/:id/wordpress/sync` | `wordpress:manage` | Sync WordPress posts |
| DELETE | `/api/sites/:id/wordpress` | `wordpress:manage` | Disconnect WordPress |
| GET | `/api/sites/:id/gsc/authorize-url` | `gsc:manage` | Get GSC OAuth URL |
| POST | `/api/sites/:id/gsc/tokens` | `gsc:manage` | Register OAuth tokens |
| POST | `/api/sites/:id/gsc/sync` | `gsc:manage` | Sync GSC data |
| DELETE | `/api/sites/:id/gsc` | `gsc:manage` | Disconnect GSC (preserves history) |
| POST | `/api/sites/:id/google-ads/configure` | `keywords:manage` | Configure Google Ads |
| POST | `/api/sites/:id/google-ads/test` | `keywords:manage` | Test Google Ads connection |

### SEO / Auditing

| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| POST | `/api/sites/:id/audit` | `operations:manage` | Run full SEO audit |
| GET | `/api/sites/:id/audit/summary` | `operations:read` | Audit overview |
| POST | `/api/sites/:id/links/analyses` | `links:manage` | Run link analysis |
| POST | `/api/sites/:id/audits/aeo` | `operations:manage` | Run AEO audit |
| POST | `/api/sites/:id/audits/geo` | `operations:manage` | Run GEO audit |
| POST | `/api/sites/:id/baseline` | `operations:manage` | Capture baseline snapshot |

### Content

| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| POST | `/api/sites/:id/content/pipeline` | `content:manage` | Run content pipeline |
| GET | `/api/sites/:id/content/packages` | `content:read` | List content packages |
| POST | `/api/sites/:id/content/packages/:id/publish` | `content:manage` | Create WP draft |

### Keywords

| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| POST | `/api/sites/:id/keywords/pipeline` | `keywords:manage` | Run keyword pipeline |
| GET | `/api/sites/:id/keywords` | `keywords:read` | List keywords |
| GET | `/api/sites/:id/keywords/clusters` | `keywords:read` | List keyword clusters |

### Operations

| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| GET | `/api/sites/:id/operations/issues` | `operations:read` | List issues |
| GET | `/api/sites/:id/operations/tasks` | `operations:read` | List tasks |
| POST | `/api/sites/:id/orchestration/jobs` | `orchestration:manage` | Dispatch n8n job |
| GET | `/api/dashboard` | `sites:read` | Portfolio dashboard |
| GET | `/api/sites/:id/dashboard` | `sites:read` | Site dashboard |

### Visibility

| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| POST | `/api/sites/:id/visibility/runs` | `visibility:manage` | Run AI visibility observation |
| GET | `/api/sites/:id/visibility/runs` | `visibility:read` | List observation runs |
| GET | `/api/sites/:id/visibility/observations` | `visibility:read` | List observations |

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | Public | Liveness check |
| GET | `/api/health/ready` | Public | Readiness (DB + Redis) |

## Frontend

19 routes with RBAC-filtered navigation:

| Route | Page | Description |
|-------|------|-------------|
| `/` | Portfolio | Agency-wide dashboard with cross-site KPIs |
| `/sites` | Sites | Site list with actions (pause, resume, archive, purge) |
| `/sites/new` | Add Site | 3-step site creation wizard |
| `/sites/:id` | Site Detail | Tabbed view: Overview, Audit, Keywords, Content, AEO, GEO, Links, Reports, Crawler, Settings |
| `/clients` | Clients | Organization management |
| `/knowledge` | Knowledge Base | Site knowledge facts |
| `/wordpress` | WordPress | Cross-site WordPress integrations |
| `/issues` | Issues | Operations issue tracker |
| `/tasks` | Tasks | Operations task tracker |
| `/monitoring` | Monitoring | Baselines, alerts, page performance |
| `/work` | Work Queue | Agency-wide work triage |
| `/content-studio` | Content Studio | Content creation and management |
| `/visibility` | Visibility | AI visibility observations and trends |
| `/reports` | Reports | Report generation and history |
| `/automation` | Automation | Orchestration job management |
| `/settings` | Settings | AI providers, prompt registry, health, security |
| `/client` | Client Portal | Restricted client-facing view |

## AI System

### Provider Routing

Three-layer resolution: **Global** -> **Site Override** -> **Workflow Override**.

```
Global credentials (env vars or /settings UI)
    └─▶ Site-specific key override (optional)
        └─▶ Workflow-specific provider/model (optional)
            └─▶ Fallback chain on failure
```

### Supported Providers

| Provider | Default Model | Capabilities |
|----------|--------------|--------------|
| OpenAI | gpt-4o-mini | Text, structured output, function calling |
| Anthropic | claude-sonnet-4-5 | Text, structured output, long context |
| Perplexity | sonar-pro | Text, web search, citations, source provenance |

### AI Workflows (26 routable workflows)

| Category | Workflows |
|----------|-----------|
| Research | `research`, `clustering`, `brief` |
| Content | `content-evidence`, `content-intent`, `content-aeo`, `content-geo`, `content-gap`, `content-brief`, `content-brief-gate`, `content-outline`, `content-draft`, `content-language` |
| Validation | `content-seo-validator`, `content-aeo-validator`, `content-geo-validator`, `content-rankmath-validator`, `content-factual`, `content-qa` |
| Operations | `operations-recommendation`, `visibility-observation` |
| Auditing | `aeo-page-auditor`, `geo-page-auditor`, `arabic-qa`, `content-links`, `writer` |

Each workflow can be routed to a specific provider/model globally or per-site.

### Orchestration Workflows (15 n8n jobs)

`site-sync`, `crawl-audit`, `gsc-sync`, `keyword-discovery`, `keyword-clustering`, `content-brief`, `content-generation`, `content-qa`, `internal-linking`, `wp-draft-publisher`, `post-publish-verification`, `monitoring-opportunities`, `ai-visibility-observation`, `monthly-snapshot`, `report-generation`

## Content Pipeline

18-stage pipeline for SEO-optimized content creation:

```
research → evidence-extraction → intent-analysis → aeo-question-map
→ geo-entity-analysis → content-gap-analysis → content-brief
→ brief-gate → outline → draft → language-editor
→ seo-validator → aeo-validator → geo-validator
→ rankmath-validator → factual-validator → internal-link-planning
→ final-qa
```

Each stage is independently testable and produces typed output for downstream consumers.

## Security

- **Authentication**: JWT with HTTP-only refresh tokens, 15-minute access / 14-day refresh TTLs
- **Authorization**: 46 permissions across 14 modules, 7 roles (SUPER_ADMIN through CLIENT)
- **Encryption**: AES-256-GCM for all stored credentials (API keys, OAuth tokens, WordPress passwords)
- **Site Access**: Multi-tenant guard ensures users can only access their organization's sites
- **Rate Limiting**: Global 300 req/min, auth endpoints 10 req/min
- **SSRF Protection**: IP validation blocks private/loopback addresses for external requests
- **Input Validation**: NestJS ValidationPipe with whitelist and transform
- **Credentials**: Never returned to the browser, never logged

### Roles

| Role | Access Level |
|------|-------------|
| `SUPER_ADMIN` | All permissions including role management and site purge |
| `ADMIN` | All permissions except role management and site purge |
| `SEO_MANAGER` | Sites, integrations, keywords, automation, work queue |
| `CONTENT_MANAGER` | Read-heavy with site updates and content |
| `EDITOR` | Read-only with content production |
| `VIEWER` | Read-only access |
| `CLIENT` | Restricted client portal (organization and site read-only) |

## Integrations

### WordPress

- Application Password authentication
- Connection health check (WordPress, Connector plugin, Rank Math)
- Post import and sync
- Draft publishing and verification
- Rollback support

### Google Search Console

- OAuth 2.0 flow (authorize -> callback -> token exchange)
- Property selection
- Incremental data sync (site, page, query, query-page daily metrics)
- Opportunity detection
- Historical data preserved on disconnect

### Google Ads

- Direct credential configuration (developer token + OAuth)
- Keyword Planner integration
- Customer ID, language, and location targeting

### n8n Orchestration

- Webhook-based job dispatch
- Callback secret authentication
- Idempotency keys and retry logic
- Timeout and failure alerting

## Testing

```bash
npm run test          # all packages
npm run test:unit     # unit tests only
npm run test:e2e      # end-to-end tests
npm run lint          # eslint across all packages
npm run typecheck     # TypeScript strict checks
```

54 test files covering:
- AI routing, encryption, prompt registry, provider capabilities
- Keyword clustering, normalization, deduplication, cannibalization
- Audit rules (SEO technical, on-page, structured data)
- Content pipeline stages
- GSC client, WordPress service
- Security (SSRF protection, AES-256-GCM, secret masking, multi-tenancy)
- Operations (baselines, comparisons, alerts, snapshots)

## Project Statistics

| Metric | Count |
|--------|-------|
| Workspaces | 21 (3 apps + 18 packages) |
| Database entities | 83 |
| Database migrations | 57 |
| API endpoints | 120+ |
| Frontend routes | 19 |
| AI workflows | 26 |
| Orchestration workflows | 15 |
| Permission keys | 46 |
| Roles | 7 |
| Content pipeline stages | 18 |
| Test files | 54 |

## License

Proprietary — All rights reserved.

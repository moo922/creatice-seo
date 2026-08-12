# Search & AI Visibility Platform — Architecture Plan

Version 1.0 · Internal engineering reference. The plan is the contract. Phases are built in order; each phase ships with tests and acceptance criteria before the next starts.

---

## 1. Architecture Assessment

### 1.1 Current State

- Repository is a greenfield monorepo (`creative-seo`), git initialized, zero commits, no tooling.
- No code, no dependencies, no CI, no infrastructure exist yet.
- This document therefore defines the target architecture from first principles.

### 1.2 Requirements Summary (non-negotiable)

| Area | Requirement |
|---|---|
| Core purpose | Internal agency OS for SEO / AEO / GEO across many client sites. **Not** an article generator. |
| Self-hosting | All core processing local. No paid SEO SaaS. |
| Forbidden | Ahrefs, Semrush, SurferSEO, DataForSEO, SerpAPI, external rank tracking, external crawler SaaS, Make, Zapier, n8n Cloud, external reporting SaaS. |
| Allowed external | GSC API, Google Ads API, GA4 Data API (optional), WordPress REST API, user-configured AI providers (OpenAI / Anthropic / Perplexity). |
| Stack | React + TS + Vite + Tailwind + shadcn/ui + TanStack Query; NestJS + TS + REST; PostgreSQL (+pgvector optional); Redis + BullMQ; self-hosted n8n CE; Node HTTP crawler + Cheerio + Playwright (DOM only); local Lighthouse CLI; HTML-to-PDF via Playwright/Chromium; WordPress + Rank Math (no Yoast). |
| State ownership | Main app + PostgreSQL own **all** persistent state. n8n is an orchestration worker only. App must remain usable if n8n is down. |
| Multi-site | `site_id` on every relevant entity. One system, 1..100+ sites, no per-site clones. |
| Fact integrity | AI never invents business facts. Per-site verified knowledge base; claims tagged VERIFIED_FACT / INFERENCE / UNVERIFIED / EXTERNAL_SOURCE. Unverified claims are never published as fact. |
| AEO | Answer-first evaluation: intent, direct answers, question coverage, structure, evidence. Not keyword stuffing. |
| GEO | Observed AI-visibility measurements (mention/citation rate, brand inclusion, cited URLs, provider/model/timestamp). No invented AI rankings; an LLM API test is an observation, never a "ChatGPT ranking". |
| Security | Keys never reach the frontend; credentials encrypted at rest; RBAC; audit logs; SSRF protection; rate limits; job timeouts; crawl concurrency limits; robots policy honored per configured audit policy. |
| Engineering | Strict TS, migrations, DTO validation, service/repository separation, typed responses, structured logging, idempotent jobs, retries with backoff, transactional writes, unit/integration/E2E tests. No mocks in production paths. Unsupported capabilities are explicitly marked unsupported — never fabricated. |

### 1.3 Key Architectural Decisions

1. **Monorepo, npm workspaces.** `apps/api` (NestJS), `apps/web` (React), `packages/*` (pure, framework-agnostic engines: crawler, analyzers, keyword, content, AI SDK, reports, internal links), `infra/` (compose, nginx, n8n), `docs/`.
2. **Backend owns all state.** Every write path persists through the API to PostgreSQL. BullMQ queues the work. n8n (when available) executes orchestration flows and reports back; the API records outcomes. If n8n is unreachable, jobs continue to be queued and critical workers (crawler, GSC sync, content pipeline) run as native BullMQ processors.
3. **TypeORM + migrations** for PostgreSQL (NestJS-idiomatic repository separation; pgvector enabled via extension when semantic similarity is needed). Migrations are versioned and applied idempotently.
4. **Crawler engine** runs in-process as a BullMQ worker: robots/sitemap discovery -> HTTP fetch (Cheerio) -> optional Playwright render for DOM-dependent checks -> structured results stored per crawl run. SSRF guard, concurrency limits, timeouts, retries.
5. **Deterministic-first analysis.** Rule evaluations and priority scoring are deterministic code; AI is used for semantic decisions (intent, clustering, content, claim classification) only.
6. **Provider adapters.** `AIProvider` (`generateText`, `generateStructured`, `healthCheck`, `estimateUsage`) and `ResearchProvider` (`research`, `returnSources`) with OpenAI / Anthropic / Perplexity adapters. Selection configurable per task and site. Research is only used where the provider genuinely returns sources; otherwise marked unsupported for that provider.
7. **Content pipeline is staged.** Research -> evidence extraction -> intent -> gap analysis -> brief -> outline -> draft -> language edit (ar/en) -> SEO validation -> AEO validation -> GEO validation -> Rank Math compatibility -> factual validation -> internal linking -> final QA. Each stage stores artifacts; nothing is a single "write an article" call.
8. **Encryption at rest.** AES-256-GCM for credentials/tokens. Frontend never receives secrets; APIs expose only masked metadata.
9. **RTL-first Arabic.** i18n layer in the web app; content engine uses Modern Standard Arabic (or per-site regional tone) with semantic keyword variants, never exact-match repetition.

---

## 2. Proposed Directory Structure

```
creative-seo/
├── apps/
│   ├── api/                              # NestJS REST API — source of truth
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config/                   # env validation (zod/Joi), typed config
│   │   │   ├── common/                   # guards, interceptors, filters, decorators, pagination
│   │   │   ├── database/
│   │   │   │   ├── datasource.ts
│   │   │   │   ├── entities/
│   │   │   │   └── migrations/
│   │   │   ├── modules/
│   │   │   │   ├── auth/                 # JWT, refresh, RBAC guards
│   │   │   │   ├── users/
│   │   │   │   ├── clients/              # organizations (agency client accounts)
│   │   │   │   ├── sites/                # sites + per-site settings (locale, language, country, cities, content/publishing rules, automation settings)
│   │   │   │   ├── credentials/          # site credentials, encrypted storage, masking
│   │   │   │   ├── knowledge-base/       # verified facts, claims, brand voice, language rules
│   │   │   │   ├── crawler/              # crawl runs, pages, robots, sitemap
│   │   │   │   ├── audits/               # audit runs, snapshots, rules, baselines
│   │   │   │   ├── issues/
│   │   │   │   ├── recommendations/
│   │   │   │   ├── tasks/
│   │   │   │   ├── keywords/             # keywords, sources, intents
│   │   │   │   ├── clusters/             # keyword clusters + memberships
│   │   │   │   ├── url-mapping/          # cluster -> canonical URL map
│   │   │   │   ├── cannibalization/
│   │   │   │   ├── search-console/       # GSC properties, syncs, performance rows
│   │   │   │   ├── content/              # opportunities, briefs, drafts, versions, pipeline runs, validations
│   │   │   │   ├── wordpress/            # WP REST client, publish, Rank Math metadata
│   │   │   │   ├── rank-math/            # compatibility validators
│   │   │   │   ├── internal-links/       # link graph, orphan detection, suggestions
│   │   │   │   ├── changes/              # change tracking
│   │   │   │   ├── progress/             # baseline comparison, 28d/MoM/QoQ
│   │   │   │   ├── aeo/
│   │   │   │   ├── geo/                  # GEO evaluation + AI visibility observations
│   │   │   │   ├── ai-providers/         # adapter registry, per-task/site selection
│   │   │   │   ├── ai-usage/             # usage/cost tracking
│   │   │   │   ├── reports/              # report jobs, templates, PDF
│   │   │   │   ├── client-portal/        # restricted portal API + tokens
│   │   │   │   ├── automation/           # n8n registry, run state, fallback workers
│   │   │   │   ├── logs/                 # system + security audit log
│   │   │   │   ├── queue/                # BullMQ module, queue definitions
│   │   │   │   └── health/
│   │   │   ├── jobs/                     # BullMQ processors (crawler, gsc-sync, content, reports, ai-visibility)
│   │   │   ├── ai/                       # provider adapters (interfaces + implementations)
│   │   │   └── sso/                      # Google OAuth (GSC/Ads/GA4), WP OAuth/App Password
│   │   ├── test/                         # unit + integration (testcontainers) + e2e
│   │   ├── .env.example
│   │   └── Dockerfile
│   └── web/                              # React SPA
│       ├── src/
│       │   ├── app/                      # routes, router guards
│       │   ├── components/               # shadcn/ui components
│       │   ├── features/                 # per-module screens (30 modules)
│       │   ├── lib/                      # api client, TanStack Query hooks
│       │   ├── i18n/                     # en/ar, RTL
│       │   ├── styles/
│       │   └── types/                    # generated from shared package
│       ├── Dockerfile
│       └── vite.config.ts
├── packages/
│   ├── shared/                           # DTOs, enums, types shared api<->web
│   ├── crawler/                          # robots, sitemap, HTTP+Cheerio, Playwright renderer, SSRF guard
│   ├── analyzers/                        # SEO/AEO/GEO/Rank Math rule evaluators
│   ├── keyword-engine/                   # normalize, dedupe, intent, cluster
│   ├── content-engine/                   # staged pipeline orchestrator
│   ├── ai-sdk/                           # provider interfaces + typed clients
│   ├── reports/                          # report schema, HTML templates, PDF renderer
│   └── internal-links/                   # link graph, orphans, suggestions
├── infra/
│   ├── docker-compose.yml                # postgres, redis, n8n, api, web, nginx
│   ├── nginx/                            # reverse proxy + SSRF egress guard
│   ├── n8n/                              # workflow JSON definitions + custom nodes
│   └── postgres/init.sql
├── docs/
│   └── architecture.md                   # this document
├── .github/workflows/ci.yml
├── package.json                          # npm workspaces root
├── turbo.json                            # build/test task graph
└── README.md
```

---

## 3. Database Domains

All tables carry `site_id` where the entity is per-site (except global/system tables). Migrations are versioned; baseline records are immutable; snapshots are append-only.

### 3.1 Identity, RBAC, Tenancy
- `clients` — agency client organizations (own one or more sites).
- `users` — internal staff and client-portal users; `type` (AGENCY | CLIENT), status.
- `roles`, `permissions`, `role_permissions`, `user_roles` — RBAC (SUPER_ADMIN, AGENCY_ADMIN, AGENCY_AGENT, AGENCY_REVIEWER, CLIENT).
- `user_site_assignments` — which agency users work on which sites; which clients see which sites.
- `audit_logs` — security + operation audit trail (actor, action, entity, site, ip, payload digest).

### 3.2 Sites & Configuration
- `sites` — name, domain, locale, language, country, target cities, client_id, status, target market, gsc_property, ga_property, default_currency.
- `site_settings` — content rules (tone, banned terms), publishing rules (default status, author, categories), automation settings, crawler policy (respect robots / ignore), concurrency.
- `site_credentials` — kind (WORDPRESS, GSC, GOOGLE_ADS, GA4), encrypted_payload, provider, label, meta, last_validated_at, expires_at, scopes.
- `site_knowledge_base` — company name, description, services, products, locations, markets, contacts, CTAs, certifications, years_of_experience, pricing facts, guarantees, service areas, differentiators, verified statistics, approved claims, prohibited claims, brand terminology, brand voice, language rules.
- `kb_claims` — individual claims tagged VERIFIED_FACT / INFERENCE / UNVERIFIED / EXTERNAL_SOURCE with source reference and evidence.
- `site_ai_settings` — default provider/model per task type, temperature, per-token budget.

### 3.3 Crawler
- `crawl_runs` — site, type (INITIAL, RECURRING, TARGETED), status, started/finished, stats, policy snapshot, config.
- `crawl_pages` — run_id, url, canonical, status_code, redirect_to, title, meta_description, h1s, headings_json, word_count, is_indexable, robots_meta, render_mode (STATIC|DOM), load_time_ms, size_bytes, content_digest.
- `crawl_links` — run_id, from_url, to_url, anchor, is_internal, rel_flags.
- `crawl_resources` — robots_txt_cache, sitemap_urls, sitemap_pages.
- `crawl_errors` — error type, url, stage, message.

### 3.4 Audit, Issues, Baselines
- `audit_rules` — registry of detection rules (key, category, severity, description, version, active).
- `audit_runs` — site, kind (BASELINE, RECURRING), status, started/finished, scope, snapshot_ref.
- `audit_results` — run_id, rule_key, url, passed, severity, evidence_json, category.
- `baselines` — site, audit_run_id (immutable snapshot link), scores_json, created_at. Never overwritten; one active baseline per metric series.
- `issues` — site, url, type, severity, status (DETECTED..IGNORED lifecycle), evidence, rule_key, first_detected, last_detected, recommendation_id, assignee_id, fix_info, verification_info. Unique constraint on (site, rule_key, url) for open-issue dedupe.
- `issue_events` — status change history with actor + timestamp.

### 3.5 Recommendations & Tasks
- `recommendations` — site, title, reason, supporting_data_json, impact, confidence, effort, priority (deterministic + AI), affected_urls_json, suggested_action, status, source (rule/ai/manual).
- `recommendation_evidence` — links recommendation -> issue -> audit_result rows.
- `tasks` — site, assignee_id, due_date, status, recommendation_id, issue_id, related_url, internal_notes, client_notes, evidence_json, completion_verification_json.
- `task_events` — status history.

### 3.6 Keywords, Clusters, Mapping, Cannibalization
- `keywords` — normalized_key (dedupe key), display, site_id, intent, topic, page_type, recommended_url, existing_url_match, action (KEEP/UPDATE/EXPAND/CREATE/MERGE/REDIRECT/REVIEW), search_volume, difficulty, data_source, status.
- `keyword_sources` — keyword_id, source (SEED, ADS, GSC, CONTENT, GAP, AI_RESEARCH), raw_value, meta.
- `keyword_clusters` — site_id, name, intent, primary_keyword_id, status, rationale.
- `cluster_members` — cluster_id, keyword_id, role (PRIMARY/SECONDARY), weight.
- `url_mappings` — site_id, cluster_id, canonical_url, reason, status. One canonical target per cluster unless explicitly justified.
- `cannibalization_groups` — site_id, intent_key, urls_json, overlap_score, severity, detected_at, status.

### 3.7 Search Console & Performance
- `gsc_properties` — site_id, property_url, platform, permission status.
- `gsc_syncs` — site_id, property, date_from, date_to, status, row_counts, raw_payload_ref.
- `gsc_performance` — site_id, property, date, query, page, clicks, impressions, ctr, position. Partitioned by month; retention policy; aggregate tables.
- `gsc_detections` — improving/declining pages, rising/lost queries, high-impression-low-CTR, positions 4-10 / 11-20, cannibalization, content decay, new opportunities. (site, type, key, evidence_json, status).

### 3.8 Content Pipeline
- `content_opportunities` — site_id, cluster_id, keyword_id, gap_type, demand, current_coverage, priority, status.
- `content_briefs` — site_id, title, language, intent, target_url, outline_json, evidence_json, sources_json, gap_analysis_json, status.
- `content_drafts` — site_id, brief_id, language, title, slug, body, word_count, status (DRAFT..ARCHIVED), wp_post_id.
- `content_versions` — draft_id, version, body, changelog, actor.
- `content_pipeline_runs` — brief_id, stage, status, started/finished, input_artifacts_ref, output_artifacts_ref, error.
- `content_validations` — draft_id, validator (SEO/AEO/GEO/RANKMATH/FACTUAL/LINKING/QA), passed, score, report_json, created_at.
- `content_claims` — draft_id, claim, classification (VERIFIED_FACT/INFERENCE/UNVERIFIED/EXTERNAL_SOURCE), kb_match_id, evidence, status (AUTO/REVIEW), review_note.
- `published_content` — site_id, wp_post_id, draft_id, url, status, published_at, rank_math_meta_json.

### 3.9 Internal Linking
- `internal_link_graph` — site_id, from_url, to_url, anchor, context, first_seen, last_seen, source (CRAWL/MANUAL/WP).
- `internal_link_suggestions` — site_id, from_url, to_url, anchor, rationale, status.
- `orphan_pages` — site_id, url, detected_at, status.

### 3.10 Change Tracking
- `change_events` — site_id, url, change_type (TITLE/META/CONTENT/HEADING/CANONICAL/REDIRECT/SCHEMA/INTERNAL_LINK/PAGE_CREATED/PAGE_DELETED/RANKMATH), previous_value, new_value, detected_by (CRAWL/WP/GSC), detected_at, source_run_id.

### 3.11 AEO / GEO / AI Visibility
- `aeo_evaluations` — site_id, url, run_id, criteria_json (intent, direct answers, definitions, question coverage, follow-ups, comparisons, decision criteria, processes, pricing context, objections, common mistakes, entity clarity, semantic completeness, factual clarity, evidence, info structure), scores_json, passed, created_at.
- `geo_evaluations` — site_id, url, run_id, criteria_json (entity clarity, factual consistency, source-worthiness, original info, expert attribution, machine-readable content, crawler accessibility, structured facts, citation readiness, brand references), scores_json, created_at.
- `ai_visibility_tests` — test template id, site_id, prompt, provider, model, timestamp, status.
- `ai_visibility_observations` — test_id, mention_rate, citation_rate, brand_inclusion, cited_urls_json, competitor_inclusion, answer_context, provider, model, timestamp, prompt, raw_response_ref.

### 3.12 Reports & Client Portal
- `report_templates` — brand assets, colors, logo, white-label settings.
- `reports` — site_id, report_type, period, status, params, file_ref, created_by, client_visible.
- `client_portal_tokens` — site_id, token_hash, issued_for, expires_at, last_used_at, revoked_at.
- `client_portal_views` — pageview logging per client site.

### 3.13 AI Usage & Automation
- `ai_providers` — provider type, base_url, encrypted_api_key, enabled, per-task support matrix, health.
- `ai_usage` — site_id, job_id, provider, model, task_type, input_usage, output_usage, estimated_cost, latency_ms, status, prompt_hash (no prompt stored), created_at.
- `automation_flows` — registry of n8n workflows: key, definition_ref, enabled, schedule, last_run, last_status.
- `automation_runs` — flow_id, site_id, status, started/finished, n8n_run_id, payload_ref, error.
- `system_logs` — level, source, message, context_json, trace_id, created_at.
- `rate_limit_buckets` — key, window, count, expires_at (in-memory + Redis).

---

## 4. Implementation Phases

Each phase is DONE only when its tests pass and acceptance criteria are met. Phases are strictly sequential.

### Phase 1 — Foundation & Multi-Tenancy
- Monorepo scaffold, npm workspaces, turbo, lint/format/typecheck, CI.
- `docker-compose.yml` (postgres, redis, n8n, api, web, nginx).
- API bootstrap: config validation, structured logging, global pipes/filters, health endpoint, rate limiting.
- Auth: JWT login/refresh, RBAC (roles/permissions), audit log, bcrypt password hashing.
- Clients, Users, Sites CRUD + all per-site settings.
- Site credentials: AES-256-GCM encryption at rest, masking API, never to frontend.
- Knowledge base + claims CRUD with classification tags.
- Web: shell, routing, auth screens, RTL i18n (ar/en), dashboard layout.
- Migrations: all Phase 1 domains.
- **Acceptance:** login/register; create client + site; store/rotate credentials encrypted (ciphertext in DB, plaintext never returned); RBAC matrix tests; audit log entries created; web reaches API; all unit/integration/E2E green.

### Phase 2 — Crawler, Audit, Issues, Baselines
- `packages/crawler`: robots/sitemap parsing, HTTP+Cheerio fetch, Playwright renderer, SSRF guard (private-IP deny, DNS-rebinding protection, redirect cap), concurrency limits, retries, timeouts.
- Crawl runs via BullMQ; idempotent; store crawl_pages/links/errors; Lighthouse CLI job for perf metrics.
- Audit rules engine (technical, on-page, content, Rank Math, internal linking, SEO/AEO/GEO-lite) with deterministic evaluators.
- Issues engine with open-issue dedupe (site+rule+url); status workflow + events.
- Baselines: immutable snapshots on first audit.
- **Acceptance:** crawl a seeded dev WP site; pages/links stored; robots respected; issues created with evidence; no duplicate open issues; baseline snapshot immutable; E2E crawl -> issues.

### Phase 3 — Search Console, Keywords, Clusters, URL Mapping, Cannibalization
- Google OAuth flow; encrypted token storage; refresh + retry with backoff.
- GSC sync worker; `gsc_performance` + aggregation; retention.
- GSC detections (improving/declining/rising/lost, low-CTR, positions 4-10 / 11-20, decay).
- Keyword engine: sources (seed, Ads planner via API when permitted, GSC queries, content, gaps, optional AI research), normalization, dedupe, intent classification.
- Clustering (deterministic overlap + optional AI semantic clustering), URL mapping (one canonical per cluster), cannibalization detection.
- **Acceptance:** GSC sync against a real test property; keyword dedupe idempotent; cluster->URL mapping unique; cannibalization groups with evidence; unit + integration tests.

### Phase 4 — AI Adapters & Content Engine
- `packages/ai-sdk`: AIProvider + ResearchProvider interfaces; OpenAI/Anthropic/Perplexity adapters; health checks; usage estimation; per-task/site selection; cost recording.
- KB-grounded factual validation; claim classification pipeline; unverified claims blocked from publishing as facts.
- Content opportunities; staged pipeline (research -> evidence -> intent -> gap -> brief -> outline -> draft -> ar/en edit -> SEO/AEO/GEO validation -> Rank Math -> factual -> internal links -> QA).
- Rank Math compatibility validator (focus keyword, SEO title, meta description, canonical, robots, schema, social).
- Internal linking suggestions from URL map (no invented targets).
- WordPress publish via REST; Rank Math metadata application.
- **Acceptance:** brief -> draft for Arabic + English with validations; unverified claims surfaced, not published; Rank Math fields set on WP test site; provider fallback on failure; E2E full content flow.

### Phase 5 — AEO, GEO, AI Visibility
- AEO evaluation engine (16 criteria).
- GEO evaluation engine (12 criteria).
- AI visibility testing: standardized prompt suite, per-site, multiple providers/models; observations (mention/citation rate, brand inclusion, cited URLs, competitor inclusion, provider/model/timestamp).
- **Acceptance:** evaluations stored; observations recorded with full metadata; UI to view; no "ranking" claims in UI or reports.

### Phase 6 — Change Tracking, Recommendations, Tasks, Progress
- Change tracking worker (crawl diffs, WP changes, GSC changes) -> change_events with before/after values.
- Recommendations: deterministic evidence + AI reasoning; priority = deterministic score + AI rationale; recommendation -> task.
- Tasks: assignee, due dates, notes (internal/client), verification.
- Progress monitoring: baseline vs current, current 28d vs previous 28d, MoM, QoQ, custom range. Baselines never overwritten.
- **Acceptance:** change detected -> recommendation -> task E2E; comparison windows correct; baseline immutability tests.

### Phase 7 — Reports & Client Portal
- Report rendering engine (server-rendered HTML) + Playwright/Chromium PDF.
- Ten report types (Initial Audit, Monthly Progress, Technical, Content, SEO, AEO, GEO, Work Completed, Issues, Executive), white-label branding.
- Every report distinguishes WORK COMPLETED from SEARCH PERFORMANCE RESULTS; never implies guaranteed rankings.
- Client portal: overview, progress, performance, completed work, major issues, recommendations, reports. Clients never see credentials, prompts, internal costs, internal notes, n8n, system logs, or other clients.
- **Acceptance:** generate each report type; PDF correct; portal E2E verifies restricted visibility.

### Phase 8 — Automation, Cost Tracking, Hardening, Scale
- n8n workflow definitions (registry in DB) + orchestration; app remains usable if n8n is down.
- AI usage/cost tracking dashboards.
- Rate limiting, SSRF hardening, concurrency tuning, load tests, full E2E regression.
- **Acceptance:** n8n-down simulation keeps queued work flowing via BullMQ; cost ledger accurate; load tests pass target RPS; docs complete.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| SSRF / internal-network probing via crawler and URL fetchers | Strict egress guard: deny private/link-local/metadata IP ranges, DNS rebinding protection, redirect cap, port allowlist, nginx egress layer, integration tests with a fake metadata endpoint. |
| AI hallucination / fabricated business facts | KB-grounded claim classification (VERIFIED_FACT / INFERENCE / UNVERIFIED / EXTERNAL_SOURCE); unverified claims blocked from publication; human review for INFERENCE and EXTERNAL_SOURCE. |
| Google API token expiry / quota exhaustion | Encrypted refresh tokens, automatic refresh with backoff, quota-aware batching, per-site throttling, graceful degradation of GSC-only features. |
| Arabic SEO quality / over-optimization | Semantic variants over exact-match repetition; natural MSA / regional tone; Rank Math score is advisory, intent and quality take precedence; Arabic-language QA rules. |
| n8n outage breaks the platform | n8n is orchestration-only; BullMQ workers run critical paths natively; job queue drains even with n8n offline; automation_flows registry tracks desired state for reconciliation. |
| Crawl cost and scale at 100+ sites | Per-site concurrency limits, incremental crawls, robots politeness delays, content digest caching, run-level budgets. |
| GSC data volume | Monthly partitioning, aggregation tables, retention policy, incremental sync. |
| WordPress / Rank Math variance across clients | Feature detection on connect; validate all WP responses; version pinning per site; graceful feature flags. |
| Credential leakage | AES-256-GCM at rest; masked responses only; no secrets to frontend; rotation support; scoped Google OAuth tokens; audit log on any access to credential material. |
| AI provider lock-in / outage | Adapter abstraction; per-task/site provider selection; health checks; retry + fallback; usage/cost ledger per call. |
| Scope creep (a 30-module platform) | Strict phase gating; each phase has acceptance criteria; unsupported capabilities are declared, not faked. |

---

## 6. Migrations Required

Migration numbering is sequential and additive. Each phase ships its migrations; production runs `migration:run` at deploy. The `pgvector` extension migration is included but the extension is only used when a semantic feature is enabled.

| Phase | Migration group | Tables created |
|---|---|---|
| 1 | 001_core_identity | clients, users, roles, permissions, role_permissions, user_roles, user_site_assignments, audit_logs |
| 1 | 002_sites_config | sites, site_settings, site_credentials, site_knowledge_base, kb_claims, site_ai_settings |
| 2 | 003_crawler | crawl_runs, crawl_pages, crawl_links, crawl_resources, crawl_errors |
| 2 | 004_audit_issues | audit_rules, audit_runs, audit_results, baselines, issues, issue_events |
| 3 | 005_keywords | keywords, keyword_sources, keyword_clusters, cluster_members, url_mappings, cannibalization_groups |
| 3 | 006_search_console | gsc_properties, gsc_syncs, gsc_performance, gsc_detections |
| 4 | 007_content | content_opportunities, content_briefs, content_drafts, content_versions, content_pipeline_runs, content_validations, content_claims, published_content |
| 4 | 008_linking | internal_link_graph, internal_link_suggestions, orphan_pages |
| 6 | 009_changes | change_events |
| 5 | 010_aeo_geo | aeo_evaluations, geo_evaluations, ai_visibility_tests, ai_visibility_observations |
| 6 | 011_recs_tasks | recommendations, recommendation_evidence, tasks, task_events |
| 7 | 012_reports | report_templates, reports, client_portal_tokens, client_portal_views |
| 8 | 013_ai_automation | ai_providers, ai_usage, automation_flows, automation_runs, system_logs, rate_limit_buckets |
| any | 000_extensions | `CREATE EXTENSION IF NOT EXISTS vector` (pgvector, conditional) |
| any | 014_indexes | Performance indexes for gsc_performance, crawl_pages, issues, keywords, url_mappings, ai_usage (added per phase as data grows) |

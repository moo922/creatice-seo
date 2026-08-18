# Gap Closure 05 — Implementation Plan

## Overview

Implement real, independent AEO (Answer Engine Optimization) and GEO (Generative Engine Optimization) Audit Engines. These are separate from SEO Health and AI Visibility. The audit combines deterministic rules with AI semantic analysis. AI evaluates subcomponents; final scores are deterministic and versioned.

## Critical Prerequisite: Crawl Page Text Storage

The `crawl_pages` table does NOT store page text. AEO/GEO audits need it. This must be fixed first.

### Migration 0050: Add `text` column to `crawl_pages`
- Add `text text` column (nullable for backward compat)
- Cap at 100KB (crawler already does `html.slice(0, 100_000)`)
- Storage: ~5MB for 50 pages, ~50MB for 500 pages — acceptable

### Files to modify:
- `packages/database/src/entities/crawl-page.ts` — add `text` column
- `packages/links/src/links.service.ts` — persist `page.text` in `runCrawl()`
- `packages/audit-rules/src/context.ts` — add `text` to `AuditPageSignal`
- `packages/links/src/audit.service.ts` — map text in `toPageSignal()` and `integrateLinkAnalysis()`

---

## Phase 1: Enums, Types & DTOs

### New enums in `packages/types/src/enums.ts`:

**Audit types (extend existing):**
- `AEO_SITE`, `AEO_PAGE`, `GEO_SITE`, `GEO_PAGE` (add to audit type vocabulary)

**Score versions:**
- `AEO_SCORE_VERSIONS = ['AEO_SCORE_V1']`
- `GEO_SCORE_VERSIONS = ['GEO_SCORE_V1']`

**Data quality:**
- `AUDIT_DATA_QUALITIES = ['GOOD', 'PARTIAL', 'STALE', 'INSUFFICIENT', 'ERROR']`

**AEO finding types (14):**
- `AEO_INTENT_MISMATCH`, `AEO_DIRECT_ANSWER_MISSING`, `AEO_DIRECT_ANSWER_WEAK`
- `AEO_PRIMARY_QUESTION_UNANSWERED`, `AEO_QUESTION_GAP`, `AEO_SEMANTIC_COVERAGE_GAP`
- `AEO_DECISION_SUPPORT_GAP`, `AEO_COMPARISON_GAP`, `AEO_COST_CONTEXT_GAP`
- `AEO_PROCESS_GAP`, `AEO_OBJECTION_GAP`, `AEO_ENTITY_EXPLANATION_GAP`
- `AEO_FACT_CONFLICT`, `AEO_LOW_INFORMATION_DENSITY`

**GEO finding types (14):**
- `GEO_ENTITY_UNCLEAR`, `GEO_ENTITY_INCONSISTENT`, `GEO_BUSINESS_INFORMATION_CONFLICT`
- `GEO_UNVERIFIED_MAJOR_CLAIM`, `GEO_LOW_FACTUAL_SPECIFICITY`, `GEO_SOURCE_QUALITY_WEAK`
- `GEO_EVIDENCE_GAP`, `GEO_AUTHOR_ATTRIBUTION_GAP`, `GEO_ORIGINAL_INFORMATION_GAP`
- `GEO_AI_CRAWLER_BLOCKED`, `GEO_IMPORTANT_CONTENT_NOT_MACHINE_ACCESSIBLE`
- `GEO_SCHEMA_ENTITY_CONFLICT`, `GEO_CITATION_READINESS_LOW`, `GEO_FACT_SOURCE_GAP`

**Question/intent/claim types:**
- `QUESTION_CATEGORIES = ['PRIMARY', 'FOLLOW_UP', 'DEFINITION', 'HOW_TO', 'PRICE', 'DECISION', 'COMPARISON', 'OBJECTION', 'PROBLEM', 'LOCAL', 'ELIGIBILITY', 'TIMING']`
- `QUESTION_COVERAGE_STATUSES = ['ANSWERED', 'PARTIALLY_ANSWERED', 'NOT_ANSWERED', 'NOT_APPLICABLE']`
- `DIRECT_ANSWER_RATINGS = ['STRONG', 'ADEQUATE', 'WEAK', 'MISSING']`
- `INTENT_MATCH_RESULTS = ['MATCH', 'PARTIAL_MATCH', 'MISMATCH', 'UNKNOWN']`
- `CLAIM_VERIFICATION_STATUSES = ['VERIFIED', 'SUPPORTED_EXTERNAL', 'UNVERIFIED', 'INFERRED', 'CONFLICTING']`

**AI crawler types:**
- `AI_CRAWLER_PURPOSES = ['SEARCH_DISCOVERY', 'USER_FETCH', 'TRAINING', 'UNKNOWN']`
- `CRAWLER_ACCESS_RESULTS = ['ALLOWED', 'BLOCKED', 'PARTIAL', 'UNKNOWN']`

**Issue kinds (extend):**
- Add `'AEO_GAP'`, `'GEO_GAP'` to `ISSUE_KINDS`

**Issue sources (extend):**
- Add `'AEO_AUDIT'`, `'GEO_AUDIT'` to `ISSUE_SOURCES`

**AI workflows (extend):**
- Add `'aeo-page-auditor'`, `'geo-page-auditor'` to `AI_WORKFLOWS`

**Automation operations (extend):**
- Add `'aeo-site-audit'`, `'geo-site-audit'` to `AUTOMATION_OPERATIONS`

**Baseline metric keys (extend):**
- `aeoReadiness` and `geoReadiness` already exist in `BASELINE_METRIC_KEYS`

### New DTOs in `packages/types/src/dto.ts`:

- `AeoPageAuditDto` — page-level AEO audit with component scores, questions, recommendations
- `GeoPageAuditDto` — page-level GEO audit with component scores, entities, claims, recommendations
- `AeoSiteAuditDto` — site-level AEO summary (aggregated component scores, pages measured/excluded/insufficient, question coverage summary)
- `GeoSiteAuditDto` — site-level GEO summary (entity clarity, consistency, evidence, citation readiness)
- `AeoScoreDto` — versioned AEO score with component breakdown
- `GeoScoreDto` — versioned GEO score with component breakdown
- `PageQuestionDto` — question + coverage status + evidence
- `PageEntityDto` — entity name, type, clarity score
- `EntityRelationDto` — subject, predicate, object, verified
- `FactEvidenceDto` — fact, source, source_type, support_strength
- `CrawlerPolicyResultDto` — crawler name, purpose, access result, last checked
- `AeoAuditSummaryDto` — for audit history
- `GeoAuditSummaryDto` — for audit history
- `AuditDataQualityDto` — status + reasons

---

## Phase 2: Database Entities & Migrations

### Migration 0050: Crawl page text
- Add `text text` to `crawl_pages`

### Migration 0051: AEO/GEO audit entities

**Reuse existing `audit_runs` and `audit_results` tables for site-level runs:**
- `audit_runs.type` gets `AEO_SITE`, `GEO_SITE`
- `audit_runs` add: `prompt_version int`, `ai_provider varchar(50)`, `ai_model varchar(100)`, `data_quality jsonb`
- `audit_results` add: `component_id varchar(100)`, `component_label varchar(200)`

**New entities:**

1. `aeo_page_audits` — Per-page AEO audit results
   - `id`, `siteId`, `auditRunId`, `crawlPageId`, `url`, `contentHash`
   - `promptVersion`, `aiProvider`, `aiModel` (nullable — deterministic-only audits have null)
   - `intentAlignment` (rating + reason JSONB)
   - `directAnswer` (rating + evidence JSONB)
   - `decisionSupport` (JSONB)
   - `semanticCompleteness` (JSONB)
   - `structureExtractability` (JSONB)
   - `factualGrounding` (JSONB)
   - `componentScores` (JSONB — all 8 component scores)
   - `overallScore` (int 0-100)
   - `scoreVersion` varchar(50)
   - `dataQuality` varchar(20)
   - `confidence` (double 0-1)
   - `status` (RUNNING/COMPLETED/FAILED)
   - `reusedFromAuditId` (nullable — for cached/reused results)
   - `startedAt`, `completedAt`, `createdAt`

2. `geo_page_audits` — Per-page GEO audit results
   - Same structure as AEO but GEO-specific components:
   - `entityClarity`, `entityConsistency`, `factualSpecificity`, `claimVerification`
   - `evidenceQuality`, `sourceQuality`, `originalInformation`, `expertAttribution`
   - `machineAccessibility`, `structuredFactClarity`, `citationReadiness`

3. `page_questions` — Question map per page/cluster
   - `id`, `siteId`, `pageUrl`, `crawlPageId` (nullable)
   - `question`, `category`, `priority`, `status` (ANSWERED/PARTIALLY_ANSWERED/NOT_ANSWERED/NOT_APPLICABLE)
   - `source` (GSC/CLUSTER/KEYWORD/AI/KNOWLEDGE_BASE)
   - `impressions` (nullable — from GSC)
   - `evidence` (text — why this rating)
   - `createdAt`

4. `page_entities` — Entities extracted from pages
   - `id`, `siteId`, `pageUrl`, `crawlPageId` (nullable)
   - `entityName`, `entityType`, `clarity` (double 0-1)
   - `mentioned` (boolean)
   - `createdAt`

5. `entity_relations` — Entity relationships
   - `id`, `siteId`
   - `subjectEntity`, `predicate`, `objectEntity`
   - `verified` (boolean — from Knowledge Base)
   - `source` (KNOWLEDGE_BASE/PAGE/INFERRED)
   - `createdAt`

6. `fact_evidence` — Evidence library
   - `id`, `siteId`
   - `fact`, `sourceUrl`, `sourceType` (OFFICIAL/FIRST_PARTY/PRIMARY_EXTERNAL/SECONDARY/UNKNOWN)
   - `supportStrength` (double 0-1)
   - `verified` (boolean)
   - `createdAt`

7. `crawler_policy_results` — AI crawler policy checks
   - `id`, `siteId`
   - `crawlerName`, `crawlerPurpose` (SEARCH_DISCOVERY/USER_FETCH/TRAINING/UNKNOWN)
   - `accessResult` (ALLOWED/BLOCKED/PARTIAL/UNKNOWN)
   - `robotsTxtAnalysis` (JSONB)
   - `checkedAt`

8. `ai_crawler_registry` — Versioned crawler definitions
   - `id`, `name`, `userAgentPattern`, `purpose`, `category`, `version`
   - `enabled`, `createdAt`

### Indexes:
- `aeo_page_audits`: (siteId, auditRunId), (siteId, url), (crawlPageId)
- `geo_page_audits`: same pattern
- `page_questions`: (siteId, pageUrl), (siteId, crawlPageId)
- `page_entities`: (siteId, pageUrl)
- `entity_relations`: (siteId)
- `fact_evidence`: (siteId)
- `crawler_policy_results`: (siteId, crawlerName)

---

## Phase 3: Deterministic AEO Rules

Create `packages/audit-rules/src/rules/aeo.ts` — deterministic rule functions.

These rules receive `AuditPageSignal` (which now includes `text`) plus context (cluster intent, GSC questions, Knowledge Base facts). They return `AuditFinding[]`.

### AEO Deterministic Rules:

1. **`aeo-intent-alignment`** — Compare page type + cluster intent against GSC queries. Check if page content serves the identified intent. Rating: MATCH/PARTIAL_MATCH/MISMATCH/UNKNOWN.

2. **`aeo-direct-answer-present`** — Check if page has meaningful content before excessive filler. Evaluate first 300 words for answer signals. Rating: STRONG/ADEQUATE/WEAK/MISSING.

3. **`aeo-primary-question-addressed`** — For each mapped cluster, determine if the primary question is addressed in the page content.

4. **`aeo-question-coverage`** — Map GSC queries + cluster questions against page content. Report covered/partial/missing.

5. **`aeo-decision-support`** — For commercial/service/product pages: check for selection criteria, pricing factors, process info, who it's for/not for.

6. **`aeo-comparison-coverage`** — For comparison intents: check for alternatives, vs sections, decision criteria.

7. **`aeo-process-coverage`** — For how-to intents: check for steps, requirements, expected results.

8. **`aeo-cost-context`** — For commercial pages: check if pricing factors/context are addressed (not exact prices).

9. **`aeo-objection-coverage`** — Check if common objections (cost, time, safety, quality) are addressed.

10. **`aeo-entity-explanation`** — Check if key entities (service, product, brand, location) are explained.

11. **`aeo-factual-consistency`** — Compare page claims against Knowledge Base facts. Flag contradictions.

12. **`aeo-information-density`** — Detect excessive low-information filler (generic intros, repeated conclusions, keyword padding).

13. **`aeo-heading-semantics`** — Check if headings accurately describe sections, have logical hierarchy.

14. **`aeo-structure-extractability`** — Check for lists, tables, JSON-LD, clear heading hierarchy.

15. **`aeo-self-containment`** — Check for "as mentioned above" / "as we said" patterns that reduce extractability.

### AEO Score V1 Component Weights (deterministic):
```
Intent Alignment:        15%
Direct Answer Quality:   15%
Question Coverage:       15%
Semantic Completeness:   12%
Decision Support:        12%
Structure/Extractability: 12%
Clarity:                 10%
Factual Grounding:        9%
```
Formula: `score = Σ(componentScore × weight) × coverageFactor`
Where `coverageFactor = 0.5 + 0.5 × (measuredPages / totalPages)`

---

## Phase 4: Deterministic GEO Rules

Create `packages/audit-rules/src/rules/geo.ts`:

1. **`geo-entity-identity`** — Evaluate homepage, about, contact for clear entity signals (name, type, location, services, description).

2. **`geo-entity-consistency`** — Compare entity data across pages + Knowledge Base. Flag contradictions (different phone, city, founding date).

3. **`geo-factual-specificity`** — Check for concrete facts vs vague marketing claims. Evaluate presence of specifications, processes, criteria.

4. **`geo-claim-verification`** — Classify significant claims against Knowledge Base: VERIFIED/SUPPORTED_EXTERNAL/UNVERIFIED/INFERRED/CONFLICTING.

5. **`geo-evidence-quality`** — Check for source attribution, citations, references.

6. **`geo-source-quality`** — Classify external source types (official, academic, industry, etc.).

7. **`geo-original-information`** — Detect first-party data, case studies, methodology, original analysis.

8. **`geo-expert-attribution`** — Check for author name, role, qualifications, reviewed-by info.

9. **`geo-machine-accessibility`** — Check robots.txt, meta robots, HTTP status, rendered content availability.

10. **`geo-ai-crawler-access`** — Check configured crawler policies against `ai_crawler_registry`. Distinguish training vs search crawlers.

11. **`geo-structured-facts`** — Check if key facts are clearly represented in visible content (not just schema).

12. **`geo-schema-validation`** — Check JSON-LD validity, type correctness, match with visible content.

13. **`geo-citation-readiness`** — Aggregate: specificity, self-contained statements, evidence, entity clarity, fact consistency.

14. **`geo-page-ownership`** — Check if reader can understand who produced the content, how to contact.

15. **`geo-dates`** — For time-sensitive content: check published/updated dates, staleness signals.

### GEO Score V1 Component Weights:
```
Entity Clarity:          12%
Entity Consistency:      12%
Factual Specificity:     12%
Claim Verification:      10%
Evidence Quality:        10%
Source Quality:           8%
Original Information:     8%
Expert Attribution:       8%
Machine Accessibility:    8%
Structured Fact Clarity:  6%
Citation Readiness:       6%
```

---

## Phase 5: Page Classification & Selection

Create `packages/audit-rules/src/page-classifier.ts`:

- Use existing `KEYWORD_PAGE_TYPES` enum (12 types)
- Classify crawl pages by: URL patterns, WordPress type, title/H1 signals, cluster mapping
- Eligible: HOMEPAGE, SERVICE, PRODUCT, CATEGORY, LANDING_PAGE, BLOG_ARTICLE, GUIDE, COMPARISON, LOCATION_PAGE, FAQ_SUPPORT
- Exclude: login, cart, checkout, account, privacy, terms, tag archives, thin pages (< 100 words), search results
- Classification is deterministic with confidence score

---

## Phase 6: AI Semantic Analysis

### AEO Page Auditor Prompt

Register in prompt registry as `aeo-page-auditor`:

**System prompt concept:**
"You are evaluating how effectively a live page answers user needs associated with a known search intent. You must not invent page content or metrics. You receive: page text, page structure, keyword cluster, search intent, GSC questions, business facts. Return structured component evaluations. Do NOT return the final platform score."

**Input variables:** `{{pageText}}`, `{{pageStructure}}`, `{{clusterIntent}}`, `{{primaryKeyword}}`, `{{gscQuestions}}`, `{{businessFacts}}`, `{{pageType}}`, `{{language}}`

**Output schema (JSON):**
```json
{
  "primaryQuestion": "",
  "intentAlignment": { "rating": "MATCH|PARTIAL|MISMATCH", "reason": "" },
  "directAnswer": { "rating": "STRONG|ADEQUATE|WEAK|MISSING", "evidence": "" },
  "questions": [{ "question": "", "status": "ANSWERED|PARTIAL|MISSING", "reason": "" }],
  "decisionSupport": { "present": true, "coverage": "", "gaps": [] },
  "semanticGaps": [""],
  "factualRisks": [{ "claim": "", "risk": "", "suggestion": "" }],
  "definitions": { "present": true, "coverage": "" },
  "comparisons": { "present": true, "quality": "" },
  "processCoverage": { "present": true, "quality": "" },
  "recommendations": [""]
}
```

### GEO Page Auditor Prompt

Register as `geo-page-auditor`:

**System prompt concept:**
"You are evaluating whether a page provides clear, trustworthy, attributable, machine-understandable information that generative systems could reference. You receive: page content, site entity data, Knowledge Base, sources, schema, crawler signals. Evaluate entity clarity, specificity, evidence, attribution, originality, citation readiness. Do NOT predict whether any AI will cite this page."

**Input variables:** `{{pageContent}}`, `{{siteEntityData}}`, `{{knowledgeBase}}`, `{{externalSources}}`, `{{schemaJson}}`, `{{crawlerSignals}}`, `{{language}}`

**Output schema (JSON):**
```json
{
  "entities": [{ "name": "", "type": "", "clarity": 0.8 }],
  "entityClarity": { "score": 0.8, "reason": "" },
  "claims": [{ "text": "", "verification": "VERIFIED|UNVERIFIED|CONFLICTING", "evidence": "" }],
  "evidence": { "hasEvidence": true, "quality": "", "gaps": [] },
  "originalInformation": { "present": true, "type": "", "quality": "" },
  "expertAttribution": { "present": true, "name": "", "qualifications": "" },
  "citationReadiness": { "score": 0.7, "factors": [] },
  "risks": [{ "type": "", "description": "", "severity": "" }],
  "recommendations": [""]
}
```

### AI Provider Routing

- Use existing `AiService` with workflow keys `aeo-page-auditor` and `geo-page-auditor`
- Site can configure provider via existing per-site AI config
- Fallback chain via existing `AiRouter`
- AI failure → deterministic results remain, semantic components marked `NOT_MEASURED`

---

## Phase 7: AEO/GEO Audit Services

### `packages/links/src/aeo-audit.service.ts`

Key methods:
- `runAeoSiteAudit(site, crawlRun, options)` — Main entry. Selects pages, runs deterministic rules, runs AI analysis, computes scores, creates issues/recommendations.
- `runAeoPageAudit(site, crawlPage, clusterContext, options)` — Single page audit.
- `getLatestAeoAudit(siteId)` — Returns latest completed audit.
- `getAeoPageAudit(siteId, url)` — Per-page audit details.
- `getAeoHistory(siteId)` — Audit history with scores.
- `getAeoQuestionGaps(siteId)` — Unanswered questions from GSC.
- `getAeoAnswerGaps(siteId)` — Pages with weak/missing direct answers.

### `packages/links/src/geo-audit.service.ts`

Key methods:
- `runGeoSiteAudit(site, crawlRun, options)` — Main entry.
- `runGeoPageAudit(site, crawlPage, options)` — Single page audit.
- `getLatestGeoAudit(siteId)` — Latest completed.
- `getGeoPageAudit(siteId, url)` — Per-page details.
- `getGeoHistory(siteId)` — History.
- `getGeoEntityView(siteId)` — Entity summary (brand, type, locations, services, conflicts).
- `getGeoGaps(siteId)` — Entity gaps, evidence gaps.

### `packages/links/src/ai-crawler-policy.service.ts`

Key methods:
- `checkCrawlerPolicy(siteId)` — Fetch robots.txt, check all registered crawlers, persist results.
- `getCrawlerPolicyResults(siteId)` — Return latest results.
- `listCrawlers()` — Return registry.

### Audit Flow (AEO example):

1. **Resolve crawl run** — latest COMPLETED crawl for the site
2. **Load page text** — from `crawl_pages.text` (fail if empty → STALE_SOURCE)
3. **Classify pages** — page-type classifier selects eligible content pages
4. **Load context** — clusters, URL mappings, GSC questions, Knowledge Base facts
5. **For each eligible page:**
   a. Run deterministic AEO rules → `AuditFinding[]`
   b. Compute deterministic component scores from findings
   c. If AI configured and page is high-priority:
      - Call `aeo-page-auditor` prompt with page text + context
      - Parse structured AI response
      - Merge AI subcomponents into component scores (AI adjusts, never overrides)
   d. Compute final AEO page score (deterministic aggregation)
   e. Persist `aeo_page_audits` row
6. **Aggregate site score** — weighted by page type importance, organic visibility, business importance
7. **Create issues** — material findings → `Issues` with kind `AEO_GAP`
8. **Create recommendations** — with reason, evidence, impact, confidence, effort
9. **Create opportunities** — QUESTION_GAP, ENTITY_GAP, etc. → `keyword_opportunities`
10. **Return** `AeoSiteAuditDto`

### Reuse & Incremental Audit:

- Store `contentHash` per page audit
- On re-audit: if `contentHash` unchanged + prompt version unchanged + KB version unchanged → reuse semantic analysis
- `reusedFromAuditId` links to previous audit row
- Site score can be recalculated from current page selection without re-running AI

---

## Phase 8: Scoring Engine

### `packages/audit-rules/src/aeo-scoring.ts`

```typescript
export const AEO_SCORE_V1 = {
  version: 'AEO_SCORE_V1',
  components: {
    intentAlignment: { weight: 0.15, version: 1 },
    directAnswer: { weight: 0.15, version: 1 },
    questionCoverage: { weight: 0.15, version: 1 },
    semanticCompleteness: { weight: 0.12, version: 1 },
    decisionSupport: { weight: 0.12, version: 1 },
    structureExtractability: { weight: 0.12, version: 1 },
    clarity: { weight: 0.10, version: 1 },
    factualGrounding: { weight: 0.09, version: 1 },
  },
};

export function computeAeoScore(
  components: Record<string, number>,
  context: { measuredPages: number; totalPages: number }
): AeoScoreResult { ... }
```

### `packages/audit-rules/src/geo-scoring.ts`

Same pattern with GEO component weights.

### Integration with existing scoring:

- `computeHealthScores()` in `scoring.ts` gets new branches for `aeo` and `geo` categories
- Health scores now include `aeoReadiness` and `geoReadiness` alongside existing scores
- These are computed from `audit_results` with category `aeo` or `geo`

---

## Phase 9: Controller & API

### Extend `apps/api/src/modules/links/audit.controller.ts`

New endpoints:

**AEO:**
- `POST /sites/:siteId/audits/aeo` — Run AEO site audit
- `GET /sites/:siteId/audits/aeo` — Get latest AEO audit
- `GET /sites/:siteId/audits/aeo/history` — Audit history
- `GET /sites/:siteId/audits/aeo/pages?url=` — Per-page AEO details
- `GET /sites/:siteId/audits/aeo/question-gaps` — Question gaps
- `GET /sites/:siteId/audits/aeo/answer-gaps` — Answer gaps

**GEO:**
- `POST /sites/:siteId/audits/geo` — Run GEO site audit
- `GET /sites/:siteId/audits/geo` — Latest GEO audit
- `GET /sites/:siteId/audits/geo/history` — History
- `GET /sites/:siteId/audits/geo/pages?url=` — Per-page GEO details
- `GET /sites/:siteId/audits/geo/entities` — Entity view
- `GET /sites/:siteId/audits/geo/gaps` — GEO gaps

**Crawler Policy:**
- `GET /sites/:siteId/audits/geo/crawlers` — Crawler policy results
- `POST /sites/:siteId/audits/geo/crawlers/check` — Run crawler check

**AI Visibility (preserve existing):**
- Keep all existing `/sites/:siteId/visibility/*` endpoints unchanged
- Rename UI label to "AI Visibility Observations"

### Authorization:
- `sites:read` for GET endpoints
- `sites:manage` for POST endpoints
- `SUPER_ADMIN` may inspect prompt versions, AI provider, source hashes

---

## Phase 10: UI

### `apps/web/src/features/sites/tabs/aeo-tab.tsx`

Site → Audit → AEO tab:

**Header:**
- AEO Readiness score (0-100, color-coded)
- Pages Measured / Total Eligible
- Data Quality indicator
- Latest Audit date

**Component Cards (8):**
- Intent Alignment, Direct Answers, Question Coverage, Decision Support
- Semantic Completeness, Structure/Extractability, Clarity, Factual Grounding
- Each shows: score, trend arrow (vs previous audit), mini-bar

**Sections:**
- Strong Areas (top components)
- Gaps (bottom components with evidence)
- Pages Needing Attention (sorted by score, lowest first)
- Question Coverage Map (table: question, status, page, impressions)

**Per-Page Detail Panel:**
- Click a page → shows: target intent, primary question, questions covered/missing, direct answer quality, decision support, entity coverage, recommendations
- Actions: Create Task, Create Content Opportunity

### `apps/web/src/features/sites/tabs/geo-tab.tsx`

Site → Audit → GEO tab:

**Header:**
- GEO Readiness score
- Entity Clarity, Fact Consistency, Evidence, Citation Readiness indicators

**Component Cards (11):**
- Entity Clarity, Entity Consistency, Factual Specificity, Claim Verification
- Evidence Quality, Source Quality, Original Information, Expert Attribution
- Machine Accessibility, Structured Fact Clarity, Citation Readiness

**Sections:**
- Major Entity Issues (conflicts, inconsistencies)
- Evidence Gaps
- Crawler Access (table: crawler, purpose, status, last checked)
- Pages Needing Improvement

**Entity View:**
- Brand, Business Type, Locations, Services, Products, People, Certifications
- Known Facts count, Source Coverage
- Conflicts highlighted

### `apps/web/src/features/sites/tabs/visibility-tab.tsx`

Rename existing AI Visibility tab to "AI Visibility Observations"
- Keep all existing functionality
- Add label: "Observational metrics — separate from AEO/GEO Readiness"

### Dashboard Integration

**Portfolio Dashboard (`apps/web/src/features/dashboard/portfolio-dashboard.tsx`):**
- Show AEO/GEO averages separately
- Only count measured sites
- Display: "Average AEO Readiness: 73 (Measured: 12 of 17 sites)"

**Site Dashboard:**
- 4 separate sections: SEO Health, AEO Readiness, GEO Readiness, AI Visibility
- Never merge into one score

---

## Phase 11: Integration

### Activation Steps

Replace stubs in `apps/api/src/modules/activation/activation.service.ts`:
- `run-aeo-audit` → call `AeoAuditService.runAeoSiteAudit()`
- `run-geo-readiness` → call `GeoAuditService.runGeoSiteAudit()`
- Status detection: check for completed AEO/GEO audit runs

### Baseline Integration

In baseline creation (`BaselineService`):
- After AEO/GEO audits complete, populate `aeoReadiness` and `geoReadiness` in `BaselineMetricsDto`
- Existing baselines remain unchanged (no backfill)

### Snapshot Integration

In snapshot creation:
- Use latest valid AEO/GEO audit
- If stale: show `dataQuality: STALE`

### Issue Integration

- Material AEO/GEO findings → `Issues` with kind `AEO_GAP`/`GEO_GAP`
- Source: `AEO_AUDIT`/`GEO_AUDIT`
- Re-audit reconciliation: update existing open findings, don't duplicate
- Finding identity: `site + page + findingType + question/entity identity`

### Recommendation Integration

- Findings → `Recommendations` with reason, evidence, impact, confidence, effort
- Only material findings become recommendations (prevent issue flooding)
- Impact/confidence/effort computed deterministically from finding severity + page importance

### Opportunity Integration

- QUESTION_GAP → `keyword_opportunities` type `QUESTION_GAP`
- ENTITY_GAP → `keyword_opportunities` type (new: `ENTITY_GAP`)
- EVIDENCE_GAP → new opportunity type
- CONTENT_EXPANSION → new opportunity type

### Content Engine Integration

When creating content from AEO/GEO opportunity:
- Pass: existing target URL, AEO findings, GEO findings, questions, verified facts, sources, keyword cluster, GSC evidence
- Content Brief Engine receives all this context automatically

### Report Integration

Reports now include real AEO/GEO sections:
- AEO: Question Coverage, Answer Gaps, Intent Coverage, Decision Content
- GEO: Entity Clarity, Fact Consistency, Evidence, Machine Accessibility, Citation Readiness
- Label: "Internal Platform Readiness Score"

### Work Queue

Major findings create work queue entries:
- High AEO question gap
- Intent mismatch
- Entity inconsistency
- Unverified major claim
- AI crawler discovery blocked
- High-value page with weak GEO readiness
- Commercial page lacking decision information

---

## Phase 12: Crawler Registry

### Default crawlers in `ai_crawler_registry`:

```typescript
DEFAULT_AI_CRAWLERS = [
  { name: 'Googlebot', userAgentPattern: 'Googlebot', purpose: 'SEARCH_DISCOVERY', category: 'search' },
  { name: 'Bingbot', userAgentPattern: 'Bingbot', purpose: 'SEARCH_DISCOVERY', category: 'search' },
  { name: 'ChatGPT-User', userAgentPattern: 'ChatGPT-User', purpose: 'USER_FETCH', category: 'ai-fetch' },
  { name: 'GPTBot', userAgentPattern: 'GPTBot', purpose: 'TRAINING', category: 'ai-training' },
  { name: 'ClaudeBot', userAgentPattern: 'ClaudeBot', purpose: 'TRAINING', category: 'ai-training' },
  { name: 'Claude-Web', userAgentPattern: 'Claude-Web', purpose: 'USER_FETCH', category: 'ai-fetch' },
  { name: 'PerplexityBot', userAgentPattern: 'PerplexityBot', purpose: 'SEARCH_DISCOVERY', category: 'ai-search' },
  { name: 'Amazonbot', userAgentPattern: 'Amazonbot', purpose: 'TRAINING', category: 'ai-training' },
  { name: 'anthropic-ai', userAgentPattern: 'anthropic-ai', purpose: 'TRAINING', category: 'ai-training' },
  { name: 'Bytespider', userAgentPattern: 'Bytespider', purpose: 'TRAINING', category: 'ai-training' },
  { name: 'Applebot-Extended', userAgentPattern: 'Applebot-Extended', purpose: 'TRAINING', category: 'ai-training' },
  { name: 'Yandex', userAgentPattern: 'Yandex', purpose: 'SEARCH_DISCOVERY', category: 'search' },
]
```

---

## Phase 13: Tests

Per spec sections 125-144:

1. **AEO direct answer** — page with clear answer → STRONG; page with filler → WEAK
2. **Question coverage** — 5 questions, page answers 4 → structured result
3. **Commercial decision support** — service page with scope/process/pricing → strong
4. **No fake price** — KB has no price → auditor must not invent one
5. **Entity consistency** — KB says Riyadh, page says Jeddah → finding
6. **Verified claim** — KB verifies certification → supported claim
7. **Unverified claim** — "largest company" with no evidence → unverified finding
8. **Original information** — case study data → stronger originality score
9. **Crawler policy** — allowed crawler → ALLOWED; blocked → BLOCKED
10. **Training vs search** — training blocked, search allowed → not fully blocked
11. **AI visibility separation** — 80% mention rate + 45 GEO → independent values
12. **No AI observations** — no visibility tests → GEO still measurable
13. **No GSC** — new site → audit works, GSC evidence unavailable
14. **Stale crawl** — old crawl → stale source warning
15. **Unchanged page** — same hash + version → reuse semantic analysis
16. **Changed page** — hash changes → re-audit required
17. **Score reproducibility** — same inputs → same score
18. **Score versioning** — V1 history preserved when V2 introduced
19. **Content opportunity** — high-impression page with missing question → QUESTION_GAP opportunity
20. **Verified publish loop** — AEO finding → opportunity → content → publish → crawl → re-audit → resolved

---

## File Count Estimate

- New files: ~30 (entities, services, rules, scoring, prompts, UI tabs, tests)
- Modified files: ~40 (enums, DTOs, existing entities, controllers, modules, activation, dashboard, reports)
- Migrations: 3 (0050, 0051, 0052)
- Tests: ~40 test cases across deterministic rules + scoring + services

---

## Execution Order

1. Enums + DTOs (packages/types)
2. Migrations 0050-0052 (packages/database)
3. Entity updates (packages/database/src/entities)
4. Crawl text storage (packages/links, packages/crawler, packages/audit-rules)
5. Deterministic rules (packages/audit-rules/src/rules/aeo.ts, geo.ts)
6. Page classifier (packages/audit-rules/src/page-classifier.ts)
7. Scoring engine (packages/audit-rules/src/aeo-scoring.ts, geo-scoring.ts)
8. AI prompts (migration + prompt registry)
9. Audit services (packages/links/src/aeo-audit.service.ts, geo-audit.service.ts)
10. Crawler policy service (packages/links/src/ai-crawler-policy.service.ts)
11. Controller extensions (apps/api)
12. Module wiring (apps/api)
13. Activation integration (apps/api)
14. Dashboard/baseline integration (apps/api)
15. UI tabs (apps/web)
16. Tests
17. Build verification (turbo run build + test)

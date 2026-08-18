# GC06 — AI Visibility Observations, Verified Citations, Competitor Share of Voice & Prompt Tracking

## Implementation Plan

**Status:** IN PROGRESS
**Estimated Tasks:** 9 phases, ~25 files changed
**DB Migrations:** 0052–0056 (5 migrations)
**New Test Scenarios:** 25 mandatory (GC06 Sections 129–153)

---

## Current State Summary

The AI Visibility module has a **solid foundation** but lacks GC06 methodology requirements:

| Area | Current | GC06 Requires |
|------|---------|---------------|
| Provider capabilities | Hardcoded in `factory.ts` | DB-level capability registry |
| Observation types | None (all treated same) | GENERATION_ONLY, SEARCH_ENABLED, SOURCE_GROUNDED |
| Citation provenance | Regex URL extraction only | Provider-provenanced verified citations |
| Prompt sets | Mutable JSONB, no versioning | Versioned with history, methodology_version |
| Competitors | String array in `site.settings` | Dedicated entity with aliases, domains, sources |
| Entity detection | Simple text matching | Alias normalization, mention vs inclusion vs recommended |
| Contamination protection | None | KB withheld from test model, logged |
| Multi-provider comparison | Single provider per run | Simultaneous multi-provider runs |
| Cost budgeting | Recorded only | Enforced monthly budget with approval |
| Repeat runs | Not supported | Configurable repeat count per prompt |
| Brand mention vs citation | Both booleans, mixed | Clearly separated metrics |

---

## Phase 1: Database Schema & Entities

### Migration 0052: Prompt Set Domain + Prompt Entity + Competitors

**New tables:**

#### `ai_visibility_prompt_sets_v2` (replaces old `ai_visibility_prompt_sets`)
```
id UUID PK
site_id UUID FK
name VARCHAR(100)
description TEXT
language VARCHAR(10) DEFAULT 'ar'
country VARCHAR(10)
target_city VARCHAR(100) NULL
status VARCHAR(20) DEFAULT 'DRAFT'  -- DRAFT/ACTIVE/PAUSED/ARCHIVED
version INT DEFAULT 1
methodology_version VARCHAR(20) DEFAULT 'MV1'
created_by UUID FK NULL
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
UNIQUE(site_id, name, version)
```

#### `ai_visibility_prompts`
```
id UUID PK
prompt_set_id UUID FK
site_id UUID UUID FK
text TEXT
normalized_text TEXT
category VARCHAR(30)  -- BRAND/COMMERCIAL/INFORMATIONAL/LOCAL/COMPARISON/DECISION/PROBLEM_SOLUTION/PRODUCT/SERVICE/CATEGORY/QUESTION
intent VARCHAR(30)
cluster_id UUID NULL FK
target_url TEXT NULL
priority INT DEFAULT 5
weight DECIMAL(5,2) DEFAULT 1.0
market VARCHAR(30)
language VARCHAR(10)
city VARCHAR(100) NULL
status VARCHAR(20) DEFAULT 'SUGGESTED'  -- SUGGESTED/APPROVED/REJECTED/ARCHIVED
source VARCHAR(30)  -- MANUAL/GSC/KEYWORD_CLUSTER/AEO_QUESTION_MAP/GEO_ENTITY_GAP/CONTENT_OPPORTUNITY/AI_SUGGESTION
source_ref JSONB NULL
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
INDEX(prompt_set_id, category, status)
```

#### `ai_visibility_competitors`
```
id UUID PK
site_id UUID FK
name VARCHAR(200)
canonical_name VARCHAR(200)
domain VARCHAR(255) NULL
aliases JSONB DEFAULT '[]'
type VARCHAR(30) DEFAULT 'DIRECT'  -- DIRECT/INDIRECT/MARKETPLACE/INFORMATION_SOURCE/OTHER
status VARCHAR(20) DEFAULT 'ACTIVE'  -- ACTIVE/ARCHIVED
source VARCHAR(30) DEFAULT 'MANUAL'
notes TEXT NULL
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
INDEX(site_id, status)
```

### Migration 0053: Observation Entity + Source Provenance

#### `ai_visibility_observations_v2` (replaces old `ai_visibility_observations`)
```
id UUID PK
site_id UUID FK
run_id UUID FK
prompt_id UUID FK NULL
prompt_set_version INT
category VARCHAR(30)
text TEXT
normalized_text TEXT
provider VARCHAR(40)
model VARCHAR(160)
methodology_version VARCHAR(20) DEFAULT 'MV1'
observation_type VARCHAR(30) DEFAULT 'GENERATION_ONLY'
status VARCHAR(20) DEFAULT 'QUEUED'
observed_at DATE
response TEXT
response_hash VARCHAR(64)
brand_mentioned BOOLEAN DEFAULT false
brand_included BOOLEAN DEFAULT false
appearance_order INT NULL
verified_target_citation BOOLEAN DEFAULT false
target_cited_urls JSONB DEFAULT '[]'
competitor_results JSONB DEFAULT '[]'
provenance_quality VARCHAR(30) DEFAULT 'UNKNOWN'
usage JSONB NULL
cost_usd DECIMAL(12,6) DEFAULT 0
latency_ms INT DEFAULT 0
error_code VARCHAR(50) NULL
contamination_logged BOOLEAN DEFAULT false
kb_withheld BOOLEAN DEFAULT true
created_at TIMESTAMPTZ
INDEX(site_id, observed_at, category)
INDEX(run_id)
INDEX(prompt_id, provider)
```

Statuses: QUEUED/RUNNING/SUCCESS/PARTIAL/FAILED/UNSUPPORTED/RATE_LIMITED

#### `ai_visibility_source_provenance`
```
id UUID PK
observation_id UUID FK
provider VARCHAR(40)
source_type VARCHAR(30)  -- PROVIDER_CITATION/GENERATED_REFERENCE/INFERRED_DOMAIN/UNKNOWN
title TEXT NULL
url TEXT NULL
domain VARCHAR(255) NULL
normalized_url TEXT NULL
registered_domain VARCHAR(255) NULL
host VARCHAR(255) NULL
provider_source_id VARCHAR(200) NULL
citation_index INT NULL
provenance_status VARCHAR(30) DEFAULT 'UNKNOWN'
raw_metadata JSONB NULL
created_at TIMESTAMPTZ
INDEX(observation_id)
INDEX(domain, provenance_status)
```

Provenance statuses: VERIFIED_PROVIDER_SOURCE/UNVERIFIED_GENERATED_REFERENCE/INFERRED_DOMAIN/UNKNOWN

### Migration 0054: Provider Capabilities + Cost Budget

#### `ai_provider_capabilities`
```
id UUID PK
provider VARCHAR(40) UNIQUE
capabilities JSONB DEFAULT '[]'
default_model VARCHAR(160)
max_output_tokens INT NULL
supports_temperature BOOLEAN DEFAULT true
supports_seed BOOLEAN DEFAULT false
supports_location_context BOOLEAN DEFAULT false
supports_search BOOLEAN DEFAULT false
supports_citations BOOLEAN DEFAULT false
supports_source_provenance BOOLEAN DEFAULT false
rate_limit_rpm INT NULL
updated_at TIMESTAMPTZ
```

Capabilities array: TEXT_GENERATION/STRUCTURED_OUTPUT/WEB_SEARCH/SOURCE_PROVENANCE/CITATIONS/SEARCH_RESULT_METADATA/LOCATION_CONTEXT/MODEL_VERSION/REQUEST_SEED/TEMPERATURE_CONTROL

#### `ai_visibility_budgets`
```
id UUID PK
site_id UUID FK UNIQUE
monthly_observation_budget_usd DECIMAL(10,4) DEFAULT 10.0
max_tests_per_run INT DEFAULT 50
repeat_count INT DEFAULT 1
enabled_providers JSONB DEFAULT '["OPENAI","ANTHROPIC","PERPLEXITY"]'
priority_prompt_only BOOLEAN DEFAULT false
hard_budget BOOLEAN DEFAULT true
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### Migration 0055: Visibility Baseline + Snapshots

#### `ai_visibility_baselines`
```
id UUID PK
site_id UUID FK
prompt_set_id UUID FK
prompt_set_version INT
providers JSONB
models JSONB
methodology_version VARCHAR(20)
period_start DATE
period_end DATE
metrics JSONB
created_at TIMESTAMPTZ
UNIQUE(site_id, prompt_set_version, period_start)
```

#### `ai_visibility_snapshots`
```
id UUID PK
site_id UUID FK
period_start DATE
period_end DATE
prompt_set_version INT
methodology_version VARCHAR(20)
metrics JSONB
data_quality VARCHAR(30) DEFAULT 'GOOD'
created_at TIMESTAMPTZ
INDEX(site_id, period_start)
```

Data quality: GOOD/PARTIAL/LOW_COVERAGE/METHODOLOGY_CHANGED/PROVIDER_FAILURE/INSUFFICIENT/STALE

---

## Phase 2: Provider Capability Registry

### Files to create/modify:

1. **`packages/database/src/entities/ai-provider-capability.ts`** — New entity
2. **`packages/database/src/entities/ai-visibility-budget.ts`** — New entity
3. **`packages/ai/src/provider/capabilities.ts`** — Capability registry service
4. **`packages/ai/src/provider/factory.ts`** — Extend to declare capabilities
5. **`packages/ai/src/contracts.ts`** — Add `ProviderCapability` interface

### Capability declaration per provider:

```typescript
// OpenAI
capabilities: [TEXT_GENERATION, STRUCTURED_OUTPUT, REQUEST_SEED, TEMPERATURE_CONTROL]
supports_citations: false
supports_source_provenance: false

// Anthropic
capabilities: [TEXT_GENERATION, STRUCTURED_OUTPUT, TEMPERATURE_CONTROL]
supports_citations: false
supports_source_provenance: false

// Perplexity
capabilities: [TEXT_GENERATION, STRUCTURED_OUTPUT, WEB_SEARCH, SOURCE_PROVENANCE, CITATIONS, SEARCH_RESULT_METADATA]
supports_citations: true
supports_source_provenance: true
```

---

## Phase 3: Entity Detection + Alias Normalization + Source Provenance

### Files to create:

1. **`packages/visibility/src/entity-detector.ts`** — Deterministic entity detection with alias resolution
2. **`packages/visibility/src/alias-normalizer.ts`** — Arabic/English alias normalization
3. **`packages/visibility/src/source-provenance.ts`** — Source provenance extraction and classification
4. **`packages/visibility/src/domain-normalizer.ts`** — Domain normalization (www, http/https, tracking params)

### Entity detection output:

```typescript
interface EntityDetectionResult {
  brand: {
    mentioned: boolean;
    included: boolean;
    recommended: boolean;
    cited: boolean;
    appearanceOrder: number | null;
    context: 'recommended' | 'compared' | 'criticized' | 'cited_as_source' | 'example' | 'alternative' | 'neutral_mention';
  };
  competitors: Array<{
    name: string;
    canonicalId: string;
    mentioned: boolean;
    included: boolean;
    appearanceOrder: number | null;
  }>;
  sources: SourceProvenance[];
}
```

### Source provenance extraction:

```typescript
interface SourceProvenance {
  provider: string;
  sourceType: 'PROVIDER_CITATION' | 'GENERATED_REFERENCE' | 'INFERRED_DOMAIN' | 'UNKNOWN';
  title: string | null;
  url: string | null;
  domain: string | null;
  normalizedUrl: string | null;
  providerSourceId: string | null;
  citationIndex: number | null;
  provenanceStatus: 'VERIFIED_PROVIDER_SOURCE' | 'UNVERIFIED_GENERATED_REFERENCE' | 'INFERRED_DOMAIN' | 'UNKNOWN';
  rawMetadata: Record<string, unknown> | null;
}
```

---

## Phase 4: Observation Engine

### Files to create/modify:

1. **`packages/visibility/src/observation-engine.ts`** — Core observation engine
2. **`packages/visibility/src/contamination-protection.ts`** — KB withholding logic
3. **`packages/visibility/src/cost-budget.ts`** — Budget enforcement
4. **`packages/visibility/src/visibility.service.ts`** — Major refactor

### Key changes to VisibilityService:

```typescript
// Before (single provider, no contamination check)
async run(siteId, orgId, target, options) {
  const result = await this.ai.generateText(name, { prompt }, { siteId, orgId, workflow });
  // ...
}

// After (multi-provider, contamination protection, repeat runs, budget)
async run(siteId, orgId, target, options) {
  const budget = await this.budgetService.checkBudget(siteId);
  if (!budget.allowed) throw new BudgetExceededException(budget.remaining);

  const providers = this.resolveProviders(siteId, options);
  const repeatCount = options.repeatCount ?? budget.repeatCount ?? 1;

  for (const provider of providers) {
    for (let i = 0; i < repeatCount; i++) {
      const result = await this.executeObservation(provider, prompt, siteId, orgId, {
        withholdKB: !isBrandedPrompt(prompt),
        observationType: this.classifyObservationType(provider),
      });
      // ...
    }
  }
}
```

### Contamination protection:

```typescript
interface ContaminationProtection {
  withholdKnowledgeBase: boolean;
  withholdGeoFindings: boolean;
  withholdAeoFindings: boolean;
  logged: boolean;
}
```

For non-branded prompts:
- Do NOT pass site Knowledge Base to test model
- Do NOT pass GEO audit findings
- Do NOT pass AEO audit findings
- Log that KB was withheld

---

## Phase 5: Competitive Share of Voice + Prompt Coverage

### Files to create:

1. **`packages/visibility/src/competitive-share.ts`** — Share of voice calculation
2. **`packages/visibility/src/prompt-coverage.ts`** — Prompt coverage tracking

### Competitive share of voice:

```typescript
interface CompetitiveShareOfVoice {
  mentionShare: {
    target: number;
    competitors: Array<{ competitorId: string; name: string; share: number }>;
  };
  citationShare: {
    target: number;
    competitors: Array<{ competitorId: string; name: string; share: number }>;
  };
  denominator: number;  // Total observations with successful responses
  methodologyNote: string;  // "Controlled observation — not market share"
}
```

### Prompt coverage:

```typescript
interface PromptCoverage {
  totalPrompts: number;
  testedPrompts: number;
  coverage: number;
  byProvider: Record<string, { tested: number; successful: number }>;
  byCategory: Record<string, { tested: number; successful: number }>;
  missingPrompts: Array<{ promptId: string; text: string; category: string }>;
}
```

---

## Phase 6: Metrics, Baseline, Snapshots, Reporting

### Files to create/modify:

1. **`packages/visibility/src/metrics.ts`** — Extend with GC06 metrics
2. **`packages/visibility/src/baseline.ts`** — AI visibility baseline
3. **`packages/visibility/src/snapshot.ts`** — Periodic snapshots
4. **`packages/visibility/src/reporting.ts`** — Client reporting with methodology note

### GC06 Metrics (extend existing):

```typescript
interface GC06Metrics {
  // Existing (keep)
  brandMentionRate: number;
  citationRate: number;
  sourceCoverage: number;
  competitorInclusion: number;
  shareOfVoice: ShareOfVoice;

  // New (GC06)
  brandInclusionRate: number;
  verifiedCitationRate: number;
  domainCitationRate: number;
  urlCitationRate: number;
  competitiveMentionShare: CompetitiveShare;
  competitiveCitationShare: CompetitiveShare;
  promptCoverage: number;
  observedMentionFrequency: number;  // For repeat runs
  brandMentionConsistency: number;   // For repeat runs
  citationConsistency: number;       // For repeat runs
  dataQuality: DataQuality;
  methodologyVersion: string;
}
```

### Methodology note (mandatory for all reports):

```
This report contains controlled observations from [Provider] ([Model]).
Metrics represent observations from standardized prompts — not universal AI rankings.
Verified citations are only counted from provider-provenanced sources.
[If methodology changed]: Methodology changed between periods — comparison quality downgraded.
```

---

## Phase 7: APIs + UI Screens

### New API endpoints:

```
POST   /sites/:siteId/visibility/prompt-sets          — Create prompt set
GET    /sites/:siteId/visibility/prompt-sets           — List prompt sets
GET    /sites/:siteId/visibility/prompt-sets/:id       — Get prompt set
PUT    /sites/:siteId/visibility/prompt-sets/:id       — Update prompt set
POST   /sites/:siteId/visibility/prompt-sets/:id/prompts — Add prompt
DELETE /sites/:siteId/visibility/prompt-sets/:id/prompts/:promptId — Remove prompt

POST   /sites/:siteId/visibility/competitors           — Add competitor
GET    /sites/:siteId/visibility/competitors            — List competitors
PUT    /sites/:siteId/visibility/competitors/:id        — Update competitor
DELETE /sites/:siteId/visibility/competitors/:id        — Remove competitor

POST   /sites/:siteId/visibility/budget                — Set budget
GET    /sites/:siteId/visibility/budget                — Get budget

POST   /sites/:siteId/visibility/runs                  — Execute run (enhanced)
GET    /sites/:siteId/visibility/runs                  — List runs (enhanced)
GET    /sites/:siteId/visibility/runs/:id              — Get run (enhanced)
GET    /sites/:siteId/visibility/runs/:id/sources       — Source provenance for run
GET    /sites/:siteId/visibility/sources                — Source explorer
GET    /sites/:siteId/visibility/competitive-share      — Competitive share of voice
GET    /sites/:siteId/visibility/prompt-coverage        — Prompt coverage
GET    /sites/:siteId/visibility/baseline               — Get/create baseline
GET    /sites/:siteId/visibility/snapshots              — List snapshots
```

### UI screens:

1. **Prompt Sets** — Versioned prompt set editor with categories, sources, weights
2. **Competitors** — Competitor management with aliases, domains, types
3. **Observations** — Enhanced observation table with provenance indicators
4. **Source Explorer** — Domain/URL citation analysis
5. **Competitive Share** — Share of voice visualization
6. **Budget** — Cost budget configuration
7. **Baseline** — Baseline comparison

---

## Phase 8: Background Jobs + Scheduling

### BullMQ jobs:

1. **`visibility-observation-run`** — Execute visibility observation run
2. **`visibility-snapshot-create`** — Create periodic snapshots
3. **`visibility-budget-check`** — Check budget before scheduled runs
4. **`visibility-competitor-discovery`** — Suggest potential competitors from observations

### Scheduling:

- Priority prompts: Weekly
- Full prompt set: Monthly
- Snapshots: Weekly
- Budget check: Before each run

---

## Phase 9: Tests (25 Mandatory Scenarios)

### Test scenarios from GC06 Sections 129–153:

1. **Verified citation detection** — Provider returns structured citation → counted as verified
2. **URL in prose vs citation** — URL appears in generated text without provenance → NOT verified
3. **Provider without citations** — OpenAI/Anthropic run → citation metrics return NOT_APPLICABLE
4. **Brand mention detection** — Target brand named in response → brandMentioned=true
5. **Incidental mention** — Brand mentioned negatively → still counted as mention, context stored
6. **Multiple competitors** — Response mentions target + 3 competitors → all tracked
7. **Appearance order** — Target appears 2nd in list → appearanceOrder=2
8. **Failed provider run** — AI call fails → observation marked FAILED, excluded from denominator
9. **Model change** — Model changes mid-period → methodology discontinuity flagged
10. **Prompt set change** — Prompts updated → new version created, old observations preserved
11. **Repeated runs** — 3 runs per prompt → observedMentionFrequency calculated
12. **Branded segment** — Branded prompts → reported separately from non-branded
13. **Arabic language** — Arabic prompt → Arabic response → Arabic-specific detection
14. **Competitor alias** — Competitor known as "X" and "Y" → resolved to canonical entity
15. **Owned domain citation** — Target domain cited as source → verifiedTargetCitation=true
16. **Share of voice** — 3 entities mentioned → shares calculated correctly
17. **Low sample warning** — Only 2 prompts tested → INSUFFICIENT data quality
18. **Cost budget exceeded** — Monthly budget hit → run blocked or warning
19. **Contamination protection** — Non-branded prompt → KB NOT passed to model
20. **Knowledge base separation** — KB exists but not used in test → logged
21. **Research separation** — GEO audit findings NOT given to test model
22. **GEO independence** — AI visibility metrics don't affect GEO readiness score
23. **AEO independence** — AI visibility metrics don't affect AEO readiness score
24. **Source gap detection** — Competitor cited repeatedly, target not → opportunity created
25. **Methodology change warning** — Provider/model changes → comparison quality downgraded

---

## File Change Summary

### New files (~15):
- `packages/database/src/entities/ai-visibility-prompt-set-v2.ts`
- `packages/database/src/entities/ai-visibility-prompt.ts`
- `packages/database/src/entities/ai-visibility-competitor.ts`
- `packages/database/src/entities/ai-visibility-observation-v2.ts`
- `packages/database/src/entities/ai-visibility-source-provenance.ts`
- `packages/database/src/entities/ai-provider-capability.ts`
- `packages/database/src/entities/ai-visibility-budget.ts`
- `packages/database/src/entities/ai-visibility-baseline.ts`
- `packages/database/src/entities/ai-visibility-snapshot.ts`
- `packages/visibility/src/entity-detector.ts`
- `packages/visibility/src/alias-normalizer.ts`
- `packages/visibility/src/source-provenance.ts`
- `packages/visibility/src/domain-normalizer.ts`
- `packages/visibility/src/observation-engine.ts`
- `packages/visibility/src/contamination-protection.ts`
- `packages/visibility/src/cost-budget.ts`
- `packages/visibility/src/competitive-share.ts`
- `packages/visibility/src/prompt-coverage.ts`
- `packages/visibility/src/baseline.ts`
- `packages/visibility/src/snapshot.ts`
- `packages/visibility/src/reporting.ts`
- `packages/ai/src/provider/capabilities.ts`

### Modified files (~10):
- `packages/database/src/entities/index.ts` — Export new entities
- `packages/ai/src/contracts.ts` — Add ProviderCapability interface
- `packages/ai/src/provider/factory.ts` — Declare capabilities per provider
- `packages/visibility/src/visibility.service.ts` — Major refactor
- `packages/visibility/src/parse.ts` — Extend with entity detection
- `packages/visibility/src/metrics.ts` — Extend with GC06 metrics
- `packages/types/src/enums.ts` — Add new enums
- `packages/types/src/dto.ts` — Add new DTOs
- `apps/api/src/modules/visibility/visibility.controller.ts` — Add new endpoints
- `apps/web/src/features/visibility/visibility-page.tsx` — Add new UI screens

### Migrations (5):
- 0052: Prompt sets v2 + prompts + competitors
- 0053: Observations v2 + source provenance
- 0054: Provider capabilities + budgets
- 0055: Baselines + snapshots
- 0056: Seed provider capabilities

---

## Execution Order

1. **Phase 1** → Migrations 0052–0055 + entities
2. **Phase 2** → Provider capabilities
3. **Phase 3** → Entity detection + provenance
4. **Phase 4** → Observation engine refactor
5. **Phase 5** → Competitive share + coverage
6. **Phase 6** → Metrics + baseline + snapshots
7. **Phase 7** → APIs + UI
8. **Phase 8** → Background jobs
9. **Phase 9** → Tests

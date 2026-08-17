export const USER_TYPES = ['AGENCY', 'CLIENT'] as const;
export type UserType = (typeof USER_TYPES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ORGANIZATION_STATUSES = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const SITE_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const SITE_ROLES = ['OWNER', 'MANAGER', 'VIEWER'] as const;
export type SiteRole = (typeof SITE_ROLES)[number];

export const SITE_SECRET_KINDS = [
  'WORDPRESS',
  'GSC',
  'GOOGLE_ADS',
  'GA4',
  'API_KEY',
  'OTHER',
] as const;
export type SiteSecretKind = (typeof SITE_SECRET_KINDS)[number];

export const WORDPRESS_CONNECTION_STATUSES = ['PENDING', 'CONNECTED', 'FAILED'] as const;
export type WordPressConnectionStatus = (typeof WORDPRESS_CONNECTION_STATUSES)[number];

export const GSC_CONNECTION_STATUSES = ['DISCONNECTED', 'CONNECTED', 'EXPIRED'] as const;
export type GscConnectionStatus = (typeof GSC_CONNECTION_STATUSES)[number];

export const GSC_DIMENSIONS = ['query', 'page', 'country', 'device'] as const;
export type GscDimension = (typeof GSC_DIMENSIONS)[number];

/**
 * Opportunity rules. `position` values are Search Console *average* positions
 * across users/impressions and must not be treated as an exact universal
 * ranking position for a query.
 */
export const GSC_OPPORTUNITY_KINDS = [
  'HIGH_IMPRESSIONS_LOW_CTR',
  'POSITION_4_10',
  'POSITION_11_20',
  'DECLINING_PAGE',
  'RISING_PAGE',
  'NEW_QUERY',
  'LOST_QUERY',
  'CONTENT_DECAY',
  'QUERY_URL_CONFLICT',
] as const;
export type GscOpportunityKind = (typeof GSC_OPPORTUNITY_KINDS)[number];

export const GSC_OPPORTUNITY_STATUSES = ['OPEN', 'DISMISSED', 'ACTIONED'] as const;
export type GscOpportunityStatus = (typeof GSC_OPPORTUNITY_STATUSES)[number];

export const KEYWORD_SOURCES = ['seed', 'gsc', 'ads', 'topic', 'manual'] as const;
export type KeywordSource = (typeof KEYWORD_SOURCES)[number];

export const KEYWORD_INTENTS = ['TRANSACTIONAL', 'COMMERCIAL', 'INFORMATIONAL', 'NAVIGATIONAL'] as const;
export type KeywordIntent = (typeof KEYWORD_INTENTS)[number];

export const KEYWORD_STATUSES = ['CANDIDATE', 'ACTIVE', 'DISMISSED'] as const;
export type KeywordStatus = (typeof KEYWORD_STATUSES)[number];

export const KEYWORD_PAGE_TYPES = ['SERVICE', 'PRODUCT', 'BLOG', 'LANDING', 'CATEGORY', 'SUPPORT', 'OTHER'] as const;
export type KeywordPageType = (typeof KEYWORD_PAGE_TYPES)[number];

export const CLUSTER_ACTIONS = ['KEEP', 'UPDATE', 'EXPAND', 'CREATE', 'MERGE', 'REDIRECT', 'REVIEW'] as const;
export type ClusterAction = (typeof CLUSTER_ACTIONS)[number];

export const CLUSTER_STATUSES = ['DRAFT', 'APPROVED', 'REVIEW'] as const;
export type ClusterStatus = (typeof CLUSTER_STATUSES)[number];

export const AI_PROVIDER_KINDS = ['OPENAI', 'ANTHROPIC', 'PERPLEXITY'] as const;
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number];

export const AI_JOB_STATUSES = ['RUNNING', 'SUCCEEDED', 'FAILED', 'NO_PROVIDER'] as const;
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

export const AI_JOB_KINDS = ['TEXT', 'STRUCTURED', 'RESEARCH'] as const;
export type AiJobKind = (typeof AI_JOB_KINDS)[number];

export const AI_PROMPT_STATUSES = ['ACTIVE', 'DRAFT', 'DEPRECATED'] as const;
export type AiPromptStatus = (typeof AI_PROMPT_STATUSES)[number];

/** Workflow keys used for provider routing (global -> site -> workflow). */
export const AI_WORKFLOWS = [
  'research',
  'clustering',
  'brief',
  'writer',
  'arabic-qa',
  'content-evidence',
  'content-intent',
  'content-aeo',
  'content-geo',
  'content-gap',
  'content-brief',
  'content-brief-gate',
  'content-outline',
  'content-draft',
  'content-language',
  'content-seo-validator',
  'content-aeo-validator',
  'content-geo-validator',
  'content-rankmath-validator',
  'content-factual',
  'content-links',
  'content-qa',
  'operations-recommendation',
  'visibility-observation',
] as const;
export type AiWorkflow = (typeof AI_WORKFLOWS)[number];

// ---------------------------------------------------------------------------
// Content intelligence pipeline
// ---------------------------------------------------------------------------

/**
 * Ordered pipeline stages. Stages 1-7 build the brief; the brief gate (control
 * stage) must pass before the outline/draft stages run. Stages 11-16 validate
 * and refine; 17-18 plan links and run final QA.
 */
export const PIPELINE_STAGES = [
  'research',
  'evidence-extraction',
  'intent-analysis',
  'aeo-question-map',
  'geo-entity-analysis',
  'content-gap-analysis',
  'content-brief',
  'brief-gate',
  'outline',
  'draft',
  'language-editor',
  'seo-validator',
  'aeo-validator',
  'geo-validator',
  'rankmath-validator',
  'factual-validator',
  'internal-link-planning',
  'final-qa',
] as const;
export type PipelineStageId = (typeof PIPELINE_STAGES)[number];

/** Coarse lifecycle of a pipeline run / content package. */
export const PIPELINE_STATUSES = [
  'QUEUED',
  'RUNNING',
  'AWAITING_APPROVAL',
  'REJECTED',
  'COMPLETE',
  'FAILED',
] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const STAGE_STATUSES = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED'] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const VALIDATOR_IDS = ['SEO', 'AEO', 'GEO', 'RANKMATH', 'FACTUAL', 'FINAL_QA'] as const;
export type ValidatorId = (typeof VALIDATOR_IDS)[number];

export const CONTENT_LANGUAGES = ['en', 'ar'] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

// ---------------------------------------------------------------------------
// Operations management
// ---------------------------------------------------------------------------

/** Issue lifecycle. The pipeline never mutates a live site; it creates issues. */
export const ISSUE_STATUSES = [
  'DETECTED',
  'REVIEWED',
  'APPROVED',
  'IN_PROGRESS',
  'FIXED',
  'VERIFYING',
  'RESOLVED',
  'IGNORED',
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_KINDS = [
  'TRAFFIC_DROP',
  'CTR_DROP',
  'POSITION_DECLINE',
  'CRITICAL_TECHNICAL',
  'GSC_FAILURE',
  'WORDPRESS_FAILURE',
  'CONTENT_DECAY',
  'CANNIBALIZATION',
  'IMPRESSION_DECLINE',
  'QUERY_VISIBILITY_LOSS',
  'ON_PAGE',
  'ORCHESTRATION',
  'MANUAL',
] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

export const ISSUE_SOURCES = ['ALERT', 'GSC', 'WORDPRESS', 'CRAWLER', 'MANUAL', 'N8N'] as const;
export type IssueSource = (typeof ISSUE_SOURCES)[number];

export const RECOMMENDATION_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type RecommendationPriority = (typeof RECOMMENDATION_PRIORITIES)[number];

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Change log change types (title, meta, content, headings, canonical, robots, schema, internal links, redirect, page created/removed, Rank Math). */
export const CHANGE_TYPES = [
  'title',
  'meta',
  'content',
  'headings',
  'canonical',
  'robots',
  'schema',
  'internal_links',
  'redirect',
  'page_created',
  'page_removed',
  'rank_math',
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

/** Immutable baseline snapshot types. */
export const BASELINE_TYPES = ['BASELINE', 'PERIODIC', 'MONTHLY', 'QUARTERLY'] as const;
export type BaselineType = (typeof BASELINE_TYPES)[number];

/** Site snapshot types (recalculated from source data). */
export const SITE_SNAPSHOT_TYPES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'MANUAL'] as const;
export type SiteSnapshotType = (typeof SITE_SNAPSHOT_TYPES)[number];

/** The baseline metric areas. */
export const BASELINE_METRIC_KEYS = [
  'crawlHealth',
  'technicalIssues',
  'onPageHealth',
  'contentHealth',
  'aeoReadiness',
  'geoReadiness',
  'gscMetrics',
  'keywordVisibility',
  'internalLinkHealth',
  'seoHealth',
  'pagesCrawled',
  'indexablePages',
  'noindexPages',
  'criticalIssues',
  'highIssues',
  'mediumIssues',
  'lowIssues',
  'rankingQueries',
  'queriesWithImpressions',
  'top3QueryCount',
  'top10QueryCount',
  'top20QueryCount',
  'positions11To20',
  'cannibalizationCandidates',
  'brokenInternalLinks',
  'orphanPages',
  'canonicalIssues',
  'aiVisibilityObservations',
] as const;
export type BaselineMetricKey = (typeof BASELINE_METRIC_KEYS)[number];

export const ALERT_KINDS = [
  'TRAFFIC_DROP',
  'CTR_DROP',
  'POSITION_DECLINE',
  'CRITICAL_TECHNICAL_ISSUE',
  'GSC_FAILURE',
  'WORDPRESS_FAILURE',
  'CONTENT_DECAY',
  'NEW_CANNIBALIZATION',
  'IMPRESSION_DECLINE',
  'QUERY_VISIBILITY_LOSS',
  'NEW_HIGH_IMPRESSION_QUERY',
  'POSITION_4_10_OPPORTUNITY',
  'POSITION_11_20_OPPORTUNITY',
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'ACTIONED', 'DISMISSED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

// ---------------------------------------------------------------------------
// AI visibility observation
// ---------------------------------------------------------------------------

/** Standardized prompt categories per site. */
export const VISIBILITY_CATEGORIES = [
  'BRAND',
  'COMMERCIAL',
  'INFORMATIONAL',
  'COMPARISON',
  'LOCAL',
  'DECISION',
  'PROBLEM_SOLUTION',
] as const;
export type VisibilityCategory = (typeof VISIBILITY_CATEGORIES)[number];

export const VISIBILITY_RUN_STATUSES = ['RUNNING', 'COMPLETED', 'FAILED'] as const;
export type VisibilityRunStatus = (typeof VISIBILITY_RUN_STATUSES)[number];

/** Computed observation metrics (always labelled as controlled observations). */
export const VISIBILITY_METRIC_KEYS = [
  'brandMentionRate',
  'citationRate',
  'sourceCoverage',
  'competitorInclusion',
  'shareOfVoice',
] as const;
export type VisibilityMetricKey = (typeof VISIBILITY_METRIC_KEYS)[number];

// ---------------------------------------------------------------------------
// Internal-link intelligence
// ---------------------------------------------------------------------------

/** Workflow for a link suggestion: Suggest -> Approve -> Apply -> Verify. */
export const LINK_SUGGESTION_STATUSES = ['SUGGESTED', 'APPROVED', 'APPLIED', 'VERIFIED', 'REJECTED'] as const;
export type LinkSuggestionStatus = (typeof LINK_SUGGESTION_STATUSES)[number];

export const LINK_SUGGESTION_ACTIONS = ['ADD_LINK', 'REMOVE_LINK', 'CHANGE_ANCHOR'] as const;
export type LinkSuggestionAction = (typeof LINK_SUGGESTION_ACTIONS)[number];

export const LINK_DETECTIONS = [
  'OPPORTUNITY',
  'ORPHAN',
  'WEAK_TARGET',
  'BROKEN',
  'OVERUSED_ANCHOR',
  'CONFLICT',
] as const;
export type LinkDetection = (typeof LINK_DETECTIONS)[number];

export const LINK_ANALYSIS_STATUSES = ['RUNNING', 'COMPLETED', 'FAILED'] as const;
export type LinkAnalysisStatus = (typeof LINK_ANALYSIS_STATUSES)[number];

// ---------------------------------------------------------------------------
// Versioned crawl runs
// ---------------------------------------------------------------------------

export const CRAWL_RUN_STATUSES = ['RUNNING', 'COMPLETED', 'FAILED'] as const;
export type CrawlRunStatus = (typeof CRAWL_RUN_STATUSES)[number];

/** How robots.txt was resolved for a crawl run. */
export const CRAWL_ROBOTS_STATUSES = ['ALLOWED', 'BLOCKED', 'NOT_FOUND', 'ERROR'] as const;
export type CrawlRobotsStatus = (typeof CRAWL_ROBOTS_STATUSES)[number];

/** How sitemap discovery resolved for a crawl run. */
export const CRAWL_SITEMAP_STATUSES = ['OK', 'NOT_FOUND', 'ERROR'] as const;
export type CrawlSitemapStatus = (typeof CRAWL_SITEMAP_STATUSES)[number];

export const CRAWL_ERROR_TYPES = [
  'http',
  'robots',
  'network',
  'timeout',
  'invalid_url',
  'ssrf',
  'blocked',
  'other',
] as const;
export type CrawlErrorType = (typeof CRAWL_ERROR_TYPES)[number];

// ---------------------------------------------------------------------------
// Deterministic audit engine
// ---------------------------------------------------------------------------

/** Scope of an audit run over a crawl run. */
export const AUDIT_RUN_TYPES = [
  'FULL',
  'TECHNICAL',
  'ON_PAGE',
  'CONTENT',
  'INTERNAL_LINKING',
  'SEO',
  'AEO',
  'GEO',
] as const;
export type AuditRunType = (typeof AUDIT_RUN_TYPES)[number];

export const AUDIT_RUN_STATUSES = ['RUNNING', 'COMPLETED', 'FAILED'] as const;
export type AuditRunStatus = (typeof AUDIT_RUN_STATUSES)[number];

/** Version of the Internal Platform Health Score algorithm. */
export const AUDIT_HEALTH_SCORE_VERSION = 1;

// ---------------------------------------------------------------------------
// Canonical metric grains & data availability
// ---------------------------------------------------------------------------

/**
 * Explicit aggregation grain for every persisted Google Search Console metric
 * row. Consumers MUST filter by grain before summing — rows of different
 * grains can never be safely added together (e.g. SITE_DAILY clicks + QUERY_DAILY
 * clicks would double-count the same traffic).
 */
export const METRIC_GRAINS = [
  'SITE_DAILY',
  'PAGE_DAILY',
  'QUERY_DAILY',
  'QUERY_PAGE_DAILY',
  'COUNTRY_DAILY',
  'DEVICE_DAILY',
  'QUERY_COUNTRY_DAILY',
  'QUERY_DEVICE_DAILY',
] as const;
export type MetricGrain = (typeof METRIC_GRAINS)[number];

/**
 * Data-availability state for a high-level metric. A metric whose underlying
 * data is unavailable must NEVER be represented as zero — use one of these
 * states so "not measured" stays distinct from "measured zero".
 */
export const METRIC_AVAILABILITY = [
  'AVAILABLE',
  'NOT_CONNECTED',
  'NOT_SYNCED',
  'INSUFFICIENT_DATA',
  'NOT_MEASURED',
  'STALE',
  'ERROR',
] as const;
export type MetricAvailability = (typeof METRIC_AVAILABILITY)[number];

/**
 * Explicit direction metadata for each metric. Determines whether an increase
 * in the numeric value is semantically positive, negative, or context-dependent.
 * This replaces any generic `positive_change = current > previous` logic.
 */
export const METRIC_DIRECTION = {
  // Higher is better
  clicks: 'higher_better',
  impressions: 'higher_better',
  ctr: 'higher_better',
  seoHealth: 'higher_better',
  crawlHealth: 'higher_better',
  onPageHealth: 'higher_better',
  contentHealth: 'higher_better',
  internalLinkHealth: 'higher_better',
  keywordVisibility: 'higher_better',
  pagesCrawled: 'higher_better',
  indexablePages: 'higher_better',
  rankingQueries: 'higher_better',
  queriesWithImpressions: 'higher_better',
  top3QueryCount: 'higher_better',
  top10QueryCount: 'higher_better',
  top20QueryCount: 'higher_better',

  // Lower is better
  avgPosition: 'lower_better',
  noindexPages: 'lower_better',
  criticalIssues: 'lower_better',
  highIssues: 'lower_better',
  mediumIssues: 'lower_better',
  lowIssues: 'lower_better',
  brokenInternalLinks: 'lower_better',
  orphanPages: 'lower_better',
  canonicalIssues: 'lower_better',
  cannibalizationCandidates: 'lower_better',
  positions11To20: 'lower_better',

  // Context-dependent (not used in direct comparison until real audits exist)
  aeoReadiness: 'not_measured',
  geoReadiness: 'not_measured',
  aiVisibilityObservations: 'context_dependent',
} as const;

export type MetricDirection = typeof METRIC_DIRECTION[keyof typeof METRIC_DIRECTION];
export type MetricKey = keyof typeof METRIC_DIRECTION;

/**
 * Query position buckets for visibility classification (Section 17).
 * Count distinct queries meeting minimum visibility requirements.
 * Keep "All Queries" and "Tracked/Qualified Queries" separate.
 */
export const GSC_QUERY_POSITION_BUCKETS = [
  'TOP_3',
  'TOP_10',
  'TOP_20',
  'POSITION_11_20',
  'POSITION_21_50',
  'POSITION_51_PLUS',
] as const;
export type GscQueryPositionBucket = (typeof GSC_QUERY_POSITION_BUCKETS)[number];

/**
 * Minimum impressions threshold for a query to be counted as "qualified".
 * Configurable per site but default is 10 impressions during the period.
 */
export const DEFAULT_MIN_IMPRESSIONS_THRESHOLD = 10;

/**
 * Keyword metric data sources (Section 18).
 * Never overwrite one source with another.
 */
export const KEYWORD_METRIC_SOURCES = ['GSC', 'GOOGLE_ADS', 'MANUAL', 'AI_RESEARCH'] as const;
export type KeywordMetricSource = (typeof KEYWORD_METRIC_SOURCES)[number];

/**
 * Trend classification for growing/declining (Section 27).
 */
export const TREND_ALGORITHMS = ['CLICK_THRESHOLD_v1'] as const;
export type TrendAlgorithm = (typeof TREND_ALGORITHMS)[number];

export const TREND_CLASSIFICATIONS = ['GROWING', 'DECLINING', 'STABLE', 'INSUFFICIENT_DATA'] as const;
export type TrendClassification = (typeof TREND_CLASSIFICATIONS)[number];

/**
 * Data quality status (Section 28).
 */
export const DATA_QUALITY_STATUSES = ['GOOD', 'PARTIAL', 'STALE', 'INSUFFICIENT', 'ERROR'] as const;
export type DataQualityStatus = (typeof DATA_QUALITY_STATUSES)[number];

/**
 * Comparison modes for incomplete months (Section 38).
 */
export const COMPARISON_MODES = ['SAME_NUMBER_OF_DAYS', 'FULL_PREVIOUS_MONTH'] as const;
export type ComparisonMode = (typeof COMPARISON_MODES)[number];

/**
 * Alert rule algorithm versions (Section 41).
 */
export const ALERT_ALGORITHM_VERSIONS = ['v1', 'v2'] as const;
export type AlertAlgorithmVersion = (typeof ALERT_ALGORITHM_VERSIONS)[number];

// ---------------------------------------------------------------------------
// Self-hosted reporting
// ---------------------------------------------------------------------------

/** Report types. INITIAL and MONTHLY are composite; the rest are focused. */
export const REPORT_TYPES = [
  'INITIAL',
  'MONTHLY',
  'EXECUTIVE',
  'SEO',
  'AEO',
  'GEO',
  'TECHNICAL',
  'CONTENT',
  'ISSUES',
  'WORK_COMPLETED',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_STATUSES = ['GENERATED', 'PDF_PENDING', 'PDF_FAILED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Supported report languages. Arabic reports render RTL, English LTR. */
export const REPORT_LANGUAGES = ['en', 'ar'] as const;
export type ReportLanguage = (typeof REPORT_LANGUAGES)[number];

// ---------------------------------------------------------------------------
// n8n orchestration
// ---------------------------------------------------------------------------

/** Backend-owned orchestration job lifecycle (PostgreSQL is the source of truth). */
export const WORKFLOW_JOB_STATUSES = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMEOUT'] as const;
export type WorkflowJobStatus = (typeof WORKFLOW_JOB_STATUSES)[number];

/** The 15 n8n workflows the backend orchestrates. */
export const ORCHESTRATION_WORKFLOWS = [
  'site-sync',
  'crawl-audit',
  'gsc-sync',
  'keyword-discovery',
  'keyword-clustering',
  'content-brief',
  'content-generation',
  'content-qa',
  'internal-linking',
  'wp-draft-publisher',
  'post-publish-verification',
  'monitoring-opportunities',
  'ai-visibility-observation',
  'monthly-snapshot',
  'report-generation',
] as const;
export type OrchestrationWorkflow = (typeof ORCHESTRATION_WORKFLOWS)[number];

// ---------------------------------------------------------------------------
// Content publishing (WordPress)
// ---------------------------------------------------------------------------

/** Lifecycle of a content package publication to WordPress. */
export const CONTENT_PUBLICATION_STATUSES = ['DRAFT', 'APPROVED', 'PUBLISHED', 'VERIFIED', 'FAILED'] as const;
export type ContentPublicationStatus = (typeof CONTENT_PUBLICATION_STATUSES)[number];

export const ROLE_KEYS = [
  'SUPER_ADMIN',
  'ADMIN',
  'SEO_MANAGER',
  'CONTENT_MANAGER',
  'EDITOR',
  'VIEWER',
  'CLIENT',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ACTIVITY_ACTIONS = [
  'auth.login',
  'auth.logout',
  'auth.refresh',
  'user.create',
  'user.update',
  'user.deactivate',
  'user.assign_roles',
  'organization.create',
  'organization.update',
  'site.create',
  'site.update',
  'site.delete',
  'site.membership.create',
  'site.membership.delete',
  'site.secret.create',
  'site.secret.delete',
  'wordpress.check',
  'wordpress.sync',
  'wordpress.disconnect',
  'gsc.connect',
  'gsc.disconnect',
  'gsc.sync',
  'gsc.property.select',
  'keywords.pipeline',
  'keywords.override',
  'content.pipeline',
  'content.brief.approve',
  'content.brief.reject',
  'content.publish',
  'operations.issue.create',
  'operations.issue.update',
  'operations.recommendation.create',
  'operations.task.create',
  'operations.task.update',
  'operations.changelog.create',
  'operations.baseline.create',
  'operations.alert.create',
  'operations.alert.update',
  'visibility.run',
  'visibility.run.create',
  'visibility.promptset.update',
  'links.analysis',
  'links.suggestion.create',
  'links.suggestion.approve',
  'links.suggestion.apply',
  'links.suggestion.verify',
  'links.suggestion.reject',
  'reports.generate',
  'reports.view',
  'client.access',
  'client.view',
  'orchestration.job.create',
  'orchestration.job.dispatch',
  'orchestration.job.callback',
  'orchestration.job.fail',
  'activation.step.run',
  'automation.settings.update',
  'automation.dispatch',
  'automation.run',
  'workqueue.assign',
  'workqueue.priority',
  'workqueue.reviewed',
  'workqueue.ignore',
  'workqueue.task',
  'workqueue.filter.save',
  'workqueue.filter.delete',
  'knowledge.fact.create',
  'knowledge.fact.update',
  'knowledge.fact.delete',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Site activation (guided first-site wizard)
// ---------------------------------------------------------------------------

export const ACTIVATION_STEP_STATUSES = ['NOT_STARTED', 'READY', 'RUNNING', 'COMPLETED', 'WARNING', 'FAILED', 'NOT_IMPLEMENTED'] as const;
export type ActivationStepStatus = (typeof ACTIVATION_STEP_STATUSES)[number];

/** Ordered guided activation sequence for a new client site. */
export const ACTIVATION_STEPS = [
  'add-site',
  'verify-domain',
  'connect-wordpress',
  'verify-connector',
  'verify-rank-math',
  'import-wordpress-pages',
  'crawl-website',
  'run-technical-audit',
  'run-seo-audit',
  'run-aeo-audit',
  'run-geo-readiness',
  'create-baseline',
  'connect-gsc',
  'import-historical-performance',
  'import-existing-queries',
  'build-url-inventory',
  'build-keyword-url-mapping',
  'detect-cannibalization',
  'detect-issues',
  'generate-recommendations',
  'populate-dashboard',
  'generate-initial-report',
] as const;
export type ActivationStepKey = (typeof ACTIVATION_STEPS)[number];

// ---------------------------------------------------------------------------
// Recurring platform automation (per-site scheduled operations)
// ---------------------------------------------------------------------------

export const AUTOMATION_OPERATIONS = [
  'gsc-sync',
  'technical-health',
  'full-crawl',
  'seo-audit',
  'keyword-opportunities',
  'internal-link-audit',
  'content-decay',
  'ai-visibility',
  'monthly-snapshot',
  'client-report',
] as const;
export type AutomationOperation = (typeof AUTOMATION_OPERATIONS)[number];

export const AUTOMATION_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type AutomationFrequency = (typeof AUTOMATION_FREQUENCIES)[number];

export const AUTOMATION_RUN_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED'] as const;
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

/** Wall-clock time of day in the site's timezone, `HH:MM` (24-hour). */
export const AUTOMATION_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ---------------------------------------------------------------------------
// Agency work queue (centralized operations workspace)
// ---------------------------------------------------------------------------

/**
 * Work item kinds surfaced in the unified work queue. Each maps to one or more
 * source tables (issues, tasks, content, links, jobs, reports, integrations).
 */
export const WORK_ITEM_TYPES = [
  'critical_issue',
  'recommendation',
  'overdue_task',
  'content_approval',
  'pending_review',
  'failed_job',
  'report_due',
  'visibility_loss',
  'integration_problem',
] as const;
export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

/** Same rank vocabulary as issue severities / recommendation priorities. */
export const WORK_ITEM_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

/** Work item status. Base items are PENDING; state overrides move them along. */
export const WORK_ITEM_STATUSES = ['PENDING', 'IN_PROGRESS', 'REVIEWED', 'IGNORED', 'DONE'] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

/** Where a work item comes from (drives grouping and deep links). */
export const WORK_SOURCES = [
  'issues',
  'recommendations',
  'tasks',
  'content',
  'links',
  'keywords',
  'automation',
  'workflow',
  'visibility',
  'reports',
  'integrations',
  'gsc',
] as const;
export type WorkSource = (typeof WORK_SOURCES)[number];

/** Safe bulk operations on the work queue. Publishing/modifying WordPress is
 *  intentionally absent — that requires explicit, per-item confirmation. */
export const WORK_BULK_ACTIONS = ['assign', 'change_priority', 'mark_reviewed', 'create_tasks', 'ignore'] as const;
export type WorkBulkAction = (typeof WORK_BULK_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Site knowledge base (persistent, verified facts about a client)
// ---------------------------------------------------------------------------

/** Required fact categories for the site knowledge base. */
export const KNOWLEDGE_CATEGORIES = [
  'COMPANY',
  'BUSINESS_DESCRIPTION',
  'SERVICES',
  'PRODUCTS',
  'LOCATIONS',
  'TARGET_MARKETS',
  'PEOPLE',
  'CERTIFICATIONS',
  'STATISTICS',
  'PRICES',
  'GUARANTEES',
  'DIFFERENTIATORS',
  'CTAS',
  'APPROVED_CLAIMS',
  'PROHIBITED_CLAIMS',
  'BRAND_TERMINOLOGY',
  'BRAND_VOICE',
  'CONTENT_RULES',
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

/** How trustworthy a knowledge fact is for content generation. */
export const KNOWLEDGE_VERIFICATION_STATUSES = ['VERIFIED', 'UNVERIFIED', 'INFERRED', 'EXTERNAL'] as const;
export type KnowledgeVerificationStatus = (typeof KNOWLEDGE_VERIFICATION_STATUSES)[number];

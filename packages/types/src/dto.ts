import type {
  RoleKey,
  SiteRole,
  GscConnectionStatus,
  GscDimension,
  GscOpportunityKind,
  GscOpportunityStatus,
  KeywordSource,
  KeywordIntent,
  KeywordStatus,
  KeywordPageType,
  ClusterAction,
  ClusterStatus,
  AiProviderKind,
  AiJobStatus,
  AiJobKind,
  AiPromptStatus,
  AiWorkflow,
  PipelineStageId,
  PipelineStatus,
  StageStatus,
  ValidatorId,
  ContentLanguage,
  IssueStatus,
  IssueKind,
  IssueSeverity,
  IssueSource,
  RecommendationPriority,
  TaskStatus,
  ChangeType,
  BaselineType,
  BaselineMetricKey,
  AlertKind,
  AlertStatus,
  VisibilityCategory,
  VisibilityRunStatus,
  VisibilityMetricKey,
  LinkSuggestionStatus,
  LinkSuggestionAction,
  LinkDetection,
  LinkAnalysisStatus,
  ReportType,
  ReportStatus,
  WorkflowJobStatus,
  OrchestrationWorkflow,
  ContentPublicationStatus,
  SiteStatus,
  ActivationStepKey,
  ActivationStepStatus,
} from './enums';
import type { PermissionKey } from './permissions';

export interface AuthUserDto {
  id: string;
  email: string;
  fullName: string;
  type: 'AGENCY' | 'CLIENT';
  status: 'ACTIVE' | 'SUSPENDED';
  organizationId: string | null;
  roles: RoleKey[];
  permissions: PermissionKey[];
}

export interface LoginResponseDto {
  accessToken: string;
  expiresIn: number;
  user: AuthUserDto;
}

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  type: 'AGENCY' | 'CLIENT';
  status: 'ACTIVE' | 'SUSPENDED';
  organizationId: string | null;
  roles: RoleKey[];
  createdAt: string;
  lastLoginAt: string | null;
}

export interface RoleDto {
  key: RoleKey;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export interface PermissionDto {
  key: PermissionKey;
  module: string;
  description: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  createdAt: string;
}

export interface SiteDto {
  id: string;
  organizationId: string;
  name: string;
  domain: string;
  locale: string;
  language: string;
  country: string | null;
  targetCities: string[];
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SiteMembershipDto {
  id: string;
  siteId: string;
  userId: string;
  siteRole: SiteRole;
  grantedBy: string | null;
  createdAt: string;
}

export interface SiteSecretDto {
  id: string;
  siteId: string;
  kind: string;
  label: string;
  masked: Record<string, string>;
  lastValidatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLogDto {
  id: string;
  userId: string | null;
  organizationId: string | null;
  siteId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  meta: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export interface PaginatedMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginatedMeta;
}

// ---- WordPress integration ----

export interface WordPressCheckStepResult {
  key:
    | 'wordpress_reachable'
    | 'connector_reachable'
    | 'authentication'
    | 'rank_math'
    | 'permissions';
  status: 'ok' | 'failed' | 'skipped';
  message: string;
  detail?: Record<string, unknown>;
}

export interface WordPressIntegrationDto {
  id: string;
  siteId: string;
  status: 'PENDING' | 'CONNECTED' | 'FAILED';
  wpUrl: string;
  wpVersion: string | null;
  phpVersion: string | null;
  rankMathDetected: boolean;
  rankMathVersion: string | null;
  lastCheckedAt: string | null;
  lastSyncAt: string | null;
  lastSyncSummary: WordPressSyncSummary | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WordPressSyncSummary {
  created: number;
  updated: number;
  unchanged: number;
  total: number;
}

export interface WordPressIntegrationSummaryDto {
  integration: WordPressIntegrationDto;
  site: {
    id: string;
    name: string;
    domain: string;
    status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  };
}

export interface WordPressCheckResultDto {
  integration: WordPressIntegrationDto;
  steps: WordPressCheckStepResult[];
  passed: boolean;
}

export interface WordPressSyncResultDto {
  siteId: string;
  status: 'PENDING' | 'CONNECTED' | 'FAILED';
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  total: number;
  postTypes: string[];
  lastSyncAt: string;
}

export interface WordPressImportedPostDto {
  id: string;
  siteId: string;
  wpPostId: number;
  postType: string;
  url: string;
  slug: string;
  status: string;
  title: string;
  contentHash: string;
  rankMath: Record<string, unknown>;
  modifiedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WordPressSyncQuery {
  status?: string;
  postTypes?: string;
  prune?: boolean;
}

// ---- Requests ----

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  fullName: string;
  type?: 'AGENCY' | 'CLIENT';
  organizationId?: string | null;
  roleKeys: RoleKey[];
}

export interface UpdateUserRequest {
  fullName?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
}

export interface AssignRolesRequest {
  roleKeys: RoleKey[];
}

export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
}

export interface UpdateOrganizationRequest {
  name?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
}

export interface CreateSiteRequest {
  organizationId: string;
  name: string;
  domain: string;
  locale?: string;
  language?: string;
  country?: string | null;
  targetCities?: string[];
}

export interface UpdateSiteRequest {
  name?: string;
  domain?: string;
  locale?: string;
  language?: string;
  country?: string | null;
  targetCities?: string[];
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
}

export interface CreateMembershipRequest {
  userId: string;
  siteRole?: SiteRole;
}

export interface CreateSecretRequest {
  kind: 'WORDPRESS' | 'GSC' | 'GOOGLE_ADS' | 'GA4' | 'API_KEY' | 'OTHER';
  label: string;
  payload: Record<string, string>;
}

export interface ListParams {
  page?: number;
  perPage?: number;
  search?: string;
}

// ---- Google Search Console ----

export interface GscPropertyDto {
  id: string;
  siteId: string;
  /** Property URL (URL-prefix) or sc-domain:example.com (domain property). */
  siteUrl: string;
  type: 'URL_PREFIX' | 'DOMAIN';
  permissionLevel: string;
  selected: boolean;
  status: GscConnectionStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GscConnectRequest {
  siteUrl: string;
  permissionLevel?: string;
  type?: 'URL_PREFIX' | 'DOMAIN';
}

export interface GscRegisterTokensRequest {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

export interface GscSyncRequest {
  dimensions?: GscDimension[];
  startDate?: string;
  endDate?: string;
}

export interface GscSyncResultDto {
  siteId: string;
  properties: Array<{
    siteUrl: string;
    rows: number;
    startDate: string;
    endDate: string;
  }>;
}

export interface GscMetricTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
}

export interface GscPerformancePoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
}

export interface GscPerformanceRowDto {
  /** Dimension value ('(all)' when no dimension breakdown was requested). */
  key: string;
  totals: GscMetricTotals;
  previousTotals: GscMetricTotals;
  deltas: {
    clicksPct: number | null;
    impressionsPct: number | null;
    ctrDelta: number | null;
    avgPositionDelta: number | null;
  };
  series: GscPerformancePoint[];
}

export interface GscPerformanceDto {
  siteId: string;
  siteUrl: string;
  dimension: GscDimension | null;
  comparison: 'prev28' | 'baseline' | 'custom';
  currentWindow: { startDate: string; endDate: string };
  previousWindow: { startDate: string; endDate: string };
  totals: GscMetricTotals;
  previousTotals: GscMetricTotals;
  rows: GscPerformanceRowDto[];
  /**
   * avgPosition values come from Search Console and are averages across users,
   * impressions and pages. They are directional, not exact universal ranks.
   */
  note: string;
}

export interface GscOpportunityDto {
  id: string;
  siteId: string;
  siteUrl: string;
  kind: GscOpportunityKind;
  query: string | null;
  page: string | null;
  status: GscOpportunityStatus;
  windowStart: string;
  windowEnd: string;
  currentValue: Record<string, unknown>;
  previousValue: Record<string, unknown>;
  detectedAt: string;
}

export interface GscOpportunitiesQuery {
  kind?: GscOpportunityKind;
  status?: GscOpportunityStatus;
  windowDays?: number;
}

// ---- Keyword engine ----

export interface KeywordDto {
  id: string;
  siteId: string;
  source: KeywordSource;
  keyword: string;
  normalized: string;
  intent: KeywordIntent;
  status: KeywordStatus;
  metrics: {
    clicks: number;
    impressions: number;
    ctr: number;
    avgPosition: number | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SeedKeywordRequest {
  keyword: string;
  intent?: KeywordIntent;
  source?: KeywordSource;
}

export interface ClusterKeywordDto {
  keywordId: string;
  keyword: string;
  role: 'primary' | 'secondary';
  metrics: {
    clicks: number;
    impressions: number;
    ctr: number;
    avgPosition: number | null;
  };
}

export interface ClusterDto {
  id: string;
  siteId: string;
  name: string;
  intent: KeywordIntent;
  pageType: KeywordPageType;
  confidence: number;
  targetUrl: string | null;
  recommendedAction: ClusterAction;
  status: ClusterStatus;
  aiReviewed: boolean;
  note: string | null;
  primaryKeyword: string;
  secondaryKeywords: string[];
  cannibalization: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UrlMappingDto {
  id: string;
  siteId: string;
  clusterId: string | null;
  keywordId: string | null;
  url: string;
  source: string;
  manualOverride: boolean;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApproveClusterRequest {
  targetUrl?: string;
  action?: ClusterAction;
}

export interface OverrideMappingRequest {
  url: string;
}

export interface KeywordPipelineResultDto {
  siteId: string;
  ingested: number;
  createdKeywords: number;
  clusters: ClusterDto[];
  createdMappings: number;
  skippedManualOverrides: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// AI infrastructure
// ---------------------------------------------------------------------------

export interface AiWorkflowOverrideDto {
  provider?: AiProviderKind;
  model?: string;
  /** Ordered fallback providers (empty = use global fallback). */
  fallback?: AiProviderKind[];
}

export interface AiProviderConfigDto {
  siteId: string;
  enabled: boolean;
  workflowOverrides: Partial<Record<AiWorkflow, AiWorkflowOverrideDto>>;
  /** Provider kinds that have a site-level key override (value never exposed). */
  keyOverrides: AiProviderKind[];
  updatedAt: string;
}

export interface AiProviderConfigRequest {
  enabled?: boolean;
  workflowOverrides?: Partial<Record<AiWorkflow, AiWorkflowOverrideDto>>;
  /** Provider kind -> new API key to encrypt and store (undefined leaves unchanged). */
  apiKeys?: Partial<Record<AiProviderKind, string>>;
  /** Provider kinds whose stored key override should be removed. */
  removeApiKeys?: AiProviderKind[];
}

export interface AiPromptDto {
  promptName: string;
  version: number;
  systemPrompt: string;
  template: string;
  schema: Record<string, unknown> | null;
  status: AiPromptStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AiPromptCreateRequest {
  promptName: string;
  systemPrompt: string;
  template: string;
  schema?: Record<string, unknown> | null;
  status?: AiPromptStatus;
}

export interface AiProviderHealthDto {
  provider: AiProviderKind;
  ok: boolean;
  configured: boolean;
  latencyMs: number | null;
  message: string | null;
}

export interface AiHealthDto {
  providers: AiProviderHealthDto[];
}

export interface AiJobDto {
  id: string;
  siteId: string | null;
  workflow: AiWorkflow | string;
  promptName: string | null;
  promptVersion: number | null;
  kind: AiJobKind;
  provider: AiProviderKind;
  model: string;
  status: AiJobStatus;
  attempts: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AiJobsQuery {
  siteId?: string;
  workflow?: string;
  status?: AiJobStatus;
  limit?: number;
}

export interface AiGenerationRequest {
  siteId?: string;
  workflow: AiWorkflow | string;
  promptName: string;
  variables: Record<string, string>;
  /** Per-call override (highest priority in the resolution hierarchy). */
  provider?: AiProviderKind;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AiGenerationResultDto {
  text: string | null;
  data: Record<string, unknown> | null;
  sources: Array<{ title: string; url: string; snippet: string | null }> | null;
  summary: string | null;
  provider: AiProviderKind;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  latencyMs: number;
  jobId: string;
}

// ---------------------------------------------------------------------------
// Content intelligence pipeline
// ---------------------------------------------------------------------------

export interface ContentOutlineSection {
  heading: string;
  headingLevel?: 'h2' | 'h3';
  purpose: string;
  points: string[];
}

export interface ContentInternalLink {
  targetUrl: string;
  anchorText: string;
  position: string;
  reason: string;
}

export interface ContentExternalEvidence {
  title: string;
  url: string;
  snippet: string | null;
  claim: string | null;
}

export interface ContentSchemaRecommendation {
  type: string;
  jsonLd: Record<string, unknown> | null;
  rationale: string;
}

export interface ContentRankMathFields {
  focusKeyword: string;
  focusKeywords: string[];
  seoTitle: string;
  metaDescription: string;
  slug: string;
  scoreTarget: number;
  scoreActual: number | null;
  /** Internal guidance; never an official Rank Math score. */
  note: string;
}

export interface ContentFactClaim {
  claim: string;
  status: 'VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED';
  sourceUrl: string | null;
  evidence: string | null;
}

export interface ContentLanguageEditorResult {
  original: string;
  corrected: string;
  changed: boolean;
  notes: string[];
  /** True when the draft already met the language quality bar. */
  passed: boolean;
}

export interface ContentBriefDto {
  title: string;
  intent: KeywordIntent;
  pageType: KeywordPageType;
  targetAudience: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  recommendedUrl: string;
  seoTitle: string;
  metaDescription: string;
  h1: string;
  outline: ContentOutlineSection[];
  keyQuestions: string[];
  entities: string[];
  competitorSummary: string;
  existingPageAssessment: string | null;
  searchVolumeContext: string | null;
  notes: string[];
}

export interface BriefGateResult {
  approved: boolean;
  score: number;
  reasons: string[];
  blockers: string[];
}

export interface PipelineStageRecordDto {
  id: PipelineStageId;
  name: string;
  status: StageStatus;
  workflow: string | null;
  promptName: string | null;
  promptVersion: number | null;
  jobId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  summary: string | null;
}

export interface ScoreMetricDto {
  id: string;
  label: string;
  /** Internal 0-100 score; not an official search-engine score. */
  score: number;
  weight: number;
  passed: boolean;
  details: string;
}

export interface ValidatorResultDto {
  validator: ValidatorId;
  label: string;
  overallScore: number;
  metrics: ScoreMetricDto[];
  passed: boolean;
  /** Internal score — clearly not an official search-engine score. */
  isInternalScore: true;
  recommendations: string[];
  note: string | null;
}

export interface InternalScoresDto {
  seo: ValidatorResultDto;
  aeo: ValidatorResultDto;
  geo: ValidatorResultDto;
  rankMath: ValidatorResultDto;
  factual: ValidatorResultDto;
  finalQa: ValidatorResultDto;
}

export interface FinalQaResultDto {
  overallScore: number;
  passed: boolean;
  mustFix: string[];
  shouldFix: string[];
  approvedForPublication: boolean;
}

export interface ContentPackageDto {
  id: string;
  siteId: string;
  organizationId: string | null;
  clusterId: string | null;
  status: PipelineStatus;
  language: ContentLanguage;
  locale: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  intent: KeywordIntent;
  pageType: KeywordPageType;
  recommendedUrl: string;
  seoTitle: string;
  metaDescription: string;
  slug: string;
  h1: string;
  outline: ContentOutlineSection[];
  htmlContent: string;
  internalLinks: ContentInternalLink[];
  externalEvidence: ContentExternalEvidence[];
  schemaRecommendation: ContentSchemaRecommendation;
  rankMath: ContentRankMathFields;
  brief: ContentBriefDto;
  briefGate: BriefGateResult;
  languageEditor: ContentLanguageEditorResult | null;
  factClaims: ContentFactClaim[];
  scores: InternalScoresDto;
  qa: FinalQaResultDto;
  stages: PipelineStageRecordDto[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface PipelineInputDto {
  clusterId?: string | null;
  targetUrl?: string | null;
  existingPageUrl?: string | null;
  existingPageContent?: string | null;
  language?: ContentLanguage;
  locale?: string;
  additionalInstructions?: string;
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  verifiedFacts?: string[];
  internalLinkCandidates?: Array<{ url: string; anchorText: string }>;
  researchEvidence?: string | null;
}

export interface RunPipelineRequest {
  clusterId?: string;
  targetUrl?: string | null;
  existingPageUrl?: string | null;
  existingPageContent?: string | null;
  language?: ContentLanguage;
  locale?: string;
  additionalInstructions?: string;
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  verifiedFacts?: string[];
  internalLinkCandidates?: Array<{ url: string; anchorText: string }>;
  researchEvidence?: string | null;
}

export interface BriefDecisionRequest {
  approve: boolean;
  note?: string;
}

export interface ContentPackageListItemDto {
  id: string;
  siteId: string;
  clusterId: string | null;
  status: PipelineStatus;
  primaryKeyword: string;
  language: ContentLanguage;
  seoTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPackagesQuery {
  status?: PipelineStatus;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Operations management
// ---------------------------------------------------------------------------

export interface IssueDto {
  id: string;
  siteId: string;
  organizationId: string | null;
  kind: IssueKind;
  severity: IssueSeverity;
  title: string;
  description: string;
  url: string | null;
  status: IssueStatus;
  source: IssueSource;
  alertId: string | null;
  data: Record<string, unknown>;
  note: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIssueRequest {
  kind: IssueKind;
  severity: IssueSeverity;
  title: string;
  description?: string;
  url?: string | null;
  source?: IssueSource;
  data?: Record<string, unknown>;
}

export interface UpdateIssueRequest {
  status?: IssueStatus;
  note?: string;
}

export interface RecommendationDto {
  id: string;
  issueId: string;
  siteId: string;
  title: string;
  evidence: string;
  reason: string;
  impact: number;
  confidence: number;
  effort: number;
  priority: RecommendationPriority;
  suggestedAction: string;
  aiExplained: boolean;
  createdAt: string;
}

export interface CreateRecommendationRequest {
  issueId: string;
  title: string;
  evidence: string;
  reason?: string;
  impact: number;
  confidence: number;
  effort: number;
  suggestedAction?: string;
  aiExplain?: boolean;
}

export interface TaskDto {
  id: string;
  siteId: string;
  issueId: string | null;
  recommendationId: string | null;
  title: string;
  url: string | null;
  assigneeId: string | null;
  deadline: string | null;
  status: TaskStatus;
  internalNotes: string;
  clientNotes: string;
  evidence: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  issueId?: string | null;
  recommendationId?: string | null;
  title: string;
  url?: string | null;
  assigneeId?: string | null;
  deadline?: string | null;
  internalNotes?: string;
  clientNotes?: string;
  evidence?: string;
}

export interface UpdateTaskRequest {
  status?: TaskStatus;
  assigneeId?: string | null;
  deadline?: string | null;
  internalNotes?: string;
  clientNotes?: string;
}

export interface ChangeLogDto {
  id: string;
  siteId: string;
  organizationId: string | null;
  pageUrl: string;
  taskId: string | null;
  changeType: ChangeType;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  changedBy: string | null;
  changedAt: string;
  createdAt: string;
}

export interface CreateChangeLogRequest {
  pageUrl: string;
  taskId?: string | null;
  changeType: ChangeType;
  before?: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

export interface BaselineMetricsDto {
  crawlHealth: number;
  technicalIssues: number;
  onPageHealth: number;
  contentHealth: number;
  aeoReadiness: number;
  geoReadiness: number;
  gscMetrics: {
    clicks: number;
    impressions: number;
    ctr: number;
    avgPosition: number | null;
  };
  keywordVisibility: number;
  internalLinkHealth: number;
}

export interface IssueSnapshotEntry {
  id: string;
  status: IssueStatus;
}

export interface BaselineSnapshotDto {
  id: string;
  siteId: string;
  organizationId: string | null;
  type: BaselineType;
  isBaseline: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  metrics: BaselineMetricsDto;
  issues: IssueSnapshotEntry[];
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CreateBaselineSnapshotRequest {
  type: BaselineType;
  periodStart?: string | null;
  periodEnd?: string | null;
  metrics: BaselineMetricsDto;
  note?: string | null;
}

export interface MetricComparisonDto {
  key: BaselineMetricKey;
  prev: number | null;
  curr: number;
  delta: number | null;
  deltaPct: number | null;
  direction: 'improved' | 'declined' | 'flat' | 'n/a';
}

export interface IssueProgressionDto {
  initial: number;
  new: number;
  resolved: number;
  remaining: number;
  regressed: number;
  totalOpen: number;
}

export interface SnapshotComparisonDto {
  from: BaselineSnapshotDto;
  to: BaselineSnapshotDto;
  metrics: MetricComparisonDto[];
  issueProgression: IssueProgressionDto;
}

export interface ProgressDashboardDto {
  baselineToCurrent: SnapshotComparisonDto | null;
  previousToCurrent: SnapshotComparisonDto | null;
  monthToMonth: SnapshotComparisonDto | null;
  quarterToQuarter: SnapshotComparisonDto | null;
  issueProgression: IssueProgressionDto | null;
  currentMetrics: BaselineMetricsDto | null;
  updatedAt: string;
}

export interface AlertDto {
  id: string;
  siteId: string;
  organizationId: string | null;
  kind: AlertKind;
  severity: IssueSeverity;
  title: string;
  description: string;
  data: Record<string, unknown>;
  status: AlertStatus;
  issueId: string | null;
  detectedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvalResultDto {
  alert: AlertDto | null;
  issueId: string | null;
  skipped: boolean;
}

export interface EvaluateAlertsRequest {
  gscHealthy?: boolean;
  wordpressHealthy?: boolean;
  traffic?: { clicks: number; prevClicks: number };
  ctr?: { ctr: number; prevCtr: number };
  position?: { avgPosition: number; prevAvgPosition: number; keywords: number };
  criticalTechnicalIssueCount?: number;
  contentDecay?: Array<{ page: string; clicks: number; prevClicks: number }>;
  cannibalization?: Array<{ query: string; pages: string[] }>;
}

export interface OperationsQuery {
  status?: string;
  kind?: string;
  url?: string;
  siteId?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// AI visibility observation
// ---------------------------------------------------------------------------

export interface VisibilityPromptDto {
  category: VisibilityCategory;
  prompt: string;
}

export interface VisibilityPromptSetDto {
  id: string;
  siteId: string;
  name: string;
  prompts: VisibilityPromptDto[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePromptSetRequest {
  name?: string;
  prompts?: VisibilityPromptDto[];
  enabled?: boolean;
}

export interface VisibilityObservationDto {
  id: string;
  siteId: string;
  runId: string;
  category: VisibilityCategory;
  prompt: string;
  provider: AiProviderKind;
  model: string;
  observedAt: string;
  response: string;
  brandMentioned: boolean;
  websiteCited: boolean;
  citedUrls: string[];
  competitorsMentioned: string[];
  context: Record<string, unknown>;
  confidence: number;
  error: string | null;
  createdAt: string;
}

export interface VisibilityMetricsDto {
  /** Share of observations where the brand was mentioned (0-1). */
  brandMentionRate: number;
  /** Share of observations where the site's own website was cited (0-1). */
  citationRate: number;
  /** Share of observations with at least one cited URL (0-1). */
  sourceCoverage: number;
  /** Share of observations mentioning at least one competitor (0-1). */
  competitorInclusion: number;
  /** AI Share of Voice observation: brand vs competitor presence (0-1 each). */
  shareOfVoice: { brand: number; competitors: number };
  totalObservations: number;
  provider: AiProviderKind;
  model: string;
  /**
   * Controlled observation from the configured AI provider and model.
   * Never an exact ChatGPT/Claude/Perplexity user ranking.
   */
  isControlledObservation: true;
  label: string;
}

export interface VisibilityRunDto {
  id: string;
  siteId: string;
  organizationId: string | null;
  provider: AiProviderKind | null;
  model: string | null;
  status: VisibilityRunStatus;
  observedAt: string;
  startedAt: string;
  completedAt: string | null;
  observationsCount: number;
  metrics: VisibilityMetricsDto | null;
  error: string | null;
  createdAt: string;
}

export interface CreateVisibilityRunRequest {
  /** ISO date for the observation batch (defaults to now). */
  observedAt?: string;
  /** Restrict the run to these categories (default: all). */
  categories?: VisibilityCategory[];
}

export interface VisibilityTrendPointDto {
  runId: string;
  observedAt: string;
  provider: AiProviderKind;
  model: string;
  metrics: VisibilityMetricsDto;
}

export interface VisibilityMetricDelta {
  key: VisibilityMetricKey;
  label: string;
  latest: number | null;
  previous: number | null;
  delta: number | null;
}

export interface VisibilityTrendsDto {
  siteId: string;
  points: VisibilityTrendPointDto[];
  latestVsPrevious: {
    latest: VisibilityTrendPointDto;
    previous: VisibilityTrendPointDto;
    deltas: VisibilityMetricDelta[];
  } | null;
  /** Controlled observations; never described as official AI-engine rankings. */
  isControlledObservation: true;
  label: string;
}

export interface VisibilityObservationQuery {
  runId?: string;
  category?: VisibilityCategory;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Internal-link intelligence
// ---------------------------------------------------------------------------

export interface CrawledLinkDto {
  url: string;
  anchor: string;
}

export interface CrawledPageDto {
  id: string;
  siteId: string;
  url: string;
  title: string | null;
  httpStatus: number | null;
  wordCount: number;
  text: string;
  headings: string[];
  outLinks: CrawledLinkDto[];
  crawledAt: string;
  createdAt: string;
}

export interface CreateCrawledPageRequest {
  url: string;
  title?: string | null;
  httpStatus?: number | null;
  text?: string;
  headings?: string[];
  outLinks?: CrawledLinkDto[];
}

export interface LinkSuggestionDto {
  id: string;
  siteId: string;
  analysisId: string | null;
  sourceUrl: string;
  targetUrl: string;
  anchor: string;
  context: string;
  confidence: number;
  reason: string;
  detection: LinkDetection;
  action: LinkSuggestionAction;
  status: LinkSuggestionStatus;
  notes: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  appliedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkSuggestionDecisionRequest {
  notes?: string;
}

export interface ApplyLinkSuggestionRequest {
  notes?: string;
  appliedSnapshot?: Record<string, unknown>;
}

export interface VerifyLinkSuggestionRequest {
  found: boolean;
  notes?: string;
}

export interface LinkStatsDto {
  orphanPages: number;
  weakTargets: number;
  brokenLinks: number;
  opportunities: number;
  overusedAnchors: number;
  conflictingLinks: number;
  crawledPages: number;
  approvedTargets: number;
}

export interface LinkAnalysisDto {
  id: string;
  siteId: string;
  status: LinkAnalysisStatus;
  stats: LinkStatsDto;
  suggestionsCreated: number;
  createdAt: string;
  completedAt: string | null;
}

export interface LinkAnalysisReportDto {
  analysis: LinkAnalysisDto;
  suggestions: LinkSuggestionDto[];
}

export interface LinkSuggestionQuery {
  status?: LinkSuggestionStatus;
  detection?: LinkDetection;
  sourceUrl?: string;
  targetUrl?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Self-hosted reporting
// ---------------------------------------------------------------------------

export interface ReportBrandingDto {
  siteId: string;
  agencyName: string;
  agencyLogoUrl: string;
  clientName: string;
  clientLogoUrl: string;
  contactDetails: Record<string, string>;
  footer: string;
  updatedAt: string;
}

export interface SaveReportBrandingRequest {
  agencyName?: string;
  agencyLogoUrl?: string;
  clientName?: string;
  clientLogoUrl?: string;
  contactDetails?: Record<string, string>;
  footer?: string;
}

export interface ReportDto {
  id: string;
  siteId: string;
  organizationId: string | null;
  type: ReportType;
  title: string;
  periodStart: string | null;
  periodEnd: string | null;
  version: number;
  status: ReportStatus;
  pdfPath: string | null;
  meta: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

export interface ReportContentDto extends ReportDto {
  html: string;
}

export interface GenerateReportRequest {
  type: ReportType;
  periodStart?: string | null;
  periodEnd?: string | null;
}

export interface ReportQuery {
  type?: ReportType;
  siteId?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Restricted client access
// ---------------------------------------------------------------------------

export interface ClientSiteDto {
  id: string;
  name: string;
  domain: string;
  status: SiteStatus;
  locale: string;
  language: string;
}

export interface ClientOverviewDto {
  site: ClientSiteDto;
  status: string;
  currentHealth: BaselineMetricsDto | null;
  openIssues: number;
  majorIssues: number;
  workCompleted: number;
  latestReport: ReportDto | null;
  updatedAt: string;
}

export interface ClientComparisonDto {
  metrics: MetricComparisonDto[];
  issueProgression: IssueProgressionDto;
}

export interface ClientProgressDto {
  baselineToCurrent: ClientComparisonDto | null;
  previousToCurrent: ClientComparisonDto | null;
  monthToMonth: { metrics: MetricComparisonDto[] } | null;
  quarterToQuarter: { metrics: MetricComparisonDto[] } | null;
  currentMetrics: BaselineMetricsDto | null;
}

export interface ClientPerformanceDto {
  metrics: MetricComparisonDto[];
  gsc: BaselineMetricsDto['gscMetrics'];
  visibility: VisibilityMetricsDto | null;
}

export interface ClientWorkItemDto {
  kind: string;
  pageUrl: string | null;
  label: string;
  changedAt: string;
}

export interface ClientWorkDto {
  items: ClientWorkItemDto[];
}

export interface ClientIssueDto {
  id: string;
  title: string;
  kind: IssueKind;
  severity: IssueSeverity;
  status: IssueStatus;
  url: string | null;
  detectedAt: string;
}

export interface ClientIssuesDto {
  items: ClientIssueDto[];
  open: number;
  resolved: number;
}

export interface ClientRecommendationDto {
  id: string;
  issueId: string;
  title: string;
  priority: RecommendationPriority;
  suggestedAction: string;
  createdAt: string;
}

export interface ClientRecommendationsDto {
  items: ClientRecommendationDto[];
}

// ---------------------------------------------------------------------------
// n8n orchestration
// ---------------------------------------------------------------------------

export interface OrchestrationJobDto {
  id: string;
  siteId: string;
  organizationId: string | null;
  workflow: OrchestrationWorkflow;
  status: WorkflowJobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  idempotencyKey: string | null;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  error: string | null;
  n8nExecutionId: string | null;
  createdBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrchestrationJobRequest {
  workflow: OrchestrationWorkflow;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface OrchestrationJobQuery {
  status?: WorkflowJobStatus;
  workflow?: OrchestrationWorkflow;
  limit?: number;
  offset?: number;
}

export interface N8nCallbackRequest {
  idempotencyKey?: string;
  jobId?: string;
  executionId?: string;
  status: 'SUCCEEDED' | 'FAILED';
  result?: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Content publishing (WordPress)
// ---------------------------------------------------------------------------

export interface ContentPublicationDto {
  id: string;
  siteId: string;
  organizationId: string | null;
  contentPackageId: string | null;
  wpPostId: number | null;
  status: ContentPublicationStatus;
  title: string;
  url: string | null;
  meta: Record<string, unknown>;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  verifiedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePublicationRequest {
  packageId: string;
  slug?: string | null;
}

// ---------------------------------------------------------------------------
// Dashboards (portfolio + site) — aggregated by the backend, not the frontend
// ---------------------------------------------------------------------------

export interface DashboardSummaryDto {
  totalSites: number;
  activeSites: number;
  sitesWithIntegrationProblems: number;
  sitesRequiringAttention: number;
  openIssues: number;
  criticalIssues: number;
  highPriorityIssues: number;
  openRecommendations: number;
  highPriorityRecommendations: number;
  openTasks: number;
  overdueTasks: number;
  contentAwaitingReview: number;
  draftContent: number;
  publishedContentThisMonth: number;
  reportsDue: number;
  reportsGeneratedThisMonth: number;
  sitesGrowing: number;
  sitesDeclining: number;
  seoHealthAverage: number | null;
  aeoReadinessAverage: number | null;
  geoReadinessAverage: number | null;
  aiJobsThisMonth: number;
  aiEstimatedCostThisMonth: number;
  crawlerJobsRunning: number;
  failedAutomationJobs: number;
}

export interface NeedsAttentionItemDto {
  siteId: string;
  siteName: string;
  problem: string;
  severity: IssueSeverity;
  detectedAt: string;
  nextAction: string;
  deepLink: string;
}

export interface SitePortfolioRowDto {
  siteId: string;
  siteName: string;
  domain: string;
  status: SiteStatus;
  seoHealth: number | null;
  aeoReadiness: number | null;
  geoReadiness: number | null;
  clicks: number;
  clicksChange: number | null;
  impressions: number;
  openCriticalIssues: number;
  openIssues: number;
  openTasks: number;
  contentPending: number;
  lastCrawl: string | null;
  lastGscSync: string | null;
  lastAudit: string | null;
  nextReport: string | null;
  integrationHealth: string;
}

export interface PortfolioDashboardDto {
  summary: DashboardSummaryDto;
  needsAttention: NeedsAttentionItemDto[];
  sites: SitePortfolioRowDto[];
}

export interface SiteIntegrationHealthDto {
  component: string;
  status: 'healthy' | 'warning' | 'disconnected' | 'error' | 'not_configured';
  detail: string | null;
  deepLink: string | null;
}

export interface SiteMetricTotalsDto {
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number | null;
}

export interface SiteKeywordRowDto {
  keyword: string;
  clicks: number;
  impressions: number;
  position: number | null;
}

export interface SiteIssueSummaryBucketDto {
  open: number;
  inProgress: number;
  resolvedThisMonth: number;
}

export interface SiteIssueSummaryDto {
  critical: SiteIssueSummaryBucketDto;
  high: SiteIssueSummaryBucketDto;
  medium: SiteIssueSummaryBucketDto;
  low: SiteIssueSummaryBucketDto;
}

export interface SiteRecommendationDto {
  id: string;
  issueId: string;
  title: string;
  priority: RecommendationPriority;
  impact: number;
  confidence: number;
  effort: number;
}

export interface ContentStageDto {
  stage: string;
  count: number;
  latestAt: string | null;
}

export interface BaselineProgressMetricDto {
  key: string;
  label: string;
  initial: number | null;
  current: number | null;
  change: number | null;
}

export interface SiteRecentActivityDto {
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export interface SiteDashboardDto {
  site: {
    id: string;
    name: string;
    domain: string;
    locale: string;
    language: string;
    country: string | null;
    status: SiteStatus;
  };
  header: {
    market: string | null;
    language: string;
    integrationHealth: string;
    lastSync: string | null;
    lastCrawl: string | null;
  };
  main: {
    seoHealth: number | null;
    aeoReadiness: number | null;
    geoReadiness: number | null;
    clicks: number;
    impressions: number;
    ctr: number;
    avgPosition: number | null;
    topKeywords: SiteKeywordRowDto[];
    nextKeywords: SiteKeywordRowDto[];
  };
  issues: { open: number; critical: number; recommendations: number; openTasks: number };
  content: { published: number; pending: number; stages: ContentStageDto[] };
  performance: {
    current: SiteMetricTotalsDto;
    previous: SiteMetricTotalsDto;
    baseline: SiteMetricTotalsDto | null;
    currentVsPrevious: { clicksPct: number | null; impressionsPct: number | null; ctrDelta: number | null; positionDelta: number | null };
    currentVsBaseline: { clicksPct: number | null; impressionsPct: number | null; ctrDelta: number | null; positionDelta: number | null };
    hasGsc: boolean;
  };
  baselineProgress: { exists: boolean; metrics: BaselineProgressMetricDto[] } | { exists: false };
  issueSummary: SiteIssueSummaryDto;
  recommendations: SiteRecommendationDto[];
  contentPipeline: ContentStageDto[];
  integrationHealth: SiteIntegrationHealthDto[];
  recentActivity: SiteRecentActivityDto[];
  emptyStates: {
    needsCrawl: boolean;
    needsBaseline: boolean;
    needsGsc: boolean;
    needsKeywords: boolean;
    noContent: boolean;
    needsAi: boolean;
  };
}

// ---------------------------------------------------------------------------
// Site activation (guided first-site wizard)
// ---------------------------------------------------------------------------

export interface ActivationStepDto {
  key: ActivationStepKey;
  /** Machine label; the UI localizes it. */
  label: string;
  status: ActivationStepStatus;
  /** Human-readable diagnostics for FAILED / WARNING steps. */
  message: string | null;
  detail: Record<string, unknown> | null;
  /** Whether the step can be executed now from the wizard. */
  runnable: boolean;
  /** Whether the step needs the operator to do something outside the wizard. */
  requiresManualAction: boolean;
  /** True for expensive/destructive operations that must not be auto-repeated. */
  expensive: boolean;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
}

export interface ActivationSummaryDto {
  pagesImported: number;
  pagesCrawled: number;
  issuesFound: number;
  criticalIssues: number;
  seoHealth: number | null;
  aeoReadiness: number | null;
  geoReadiness: number | null;
  searchQueriesImported: number;
  keywordOpportunities: number;
  cannibalizationCases: number;
  recommendations: number;
  baselineDate: string | null;
  baselineExists: boolean;
  initialReportExists: boolean;
}

export interface SiteActivationDto {
  siteId: string;
  siteName: string;
  siteDomain: string;
  ready: boolean;
  completedSteps: number;
  totalSteps: number;
  progress: number;
  steps: ActivationStepDto[];
  summary: ActivationSummaryDto;
}

import { User } from './user';
import { Role } from './role';
import { Permission } from './permission';
import { Organization } from './organization';
import { Site } from './site';
import { SiteMembership } from './site-membership';
import { RefreshToken } from './refresh-token';
import { ActivityLog } from './activity-log';
import { SiteSecret } from './site-secret';
import { WordPressIntegration } from './wordpress-integration';
import { WordPressPost } from './wordpress-post';
import { GscProperty } from './gsc-property';
import { GscToken } from './gsc-token';
import { GscDailyMetric } from './gsc-daily-metric';
import { GscSiteDailyMetric, GscQueryDailyMetric, GscPageDailyMetric, GscQueryPageDailyMetric } from './gsc-canonical-metrics';
import { GscSyncState } from './gsc-sync-state';
import { GscOpportunity } from './gsc-opportunity';
import { Keyword } from './keyword';
import { KeywordSource } from './keyword-source';
import { KeywordMetric } from './keyword-metric';
import { KeywordPlannerMetric } from './keyword-planner-metric';
import { KeywordDiscoveryJob } from './keyword-discovery-job';
import { KeywordOpportunity } from './keyword-opportunity';
import { CannibalizationCase } from './cannibalization-case';
import { GoogleAdsIntegration } from './google-ads-integration';
import { Cluster } from './cluster';
import { ClusterKeyword } from './cluster-keyword';
import { UrlMapping } from './url-mapping';
import { AiProviderConfig } from './ai-provider-config';
import { AiJob } from './ai-job';
import { AiPrompt } from './ai-prompt';
import { ContentPackage } from './content-package';
import { Issue } from './issue';
import { Recommendation } from './recommendation';
import { OperationsTask } from './operations-task';
import { ChangeLog } from './change-log';
import { BaselineSnapshot } from './baseline-snapshot';
import { OperationsAlert } from './operations-alert';
import { AiVisibilityPromptSet } from './ai-visibility-prompt-set';
import { AiVisibilityRun } from './ai-visibility-run';
import { AiVisibilityObservation } from './ai-visibility-observation';
import { CrawledPage } from './crawled-page';
import { CrawlRun } from './crawl-run';
import { CrawlPage } from './crawl-page';
import { CrawlLink } from './crawl-link';
import { CrawlError } from './crawl-error';
import { AuditRun } from './audit-run';
import { AuditResult } from './audit-result';
import { LighthouseRun } from './lighthouse-run';
import { LinkAnalysis } from './link-analysis';
import { LinkSuggestion } from './link-suggestion';
import { ReportBranding } from './report-branding';
import { Report } from './report';
import { WorkflowJob } from './workflow-job';
import { ContentPublication } from './content-publication';
import { SiteActivationStep } from './site-activation-step';
import { SiteAutomationSettings } from './site-automation-settings';
import { SiteSnapshot } from './site-snapshot';
import { AutomationRun } from './automation-run';
import { WorkItemState } from './work-item-state';
import { WorkFilter } from './work-filter';
import { KnowledgeFact } from './knowledge-fact';
import { AeoPageAudit } from './aeo-page-audit';
import { GeoPageAudit } from './geo-page-audit';
import { PageQuestion } from './page-question';
import { PageEntity } from './page-entity';
import { EntityRelation } from './entity-relation';
import { FactEvidence } from './fact-evidence';
import { CrawlerPolicyResult } from './crawler-policy-result';
import { AiCrawlerRegistry } from './ai-crawler-registry';
import { AiVisibilityPromptSetV2 } from './ai-visibility-prompt-set-v2';
import { AiVisibilityPrompt } from './ai-visibility-prompt';
import { AiVisibilityCompetitor } from './ai-visibility-competitor';
import { AiVisibilityObservationV2 } from './ai-visibility-observation-v2';
import { AiVisibilitySourceProvenance } from './ai-visibility-source-provenance';
import { AiProviderCapability } from './ai-provider-capability';
import { AiVisibilityBudget } from './ai-visibility-budget';
import { AiVisibilityBaseline } from './ai-visibility-baseline';
import { AiVisibilitySnapshot } from './ai-visibility-snapshot';

export const entities = [
  User,
  Role,
  Permission,
  Organization,
  Site,
  SiteMembership,
  RefreshToken,
  ActivityLog,
  SiteSecret,
  WordPressIntegration,
  WordPressPost,
  GscProperty,
  GscToken,
  GscDailyMetric,
  GscSiteDailyMetric,
  GscQueryDailyMetric,
  GscPageDailyMetric,
  GscQueryPageDailyMetric,
  GscSyncState,
  GscOpportunity,
  Keyword,
  KeywordSource,
  KeywordMetric,
  KeywordPlannerMetric,
  KeywordDiscoveryJob,
  KeywordOpportunity,
  CannibalizationCase,
  GoogleAdsIntegration,
  Cluster,
  ClusterKeyword,
  UrlMapping,
  AiProviderConfig,
  AiJob,
  AiPrompt,
  ContentPackage,
  Issue,
  Recommendation,
  OperationsTask,
  ChangeLog,
  BaselineSnapshot,
  OperationsAlert,
  AiVisibilityPromptSet,
  AiVisibilityRun,
  AiVisibilityObservation,
  CrawledPage,
  CrawlRun,
  CrawlPage,
  CrawlLink,
  CrawlError,
  AuditRun,
  AuditResult,
  LighthouseRun,
  LinkAnalysis,
  LinkSuggestion,
  ReportBranding,
  Report,
  WorkflowJob,
  ContentPublication,
  SiteActivationStep,
  SiteAutomationSettings,
  SiteSnapshot,
  AutomationRun,
  WorkItemState,
  WorkFilter,
  KnowledgeFact,
  AeoPageAudit,
  GeoPageAudit,
  PageQuestion,
  PageEntity,
  EntityRelation,
  FactEvidence,
  CrawlerPolicyResult,
  AiCrawlerRegistry,
  AiVisibilityPromptSetV2,
  AiVisibilityPrompt,
  AiVisibilityCompetitor,
  AiVisibilityObservationV2,
  AiVisibilitySourceProvenance,
  AiProviderCapability,
  AiVisibilityBudget,
  AiVisibilityBaseline,
  AiVisibilitySnapshot,
];

export {
  User,
  Role,
  Permission,
  Organization,
  Site,
  SiteMembership,
  RefreshToken,
  ActivityLog,
  SiteSecret,
  WordPressIntegration,
  WordPressPost,
  GscProperty,
  GscToken,
  GscDailyMetric,
  GscSiteDailyMetric,
  GscQueryDailyMetric,
  GscPageDailyMetric,
  GscQueryPageDailyMetric,
  GscSyncState,
  GscOpportunity,
  Keyword,
  KeywordSource,
  KeywordMetric,
  KeywordPlannerMetric,
  KeywordDiscoveryJob,
  KeywordOpportunity,
  CannibalizationCase,
  GoogleAdsIntegration,
  Cluster,
  ClusterKeyword,
  UrlMapping,
  AiProviderConfig,
  AiJob,
  AiPrompt,
  ContentPackage,
  Issue,
  Recommendation,
  OperationsTask,
  ChangeLog,
  BaselineSnapshot,
  OperationsAlert,
  AiVisibilityPromptSet,
  AiVisibilityRun,
  AiVisibilityObservation,
  CrawledPage,
  CrawlRun,
  CrawlPage,
  CrawlLink,
  CrawlError,
  AuditRun,
  AuditResult,
  LighthouseRun,
  LinkAnalysis,
  LinkSuggestion,
  ReportBranding,
  Report,
  WorkflowJob,
  ContentPublication,
  SiteActivationStep,
  SiteAutomationSettings,
  SiteSnapshot,
  AutomationRun,
  WorkItemState,
  WorkFilter,
  KnowledgeFact,
  AeoPageAudit,
  GeoPageAudit,
  PageQuestion,
  PageEntity,
  EntityRelation,
  FactEvidence,
  CrawlerPolicyResult,
  AiCrawlerRegistry,
  AiVisibilityPromptSetV2,
  AiVisibilityPrompt,
  AiVisibilityCompetitor,
  AiVisibilityObservationV2,
  AiVisibilitySourceProvenance,
  AiProviderCapability,
  AiVisibilityBudget,
  AiVisibilityBaseline,
  AiVisibilitySnapshot,
};

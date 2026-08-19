import { CreateIdentity00011720000000001 } from './0001-create-identity';
import { CreateTenants00021720000000002 } from './0002-create-tenants';
import { CreateAuthSession00031720000000003 } from './0003-create-auth-session';
import { CreateActivityLogs00041720000000004 } from './0004-create-activity-logs';
import { CreateSiteSecrets00051720000000005 } from './0005-create-site-secrets';
import { SeedRbac00061720000000006 } from './0006-seed-rbac';
import { CreateWordPressIntegration00071720000000007 } from './0007-create-wordpress-integration';
import { SeedWordpressPermissions00081720000000008 } from './0008-seed-wordpress-permissions';
import { CreateGsc00091720000000009 } from './0009-create-gsc';
import { CreateKeywordEngine00101720000000010 } from './0010-create-keyword-engine';
import { SeedGscKeywordsPermissions00111720000000011 } from './0011-seed-gsc-keywords-permissions';
import { CreateAiInfra00121720000000012 } from './0012-create-ai-infra';
import { SeedAiPrompts00131720000000013 } from './0013-seed-ai-prompts';
import { SeedAiPermissions00141720000000014 } from './0014-seed-ai-permissions';
import { CreateContentPipeline00151720000000015 } from './0015-create-content-pipeline';
import { SeedContentPrompts00161720000000016 } from './0016-seed-content-prompts';
import { SeedContentPermissions00171720000000017 } from './0017-seed-content-permissions';
import { CreateOperations00181720000000018 } from './0018-create-operations';
import { SeedOperationsPermissions00191720000000019 } from './0019-seed-operations-permissions';
import { SeedRecommendationExplainer00201720000000020 } from './0020-seed-recommendation-explainer';
import { CreateAiVisibility00211720000000021 } from './0021-create-ai-visibility';
import { SeedAiVisibility00221720000000022 } from './0022-seed-ai-visibility';
import { CreateLinkIntelligence00231720000000023 } from './0023-create-link-intelligence';
import { SeedLinkPermissions00241720000000024 } from './0024-seed-link-permissions';
import { CreateReporting00251720000000025 } from './0025-create-reporting';
import { SeedReportingPermissions00261720000000026 } from './0026-seed-reporting-permissions';
import { CreateOrchestration00271720000000027 } from './0027-create-orchestration';
import { SeedClientOrchestrationPermissions00281720000000028 } from './0028-seed-client-orchestration-permissions';
import { CreateContentPublications00291720000000029 } from './0029-create-content-publications';
import { CreateSiteActivation00301720000000030 } from './0030-create-site-activation';
import { CreateAutomation00311720000000031 } from './0031-create-automation';
import { SeedAutomationPermissions00321720000000032 } from './0032-seed-automation-permissions';
import { CreateWorkQueue00331720000000033 } from './0033-create-work-queue';
import { SeedWorkqueuePermissions00341720000000034 } from './0034-seed-workqueue-permissions';
import { CreateKnowledgeBase00351720000000035 } from './0035-create-knowledge-base';
import { SeedKnowledgePermissions00361720000000036 } from './0036-seed-knowledge-permissions';
import { CreateCrawlRuns00371720000000037 } from './0037-create-crawl-runs';
import { AddCrawlAuditSignals00381720000000038 } from './0038-add-crawl-audit-signals';
import { CreateAuditRuns00391720000000039 } from './0039-create-audit-runs';
import { CreateLighthouseRuns00401720000000040 } from './0040-create-lighthouse-runs';
import { AddLinkAnalysisCrawlRun00411720000000041 } from './0041-add-link-analysis-crawl-run';
import { CanonicalMetricGrains00421720000000042 } from './0042-canonical-metric-grains';
import { CreateSiteSnapshots00431720000000043 } from './0043-create-site-snapshots';
import { AddBaselineDataQuality00441720000000044 } from './0044-add-baseline-data-quality';
import { AddKeywordMetricColumns00451720000000045 } from './0045-add-keyword-metric-source';
import { AddPerformanceIndexes00461720000000046 } from './0046-add-performance-indexes';
import { AddPublicationVerificationFields00471720000000047 } from './0047-add-publication-verification-fields';
import { KeywordIntelligence00481720000000048 } from './0048-keyword-intelligence';
import { UpdatePromptEnums00491720000000049 } from './0049-update-prompt-enums';
import { AddCrawlPageText00501720000000050 } from './0050-add-crawl-page-text';
import { AddAeoGoreuditEntities00511720000000051 } from './0051-add-aeo-geo-audit-entities';
import { AddGc06PromptSetsCompetitors00521720000000052 } from './0052-add-gc06-prompt-sets-competitors';
import { AddGc06ObservationsProvenance00531720000000053 } from './0053-add-gc06-observations-provenance';
import { AddGc06ProviderBudget00541720000000054 } from './0054-add-gc06-provider-budget';
import { AddGc06BaselinesSnapshots00551720000000055 } from './0055-add-gc06-baselines-snapshots';
import { AddGc07DecisionEngine00561720000000056 } from './0056-add-gc07-decision-engine';
import { AddGlobalAiProviderCredentials00571720000000057 } from './0057-add-global-ai-provider-credentials';

export const migrations = [
  CreateIdentity00011720000000001,
  CreateTenants00021720000000002,
  CreateAuthSession00031720000000003,
  CreateActivityLogs00041720000000004,
  CreateSiteSecrets00051720000000005,
  SeedRbac00061720000000006,
  CreateWordPressIntegration00071720000000007,
  SeedWordpressPermissions00081720000000008,
  CreateGsc00091720000000009,
  CreateKeywordEngine00101720000000010,
  SeedGscKeywordsPermissions00111720000000011,
  CreateAiInfra00121720000000012,
  SeedAiPrompts00131720000000013,
  SeedAiPermissions00141720000000014,
  CreateContentPipeline00151720000000015,
  SeedContentPrompts00161720000000016,
  SeedContentPermissions00171720000000017,
  CreateOperations00181720000000018,
  SeedOperationsPermissions00191720000000019,
  SeedRecommendationExplainer00201720000000020,
  CreateAiVisibility00211720000000021,
  SeedAiVisibility00221720000000022,
  CreateLinkIntelligence00231720000000023,
  SeedLinkPermissions00241720000000024,
  CreateReporting00251720000000025,
  SeedReportingPermissions00261720000000026,
  CreateOrchestration00271720000000027,
  SeedClientOrchestrationPermissions00281720000000028,
  CreateContentPublications00291720000000029,
  CreateSiteActivation00301720000000030,
  CreateAutomation00311720000000031,
  SeedAutomationPermissions00321720000000032,
  CreateWorkQueue00331720000000033,
  SeedWorkqueuePermissions00341720000000034,
  CreateKnowledgeBase00351720000000035,
  SeedKnowledgePermissions00361720000000036,
  CreateCrawlRuns00371720000000037,
  AddCrawlAuditSignals00381720000000038,
  CreateAuditRuns00391720000000039,
  CreateLighthouseRuns00401720000000040,
  AddLinkAnalysisCrawlRun00411720000000041,
  CanonicalMetricGrains00421720000000042,
  CreateSiteSnapshots00431720000000043,
  AddBaselineDataQuality00441720000000044,
  AddKeywordMetricColumns00451720000000045,
  AddPerformanceIndexes00461720000000046,
  AddPublicationVerificationFields00471720000000047,
  KeywordIntelligence00481720000000048,
  UpdatePromptEnums00491720000000049,
  AddCrawlPageText00501720000000050,
  AddAeoGoreuditEntities00511720000000051,
  AddGc06PromptSetsCompetitors00521720000000052,
  AddGc06ObservationsProvenance00531720000000053,
  AddGc06ProviderBudget00541720000000054,
  AddGc06BaselinesSnapshots00551720000000055,
  AddGc07DecisionEngine00561720000000056,
  AddGlobalAiProviderCredentials00571720000000057,
];

export {
  CreateIdentity00011720000000001,
  CreateTenants00021720000000002,
  CreateAuthSession00031720000000003,
  CreateActivityLogs00041720000000004,
  CreateSiteSecrets00051720000000005,
  SeedRbac00061720000000006,
  CreateWordPressIntegration00071720000000007,
  SeedWordpressPermissions00081720000000008,
  CreateGsc00091720000000009,
  CreateKeywordEngine00101720000000010,
  SeedGscKeywordsPermissions00111720000000011,
  CreateAiInfra00121720000000012,
  SeedAiPrompts00131720000000013,
  SeedAiPermissions00141720000000014,
  CreateContentPipeline00151720000000015,
  SeedContentPrompts00161720000000016,
  SeedContentPermissions00171720000000017,
  CreateOperations00181720000000018,
  SeedOperationsPermissions00191720000000019,
  SeedRecommendationExplainer00201720000000020,
  CreateAiVisibility00211720000000021,
  SeedAiVisibility00221720000000022,
  CreateLinkIntelligence00231720000000023,
  SeedLinkPermissions00241720000000024,
  CreateReporting00251720000000025,
  SeedReportingPermissions00261720000000026,
  CreateOrchestration00271720000000027,
  SeedClientOrchestrationPermissions00281720000000028,
  CreateContentPublications00291720000000029,
  CreateSiteActivation00301720000000030,
  CreateAutomation00311720000000031,
  SeedAutomationPermissions00321720000000032,
  CreateWorkQueue00331720000000033,
  SeedWorkqueuePermissions00341720000000034,
  CreateKnowledgeBase00351720000000035,
  SeedKnowledgePermissions00361720000000036,
  CreateCrawlRuns00371720000000037,
  AddCrawlAuditSignals00381720000000038,
  CreateAuditRuns00391720000000039,
  CreateLighthouseRuns00401720000000040,
  AddLinkAnalysisCrawlRun00411720000000041,
  CanonicalMetricGrains00421720000000042,
  CreateSiteSnapshots00431720000000043,
  AddBaselineDataQuality00441720000000044,
  AddKeywordMetricColumns00451720000000045,
  AddPerformanceIndexes00461720000000046,
  AddPublicationVerificationFields00471720000000047,
  KeywordIntelligence00481720000000048,
  UpdatePromptEnums00491720000000049,
  AddCrawlPageText00501720000000050,
  AddAeoGoreuditEntities00511720000000051,
  AddGc06PromptSetsCompetitors00521720000000052,
  AddGc06ObservationsProvenance00531720000000053,
  AddGc06ProviderBudget00541720000000054,
  AddGc06BaselinesSnapshots00551720000000055,
  AddGc07DecisionEngine00561720000000056,
  AddGlobalAiProviderCredentials00571720000000057,
};

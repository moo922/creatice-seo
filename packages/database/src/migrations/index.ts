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
};

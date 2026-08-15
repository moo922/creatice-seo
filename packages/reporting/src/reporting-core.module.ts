import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AiVisibilityRun,
  AutomationRun,
  Cluster,
  ClusterKeyword,
  ContentPublication,
  GscDailyMetric,
  GscOpportunity,
  GscProperty,
  Keyword,
  KeywordMetric,
  LinkAnalysis,
  LinkSuggestion,
  Report,
  ReportBranding,
  Site,
  WordPressIntegration,
  WordPressPost,
} from '@creative-seo/database';
import { ReportingService } from './reporting.service';

/**
 * Fully self-hosted reporting infrastructure. Depends on the global
 * OperationsCoreModule, VisibilityCoreModule, ContentCoreModule and
 * LinksCoreModule (BaselineService, OperationsService, VisibilityService,
 * ContentPackagesService, LinksService) which host applications must import.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportBranding,
      Report,
      Site,
      Cluster,
      ClusterKeyword,
      Keyword,
      KeywordMetric,
      GscDailyMetric,
      GscProperty,
      GscOpportunity,
      WordPressIntegration,
      WordPressPost,
      ContentPublication,
      LinkSuggestion,
      LinkAnalysis,
      AutomationRun,
      AiVisibilityRun,
    ]),
  ],
  providers: [ReportingService],
  exports: [ReportingService],
})
export class ReportingCoreModule {}

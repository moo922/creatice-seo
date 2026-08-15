import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AutomationRun,
  Cluster,
  ClusterKeyword,
  GscDailyMetric,
  GscOpportunity,
  GscProperty,
  GscSyncState,
  GscToken,
  Keyword,
  Site,
  SiteAutomationSettings,
  UrlMapping,
} from '@creative-seo/database';
import { AutomationExecutorService } from './automation-executor.service';
import { AutomationService } from './automation.service';
import { HeadlessGscService } from './headless-gsc';
import { HeadlessKeywordsService } from './headless-keywords';

/**
 * Recurring automation infrastructure for the API and worker apps: per-site
 * settings, the DB-backed scheduler (idempotent run claims), headless executors
 * for every operation and run history. Depends on the global AiCoreModule
 * (@creative-seo/ai) for the keyword pipeline explainer, which host apps must
 * import alongside the other core modules.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AutomationRun,
      Site,
      SiteAutomationSettings,
      GscProperty,
      GscDailyMetric,
      GscToken,
      GscSyncState,
      GscOpportunity,
      Keyword,
      Cluster,
      ClusterKeyword,
      UrlMapping,
    ]),
  ],
  providers: [AutomationService, AutomationExecutorService, HeadlessGscService, HeadlessKeywordsService],
  exports: [AutomationService, AutomationExecutorService, HeadlessGscService, HeadlessKeywordsService],
})
export class AutomationCoreModule {}

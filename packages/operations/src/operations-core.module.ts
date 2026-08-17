import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AiVisibilityObservation,
  AiVisibilityRun,
  AuditResult,
  AuditRun,
  BaselineSnapshot,
  ChangeLog,
  ContentPublication,
  CrawlRun,
  GscDailyMetric,
  GscPageDailyMetric,
  GscProperty,
  GscQueryDailyMetric,
  GscQueryPageDailyMetric,
  GscSiteDailyMetric,
  GscSyncState,
  Issue,
  LinkSuggestion,
  OperationsAlert,
  OperationsTask,
  Recommendation,
  Report,
  Site,
  SiteSnapshot,
} from '@creative-seo/database';
import { AeoGeoService } from './aeo-geo.service';
import { AiVisibilityMetricsService } from './ai-visibility.service';
import { AlertService } from './alert.service';
import { BaselineService } from './baseline.service';
import { CentralMetricsService } from './central-metrics.service';
import { ComparisonService } from './comparison.service';
import { ContentDecayService } from './content-decay.service';
import { ContentPerformanceService } from './content-performance.service';
import { IssueProgressService } from './issue-progress.service';
import { OperationsService } from './operations.service';
import { PeriodService } from './period.service';
import { PortfolioService } from './portfolio.service';
import { SeoHealthService } from './seo-health.service';
import { SiteSnapshotService } from './site-snapshot.service';
import { WorkCompletedService } from './work-completed.service';

/**
 * Operations management infrastructure for the API and worker apps: issues,
 * deterministic recommendations, tasks, change log, immutable baselines,
 * alerts, snapshots, and comparisons. Depends on the global AiCoreModule
 * from @creative-seo/ai (for the optional recommendation explainer) which
 * host applications must import.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([
    Issue,
    Recommendation,
    OperationsTask,
    ChangeLog,
    BaselineSnapshot,
    OperationsAlert,
    GscProperty,
    GscDailyMetric,
    GscSiteDailyMetric,
    GscPageDailyMetric,
    GscQueryDailyMetric,
    GscQueryPageDailyMetric,
    GscSyncState,
    SiteSnapshot,
    CrawlRun,
    AuditRun,
    AuditResult,
    AiVisibilityRun,
    AiVisibilityObservation,
    ContentPublication,
    LinkSuggestion,
    Report,
    Site,
  ])],
  providers: [
    OperationsService,
    BaselineService,
    AlertService,
    SiteSnapshotService,
    ComparisonService,
    CentralMetricsService,
    ContentDecayService,
    IssueProgressService,
    WorkCompletedService,
    ContentPerformanceService,
    SeoHealthService,
    AeoGeoService,
    AiVisibilityMetricsService,
    PeriodService,
    PortfolioService,
  ],
  exports: [
    OperationsService,
    BaselineService,
    AlertService,
    SiteSnapshotService,
    ComparisonService,
    CentralMetricsService,
    ContentDecayService,
    IssueProgressService,
    WorkCompletedService,
    ContentPerformanceService,
    SeoHealthService,
    AeoGeoService,
    AiVisibilityMetricsService,
    PeriodService,
    PortfolioService,
  ],
})
export class OperationsCoreModule {}

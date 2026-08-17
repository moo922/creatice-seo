import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AiVisibilityRun,
  AuditRun,
  BaselineSnapshot,
  ChangeLog,
  CrawlRun,
  GscDailyMetric,
  GscProperty,
  GscSiteDailyMetric,
  GscSyncState,
  Issue,
  OperationsAlert,
  OperationsTask,
  Recommendation,
  SiteSnapshot,
} from '@creative-seo/database';
import { AlertService } from './alert.service';
import { BaselineService } from './baseline.service';
import { ComparisonService } from './comparison.service';
import { OperationsService } from './operations.service';
import { SiteSnapshotService } from './site-snapshot.service';

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
    GscSyncState,
    SiteSnapshot,
    CrawlRun,
    AuditRun,
    AiVisibilityRun,
  ])],
  providers: [OperationsService, BaselineService, AlertService, SiteSnapshotService, ComparisonService],
  exports: [OperationsService, BaselineService, AlertService, SiteSnapshotService, ComparisonService],
})
export class OperationsCoreModule {}

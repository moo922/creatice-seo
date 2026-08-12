import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BaselineSnapshot,
  ChangeLog,
  GscDailyMetric,
  GscProperty,
  Issue,
  OperationsAlert,
  OperationsTask,
  Recommendation,
} from '@creative-seo/database';
import { AlertService } from './alert.service';
import { BaselineService } from './baseline.service';
import { OperationsService } from './operations.service';

/**
 * Operations management infrastructure for the API and worker apps: issues,
 * deterministic recommendations, tasks, change log, immutable baselines and
 * alerts. Depends on the global AiCoreModule from @creative-seo/ai (for the
 * optional recommendation explainer) which host applications must import.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Issue, Recommendation, OperationsTask, ChangeLog, BaselineSnapshot, OperationsAlert, GscProperty, GscDailyMetric])],
  providers: [OperationsService, BaselineService, AlertService],
  exports: [OperationsService, BaselineService, AlertService],
})
export class OperationsCoreModule {}

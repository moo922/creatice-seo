import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AiJob,
  AiVisibilityRun,
  AutomationRun,
  BaselineSnapshot,
  Cluster,
  ContentPackage,
  ContentPublication,
  GscProperty,
  GscSiteDailyMetric,
  Issue,
  LinkSuggestion,
  OperationsTask,
  Recommendation,
  Report,
  Site,
  SiteMembership,
  User,
  WordPressIntegration,
  WorkFilter,
  WorkItemState,
  WorkflowJob,
} from '@creative-seo/database';
import { WorkQueueController, SiteWorkController } from './workqueue.controller';
import { WorkQueueService } from './workqueue.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Site,
      SiteMembership,
      Issue,
      Recommendation,
      OperationsTask,
      ContentPackage,
      ContentPublication,
      LinkSuggestion,
      Cluster,
      AutomationRun,
      WorkflowJob,
      AiVisibilityRun,
      AiJob,
      Report,
      GscProperty,
      WordPressIntegration,
      BaselineSnapshot,
      GscSiteDailyMetric,
      User,
      WorkItemState,
      WorkFilter,
    ]),
  ],
  controllers: [WorkQueueController, SiteWorkController],
  providers: [WorkQueueService],
  exports: [WorkQueueService],
})
export class WorkQueueModule {}

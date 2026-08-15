import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ActivityLog,
  AiJob,
  AiProviderConfig,
  BaselineSnapshot,
  ContentPackage,
  ContentPublication,
  CrawledPage,
  GscDailyMetric,
  GscProperty,
  Issue,
  Keyword,
  KeywordMetric,
  LinkAnalysis,
  OperationsTask,
  Organization,
  Recommendation,
  Report,
  Site,
  SiteMembership,
  WordPressIntegration,
  WorkflowJob,
} from '@creative-seo/database';
import { PortfolioDashboardController, SiteDashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Site, SiteMembership, Issue, Recommendation, OperationsTask, AiJob, WorkflowJob, ContentPackage, ContentPublication, BaselineSnapshot, CrawledPage, LinkAnalysis, GscProperty, GscDailyMetric, Keyword, KeywordMetric, WordPressIntegration, Report, ActivityLog, AiProviderConfig, Organization])],
  controllers: [PortfolioDashboardController, SiteDashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

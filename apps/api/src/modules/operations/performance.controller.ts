import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  BaselineService,
  CentralMetricsService,
  ContentDecayService,
  IssueProgressService,
  PeriodService,
  SiteSnapshotService,
  WorkCompletedService,
} from '@creative-seo/operations';
import type {
  BaselineSnapshotDto,
  ContentDecayPageDto,
  DataQualityDto,
  IssuePeriodProgressDto,
  PagePerformanceDto,
  ProgressDashboardDto,
  QueryPagePerformanceDto,
  QueryPerformanceDto,
  SitePerformanceDto,
  WorkCompletedMetricsDto,
} from '@creative-seo/types';
import type { SiteSnapshot } from '@creative-seo/database';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';

/**
 * Performance API contracts (Section 45).
 * All routes enforce site authorization via SiteAccessGuard.
 */
@Controller('sites/:siteId/performance')
@UseGuards(SiteAccessGuard)
@RequirePermissions('operations:read')
export class PerformanceController {
  constructor(
    private readonly centralMetrics: CentralMetricsService,
    private readonly baselines: BaselineService,
    private readonly snapshots: SiteSnapshotService,
    private readonly issueProgress: IssueProgressService,
    private readonly workCompleted: WorkCompletedService,
    private readonly period: PeriodService,
    private readonly contentDecay: ContentDecayService,
  ) {}

  @Get()
  getSitePerformance(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('days') days?: string,
  ): Promise<SitePerformanceDto> {
    return this.centralMetrics.getSitePerformance(siteId, days ? Number(days) : undefined);
  }

  @Get('pages')
  getPagePerformance(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('days') days?: string,
  ): Promise<PagePerformanceDto[]> {
    return this.centralMetrics.getPagePerformance(siteId, days ? Number(days) : undefined);
  }

  @Get('queries')
  getQueryPerformance(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('days') days?: string,
  ): Promise<QueryPerformanceDto[]> {
    return this.centralMetrics.getQueryPerformance(siteId, days ? Number(days) : undefined);
  }

  @Get('query-pages')
  getQueryPagePerformance(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('days') days?: string,
  ): Promise<QueryPagePerformanceDto[]> {
    return this.centralMetrics.getQueryPagePerformance(siteId, days ? Number(days) : undefined);
  }

  @Get('content-decay')
  getContentDecay(
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ): Promise<ContentDecayPageDto[]> {
    return this.contentDecay.detectDecay(siteId);
  }
}

/**
 * Baseline and snapshot endpoints (Section 45).
 */
@Controller('sites/:siteId')
@UseGuards(SiteAccessGuard)
@RequirePermissions('operations:read')
export class SiteBaselineController {
  constructor(
    private readonly baselines: BaselineService,
    private readonly snapshots: SiteSnapshotService,
  ) {}

  @Get('baseline')
  listBaselines(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('type') type?: string,
  ): Promise<BaselineSnapshotDto[]> {
    return this.baselines.listSnapshots(siteId, type as BaselineSnapshotDto['type'] | undefined);
  }

  @Get('baseline/:id')
  getBaseline(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaselineSnapshotDto> {
    return this.baselines.getSnapshot(id);
  }

  @Post('baseline')
  @RequirePermissions('operations:manage')
  captureBaseline(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<BaselineSnapshotDto> {
    return this.baselines.capture(siteId, user?.organizationId ?? null, 'PERIODIC', user?.id ?? null);
  }

  @Get('snapshots')
  listSnapshots(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('type') type?: string,
  ): Promise<SiteSnapshot[]> {
    return this.snapshots.list(siteId, type as any);
  }
}

/**
 * Progress, issue progress, work completed, and data quality endpoints (Section 45).
 */
@Controller('sites/:siteId')
@UseGuards(SiteAccessGuard)
@RequirePermissions('operations:read')
export class SiteProgressController {
  constructor(
    private readonly baselines: BaselineService,
    private readonly issueProgress: IssueProgressService,
    private readonly workCompleted: WorkCompletedService,
    private readonly period: PeriodService,
  ) {}

  @Get('progress')
  getProgress(
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ): Promise<ProgressDashboardDto> {
    return this.baselines.dashboard(siteId);
  }

  @Get('issue-progress')
  getIssueProgress(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<IssuePeriodProgressDto[]> {
    const now = new Date();
    const start = startDate || new Date(now.getTime() - 28 * 86_400_000).toISOString().slice(0, 10);
    const end = endDate || now.toISOString().slice(0, 10);
    return this.issueProgress.getIssuePeriodProgress(siteId, start, end);
  }

  @Get('work-completed')
  getWorkCompleted(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<WorkCompletedMetricsDto> {
    const now = new Date();
    const start = startDate || new Date(now.getTime() - 28 * 86_400_000).toISOString().slice(0, 10);
    const end = endDate || now.toISOString().slice(0, 10);
    return this.workCompleted.getWorkCompleted(siteId, start, end);
  }

  @Get('data-quality')
  getDataQuality(
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ): Promise<DataQualityDto> {
    return this.period.getDataQuality(siteId);
  }
}

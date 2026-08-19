import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AlertService, BaselineService } from '@creative-seo/operations';
import type {
  AlertDto,
  AlertEvalResultDto,
  BaselineSnapshotDto,
  ProgressDashboardDto,
} from '@creative-seo/types';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import {
  CreateBaselineDto,
  CaptureBaselineDto,
  EvaluateAlertsDto,
  OperationsQueryDto,
  PagePerformanceQueryDto,
  UpdateAlertDto,
} from './operations.dto';

/**
 * Monitoring endpoints: immutable baseline snapshots, the progress dashboard
 * (baseline -> current, previous -> current, month -> month, quarter -> quarter),
 * alerts and post-change page performance comparisons.
 */
@Controller('sites/:siteId/monitoring')
@UseGuards(SiteAccessGuard)
@RequirePermissions('operations:read')
export class SiteMonitoringController {
  constructor(
    private readonly baselines: BaselineService,
    private readonly alerts: AlertService,
  ) {}

  // ---- Baselines ----

  @Post('snapshots')
  @RequirePermissions('operations:manage')
  createSnapshot(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreateBaselineDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<BaselineSnapshotDto> {
    return this.baselines.createSnapshot(siteId, user?.organizationId ?? null, dto, user?.id ?? null);
  }

  @Post('snapshots/capture')
  @RequirePermissions('operations:manage')
  captureSnapshot(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CaptureBaselineDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<BaselineSnapshotDto> {
    return this.baselines.capture(siteId, user?.organizationId ?? null, dto.type, user?.id ?? null);
  }

  @Get('snapshots')
  listSnapshots(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('type') type?: string,
  ): Promise<BaselineSnapshotDto[]> {
    return this.baselines.listSnapshots(siteId, type as BaselineSnapshotDto['type'] | undefined);
  }

  @Get('snapshots/:id')
  getSnapshot(@Param('id', ParseUUIDPipe) id: string): Promise<BaselineSnapshotDto> {
    return this.baselines.getSnapshot(id);
  }

  @Get('dashboard')
  dashboard(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<ProgressDashboardDto> {
    return this.baselines.dashboard(siteId);
  }

  @Get('page-performance')
  pagePerformance(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: PagePerformanceQueryDto,
  ) {
    return this.baselines.pagePerformanceComparison(
      siteId,
      query.pageUrl,
      query.beforeStart,
      query.beforeEnd,
      query.afterStart,
      query.afterEnd,
    );
  }

  // ---- Alerts ----

  @Post('alerts/evaluate')
  @RequirePermissions('operations:manage')
  evaluateAlerts(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: EvaluateAlertsDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AlertEvalResultDto[]> {
    return this.alerts.evaluate(siteId, user?.organizationId ?? null, dto);
  }

  @Get('alerts')
  listAlerts(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: OperationsQueryDto,
  ): Promise<AlertDto[]> {
    return this.alerts.listAlerts(siteId, query);
  }

  @Post('alerts/:id/status')
  @RequirePermissions('operations:manage')
  updateAlert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertDto,
  ): Promise<AlertDto> {
    return this.alerts.updateAlertStatus(id, dto.status);
  }
}

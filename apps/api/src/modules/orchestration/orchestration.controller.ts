import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { loadAppEnv } from '@creative-seo/config';
import { OrchestrationService } from '@creative-seo/orchestration';
import type { N8nCallbackRequest, OrchestrationJobDto } from '@creative-seo/types';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { CreateOrchestrationJobDto, N8nCallbackDto, OrchestrationJobQueryDto } from './orchestration.dto';

/**
 * n8n orchestration endpoints. Jobs are created here (PostgreSQL is the source
 * of truth), dispatched to the matching n8n webhook, and reconciled via the
 * callback webhook. Failures update job status and create operational alerts.
 */
@Controller('sites/:siteId/orchestration')
@UseGuards(SiteAccessGuard)
@RequirePermissions('orchestration:read')
export class SiteOrchestrationController {
  constructor(
    private readonly orchestration: OrchestrationService,
    private readonly activities: ActivityLogService,
  ) {}

  @Post('jobs')
  @RequirePermissions('orchestration:manage')
  async create(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreateOrchestrationJobDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<OrchestrationJobDto> {
    const job = await this.orchestration.createAndDispatch(siteId, user?.organizationId ?? null, dto, user?.id ?? null);
    await this.activities.record({
      action: 'orchestration.job.create',
      userId: user?.id ?? null,
      siteId,
      entityType: 'orchestration_job',
      entityId: job.id,
      meta: { workflow: dto.workflow, status: job.status },
    });
    return job;
  }

  @Get('jobs')
  jobs(@Param('siteId', ParseUUIDPipe) siteId: string, @Query() query: OrchestrationJobQueryDto): Promise<OrchestrationJobDto[]> {
    return this.orchestration.listJobs(siteId, query);
  }

  @Get('jobs/:id')
  getJob(@Param('id', ParseUUIDPipe) id: string): Promise<OrchestrationJobDto> {
    return this.orchestration.getJob(id);
  }
}

/** Admin cross-site view of orchestration jobs. */
@Controller('orchestration')
@RequirePermissions('orchestration:read')
export class OrchestrationAdminController {
  constructor(private readonly orchestration: OrchestrationService) {}

  @Get('jobs')
  jobs(@Query() query: OrchestrationJobQueryDto): Promise<OrchestrationJobDto[]> {
    return this.orchestration.listAllJobs(query);
  }
}

/**
 * Public callback webhook that n8n calls with job results. Authenticated with
 * the N8N_CALLBACK_SECRET header when configured. Idempotency keys make
 * repeated callbacks safe.
 */
@Controller('webhooks/n8n')
export class N8nCallbackController {
  constructor(
    private readonly orchestration: OrchestrationService,
    private readonly activities: ActivityLogService,
  ) {}

  @Post('callback')
  async callback(@Body() dto: N8nCallbackDto, @Headers('x-n8n-secret') secret?: string): Promise<{ status: 'ignored' | 'updated' }> {
    const expected = loadAppEnv().N8N_CALLBACK_SECRET;
    if (expected && secret !== expected) {
      throw new UnauthorizedException('Invalid n8n callback secret');
    }
    const request: N8nCallbackRequest = {
      idempotencyKey: dto.idempotencyKey,
      jobId: dto.jobId,
      executionId: dto.executionId,
      status: dto.status,
      result: dto.result,
      error: dto.error,
    };
    const outcome = await this.orchestration.handleCallback(request);
    await this.activities.record({
      action: 'orchestration.job.callback',
      siteId: null,
      entityType: 'orchestration_job',
      entityId: dto.jobId ?? dto.idempotencyKey ?? null,
      meta: { status: dto.status, outcome: outcome.status },
    });
    return outcome;
  }
}

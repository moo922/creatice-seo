import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { WorkBulkResultDto, WorkFilterDto, WorkQueueResponseDto } from '@creative-seo/types';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import { SaveWorkFilterDto, WorkBulkActionDto, WorkQueueQueryDto } from './workqueue.dto';
import { WorkQueueService } from './workqueue.service';

/**
 * Agency-wide work queue: aggregated issues, tasks, content approvals, failed
 * jobs, reports due, visibility losses and integration problems with saved
 * filters and safe bulk triage (assign, prioritize, review, ignore, create
 * tasks). Publishing/modifying WordPress is intentionally excluded from bulk.
 */
@Controller('work')
@RequirePermissions('workqueue:read')
export class WorkQueueController {
  constructor(private readonly work: WorkQueueService) {}

  @Get()
  list(@CurrentUser() user: AuthPrincipal, @Query() query: WorkQueueQueryDto): Promise<WorkQueueResponseDto> {
    return this.work.list(user, query);
  }

  @Get('filters')
  filters(@CurrentUser() user: AuthPrincipal): Promise<WorkFilterDto[]> {
    return this.work.listFilters(user);
  }

  @Post('filters')
  @RequirePermissions('workqueue:manage')
  createFilter(@CurrentUser() user: AuthPrincipal, @Body() dto: SaveWorkFilterDto): Promise<WorkFilterDto> {
    return this.work.createFilter(user, dto);
  }

  @Put('filters/:id')
  @RequirePermissions('workqueue:manage')
  updateFilter(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveWorkFilterDto): Promise<WorkFilterDto> {
    return this.work.updateFilter(user, id, dto);
  }

  @Delete('filters/:id')
  @RequirePermissions('workqueue:manage')
  deleteFilter(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<{ success: boolean }> {
    return this.work.deleteFilter(user, id);
  }

  @Post('bulk')
  @RequirePermissions('workqueue:manage')
  bulk(@CurrentUser() user: AuthPrincipal, @Body() dto: WorkBulkActionDto): Promise<WorkBulkResultDto> {
    return this.work.bulk(user, dto);
  }
}

/** Site-scoped work queue (same aggregation, one site). */
@Controller('sites/:siteId/work')
@UseGuards(SiteAccessGuard)
@RequirePermissions('workqueue:read')
export class SiteWorkController {
  constructor(private readonly work: WorkQueueService) {}

  @Get()
  list(@CurrentUser() user: AuthPrincipal, @Param('siteId', ParseUUIDPipe) siteId: string, @Query() query: WorkQueueQueryDto): Promise<WorkQueueResponseDto> {
    return this.work.list(user, query, siteId);
  }
}

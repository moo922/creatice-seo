import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { OperationsService } from '@creative-seo/operations';
import type {
  ChangeLogDto,
  IssueDto,
  RecommendationDto,
  TaskDto,
} from '@creative-seo/types';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import {
  CreateChangeLogDto,
  CreateIssueDto,
  CreateRecommendationDto,
  CreateTaskDto,
  OperationsQueryDto,
  UpdateIssueDto,
  UpdateTaskDto,
} from './operations.dto';

/**
 * Operations management endpoints: issues (lifecycle), recommendations
 * (deterministic metrics + optional AI explanation), tasks and the change log.
 */
@Controller('sites/:siteId/operations')
@UseGuards(SiteAccessGuard)
@RequirePermissions('operations:read')
export class SiteOperationsController {
  constructor(private readonly operations: OperationsService) {}

  // ---- Issues ----

  @Post('issues')
  @RequirePermissions('operations:manage')
  createIssue(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreateIssueDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<IssueDto> {
    return this.operations.createIssue(siteId, user?.organizationId ?? null, dto);
  }

  @Get('issues')
  listIssues(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: OperationsQueryDto,
  ): Promise<IssueDto[]> {
    return this.operations.listIssues(siteId, query);
  }

  @Get('issues/:id')
  getIssue(@Param('id', ParseUUIDPipe) id: string): Promise<IssueDto> {
    return this.operations.getIssue(id);
  }

  @Put('issues/:id')
  @RequirePermissions('operations:manage')
  updateIssue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIssueDto,
  ): Promise<IssueDto> {
    return this.operations.updateIssueStatus(id, dto);
  }

  // ---- Recommendations ----

  @Post('recommendations')
  @RequirePermissions('operations:manage')
  createRecommendation(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreateRecommendationDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<RecommendationDto> {
    return this.operations.createRecommendation(siteId, user?.organizationId ?? null, dto);
  }

  @Get('recommendations')
  listRecommendations(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('issueId') issueId?: string,
  ): Promise<RecommendationDto[]> {
    return this.operations.listRecommendations(siteId, issueId);
  }

  // ---- Tasks ----

  @Post('tasks')
  @RequirePermissions('operations:manage')
  createTask(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<TaskDto> {
    return this.operations.createTask(siteId, dto, user?.id ?? null);
  }

  @Get('tasks')
  listTasks(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: OperationsQueryDto,
  ): Promise<TaskDto[]> {
    return this.operations.listTasks(siteId, query);
  }

  @Put('tasks/:id')
  @RequirePermissions('operations:manage')
  updateTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskDto> {
    return this.operations.updateTask(id, dto);
  }

  // ---- Change log ----

  @Post('change-log')
  @RequirePermissions('operations:manage')
  createChangeLog(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreateChangeLogDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ChangeLogDto> {
    return this.operations.createChangeLog(siteId, user?.organizationId ?? null, dto, user?.id ?? null);
  }

  @Get('change-log')
  listChangeLog(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: OperationsQueryDto,
  ): Promise<ChangeLogDto[]> {
    return this.operations.listChangeLogs(siteId, query);
  }
}

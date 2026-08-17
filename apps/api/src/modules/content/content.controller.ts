import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ContentPackagesService, ContentPipelineService } from '@creative-seo/content';
import type { ContentPackageDto, ContentPublicationDto } from '@creative-seo/types';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import { ContentInputResolver } from './content.resolver';
import { ContentPackagesQueryDto, CreatePublicationDto, RunPipelineRequestDto } from './content.dto';
import { ContentPublishService } from './content-publish.service';

/**
 * Content intelligence pipeline endpoints. Runs the 17-stage pipeline for a
 * site, lists content packages, and lets reviewers approve or reject a brief
 * that the pipeline gate did not approve. No draft is generated before the
 * brief is approved by the pipeline gate.
 */
@Controller('sites/:siteId/content')
@UseGuards(SiteAccessGuard)
@RequirePermissions('content:read')
export class SiteContentController {
  constructor(
    private readonly pipeline: ContentPipelineService,
    private readonly packages: ContentPackagesService,
    private readonly resolver: ContentInputResolver,
    private readonly publish: ContentPublishService,
  ) {}

  @Post('pipeline')
  @RequirePermissions('content:manage')
  async run(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: RunPipelineRequestDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ContentPackageDto> {
    const input = await this.resolver.resolve(siteId, dto, user?.id ?? null);
    return this.pipeline.run(input);
  }

  @Get('packages')
  list(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: ContentPackagesQueryDto,
  ): Promise<ContentPackageDto[]> {
    return this.packages.list(siteId, { status: query.status, limit: query.limit, offset: query.offset });
  }

  @Get('packages/:id')
  async get(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ContentPackageDto> {
    const row = await this.packages.findById(id);
    if (row.siteId !== siteId) {
      throw new NotFoundException('Content package not found');
    }
    return this.packages.toDto(row);
  }

  @Post('packages/:id/brief/approve')
  @RequirePermissions('content:manage')
  approve(@Param('id', ParseUUIDPipe) id: string): Promise<ContentPackageDto> {
    return this.pipeline.resumeAfterApproval(id);
  }

  @Post('packages/:id/brief/reject')
  @RequirePermissions('content:manage')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { note?: string },
  ): Promise<ContentPackageDto> {
    return this.pipeline.rejectBrief(id, body?.note);
  }

  // ---- Publishing (WordPress) ----

  @Post('packages/:id/publish')
  @RequirePermissions('content:manage')
  createDraft(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('id', ParseUUIDPipe) packageId: string,
    @Body() body: CreatePublicationDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ContentPublicationDto> {
    return this.publish.createDraft(siteId, user?.organizationId ?? null, { packageId, slug: body?.slug ?? null }, user?.id ?? null);
  }

  @Get('publications')
  publications(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<ContentPublicationDto[]> {
    return this.publish.list(siteId);
  }

  @Post('publications/:id/approve')
  @RequirePermissions('content:manage')
  approvePublication(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal): Promise<ContentPublicationDto> {
    return this.publish.approve(id, user?.id ?? null);
  }

  @Post('publications/:id/publish')
  @RequirePermissions('content:manage')
  publishPublication(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal): Promise<ContentPublicationDto> {
    return this.publish.publish(id, user?.id ?? null);
  }

  @Post('publications/:id/verify')
  @RequirePermissions('content:manage')
  verifyPublication(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal): Promise<ContentPublicationDto> {
    return this.publish.verify(id, user?.id ?? null);
  }

  @Post('publications/:id/rollback')
  @RequirePermissions('content:manage')
  rollbackPublication(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal): Promise<ContentPublicationDto> {
    return this.publish.rollback(id, user?.id ?? null);
  }
}

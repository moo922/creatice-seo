import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import type { ClusterDto, KeywordDto, KeywordPipelineResultDto, UrlMappingDto } from '@creative-seo/types';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ApproveClusterDto, KeywordPipelineRequestDto, OverrideMappingDto, SeedKeywordDto } from './keywords.dto';
import { KeywordsService } from './keywords.service';

/**
 * Keyword engine endpoints. Running the pipeline performs keyword discovery
 * (explicit + optional GSC queries), clustering (AI with deterministic
 * fallback) and URL mapping. Approving a cluster makes its URL part of the
 * approved URL map consumed by the internal-link intelligence module.
 */
@Controller('sites/:siteId/keywords')
@UseGuards(SiteAccessGuard)
@RequirePermissions('keywords:read')
export class SiteKeywordsController {
  constructor(
    private readonly keywords: KeywordsService,
    private readonly activities: ActivityLogService,
  ) {}

  @Post('seed')
  @RequirePermissions('keywords:manage')
  seed(@Param('siteId', ParseUUIDPipe) siteId: string, @Body() dto: SeedKeywordDto): Promise<KeywordDto> {
    return this.keywords.seed(siteId, dto);
  }

  @Get()
  list(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<KeywordDto[]> {
    return this.keywords.listKeywords(siteId);
  }

  @Post('pipeline')
  @RequirePermissions('keywords:manage')
  async pipeline(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: KeywordPipelineRequestDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<KeywordPipelineResultDto> {
    const result = await this.keywords.runPipeline(siteId, user?.organizationId ?? null, dto);
    await this.activities.record({
      action: 'keywords.pipeline',
      userId: user?.id ?? null,
      siteId,
      entityType: 'site',
      entityId: siteId,
      meta: { createdKeywords: result.createdKeywords, clusters: result.clusters.length },
    });
    return result;
  }

  @Get('clusters')
  clusters(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<ClusterDto[]> {
    return this.keywords.listClusters(siteId);
  }

  @Get('clusters/:id')
  cluster(@Param('siteId', ParseUUIDPipe) siteId: string, @Param('id', ParseUUIDPipe) id: string): Promise<ClusterDto> {
    return this.keywords.getCluster(siteId, id);
  }

  @Post('clusters/:id/approve')
  @RequirePermissions('keywords:manage')
  async approve(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveClusterDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ClusterDto> {
    const cluster = await this.keywords.approveCluster(siteId, id, dto, user?.id ?? null);
    await this.activities.record({
      action: 'keywords.override',
      userId: user?.id ?? null,
      siteId,
      entityType: 'cluster',
      entityId: id,
      meta: { approved: true, url: dto.targetUrl ?? null },
    });
    return cluster;
  }

  @Get('url-mappings')
  mappings(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<UrlMappingDto[]> {
    return this.keywords.listMappings(siteId);
  }

  @Put('url-mappings/:id')
  @RequirePermissions('keywords:manage')
  override(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OverrideMappingDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<UrlMappingDto> {
    return this.keywords.overrideMapping(siteId, id, dto, user?.id ?? null);
  }
}

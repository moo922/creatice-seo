import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import type {
  CannibalizationCaseDto,
  ClusterDto,
  KeywordDto,
  KeywordExplorerSummaryDto,
  KeywordOpportunityDto,
  KeywordPipelineResultDto,
  UrlMappingDto,
} from '@creative-seo/types';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ApproveClusterDto, KeywordPipelineRequestDto, OverrideMappingDto, SeedKeywordDto } from './keywords.dto';
import { KeywordsService } from './keywords.service';

/**
 * Keyword Intelligence endpoints. Running the pipeline performs discovery (GSC
 * + explicit + optional site content + optional Google Ads), semantic clustering
 * (AI with deterministic candidate groups), URL matching, cannibalization
 * analysis and deterministic opportunity scoring.
 *
 * Nothing is auto-approved: the URL map and opportunities require operator
 * approval (Sections 32, 90).
 */
@Controller('sites/:siteId/keywords')
@UseGuards(SiteAccessGuard)
@RequirePermissions('keywords:read')
export class SiteKeywordsController {
  constructor(
    private readonly keywords: KeywordsService,
    private readonly activities: ActivityLogService,
  ) {}

  // ---- Keywords ----

  @Post('seed')
  @RequirePermissions('keywords:manage')
  seed(@Param('siteId', ParseUUIDPipe) siteId: string, @Body() dto: SeedKeywordDto): Promise<KeywordDto> {
    return this.keywords.seed(siteId, dto);
  }

  @Get()
  list(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<KeywordDto[]> {
    return this.keywords.listKeywords(siteId);
  }

  @Get('explorer/summary')
  summary(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<KeywordExplorerSummaryDto> {
    return this.keywords.explorerSummary(siteId);
  }

  // ---- Pipeline ----

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

  @Post('discovery')
  @RequirePermissions('keywords:manage')
  async discovery(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: { keywords?: string[]; discoverFromGsc?: boolean; discoverFromSite?: boolean; googleAdsSeeds?: string[]; maxIdeas?: number },
    @CurrentUser() user: AuthPrincipal,
  ): Promise<{ discovered: number; jobId: string | null; errors: string[] }> {
    const result = await this.keywords.runDiscovery(siteId, dto);
    await this.activities.record({
      action: 'keywords.discover',
      userId: user?.id ?? null,
      siteId,
      entityType: 'site',
      entityId: siteId,
      meta: { discovered: result.discovered, jobId: result.jobId },
    });
    return result;
  }

  @Post('cluster')
  @RequirePermissions('keywords:manage')
  async cluster(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<{ clusters: ClusterDto[]; errors: string[] }> {
    const result = await this.keywords.cluster(siteId, user?.organizationId ?? null);
    await this.activities.record({
      action: 'keywords.cluster',
      userId: user?.id ?? null,
      siteId,
      entityType: 'site',
      entityId: siteId,
      meta: { clusters: result.clusters.length },
    });
    return result;
  }

  // ---- Clusters ----

  @Get('clusters')
  clusters(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<ClusterDto[]> {
    return this.keywords.listClusters(siteId);
  }

  @Get('clusters/:id')
  clusterDetail(@Param('siteId', ParseUUIDPipe) siteId: string, @Param('id', ParseUUIDPipe) id: string): Promise<ClusterDto> {
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
      action: 'keywords.cluster.approve',
      userId: user?.id ?? null,
      siteId,
      entityType: 'cluster',
      entityId: id,
      meta: { approved: true, url: dto.targetUrl ?? null },
    });
    return cluster;
  }

  // ---- URL mapping ----

  @Get('url-mappings')
  mappings(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<UrlMappingDto[]> {
    return this.keywords.listMappings(siteId);
  }

  @Post('url-mappings/match')
  @RequirePermissions('keywords:manage')
  match(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<{ matched: number }> {
    return this.keywords.matchExistingUrls(siteId).then((matched) => ({ matched }));
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

  // ---- Cannibalization ----

  @Get('cannibalization')
  cannibalization(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<CannibalizationCaseDto[]> {
    return this.keywords.listCannibalization(siteId);
  }

  @Post('cannibalization/analyze')
  @RequirePermissions('keywords:manage')
  analyzeCannibalization(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<CannibalizationCaseDto[]> {
    return this.keywords.runCannibalizationAnalysis(siteId, user?.organizationId ?? null);
  }

  // ---- Opportunities ----

  @Get('opportunities')
  opportunities(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<KeywordOpportunityDto[]> {
    return this.keywords.listOpportunities(siteId);
  }

  @Post('opportunities/refresh')
  @RequirePermissions('keywords:manage')
  refreshOpportunities(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<KeywordOpportunityDto[]> {
    return this.keywords.runOpportunityScoring(siteId, user?.organizationId ?? null);
  }

  @Post('opportunities/:id/approve')
  @RequirePermissions('keywords:manage')
  approveOpportunity(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal): Promise<KeywordOpportunityDto> {
    return this.keywords.approveOpportunity(id, user?.id ?? null);
  }

  @Post('opportunities/:id/ignore')
  @RequirePermissions('keywords:manage')
  ignoreOpportunity(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal): Promise<KeywordOpportunityDto> {
    return this.keywords.ignoreOpportunity(id, user?.id ?? null);
  }

  @Post('opportunities/:id/create-content')
  @RequirePermissions('keywords:manage')
  createContentFromOpportunity(@Param('id', ParseUUIDPipe) id: string): Promise<{
    clusterId: string | null;
    primaryKeyword: string;
    secondaryKeywords: string[];
    targetUrl: string | null;
    action: string;
    intent: string | null;
    pageType: string | null;
  }> {
    return this.keywords.buildContentRequestFromOpportunity(id);
  }
}
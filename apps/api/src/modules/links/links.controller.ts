import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { LinksService } from '@creative-seo/links';
import type {
  CrawlRunDetailDto,
  CrawlRunDto,
  CrawlRunResultDto,
  LinkAnalysisDto,
  LinkAnalysisReportDto,
  LinkSuggestionDto,
} from '@creative-seo/types';
import { Repository } from 'typeorm';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import {
  ApplyLinkSuggestionDto,
  CreateCrawledPageDto,
  LinkSuggestionDecisionDto,
  LinkSuggestionQueryDto,
  StartCrawlDto,
  VerifyLinkSuggestionDto,
} from './links.dto';

/**
 * Internal-link intelligence endpoints. Analysis uses the approved URL map
 * (manual-override or approved url_mappings), crawled page content and the
 * existing link graph. Suggestions never invent URLs or create self-links, and
 * published content is only changed after explicit approval (Apply records the
 * change in the operations change log; Verify confirms it after recrawl).
 */
@Controller('sites/:siteId/links')
@UseGuards(SiteAccessGuard)
@RequirePermissions('links:read')
export class SiteLinksController {
  constructor(
    private readonly links: LinksService,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
  ) {}

  // ---- Crawled pages ----

  @Post('crawl-pages')
  @RequirePermissions('links:manage')
  upsertCrawledPage(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreateCrawledPageDto,
  ) {
    return this.links.upsertCrawledPage(siteId, dto);
  }

  @Get('crawl-pages')
  crawledPages(@Param('siteId', ParseUUIDPipe) siteId: string) {
    return this.links.listCrawledPages(siteId);
  }

  // ---- Crawl runs (versioned) ----

  @Post('crawls')
  @RequirePermissions('links:manage')
  async runCrawl(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: StartCrawlDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<CrawlRunResultDto> {
    const site = await this.requireSite(siteId);
    return this.links.runCrawl(
      { id: site.id, organizationId: site.organizationId, domain: site.domain },
      user?.id ?? null,
      dto,
    );
  }

  @Get('crawls')
  crawlRuns(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<CrawlRunDto[]> {
    return this.links.listCrawlRuns(siteId);
  }

  @Get('crawls/:runId')
  getCrawlRun(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<CrawlRunDetailDto> {
    return this.links.getCrawlRun(siteId, runId);
  }

  // ---- Analysis ----

  @Post('analyses')
  @RequirePermissions('links:manage')
  async runAnalysis(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<LinkAnalysisReportDto> {
    const domain = await this.requireSiteDomain(siteId);
    return this.links.runAnalysis(siteId, domain, user?.id ?? null);
  }

  @Get('analyses')
  analyses(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<LinkAnalysisDto[]> {
    return this.links.listAnalyses(siteId);
  }

  @Get('analyses/:id')
  getAnalysis(@Param('id', ParseUUIDPipe) id: string): Promise<LinkAnalysisReportDto> {
    return this.links.getAnalysis(id);
  }

  // ---- Suggestions + workflow ----

  @Get('suggestions')
  suggestions(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: LinkSuggestionQueryDto,
  ): Promise<LinkSuggestionDto[]> {
    return this.links.listSuggestions(siteId, query);
  }

  @Get('suggestions/:id')
  getSuggestion(@Param('id', ParseUUIDPipe) id: string): Promise<LinkSuggestionDto> {
    return this.links.getSuggestion(id);
  }

  @Post('suggestions/:id/approve')
  @RequirePermissions('links:manage')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkSuggestionDecisionDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<LinkSuggestionDto> {
    return this.links.approveSuggestion(id, user?.id ?? null, dto.notes);
  }

  @Post('suggestions/:id/apply')
  @RequirePermissions('links:manage')
  async apply(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyLinkSuggestionDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<LinkSuggestionDto> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    return this.links.applySuggestion(id, user?.id ?? null, site?.organizationId ?? null, dto);
  }

  @Post('suggestions/:id/verify')
  @RequirePermissions('links:manage')
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyLinkSuggestionDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<LinkSuggestionDto> {
    return this.links.verifySuggestion(id, user?.id ?? null, dto);
  }

  @Post('suggestions/:id/reject')
  @RequirePermissions('links:manage')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkSuggestionDecisionDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<LinkSuggestionDto> {
    return this.links.rejectSuggestion(id, user?.id ?? null, dto);
  }

  @Post('recrawl/verify')
  @RequirePermissions('links:manage')
  verifyFromCrawl(
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ): Promise<{ found: number; notFound: number }> {
    return this.links.verifyAppliedFromCrawl(siteId);
  }

  private async requireSite(siteId: string): Promise<Site> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    return site;
  }

  private async requireSiteDomain(siteId: string): Promise<string> {
    return (await this.requireSite(siteId)).domain;
  }
}

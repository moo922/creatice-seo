import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AeoAuditService, GeoAuditService } from '@creative-seo/links';
import { AiCrawlerPolicyService } from '@creative-seo/links';
import type { AuthPrincipal } from '../../common/auth.types';

@Controller('sites/:siteId/audits')
@UseGuards(SiteAccessGuard)
export class AeoAuditController {
  constructor(
    private readonly aeoService: AeoAuditService,
    private readonly crawlerPolicy: AiCrawlerPolicyService,
  ) {}

  @Post('aeo')
  @RequirePermissions('operations:manage')
  async runAeoAudit(@Param('siteId') siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.aeoService.runAeoSiteAudit(siteId, user.id);
  }

  @Get('aeo')
  @RequirePermissions('operations:read')
  async getLatestAeoAudit(@Param('siteId') siteId: string) {
    return this.aeoService.getLatestAeoAudit(siteId);
  }

  @Get('aeo/history')
  @RequirePermissions('operations:read')
  async getAeoHistory(@Param('siteId') siteId: string) {
    return this.aeoService.getAeoHistory(siteId);
  }

  @Get('aeo/question-gaps')
  @RequirePermissions('operations:read')
  async getAeoQuestionGaps(@Param('siteId') siteId: string) {
    return this.aeoService.getAeoQuestionGaps(siteId);
  }
}

@Controller('sites/:siteId/audits')
@UseGuards(SiteAccessGuard)
export class GeoAuditController {
  constructor(
    private readonly geoService: GeoAuditService,
    private readonly crawlerPolicy: AiCrawlerPolicyService,
  ) {}

  @Post('geo')
  @RequirePermissions('operations:manage')
  async runGeoAudit(@Param('siteId') siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.geoService.runGeoSiteAudit(siteId, user.id);
  }

  @Get('geo')
  @RequirePermissions('operations:read')
  async getLatestGeoAudit(@Param('siteId') siteId: string) {
    return this.geoService.getLatestGeoAudit(siteId);
  }

  @Get('geo/history')
  @RequirePermissions('operations:read')
  async getGeoHistory(@Param('siteId') siteId: string) {
    return this.geoService.getGeoHistory(siteId);
  }

  @Get('geo/gaps')
  @RequirePermissions('operations:read')
  async getGeoGaps(@Param('siteId') siteId: string) {
    return this.geoService.getGeoGaps(siteId);
  }

  @Get('geo/entities')
  @RequirePermissions('operations:read')
  async getGeoEntityView(@Param('siteId') siteId: string) {
    const audit = await this.geoService.getLatestGeoAudit(siteId);
    return audit?.entitySummary ?? null;
  }

  @Get('geo/crawlers')
  @RequirePermissions('operations:read')
  async getCrawlerPolicy(@Param('siteId') siteId: string) {
    return this.crawlerPolicy.getPolicyResults(siteId);
  }

  @Post('geo/crawlers/check')
  @RequirePermissions('operations:manage')
  async checkCrawlerPolicy(@Param('siteId') siteId: string) {
    return this.crawlerPolicy.checkCrawlerPolicy(siteId);
  }
}

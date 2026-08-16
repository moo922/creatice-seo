import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { AuditService, LighthouseService } from '@creative-seo/links';
import { ruleDefinitions } from '@creative-seo/audit-rules';
import type {
  AuditOverviewDto,
  AuditReportDto,
  AuditResultDto,
  AuditRuleDto,
  AuditRunDto,
  AuditRunHistoryEntryDto,
  LighthouseRunDto,
  PageInspectionDto,
} from '@creative-seo/types';
import { Repository } from 'typeorm';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import type { AuthPrincipal } from '../../common/auth.types';
import { RunAuditDto, RunLighthouseDto } from './links.dto';

/**
 * Deterministic audit endpoints. Runs the audit rule registry over a versioned
 * crawl run, persists runs + results, reconciles issues, and exposes the audit
 * dashboard (overview, history, page inspection). Lighthouse is a separate,
 * independent browser audit that never mixes into Internal Platform Health.
 */
@Controller('sites/:siteId/audit')
@UseGuards(SiteAccessGuard)
@RequirePermissions('operations:read')
export class SiteAuditController {
  constructor(
    private readonly audits: AuditService,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
  ) {}

  @Post()
  @RequirePermissions('operations:manage')
  async run(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: RunAuditDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AuditReportDto> {
    const site = await this.requireSite(siteId);
    return this.audits.runAudit(
      { id: site.id, organizationId: site.organizationId, domain: site.domain, language: site.language },
      user?.id ?? null,
      dto,
    );
  }

  @Get('summary')
  summary(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<AuditOverviewDto> {
    return this.audits.getOverview(siteId);
  }

  @Get('runs')
  runs(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<AuditRunDto[]> {
    return this.audits.listAuditRuns(siteId);
  }

  @Get('history')
  history(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<AuditRunHistoryEntryDto[]> {
    return this.audits.getHistory(siteId);
  }

  @Get('runs/:runId')
  runDetail(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<{ run: AuditRunDto; results: AuditResultDto[] }> {
    return this.audits.getAuditRun(siteId, runId);
  }

  @Get('pages')
  pageInspection(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('url') url: string,
  ): Promise<PageInspectionDto> {
    return this.audits.getPageInspection(siteId, url ?? '');
  }

  private async requireSite(siteId: string): Promise<Site> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    return site;
  }
}

@Controller('audit')
@RequirePermissions('operations:read')
export class AuditRulesController {
  @Get('rules')
  rules(): AuditRuleDto[] {
    return ruleDefinitions();
  }
}

@Controller('sites/:siteId/lighthouse')
@UseGuards(SiteAccessGuard)
@RequirePermissions('operations:read')
export class SiteLighthouseController {
  constructor(private readonly lighthouse: LighthouseService) {}

  @Post()
  @RequirePermissions('operations:manage')
  run(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: RunLighthouseDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<LighthouseRunDto> {
    return this.lighthouse.run(siteId, dto, user?.id ?? null);
  }

  @Get()
  list(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<LighthouseRunDto[]> {
    return this.lighthouse.list(siteId);
  }
}

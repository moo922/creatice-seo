import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { AuditService } from '@creative-seo/links';
import { ruleDefinitions } from '@creative-seo/audit-rules';
import type { AuditReportDto, AuditResultDto, AuditRuleDto, AuditRunDto } from '@creative-seo/types';
import { Repository } from 'typeorm';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import type { AuthPrincipal } from '../../common/auth.types';
import { RunAuditDto } from './links.dto';

/**
 * Deterministic audit endpoints. Runs the audit rule registry over a versioned
 * crawl run; high/critical findings are persisted as issues (source CRAWLER).
 * The rule registry itself is exposed read-only.
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
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    return this.audits.runAudit(
      { id: site.id, organizationId: site.organizationId, domain: site.domain, language: site.language },
      user?.id ?? null,
      dto,
    );
  }

  @Get('runs')
  runs(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<AuditRunDto[]> {
    return this.audits.listAuditRuns(siteId);
  }

  @Get('runs/:runId')
  runDetail(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<{ run: AuditRunDto; results: AuditResultDto[] }> {
    return this.audits.getAuditRun(siteId, runId);
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

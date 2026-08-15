import { Body, Controller, Get, Header, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ReportingService } from '@creative-seo/reporting';
import type { ReportBrandingDto, ReportContentDto, ReportDto } from '@creative-seo/types';
import { readFileSync } from 'fs';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { GenerateReportDto, ReportQueryDto, SaveReportBrandingDto } from './reporting.dto';

/**
 * Fully self-hosted reporting endpoints: white-label branding, report
 * generation (responsive HTML + local Chromium/Playwright PDF), permanent
 * version storage and HTML/PDF serving. No third-party reporting SaaS.
 */
@Controller('sites/:siteId/reporting')
@UseGuards(SiteAccessGuard)
@RequirePermissions('reports:read')
export class SiteReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly activities: ActivityLogService,
  ) {}

  @Get('branding')
  getBranding(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<ReportBrandingDto> {
    return this.reporting.getBranding(siteId);
  }

  @Put('branding')
  @RequirePermissions('reports:manage')
  saveBranding(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: SaveReportBrandingDto,
  ): Promise<ReportBrandingDto> {
    return this.reporting.saveBranding(siteId, dto);
  }

  @Post('reports')
  @RequirePermissions('reports:manage')
  generate(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: GenerateReportDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ReportDto> {
    return this.reporting.generate(siteId, user?.organizationId ?? null, dto, user?.id ?? null);
  }

  /**
   * Renders a report as HTML without persisting it. The response body is the
   * rendered, self-contained HTML document ready for inline preview — no
   * report row, baseline snapshot or PDF file is created.
   */
  @Post('reports/preview')
  @RequirePermissions('reports:read')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async preview(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: GenerateReportDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<string> {
    const content = await this.reporting.preview(siteId, user?.organizationId ?? null, dto);
    return content.html;
  }

  @Get('reports')
  list(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: ReportQueryDto,
  ): Promise<ReportDto[]> {
    return this.reporting.listReports(siteId, query);
  }

  @Get('reports/:id')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal): Promise<ReportContentDto> {
    await this.recordView(id, user, 'report');
    return this.reporting.getReport(id);
  }

  @Get('reports/:id/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async html(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal): Promise<string> {
    await this.recordView(id, user, 'html');
    return this.reporting.getReportHtml(id);
  }

  @Get('reports/:id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
    @Res() res: Response,
  ): Promise<void> {
    await this.recordView(id, user, 'pdf');
    const path = await this.reporting.getReportPdfPath(id);
    try {
      // Raw byte stream via @Res(): bypasses the global { data } envelope so
      // browsers/PDF viewers receive a real application/pdf document.
      res.type('application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="report.pdf"');
      res.send(readFileSync(path));
    } catch {
      throw new NotFoundException('PDF file is missing on disk');
    }
  }

  private async recordView(id: string, user: AuthPrincipal | undefined, format: string): Promise<void> {
    await this.activities.record({
      action: 'reports.view',
      userId: user?.id ?? null,
      siteId: null,
      entityType: 'report',
      entityId: id,
      meta: { format },
    });
  }
}

/** Cross-site report listing (agency/admin dashboard). */
@Controller('reports')
@RequirePermissions('reports:read')
export class AdminReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get()
  list(@Query() query: ReportQueryDto): Promise<ReportDto[]> {
    return this.reporting.listReportsGlobal(query);
  }
}

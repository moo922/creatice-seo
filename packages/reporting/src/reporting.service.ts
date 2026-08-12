import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cluster, ClusterKeyword, Keyword, KeywordMetric, Report, ReportBranding, Site } from '@creative-seo/database';
import { loadAppEnv, isSafePublicUrl } from '@creative-seo/config';
import { BaselineService, OperationsService } from '@creative-seo/operations';
import { VisibilityService } from '@creative-seo/visibility';
import { ContentPackagesService } from '@creative-seo/content';
import { LinksService } from '@creative-seo/links';
import type {
  ContentPackageDto,
  GenerateReportRequest,
  IssueSnapshotEntry,
  ReportBrandingDto,
  ReportContentDto,
  ReportDto,
  ReportQuery,
  SaveReportBrandingRequest,
  VisibilityMetricsDto,
} from '@creative-seo/types';
import { In, Repository } from 'typeorm';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { agencyDefaults, resolveBranding } from './branding';
import { CORRELATION_DISCLAIMER, metricRows, type MetricRow, type ReportData, type WorkItem } from './data';
import { htmlToPdf } from './pdf';
import { renderReport } from './render/report';

/**
 * Fully self-hosted reporting. Builds report data from the platform's own data
 * (baselines, issues, change log, content packages, visibility observations,
 * link suggestions), renders responsive HTML, converts to PDF with local
 * Chromium/Playwright, and saves every version permanently. Work completed is
 * always kept separate from performance outcome and causation is never claimed.
 */
@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(
    @InjectRepository(ReportBranding) private readonly branding: Repository<ReportBranding>,
    @InjectRepository(Report) private readonly reports: Repository<Report>,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(Cluster) private readonly clusters: Repository<Cluster>,
    @InjectRepository(ClusterKeyword) private readonly clusterKeywords: Repository<ClusterKeyword>,
    @InjectRepository(Keyword) private readonly keywords: Repository<Keyword>,
    @InjectRepository(KeywordMetric) private readonly keywordMetrics: Repository<KeywordMetric>,
    private readonly baselines: BaselineService,
    private readonly operations: OperationsService,
    private readonly visibility: VisibilityService,
    private readonly content: ContentPackagesService,
    private readonly links: LinksService,
  ) {}

  // -------------------------------------------------------------------------
  // Branding
  // -------------------------------------------------------------------------

  async getBranding(siteId: string): Promise<ReportBrandingDto> {
    const [site, row] = await Promise.all([this.sites.findOne({ where: { id: siteId } }), this.branding.findOne({ where: { siteId } })]);
    const defaults = agencyDefaults(envAgencyDefaults());
    const view = resolveBranding(defaults, row ? this.toBrandingDto(row) : null, site?.name ?? null);
    // SSRF guard: logo URLs are rendered by local Chromium during PDF generation,
    // so they must never point at private/loopback hosts.
    const [agencyLogoSafe, clientLogoSafe] = await Promise.all([
      isSafePublicUrl(view.agencyLogoUrl),
      isSafePublicUrl(view.clientLogoUrl),
    ]);
    return {
      siteId,
      agencyName: view.agencyName,
      agencyLogoUrl: agencyLogoSafe ? view.agencyLogoUrl : '',
      clientName: view.clientName,
      clientLogoUrl: clientLogoSafe ? view.clientLogoUrl : '',
      contactDetails: view.contactDetails,
      footer: view.footer,
      updatedAt: row?.updatedAt.toISOString() ?? new Date(0).toISOString(),
    };
  }

  async saveBranding(siteId: string, input: SaveReportBrandingRequest): Promise<ReportBrandingDto> {
    const existing = await this.branding.findOne({ where: { siteId } });
    const row = existing ?? this.branding.create({ siteId, agencyName: '', clientName: '' });
    if (input.agencyName !== undefined) row.agencyName = input.agencyName;
    if (input.agencyLogoUrl !== undefined) {
      row.agencyLogoUrl = (await isSafePublicUrl(input.agencyLogoUrl)) ? input.agencyLogoUrl : row.agencyLogoUrl;
    }
    if (input.clientName !== undefined) row.clientName = input.clientName;
    if (input.clientLogoUrl !== undefined) {
      row.clientLogoUrl = (await isSafePublicUrl(input.clientLogoUrl)) ? input.clientLogoUrl : row.clientLogoUrl;
    }
    if (input.contactDetails !== undefined) row.contactDetails = input.contactDetails;
    if (input.footer !== undefined) row.footer = input.footer;
    await this.branding.save(row);
    return this.getBranding(siteId);
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  async generate(
    siteId: string,
    organizationId: string | null,
    req: GenerateReportRequest,
    createdBy: string | null,
  ): Promise<ReportDto> {
    await this.requireSite(siteId);
    const branding = await this.getBranding(siteId);
    const data = await this.buildReportData(siteId, branding, req);

    const html = renderReport(req.type, data);
    const version = (await this.reports.count({ where: { siteId, type: req.type } })) + 1;

    const row = this.reports.create({
      siteId,
      organizationId,
      type: req.type,
      title: reportTitleText(branding.clientName, req.type),
      periodStart: data.period.start,
      periodEnd: data.period.end,
      version,
      html,
      pdfPath: null,
      status: 'GENERATED',
      meta: {
        hasBaseline: data.hasBaseline,
        observations: data.visibility?.totalObservations ?? 0,
        workCompleted: data.workCompleted.length,
      },
      createdBy,
    });
    const saved = await this.reports.save(row);

    try {
      const pdf = await htmlToPdf(html);
      if (pdf) {
        const dir = loadAppEnv().REPORTS_DIR;
        mkdirSync(dir, { recursive: true });
        const filePath = join(dir, `${saved.id}.pdf`);
        writeFileSync(filePath, pdf);
        saved.pdfPath = `${saved.id}.pdf`;
      } else {
        saved.status = 'PDF_FAILED';
      }
    } catch (error) {
      this.logger.warn(`PDF step failed for report ${saved.id}: ${error instanceof Error ? error.message : 'unknown'}`);
      saved.status = 'PDF_FAILED';
    }
    await this.reports.save(saved);
    return this.toDto(saved);
  }

  async listReports(siteId: string, query: ReportQuery = {}): Promise<ReportDto[]> {
    const builder = this.reports
      .createQueryBuilder('report')
      .where('report.site_id = :siteId', { siteId })
      .orderBy('report.created_at', 'DESC')
      .limit(Math.min(query.limit ?? 50, 100))
      .offset(query.offset ?? 0);
    if (query.type) builder.andWhere('report.type = :type', { type: query.type });
    const rows = await builder.getMany();
    return rows.map((row) => this.toDto(row));
  }

  async getReport(id: string): Promise<ReportContentDto> {
    const row = await this.requireReport(id);
    return { ...this.toDto(row), html: row.html };
  }

  async getReportHtml(id: string): Promise<string> {
    const row = await this.requireReport(id);
    return row.html;
  }

  async getReportPdfPath(id: string): Promise<string> {
    const row = await this.requireReport(id);
    if (!row.pdfPath) {
      throw new NotFoundException('PDF was not generated for this report');
    }
    return join(loadAppEnv().REPORTS_DIR, row.pdfPath);
  }

  // -------------------------------------------------------------------------
  // Data assembly
  // -------------------------------------------------------------------------

  private async buildReportData(siteId: string, branding: ReportBrandingDto, req: GenerateReportRequest): Promise<ReportData> {
    const dashboard = await this.baselines.dashboard(siteId);

    const performanceComparisons = dashboard.previousToCurrent?.metrics ?? dashboard.baselineToCurrent?.metrics ?? [];
    const baselineComparisons = dashboard.baselineToCurrent?.metrics ?? dashboard.previousToCurrent?.metrics ?? [];
    const performance = metricRows(performanceComparisons);
    const sinceBaseline = metricRows(baselineComparisons);
    const focusMetrics: MetricRow[] = sinceBaseline.length > 0 ? sinceBaseline : performance;

    const issueSnapshot = await this.operations.getIssueSnapshot(siteId);
    const issueCounts = countByStatus(issueSnapshot);
    const [changeLogs, appliedLinks, packages, trends] = await Promise.all([
      this.operations.listChangeLogs(siteId, { limit: 100 }),
      this.listAppliedLinks(siteId),
      this.content.list(siteId, { limit: 100 }),
      this.visibility.trends(siteId),
    ]);
    const changeLogItems: WorkItem[] = changeLogs.map((log) => ({
      kind: log.changeType,
      pageUrl: log.pageUrl,
      label: `${log.changeType.replace(/_/g, ' ')} on ${log.pageUrl}`,
      changedAt: log.changedAt.slice(0, 10),
    }));

    const workCompleted = this.collectWork(changeLogItems, appliedLinks, packages);
    const visibility: VisibilityMetricsDto | null = trends.latestVsPrevious
      ? trends.latestVsPrevious.latest.metrics
      : trends.points[trends.points.length - 1]?.metrics ?? null;
    const keywordOpportunities = await this.loadKeywordOpportunities(siteId);

    const period = {
      start: req.periodStart ?? null,
      end: req.periodEnd ?? null,
      label: periodLabel(req, performance.length > 0),
    };

    const nextActions = [
      ...((issueCounts['CRITICAL'] ?? 0) > 0 ? [`Resolve ${issueCounts['CRITICAL']} open critical issue(s).`] : []),
      ...(appliedLinks.pending > 0 ? [`Review ${appliedLinks.pending} pending link suggestion(s).`] : []),
      ...(trends.points.length === 0
        ? ['Run an AI visibility observation batch to establish a visibility baseline.']
        : ['Continue periodic AI visibility observations to track trends.']),
      ...(packages.length === 0 ? ['Generate content for approved keyword clusters.'] : []),
      'Review this report and compare next month against the baseline.',
    ];

    return {
      branding,
      period,
      generatedAt: new Date().toISOString(),
      disclaimer: CORRELATION_DISCLAIMER,
      hasData: dashboard.currentMetrics !== null || packages.length > 0 || workCompleted.length > 0,
      hasBaseline: dashboard.baselineToCurrent !== null,
      performance,
      sinceBaseline,
      issueProgression: dashboard.baselineToCurrent?.issueProgression ?? dashboard.previousToCurrent?.issueProgression ?? null,
      issueCounts,
      workCompleted,
      contentStats: { packages: packages.length, completed: packages.filter((item) => item.status === 'COMPLETE').length },
      visibility,
      keywordOpportunities,
      wins: buildWins(performance, issueSnapshot),
      risks: buildRisks(performance, issueCounts),
      nextActions,
      focusMetrics,
    };
  }

  private async listAppliedLinks(siteId: string): Promise<{ items: WorkItem[]; pending: number }> {
    const [applied, verified, suggested] = await Promise.all([
      this.links.listSuggestions(siteId, { status: 'APPLIED', limit: 100 }),
      this.links.listSuggestions(siteId, { status: 'VERIFIED', limit: 100 }),
      this.links.listSuggestions(siteId, { status: 'SUGGESTED', limit: 1 }),
    ]);
    const items: WorkItem[] = [...applied, ...verified].map((suggestion) => ({
      kind: 'internal_link',
      pageUrl: suggestion.sourceUrl,
      label: `Internal link "${suggestion.anchor}" -> ${suggestion.targetUrl}`,
      changedAt: (suggestion.appliedAt ?? suggestion.verifiedAt ?? suggestion.createdAt).slice(0, 10),
    }));
    return { items, pending: suggested.length };
  }

  private collectWork(changeLogs: WorkItem[], appliedLinks: { items: WorkItem[]; pending: number }, packages: ContentPackageDto[]): WorkItem[] {
    const contentWork: WorkItem[] = packages
      .filter((item) => item.status === 'COMPLETE')
      .map((item) => ({ kind: 'content', pageUrl: item.recommendedUrl || null, label: item.seoTitle || 'Content package', changedAt: item.createdAt.slice(0, 10) }));
    return [...changeLogs, ...appliedLinks.items, ...contentWork];
  }

  private async loadKeywordOpportunities(siteId: string): Promise<Array<{ keyword: string; position: number | null; note: string }>> {
    const clusters = await this.clusters.find({ where: { siteId, status: 'APPROVED' } });
    const opportunities: Array<{ keyword: string; position: number | null; note: string }> = [];
    for (const cluster of clusters) {
      const links = await this.clusterKeywords.find({ where: { clusterId: cluster.id } });
      if (links.length === 0) continue;
      const keywordIds = links.map((link) => link.keywordId);
      const keywordRows = await this.keywords.find({ where: { id: In(keywordIds) } });
      const primary = keywordRows[0]?.keyword ?? cluster.name;
      const metrics = await this.keywordMetrics.find({ where: { keywordId: In(keywordIds) } });
      const positions = metrics.map((row) => row.position).filter((position) => position > 0);
      const avg = positions.length > 0 ? positions.reduce((sum, position) => sum + position, 0) / positions.length : null;
      if (avg === null || (avg >= 4 && avg <= 20)) {
        opportunities.push({
          keyword: primary,
          position: avg === null ? null : Math.round(avg * 10) / 10,
          note: avg === null ? 'No ranking data yet — opportunity to gain visibility.' : `Average position ${Math.round(avg * 10) / 10} — opportunity to move toward page one.`,
        });
      }
    }
    return opportunities.slice(0, 20);
  }

  private toBrandingDto(row: ReportBranding): ReportBrandingDto {
    return {
      siteId: row.siteId,
      agencyName: row.agencyName,
      agencyLogoUrl: row.agencyLogoUrl,
      clientName: row.clientName,
      clientLogoUrl: row.clientLogoUrl,
      contactDetails: row.contactDetails,
      footer: row.footer,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async requireSite(siteId: string): Promise<Site> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    return site;
  }

  private async requireReport(id: string): Promise<Report> {
    const row = await this.reports.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Report not found');
    }
    return row;
  }

  private toDto(row: Report): ReportDto {
    return {
      id: row.id,
      siteId: row.siteId,
      organizationId: row.organizationId,
      type: row.type as ReportDto['type'],
      title: row.title,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      version: row.version,
      status: row.status as ReportDto['status'],
      pdfPath: row.pdfPath,
      meta: row.meta,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function envAgencyDefaults() {
  const env = loadAppEnv();
  return {
    name: env.AGENCY_NAME,
    logoUrl: env.AGENCY_LOGO_URL,
    email: env.AGENCY_EMAIL,
    phone: env.AGENCY_PHONE,
    footer: env.AGENCY_FOOTER,
  };
}

function reportTitleText(clientName: string, type: string): string {
  const labels: Record<string, string> = {
    INITIAL: 'Initial Search & AI Visibility Audit',
    MONTHLY: 'Monthly Progress',
    EXECUTIVE: 'Executive Report',
    SEO: 'SEO Report',
    AEO: 'AEO Report',
    GEO: 'GEO Report',
    TECHNICAL: 'Technical Report',
    CONTENT: 'Content Report',
    ISSUES: 'Issues Report',
    WORK_COMPLETED: 'Work Completed Report',
  };
  return `${clientName} — ${labels[type] ?? type}`;
}

function periodLabel(req: GenerateReportRequest, hasData: boolean): string {
  if (req.periodStart && req.periodEnd) return `${req.periodStart} to ${req.periodEnd}`;
  if (req.periodStart) return `from ${req.periodStart}`;
  if (req.periodEnd) return `up to ${req.periodEnd}`;
  return hasData ? 'latest available' : 'n/a';
}

function countByStatus(snapshot: IssueSnapshotEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of snapshot) {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  }
  return counts;
}

function buildWins(performance: MetricRow[], issueSnapshot: IssueSnapshotEntry[]): string[] {
  const wins = performance.filter((entry) => entry.direction === 'improved').slice(0, 3).map((row) => `${row.label} improved ${row.delta} (correlation only).`);
  const resolved = issueSnapshot.filter((entry) => entry.status === 'RESOLVED' || entry.status === 'IGNORED').length;
  if (resolved > 0) wins.push(`${resolved} issue(s) resolved.`);
  return wins;
}

function buildRisks(performance: MetricRow[], issueCounts: Record<string, number>): string[] {
  const risks = performance.filter((entry) => entry.direction === 'declined').slice(0, 3).map((row) => `${row.label} declined ${row.delta} (correlation only).`);
  if ((issueCounts['CRITICAL'] ?? 0) > 0) risks.push(`${issueCounts['CRITICAL']} critical issue(s) still open.`);
  return risks;
}

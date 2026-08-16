import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AiVisibilityRun,
  AutomationRun,
  Cluster,
  ClusterKeyword,
  ContentPublication,
  GscDailyMetric,
  GscOpportunity,
  GscProperty,
  Keyword,
  KeywordMetric,
  LinkAnalysis,
  LinkSuggestion,
  Report,
  ReportBranding,
  Site,
  WordPressIntegration,
  WordPressPost,
} from '@creative-seo/database';
import { loadAppEnv, isSafePublicUrl } from '@creative-seo/config';
import { BaselineService, OperationsService } from '@creative-seo/operations';
import { VisibilityService } from '@creative-seo/visibility';
import { ContentPackagesService } from '@creative-seo/content';
import { LinksService } from '@creative-seo/links';
import type {
  ContentPackageDto,
  GenerateReportRequest,
  IssueDto,
  IssueSnapshotEntry,
  ReportBrandingDto,
  ReportContentDto,
  ReportDto,
  ReportLanguage,
  ReportQuery,
  SaveReportBrandingRequest,
  VisibilityMetricsDto,
} from '@creative-seo/types';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { agencyDefaults, resolveBranding } from './branding';
import {
  CORRELATION_DISCLAIMER,
  metricRows,
  type CannibalizationRow,
  type ContentOpportunity,
  type ContentQualityStats,
  type HealthBlock,
  type InternalLinkStatus,
  type KeywordMove,
  type KeywordVisibilityRow,
  type MatrixQuadrant,
  type MetricRow,
  type OrganicPerformance,
  type PageMove,
  type PlanBlock,
  type PublishedContentItem,
  type RankMathStatus,
  type ReportData,
  type ReportFinding,
  type ReportRecommendation,
  type WorkItem,
} from './data';
import { htmlToPdf } from './pdf';
import { renderReport } from './render/report';

const OPEN_ISSUE_STATUSES = ['DETECTED', 'REVIEWED', 'APPROVED', 'IN_PROGRESS', 'FIXED', 'VERIFYING'];
const CLOSED_ISSUE_STATUSES = ['RESOLVED', 'IGNORED'];
const HEALTH_THRESHOLD = 60;

/**
 * Fully self-hosted reporting. Builds report data from the platform's own data
 * (baselines, issues, recommendations, change log, GSC metrics and
 * opportunities, keyword metrics, content packages, link analyses, visibility
 * observations), renders responsive bilingual HTML (English LTR / Arabic RTL),
 * converts to PDF with local Chromium/Playwright, and saves every version
 * permanently with a content hash. Work completed is always kept separate from
 * performance outcome and causation is never claimed.
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
    @InjectRepository(GscDailyMetric) private readonly gscMetrics: Repository<GscDailyMetric>,
    @InjectRepository(GscProperty) private readonly gscProperties: Repository<GscProperty>,
    @InjectRepository(GscOpportunity) private readonly gscOpportunities: Repository<GscOpportunity>,
    @InjectRepository(WordPressIntegration) private readonly wpIntegrations: Repository<WordPressIntegration>,
    @InjectRepository(WordPressPost) private readonly wpPosts: Repository<WordPressPost>,
    @InjectRepository(ContentPublication) private readonly publications: Repository<ContentPublication>,
    @InjectRepository(LinkSuggestion) private readonly linkSuggestions: Repository<LinkSuggestion>,
    @InjectRepository(LinkAnalysis) private readonly linkAnalyses: Repository<LinkAnalysis>,
    @InjectRepository(AutomationRun) private readonly automationRuns: Repository<AutomationRun>,
    @InjectRepository(AiVisibilityRun) private readonly visibilityRuns: Repository<AiVisibilityRun>,
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
  // Generation / preview
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
      title: reportTitleText(branding.clientName, req.type, data.lang),
      periodStart: data.period.start,
      periodEnd: data.period.end,
      version,
      html,
      pdfPath: null,
      status: 'GENERATED',
      meta: {
        lang: data.lang,
        sha256: sha256(html),
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

  /**
   * Renders a report's HTML without persisting anything. This is the
   * "preview before generation" path — it never creates report rows, baseline
   * snapshots or PDF files.
   */
  async preview(siteId: string, organizationId: string | null, req: GenerateReportRequest): Promise<ReportContentDto> {
    await this.requireSite(siteId);
    const branding = await this.getBranding(siteId);
    const data = await this.buildReportData(siteId, branding, req);
    const html = renderReport(req.type, data);
    return {
      id: '',
      siteId,
      organizationId,
      type: req.type,
      title: reportTitleText(branding.clientName, req.type, data.lang),
      periodStart: data.period.start,
      periodEnd: data.period.end,
      version: 0,
      status: 'GENERATED',
      pdfPath: null,
      meta: {
        lang: data.lang,
        sha256: sha256(html),
        preview: true,
        hasBaseline: data.hasBaseline,
      },
      createdBy: null,
      createdAt: new Date().toISOString(),
      html,
    };
  }

  async listReports(siteId: string, query: ReportQuery = {}): Promise<ReportDto[]> {
    return this.queryReports({ siteId, ...query });
  }

  /** Cross-site report listing (admin/agency view); optional siteId filter. */
  async listReportsGlobal(query: ReportQuery = {}): Promise<ReportDto[]> {
    return this.queryReports(query);
  }

  private async queryReports(query: ReportQuery): Promise<ReportDto[]> {
    const builder = this.reports
      .createQueryBuilder('report')
      .orderBy('report.created_at', 'DESC')
      .limit(Math.min(query.limit ?? 50, 100))
      .offset(query.offset ?? 0);
    if (query.siteId) builder.andWhere('report.site_id = :siteId', { siteId: query.siteId });
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
    const lang: ReportLanguage = req.lang ?? 'en';
    const windows = periodWindows(req);
    const site = await this.sites.findOne({ where: { id: siteId }, select: { id: true, name: true, domain: true } });

    const dashboard = await this.baselines.dashboard(siteId);
    const performanceComparisons = dashboard.previousToCurrent?.metrics ?? dashboard.baselineToCurrent?.metrics ?? [];
    const baselineComparisons = dashboard.baselineToCurrent?.metrics ?? dashboard.previousToCurrent?.metrics ?? [];
    const performance = metricRows(performanceComparisons);
    const sinceBaseline = metricRows(baselineComparisons);
    const focusMetrics: MetricRow[] = sinceBaseline.length > 0 ? sinceBaseline : performance;

    const issueSnapshot = await this.operations.getIssueSnapshot(siteId);
    const issueCounts = countByStatus(issueSnapshot);

    const [
      issues,
      recommendations,
      tasks,
      changeLogs,
      appliedLinks,
      packages,
      trends,
      gscRows,
      gscPrevious,
      opportunities,
      wpIntegration,
      wpPostCoverage,
      publications,
      linkPendingCount,
      linkAppliedCount,
      linkVerifiedCount,
      latestAnalysis,
      automationCount,
      visibilityRunCount,
    ] = await Promise.all([
      this.operations.listIssues(siteId, { limit: 200 }),
      this.operations.listRecommendations(siteId),
      this.operations.listTasks(siteId),
      this.operations.listChangeLogs(siteId, { limit: 100 }),
      this.listAppliedLinks(siteId),
      this.content.list(siteId, { limit: 100 }),
      this.visibility.trends(siteId),
      this.gscWindow(siteId, windows.currentStart, windows.currentEnd),
      this.gscWindow(siteId, windows.previousStart, windows.previousEnd),
      this.gscOpportunities.find({ where: { kind: 'QUERY_URL_CONFLICT', status: 'OPEN' }, order: { detectedAt: 'DESC' }, take: 30 }),
      this.wpIntegrations.findOne({ where: { siteId } }),
      this.loadWpPostCoverage(siteId),
      this.publications.find({ where: { siteId }, order: { publishedAt: 'DESC' }, take: 50 }),
      this.linkSuggestions.count({ where: { siteId, status: 'SUGGESTED' } }),
      this.linkSuggestions.count({ where: { siteId, status: 'APPLIED' } }),
      this.linkSuggestions.count({ where: { siteId, status: 'VERIFIED' } }),
      this.loadLatestAnalysis(siteId),
      this.automationRuns.count({ where: { siteId, status: 'COMPLETED' } }),
      this.visibilityRuns.count({ where: { siteId, status: 'COMPLETED' } }),
    ]);

    const keywordData = await this.loadKeywordData(siteId);
    const changeLogItems: WorkItem[] = changeLogs.map((log) => ({
      kind: log.changeType,
      pageUrl: log.pageUrl,
      label: `${log.changeType.replace(/_/g, ' ')} on ${log.pageUrl}`,
      changedAt: log.changedAt.slice(0, 10),
    }));
    const publicationWork: WorkItem[] = publications
      .filter((item) => item.status === 'PUBLISHED' && item.publishedAt)
      .slice(0, 20)
      .map((item) => ({
        kind: 'content',
        pageUrl: item.url,
        label: `Published "${item.title}"`,
        changedAt: item.publishedAt ? item.publishedAt.toISOString().slice(0, 10) : item.createdAt.toISOString().slice(0, 10),
      }));
    const observationWork: WorkItem[] = visibilityRunCount > 0
      ? [{ kind: 'observation', pageUrl: null, label: `${visibilityRunCount} AI visibility observation run(s) completed`, changedAt: new Date().toISOString().slice(0, 10) }]
      : [];
    const automationWork: WorkItem[] = automationCount > 0
      ? [{ kind: 'automation', pageUrl: null, label: `${automationCount} automation run(s) completed`, changedAt: new Date().toISOString().slice(0, 10) }]
      : [];

    const workCompleted = this.collectWork(changeLogItems, appliedLinks, packages, [...publicationWork, ...observationWork, ...automationWork]);
    const visibility: VisibilityMetricsDto | null = trends.latestVsPrevious
      ? trends.latestVsPrevious.latest.metrics
      : trends.points[trends.points.length - 1]?.metrics ?? null;

    const allIssues = findings(issues);
    const openIssues = allIssues.filter((issue) => OPEN_ISSUE_STATUSES.includes(issue.status));
    const criticalProblems = openIssues.filter((issue) => issue.severity === 'CRITICAL').slice(0, 12);
    const highPriorityProblems = openIssues.filter((issue) => issue.severity === 'HIGH').slice(0, 12);
    const technicalFindings = allIssues
      .filter((issue) => ['CRITICAL_TECHNICAL', 'GSC_FAILURE', 'WORDPRESS_FAILURE', 'ORCHESTRATION'].includes(issue.kind))
      .slice(0, 20);
    const onPageFindings = allIssues.filter((issue) => issue.kind === 'ON_PAGE').slice(0, 20);
    const issuesResolvedList = allIssues.filter((issue) => CLOSED_ISSUE_STATUSES.includes(issue.status)).slice(0, 20);
    const outstandingList = openIssues.slice(0, 20);

    const contentQuality = computeContentQuality(packages);
    const health = buildHealthBlocks(dashboard.currentMetrics, performance);
    const cannibalization = buildCannibalization(openIssues, opportunities);
    const rankMath = buildRankMath(wpIntegration, wpPostCoverage);
    const internalLinks = buildInternalLinks(latestAnalysis, { pending: linkPendingCount, applied: linkAppliedCount, verified: linkVerifiedCount });
    const contentOpportunities = buildContentOpportunities(packages, keywordData.clusters);
    const quickWins = buildQuickWins(recommendations);
    const matrix = buildMatrix(recommendations);
    const aeoGaps = buildAeoGaps(dashboard.currentMetrics, contentQuality.avg, visibility);
    const geoGaps = buildGeoGaps(dashboard.currentMetrics, contentQuality.avg, visibility);
    const nextPriorities = buildNextPriorities(openIssues, recommendations, contentOpportunities, visibilityRunCount);
    const keywordMoves = keywordData.moves;
    const organic = buildOrganic(gscRows, gscPrevious);
    const pageMoves = await this.loadPageMoves(siteId, windows);
    const publishedList: PublishedContentItem[] = publications
      .filter((item) => item.status === 'PUBLISHED' && item.publishedAt)
      .slice(0, 30)
      .map((item) => ({
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt ? item.publishedAt.toISOString().slice(0, 10) : '',
        language: 'en',
      }));

    const keywordOpportunities = keywordData.opportunities;
    const plans = buildPlans(criticalProblems, highPriorityProblems, quickWins, contentOpportunities, visibilityRunCount, tasks.length);

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
      lang,
      branding,
      site: site ? { name: site.name, domain: site.domain } : null,
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
      health,
      visibilityBaseline: healthBaseline(dashboard.currentMetrics),
      technicalFindings,
      onPageFindings,
      contentQuality,
      rankMath,
      keywordVisibility: keywordData.rows,
      cannibalization,
      internalLinks,
      aeoGaps,
      geoGaps,
      criticalProblems,
      highPriorityProblems,
      quickWins,
      contentOpportunities,
      matrix,
      plans,
      organic,
      keywordMoves,
      pageMoves,
      issuesResolvedList,
      outstandingList,
      contentPublishedList: publishedList,
      recommendationsList: recommendations
        .map((item) => ({
          id: item.id,
          issueId: item.issueId,
          title: item.title,
          priority: item.priority as ReportRecommendation['priority'],
          impact: item.impact,
          confidence: item.confidence,
          effort: item.effort,
          suggestedAction: item.suggestedAction,
        }))
        .slice(0, 30),
      nextPriorities,
    };
  }

  private async loadKeywordData(siteId: string): Promise<{
    rows: KeywordVisibilityRow[];
    moves: KeywordMove[];
    opportunities: Array<{ keyword: string; position: number | null; note: string }>;
    clusters: Array<{ name: string; action: string }>;
  }> {
    const clusters = await this.clusters.find({ where: { siteId, status: 'APPROVED' } });
    const keywordRows = await this.keywords.find({ where: { siteId }, order: { keyword: 'ASC' } });
    const keywordIds = keywordRows.map((row) => row.id);
    const idToKeyword = new Map(keywordRows.map((row) => [row.id, row.keyword]));

    const cutoff = addDaysIso(new Date(), -90);
    const metricRows = keywordIds.length > 0
      ? await this.keywordMetrics
          .createQueryBuilder('km')
          .where('km.keyword_id IN (:...ids)', { ids: keywordIds })
          .andWhere('km.metric_date >= :cutoff', { cutoff })
          .orderBy('km.keyword_id', 'ASC')
          .addOrderBy('km.metric_date', 'ASC')
          .getMany()
      : [];
    const byKeyword = new Map<string, typeof metricRows>();
    for (const row of metricRows) {
      const list = byKeyword.get(row.keywordId) ?? [];
      list.push(row);
      byKeyword.set(row.keywordId, list);
    }

    const rows: KeywordVisibilityRow[] = [];
    const moves: KeywordMove[] = [];
    for (const [keywordId, list] of byKeyword) {
      const keyword = idToKeyword.get(keywordId) ?? 'Keyword';
      const latest = list[list.length - 1]!;
      const prev = latestDateRow(list.slice(0, -1));
      const position = latest.position > 0 ? round2(latest.position) : null;
      const previousPosition = prev && prev.position > 0 ? round2(prev.position) : null;
      const delta = position !== null && previousPosition !== null ? round2(position - previousPosition) : null;
      rows.push({
        keyword,
        position,
        clicks: latest.clicks,
        impressions: latest.impressions,
        ctr: latest.ctr,
        delta,
      });
      moves.push({ keyword, before: previousPosition, after: position, delta, clicksAfter: latest.clicks });
    }
    rows.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
    moves.sort((a, b) => (a.delta === null ? 0 : a.delta) - (b.delta === null ? 0 : b.delta));

    const opportunities: Array<{ keyword: string; position: number | null; note: string }> = [];
    for (const cluster of clusters) {
      const links = await this.clusterKeywords.find({ where: { clusterId: cluster.id } });
      if (links.length === 0) continue;
      const keywordIdsInCluster = links.map((link) => link.keywordId);
      const positions: number[] = [];
      for (const keywordId of keywordIdsInCluster) {
        const list = byKeyword.get(keywordId);
        if (list && list.length > 0) {
          const latest = list[list.length - 1]!;
          if (latest.position > 0) positions.push(latest.position);
        }
      }
      const avg = positions.length > 0 ? round2(positions.reduce((sum, position) => sum + position, 0) / positions.length) : null;
      if (avg === null || (avg >= 4 && avg <= 20)) {
        opportunities.push({
          keyword: keywordRows.find((row) => row.id === keywordIdsInCluster[0])?.keyword ?? cluster.name,
          position: avg,
          note: avg === null ? 'No ranking data yet — opportunity to gain visibility.' : `Average position ${avg} — opportunity to move toward page one.`,
        });
      }
    }

    return {
      rows: rows.slice(0, 30),
      moves: moves.slice(0, 15),
      opportunities: opportunities.slice(0, 20),
      clusters: clusters.map((cluster) => ({ name: cluster.name, action: cluster.recommendedAction })),
    };
  }

  private async loadPageMoves(siteId: string, windows: ReturnType<typeof periodWindows>): Promise<PageMove[]> {
    const byPage = await this.gscPageTotals(siteId, windows);
    const rows: PageMove[] = [];
    for (const [page, totals] of byPage) {
      rows.push({
        page,
        clicksBefore: totals.previous.clicks,
        clicksAfter: totals.current.clicks,
        impressionsBefore: totals.previous.impressions,
        impressionsAfter: totals.current.impressions,
        positionAfter: totals.current.avgPosition,
      });
    }
    rows.sort((a, b) => Math.abs(b.clicksAfter - b.clicksBefore) - Math.abs(a.clicksAfter - a.clicksBefore));
    return rows.slice(0, 12);
  }

  private async gscPageTotals(
    siteId: string,
    windows: ReturnType<typeof periodWindows>,
  ): Promise<Map<string, { current: { clicks: number; impressions: number; avgPosition: number | null }; previous: { clicks: number; impressions: number; avgPosition: number | null } }>> {
    const [current, previous] = await Promise.all([
      this.gscPageWindow(siteId, windows.currentStart, windows.currentEnd),
      this.gscPageWindow(siteId, windows.previousStart, windows.previousEnd),
    ]);
    const result = new Map<string, { current: { clicks: number; impressions: number; avgPosition: number | null }; previous: { clicks: number; impressions: number; avgPosition: number | null } }>();
    for (const [page, totals] of current) {
      result.set(page, { current: totals, previous: { clicks: 0, impressions: 0, avgPosition: null } });
    }
    for (const [page, totals] of previous) {
      const existing = result.get(page);
      if (existing) existing.previous = totals;
      else result.set(page, { current: { clicks: 0, impressions: 0, avgPosition: null }, previous: totals });
    }
    return result;
  }

  private gscPageWindow(siteId: string, start: string, end: string): Promise<Map<string, { clicks: number; impressions: number; avgPosition: number | null }>> {
    return this.gscMetrics
      .createQueryBuilder('m')
      .innerJoin(GscProperty, 'p', 'p.id = m.property_id')
      .select('m.page', 'page')
      .addSelect('COALESCE(SUM(m.clicks), 0)', 'clicks')
      .addSelect('COALESCE(SUM(m.impressions), 0)', 'impressions')
      .addSelect('AVG(m.position) FILTER (WHERE m.position > 0)', 'position')
      .where('p.site_id = :siteId', { siteId })
      .andWhere('m.metric_date BETWEEN :s AND :e', { s: start, e: end })
      .andWhere("m.page != ''")
      .groupBy('m.page')
      .orderBy('clicks', 'DESC')
      .limit(100)
      .getRawMany()
      .then((rows) => {
        const map = new Map<string, { clicks: number; impressions: number; avgPosition: number | null }>();
        for (const row of rows as Array<{ page: string; clicks: string; impressions: string; position: string | null }>) {
          map.set(row.page, {
            clicks: Number(row.clicks),
            impressions: Number(row.impressions),
            avgPosition: row.position === null ? null : round2(Number(row.position)),
          });
        }
        return map;
      });
  }

  private async loadWpPostCoverage(siteId: string): Promise<{ scanned: number; covered: number }> {
    const [total, covered] = await Promise.all([
      this.wpPosts.count({ where: { siteId, status: 'publish' } }),
      this.wpPosts
        .createQueryBuilder('p')
        .where('p.site_id = :siteId', { siteId })
        .andWhere("p.status = 'publish'")
        .andWhere("p.rank_math != '{}'::jsonb")
        .getCount(),
    ]);
    return { scanned: total, covered };
  }

  private async loadLatestAnalysis(siteId: string): Promise<LinkAnalysis | null> {
    const analysis = await this.linkAnalyses.findOne({ where: { siteId }, order: { createdAt: 'DESC' } });
    return analysis ?? null;
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

  private collectWork(changeLogs: WorkItem[], appliedLinks: { items: WorkItem[]; pending: number }, packages: ContentPackageDto[], extra: WorkItem[] = []): WorkItem[] {
    const contentWork: WorkItem[] = packages
      .filter((item) => item.status === 'COMPLETE')
      .map((item) => ({ kind: 'content', pageUrl: item.recommendedUrl || null, label: item.seoTitle || 'Content package', changedAt: item.createdAt.slice(0, 10) }));
    return [...changeLogs, ...appliedLinks.items, ...contentWork, ...extra];
  }

  private gscWindow(siteId: string, start: string, end: string): Promise<{ clicks: number; impressions: number; position: number | null }> {
    return this.gscMetrics
      .createQueryBuilder('m')
      .innerJoin(GscProperty, 'p', 'p.id = m.property_id')
      .select('COALESCE(SUM(m.clicks), 0)', 'clicks')
      .addSelect('COALESCE(SUM(m.impressions), 0)', 'impressions')
      .addSelect('AVG(m.position) FILTER (WHERE m.position > 0)', 'position')
      .where('p.site_id = :siteId', { siteId })
      .andWhere('m.metric_date BETWEEN :s AND :e', { s: start, e: end })
      .getRawOne<{ clicks: string; impressions: string; position: string | null }>()
      .then((row) => ({ clicks: Number(row?.clicks ?? 0), impressions: Number(row?.impressions ?? 0), position: row?.position === null ? null : Number(row?.position ?? 0) }));
  }

  // -------------------------------------------------------------------------
  // DTO helpers
  // -------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Module-level helpers (pure)
// ---------------------------------------------------------------------------

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

function reportTitleText(clientName: string, type: string, lang: ReportLanguage): string {
  const labels: Record<string, { en: string; ar: string }> = {
    INITIAL: { en: 'Initial Search & AI Visibility Audit', ar: 'التدقيق الأولي لظهور الموقع في البحث والذكاء الاصطناعي' },
    MONTHLY: { en: 'Monthly Search Visibility Report', ar: 'التقرير الشهري لظهور الموقع في البحث' },
    EXECUTIVE: { en: 'Executive Summary Report', ar: 'الملخص التنفيذي' },
    SEO: { en: 'SEO Report', ar: 'تقرير SEO' },
    AEO: { en: 'AEO Report', ar: 'تقرير AEO' },
    GEO: { en: 'GEO Report', ar: 'تقرير GEO' },
    TECHNICAL: { en: 'Technical Report', ar: 'التقرير الفني' },
    CONTENT: { en: 'Content Report', ar: 'تقرير المحتوى' },
    ISSUES: { en: 'Issues Report', ar: 'تقرير المشكلات' },
    WORK_COMPLETED: { en: 'Work Completed Report', ar: 'تقرير الأعمال المنجزة' },
  };
  const label = labels[type] ?? { en: type, ar: type };
  return `${clientName} — ${label[lang]}`;
}

function periodWindows(req: GenerateReportRequest): { currentStart: string; currentEnd: string; previousStart: string; previousEnd: string } {
  const now = new Date();
  if (req.periodStart && req.periodEnd) {
    const start = new Date(req.periodStart);
    const end = new Date(req.periodEnd);
    const length = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    const prevEnd = addDaysIso(start, -1);
    const prevStart = addDaysIso(start, -length);
    return {
      currentStart: req.periodStart,
      currentEnd: req.periodEnd,
      previousStart: prevStart,
      previousEnd: prevEnd,
    };
  }
  const currentEnd = now.toISOString().slice(0, 10);
  const currentStart = addDaysIso(now, -27);
  const previousEnd = addDaysIso(now, -28);
  const previousStart = addDaysIso(now, -55);
  return { currentStart, currentEnd, previousStart, previousEnd };
}

function addDaysIso(date: Date, days: number): string {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString().slice(0, 10);
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

function findings(issues: IssueDto[]): ReportFinding[] {
  return issues.map((issue) => ({
    id: issue.id,
    kind: issue.kind,
    severity: issue.severity as ReportFinding['severity'],
    status: issue.status,
    title: issue.title,
    description: issue.description,
    url: issue.url,
    detectedAt: issue.detectedAt.slice(0, 10),
  }));
}

function buildHealthBlocks(current: import('@creative-seo/types').BaselineMetricsDto | null, performance: MetricRow[]): ReportData['health'] {
  const byKey = new Map(performance.map((row) => [row.key, row]));
  const block = (key: string, value: number | null): HealthBlock => {
    const row = byKey.get(key);
    return {
      key,
      labelKey: key,
      value,
      previous: null,
      delta: row?.delta ?? null,
      direction: row?.direction ?? 'n/a',
    };
  };
  return {
    seo: [
      block('crawlHealth', current?.crawlHealth ?? null),
      block('technicalIssues', current?.technicalIssues ?? null),
      block('onPageHealth', current?.onPageHealth ?? null),
      block('keywordVisibility', current?.keywordVisibility ?? null),
      block('internalLinkHealth', current?.internalLinkHealth ?? null),
    ],
    aeo: [block('aeoReadiness', current?.aeoReadiness ?? null), block('contentHealth', current?.contentHealth ?? null)],
    geo: [block('geoReadiness', current?.geoReadiness ?? null)],
  };
}

function healthBaseline(current: import('@creative-seo/types').BaselineMetricsDto | null): HealthBlock[] {
  if (!current) return [];
  return [
    { key: 'crawlHealth', labelKey: 'crawlHealth', value: current.crawlHealth, previous: null, delta: null, direction: 'n/a' },
    { key: 'onPageHealth', labelKey: 'onPageHealth', value: current.onPageHealth, previous: null, delta: null, direction: 'n/a' },
    { key: 'aeoReadiness', labelKey: 'aeoReadiness', value: current.aeoReadiness, previous: null, delta: null, direction: 'n/a' },
    { key: 'geoReadiness', labelKey: 'geoReadiness', value: current.geoReadiness, previous: null, delta: null, direction: 'n/a' },
    { key: 'keywordVisibility', labelKey: 'keywordVisibility', value: current.keywordVisibility, previous: null, delta: null, direction: 'n/a' },
  ];
}

function buildCannibalization(openIssues: ReportFinding[], opportunities: GscOpportunity[]): CannibalizationRow[] {
  const rows: CannibalizationRow[] = [];
  for (const issue of openIssues.filter((item) => item.kind === 'CANNIBALIZATION')) {
    rows.push({ query: issue.title, pages: issue.url ? [issue.url] : [], severity: issue.severity === 'CRITICAL' || issue.severity === 'HIGH' ? 'HIGH' : 'MEDIUM' });
  }
  for (const opportunity of opportunities) {
    const value = opportunity.currentValue as Record<string, unknown>;
    const rawPages = Array.isArray(value.pages) ? (value.pages as Array<[string, number] | string>) : [];
    const pages = rawPages.map((entry) => (Array.isArray(entry) ? String(entry[0]) : String(entry)));
    rows.push({ query: opportunity.query ?? 'Multiple pages', pages: pages.slice(0, 10), severity: 'HIGH' });
  }
  return rows.slice(0, 20);
}

function buildRankMath(integration: WordPressIntegration | null, coverage: { scanned: number; covered: number }): RankMathStatus | null {
  if (!integration) return null;
  return {
    detected: integration.rankMathDetected,
    version: integration.rankMathVersion,
    scanned: coverage.scanned,
    covered: coverage.covered,
    coveragePct: coverage.scanned > 0 ? round2((coverage.covered / coverage.scanned) * 100) : null,
  };
}

function buildInternalLinks(analysis: LinkAnalysis | null, counts: { pending: number; applied: number; verified: number }): InternalLinkStatus {
  const stats = analysis ? buildLinkStats(analysis.stats) : null;
  return { stats, pending: counts.pending, applied: counts.applied, verified: counts.verified };
}

function buildLinkStats(raw: Record<string, unknown>): InternalLinkStatus['stats'] {
  const toNumber = (key: string): number => {
    const value = raw[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  return {
    pagesCrawled: toNumber('crawledPages'),
    orphanPages: toNumber('orphanPages'),
    weakTargets: toNumber('weakTargets'),
    brokenLinks: toNumber('brokenLinks'),
    opportunities: toNumber('opportunities'),
    overusedAnchors: toNumber('overusedAnchors'),
    conflictingLinks: toNumber('conflictingLinks'),
    approvedTargets: toNumber('approvedTargets'),
  };
}

function buildContentOpportunities(packages: ContentPackageDto[], clusters: Array<{ name: string; action: string }>): ContentOpportunity[] {
  const done = new Set(packages.map((item) => item.clusterId).filter(Boolean));
  return clusters
    .map((cluster) => ({
      cluster: cluster.name,
      keyword: cluster.name,
      position: null,
      action: cluster.action,
      note: done.has(cluster.name) ? 'Already generated content for this cluster.' : 'No content package yet for this approved cluster.',
    }))
    .slice(0, 10);
}

function buildQuickWins(recommendations: ReportRecommendation[]): string[] {
  return recommendations
    .filter((item) => (item.priority === 'CRITICAL' || item.priority === 'HIGH') && item.effort <= 30)
    .slice(0, 6)
    .map((item) => `${item.title} (impact ${item.impact}, confidence ${item.confidence}, effort ${item.effort})`);
}

function buildMatrix(recommendations: ReportRecommendation[]): MatrixQuadrant[] {
  const quadrants: MatrixQuadrant[] = [
    { key: 'quickWins', items: [] },
    { key: 'majorProjects', items: [] },
    { key: 'fillIns', items: [] },
    { key: 'reconsider', items: [] },
  ];
  for (const item of recommendations) {
    const highPriority = item.priority === 'CRITICAL' || item.priority === 'HIGH';
    const highEffort = item.effort >= 70;
    if (highPriority && !highEffort) quadrants[0]!.items.push(item.title);
    else if (highPriority && highEffort) quadrants[1]!.items.push(item.title);
    else if (!highPriority && !highEffort) quadrants[2]!.items.push(item.title);
    else quadrants[3]!.items.push(item.title);
  }
  return quadrants.map((quadrant) => ({ ...quadrant, items: quadrant.items.slice(0, 8) }));
}

function buildAeoGaps(
  current: import('@creative-seo/types').BaselineMetricsDto | null,
  avg: ContentQualityStats['avg'],
  visibility: VisibilityMetricsDto | null,
): string[] {
  const gaps: string[] = [];
  if (current && current.aeoReadiness !== null && current.aeoReadiness < HEALTH_THRESHOLD) gaps.push('AEO readiness score below the healthy threshold (under 60).');
  if (avg.aeo !== null && avg.aeo < HEALTH_THRESHOLD) gaps.push(`Average AEO validator score across content packages is ${Math.round(avg.aeo)} — answer-engine questions may be under-covered.`);
  if (visibility && visibility.citationRate < 0.5) gaps.push('Low on-site citation rate in AI observations — pages rarely cited as a source.');
  if (avg.rankMath !== null && avg.rankMath < HEALTH_THRESHOLD) gaps.push('Rank Math schema/structured-data coverage below the healthy threshold.');
  if (gaps.length === 0 && current === null && avg.aeo === null && !visibility) gaps.push('Run an AI visibility observation batch and capture a baseline to identify AEO gaps.');
  return gaps.slice(0, 6);
}

function buildGeoGaps(
  current: import('@creative-seo/types').BaselineMetricsDto | null,
  avg: ContentQualityStats['avg'],
  visibility: VisibilityMetricsDto | null,
): string[] {
  const gaps: string[] = [];
  if (current && current.geoReadiness !== null && current.geoReadiness < HEALTH_THRESHOLD) gaps.push('GEO readiness score below the healthy threshold (under 60).');
  if (avg.geo !== null && avg.geo < HEALTH_THRESHOLD) gaps.push(`Average GEO validator score across content packages is ${Math.round(avg.geo)} — entity coverage may be incomplete.`);
  if (visibility && visibility.sourceCoverage < 0.5) gaps.push('Low source coverage in AI observations — the site is rarely cited.');
  if (visibility && visibility.competitorInclusion > 0.7) gaps.push('Competitors are mentioned in most AI answers while the site is absent.');
  if (gaps.length === 0 && current === null && avg.geo === null && !visibility) gaps.push('Run an AI visibility observation batch and capture a baseline to identify GEO gaps.');
  return gaps.slice(0, 6);
}

function buildOrganic(current: { clicks: number; impressions: number; position: number | null }, previous: { clicks: number; impressions: number; position: number | null }): OrganicPerformance {
  const hasGsc = current.impressions > 0 || previous.impressions > 0;
  return {
    hasGsc,
    clicks: current.clicks,
    impressions: current.impressions,
    ctr: current.impressions > 0 ? round2(current.clicks / current.impressions) : 0,
    avgPosition: current.position === null ? null : round2(current.position),
    previous: {
      clicks: previous.clicks,
      impressions: previous.impressions,
      ctr: previous.impressions > 0 ? round2(previous.clicks / previous.impressions) : 0,
      avgPosition: previous.position === null ? null : round2(previous.position),
    },
  };
}

function buildNextPriorities(
  openIssues: ReportFinding[],
  recommendations: ReportRecommendation[],
  contentOpportunities: ContentOpportunity[],
  visibilityRunCount: number,
): string[] {
  const priorities: string[] = [];
  const critical = openIssues.filter((issue) => issue.severity === 'CRITICAL').length;
  const high = openIssues.filter((issue) => issue.severity === 'HIGH').length;
  if (critical > 0) priorities.push(`Resolve ${critical} critical issue(s) first.`);
  if (high > 0) priorities.push(`Work through ${high} high-priority issue(s).`);
  const topRecommendations = recommendations
    .filter((item) => item.priority === 'CRITICAL' || item.priority === 'HIGH')
    .slice(0, 3)
    .map((item) => item.title);
  if (topRecommendations.length > 0) priorities.push(`Implement top recommendations: ${topRecommendations.join('; ')}.`);
  if (contentOpportunities.length > 0) priorities.push(`Build content for ${contentOpportunities.length} approved cluster(s) with visibility potential.`);
  if (visibilityRunCount === 0) priorities.push('Establish an AI visibility observation baseline.');
  else priorities.push('Continue periodic AI visibility observations to track trends.');
  return priorities.slice(0, 8);
}

function buildPlans(
  criticalProblems: ReportFinding[],
  highPriorityProblems: ReportFinding[],
  quickWins: string[],
  contentOpportunities: ContentOpportunity[],
  visibilityRunCount: number,
  taskCount: number,
): PlanBlock[] {
  const plans: PlanBlock[] = [
    {
      key: 'plan30',
      intro: 'plan30.intro',
      items: criticalProblems.length > 0 ? [`Resolve ${criticalProblems.length} critical issue(s): ${criticalProblems.slice(0, 3).map((item) => item.title).join('; ')}.`] : [],
    },
    {
      key: 'plan60',
      intro: 'plan60.intro',
      items: highPriorityProblems.length > 0 ? [`Resolve ${highPriorityProblems.length} high-priority issue(s).`] : [],
    },
    {
      key: 'plan90',
      intro: 'plan90.intro',
      items: contentOpportunities.length > 0 ? [`Publish content for ${contentOpportunities.length} opportunity cluster(s).`] : [],
    },
  ];
  if (quickWins.length > 0) plans[0]!.items.push(`Execute ${quickWins.length} quick win(s).`);
  if (taskCount > 0) plans[1]!.items.push(`Track and close ${taskCount} open task(s).`);
  if (visibilityRunCount === 0) plans[1]!.items.push('Run an AI visibility observation batch.');
  else plans[2]!.items.push('Continue AI visibility observation tracking.');
  plans[2]!.items.push('Monitor progress vs the immutable baseline snapshot.');
  return plans.map((plan) => ({ ...plan, items: plan.items.slice(0, 6) }));
}

function computeContentQuality(packages: ContentPackageDto[]): ContentQualityStats {
  const published = packages.filter((item) => item.status === 'COMPLETE').length;
  const drafts = packages.filter((item) => ['QUEUED', 'RUNNING', 'AWAITING_APPROVAL', 'REJECTED', 'FAILED'].includes(item.status)).length;
  const withScores = packages.filter((item) => item.scores && item.scores.seo && typeof item.scores.seo.overallScore === 'number');
  const avg = (pick: (item: ContentPackageDto) => number | null | undefined): number | null => {
    const values = packages.map(pick).filter((value): value is number => typeof value === 'number');
    return values.length > 0 ? round2(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  };
  void withScores;
  return {
    packages: packages.length,
    published,
    drafts,
    avg: {
      seo: avg((item) => item.scores?.seo?.overallScore),
      aeo: avg((item) => item.scores?.aeo?.overallScore),
      geo: avg((item) => item.scores?.geo?.overallScore),
      rankMath: avg((item) => item.scores?.rankMath?.overallScore),
    },
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function latestDateRow(rows: Array<{ metricDate: string }>): { position: number; metricDate: string } | null {
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1] as { metricDate: string; position: number };
  return { position: last.position, metricDate: last.metricDate };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

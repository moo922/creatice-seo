import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { loadAppEnv } from '@creative-seo/config';
import {
  ActivityLog,
  AiJob,
  AiProviderConfig,
  BaselineSnapshot,
  ContentPackage,
  ContentPublication,
  CrawledPage,
  GscDailyMetric,
  GscProperty,
  Issue,
  Keyword,
  KeywordMetric,
  LinkAnalysis,
  OperationsTask,
  Organization,
  Recommendation,
  Report,
  Site,
  SiteMembership,
  WordPressIntegration,
  WorkflowJob,
} from '@creative-seo/database';
import type {
  BaselineMetricsDto,
  BaselineProgressMetricDto,
  ContentStageDto,
  DashboardSummaryDto,
  NeedsAttentionItemDto,
  PortfolioDashboardDto,
  SiteDashboardDto,
  SiteIntegrationHealthDto,
  SiteIssueSummaryDto,
  SiteMetricTotalsDto,
  SitePortfolioRowDto,
  SiteRecommendationDto,
  SiteKeywordRowDto,
} from '@creative-seo/types';
import { In, Repository } from 'typeorm';
import type { AuthPrincipal } from '../../common/auth.types';

const CLOSED = new Set(['RESOLVED', 'IGNORED']);
const IN_PROGRESS = new Set(['IN_PROGRESS', 'FIXED', 'VERIFYING']);
const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const TODAY = new Date();

/**
 * Aggregated operational dashboards. All metrics are computed here in grouped
 * SQL queries (no N+1) over the real database domains — the frontend only
 * renders. Access is scoped to the user's authorized sites (global roles see
 * all; everyone else sees memberships).
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(SiteMembership) private readonly memberships: Repository<SiteMembership>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(Recommendation) private readonly recommendations: Repository<Recommendation>,
    @InjectRepository(OperationsTask) private readonly tasks: Repository<OperationsTask>,
    @InjectRepository(AiJob) private readonly aiJobs: Repository<AiJob>,
    @InjectRepository(WorkflowJob) private readonly workflowJobs: Repository<WorkflowJob>,
    @InjectRepository(ContentPackage) private readonly packages: Repository<ContentPackage>,
    @InjectRepository(ContentPublication) private readonly publications: Repository<ContentPublication>,
    @InjectRepository(BaselineSnapshot) private readonly baselines: Repository<BaselineSnapshot>,
    @InjectRepository(CrawledPage) private readonly crawledPages: Repository<CrawledPage>,
    @InjectRepository(LinkAnalysis) private readonly analyses: Repository<LinkAnalysis>,
    @InjectRepository(GscProperty) private readonly gscProperties: Repository<GscProperty>,
    @InjectRepository(GscDailyMetric) private readonly gscMetrics: Repository<GscDailyMetric>,
    @InjectRepository(Keyword) private readonly keywords: Repository<Keyword>,
    @InjectRepository(KeywordMetric) private readonly keywordMetrics: Repository<KeywordMetric>,
    @InjectRepository(WordPressIntegration) private readonly wpIntegrations: Repository<WordPressIntegration>,
    @InjectRepository(Report) private readonly reports: Repository<Report>,
    @InjectRepository(ActivityLog) private readonly activityLogs: Repository<ActivityLog>,
    @InjectRepository(AiProviderConfig) private readonly aiConfigs: Repository<AiProviderConfig>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
  ) {}

  // -------------------------------------------------------------------------
  // Portfolio dashboard
  // -------------------------------------------------------------------------

  async portfolio(user: AuthPrincipal): Promise<PortfolioDashboardDto> {
    const siteIds = await this.authorizedSiteIds(user);
    const sites = siteIds.length > 0 ? await this.sites.find({ where: { id: In(siteIds) } }) : [];
    if (siteIds.length === 0) {
      return { summary: emptySummary(), needsAttention: [], sites: [] };
    }

    const windows = windows28d();
    const [issueRows, recRows, taskRows, overdueRows, aiRows, pkgRows, pubRows, reportRows, gscCurrent, gscPrevious, wfRows, baselineRows, crawlRows, analysisRows, gscProps, wpRows] = await Promise.all([
      this.issuesGrouped(siteIds),
      this.recommendationsGrouped(siteIds),
      this.tasksGrouped(siteIds),
      this.overdueTasksGrouped(siteIds),
      this.aiJobsGrouped(siteIds),
      this.packagesGrouped(siteIds),
      this.publicationsGrouped(siteIds),
      this.reportsGrouped(siteIds),
      this.gscWindow(siteIds, windows.currentStart, windows.currentEnd),
      this.gscWindow(siteIds, windows.previousStart, windows.previousEnd),
      this.workflowJobsGrouped(siteIds),
      this.latestBaselines(siteIds),
      this.latestCrawl(siteIds),
      this.latestAnalysis(siteIds),
      this.gscPropertyBySite(siteIds),
      this.wpBySite(siteIds),
    ]);

    const bySite = <T,>(rows: T[], key: string): Map<string, T[]> => {
      const map = new Map<string, T[]>();
      for (const row of rows) {
        const siteId = String((row as Record<string, unknown>)[key]);
        const bucket = map.get(siteId) ?? [];
        bucket.push(row);
        map.set(siteId, bucket);
      }
      return map;
    };
    const issuesBySite = bySite<IssueRow>(issueRows, 'siteId');
    const recsBySite = bySite<RecommendationRow>(recRows, 'siteId');
    const tasksBySite = bySite<{ status: string; count: string }>(taskRows, 'siteId');
    const overdueBySite = bySite<{ count: string }>(overdueRows, 'siteId');
    const aiBySite = bySite<AiRow>(aiRows, 'siteId');
    const pkgBySite = bySite<{ status: string; count: string }>(pkgRows, 'siteId');
    const pubBySite = bySite<{ status: string; count: string }>(pubRows, 'siteId');
    const reportBySite = bySite<{ count: string }>(reportRows, 'siteId');
    const currentGsc = bySite<GscAggRow>(gscCurrent, 'siteId');
    const previousGsc = bySite<GscAggRow>(gscPrevious, 'siteId');
    const wfBySite = bySite<WorkflowRow>(wfRows, 'siteId');
    const baselineBySite = latestPerSite(baselineRows);
    const crawlBySite = latestPerSite(crawlRows);
    const analysisBySite = latestPerSite(analysisRows);
    const gscPropBySite = latestPerSite(gscProps);
    const wpBySiteMap = latestPerSite(wpRows);

    const rows: SitePortfolioRowDto[] = [];
    const needsAttention: NeedsAttentionItemDto[] = [];
    const summary: DashboardSummaryDto = emptySummary();
    summary.totalSites = sites.length;
    summary.activeSites = sites.filter((site) => site.status === 'ACTIVE').length;

    const clientNames = await this.orgNamesBySite(sites);

    for (const site of sites) {
      const ctx: SiteContext = {
        issues: issuesBySite.get(site.id) ?? [],
        recs: recsBySite.get(site.id) ?? [],
        tasks: tasksBySite.get(site.id) ?? [],
        overdue: sum(overdueBySite.get(site.id) ?? []),
        ai: aiBySite.get(site.id) ?? [],
        pkg: pkgBySite.get(site.id) ?? [],
        pub: pubBySite.get(site.id) ?? [],
        reports: reportBySite.get(site.id) ?? [],
        currentGsc: currentGsc.get(site.id) ?? [],
        previousGsc: previousGsc.get(site.id) ?? [],
        wf: wfBySite.get(site.id) ?? [],
        baseline: baselineBySite.get(site.id) ?? null,
        lastCrawl: crawlBySite.get(site.id)?.['latest'] ?? null,
        lastAudit: analysisBySite.get(site.id)?.['latest'] ?? null,
        gscProp: gscPropBySite.get(site.id) ?? null,
        wp: wpBySiteMap.get(site.id) ?? null,
      };
      const row = await this.buildPortfolioRow(site, ctx);
      row.clientName = clientNames.get(site.id) ?? null;
      rows.push(row);
      needsAttention.push(...this.needsAttentionFor(site, row, ctx));
    }

    // Summary aggregates
    const openIssueRows = issueRows.filter((r) => !CLOSED.has(r.status));
    summary.openIssues = openIssueRows.reduce((sumVal, r) => sumVal + Number(r.count), 0);
    summary.criticalIssues = openIssueRows.filter((r) => r.severity === 'CRITICAL').reduce((sumVal, r) => sumVal + Number(r.count), 0);
    summary.highPriorityIssues = openIssueRows.filter((r) => r.severity === 'HIGH').reduce((sumVal, r) => sumVal + Number(r.count), 0);
    summary.openRecommendations = recsBySiteAll(recRows);
    summary.highPriorityRecommendations = recRows.filter((r) => r.priority === 'CRITICAL' || r.priority === 'HIGH').reduce((sumVal, r) => sumVal + Number(r.count), 0);
    summary.openTasks = tasksBySiteAll(taskRows);
    summary.overdueTasks = sum(overdueRows);
    summary.contentAwaitingReview = sumBy(pkgRows, (r) => r.status === 'AWAITING_APPROVAL');
    summary.draftContent = sumBy(pubRows, (r) => r.status === 'DRAFT' || r.status === 'APPROVED');
    summary.publishedContentThisMonth = sumBy(pubRows, (r) => r.status === 'PUBLISHED');
    summary.reportsGeneratedThisMonth = sum(reportRows);
    summary.reportsDue = rows.filter((r) => r.nextReport !== null).length;
    const growing = rows.filter((r) => r.clicksChange !== null && r.clicksChange > 0);
    const declining = rows.filter((r) => r.clicksChange !== null && r.clicksChange < 0);
    summary.sitesGrowing = growing.length;
    summary.sitesDeclining = declining.length;
    const healthAverages = averageOf(rows, (r) => r.seoHealth);
    summary.seoHealthAverage = healthAverages.seo;
    summary.aeoReadinessAverage = healthAverages.aeo;
    summary.geoReadinessAverage = healthAverages.geo;
    summary.aiJobsThisMonth = sumBy(aiRows, (r) => r.status !== 'RUNNING');
    summary.aiEstimatedCostThisMonth = round2(aiRows.reduce((sumVal, r) => sumVal + (Number(r.cost) || 0), 0));
    summary.crawlerJobsRunning = wfRows.filter((r) => r.workflow === 'crawl-audit' && r.status === 'RUNNING').reduce((sumVal, r) => sumVal + Number(r.count), 0);
    summary.failedAutomationJobs = wfRows.filter((r) => (r.status === 'FAILED' || r.status === 'TIMEOUT')).reduce((sumVal, r) => sumVal + Number(r.count), 0);
    summary.sitesWithIntegrationProblems = rows.filter((r) => r.integrationHealth === 'error' || r.integrationHealth === 'warning').length;
    summary.sitesRequiringAttention = needsAttention.length > 0 ? new Set(needsAttention.map((item) => item.siteId)).size : 0;

    needsAttention.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || (a.detectedAt < b.detectedAt ? 1 : -1));

    return { summary, needsAttention, sites: rows };
  }

  // -------------------------------------------------------------------------
  // Site dashboard
  // -------------------------------------------------------------------------

  async site(user: AuthPrincipal, siteId: string): Promise<SiteDashboardDto> {
    const authorized = await this.authorizedSiteIds(user);
    if (!authorized.includes(siteId)) {
      throw new NotFoundException('Site not found');
    }
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');

    const windows = windows28d();
    const [baselineRows, issues, recommendations, tasks, packages, publications, crawled, analysis, gscProp, wp, gscCurrent, gscPrevious, keywords, wfJobs, activities, aiConfigured] = await Promise.all([
      this.baselines.find({ where: { siteId }, order: { createdAt: 'ASC' } }),
      this.issues.find({ where: { siteId } }),
      this.recommendations.find({ where: { siteId } }),
      this.tasks.find({ where: { siteId } }),
      this.packages.find({ where: { siteId } }),
      this.publications.find({ where: { siteId } }),
      this.crawledPages.count({ where: { siteId } }),
      this.analyses.findOne({ where: { siteId }, order: { createdAt: 'DESC' } }),
      this.gscProperties.findOne({ where: { siteId } }),
      this.wpIntegrations.findOne({ where: { siteId } }),
      this.gscWindow([siteId], windows.currentStart, windows.currentEnd),
      this.gscWindow([siteId], windows.previousStart, windows.previousEnd),
      this.topKeywords(siteId, windows.currentStart, windows.currentEnd, 20),
      this.workflowJobs.find({ where: { siteId } }),
      this.activityLogs.find({ where: { siteId }, order: { createdAt: 'DESC' }, take: 20 }),
      this.aiConfigured(siteId),
    ]);

    const current = gscCurrent[0] as GscAggRow | undefined;
    const previous = gscPrevious[0] as GscAggRow | undefined;
    const currentTotals = toTotals(current);
    const previousTotals = toTotals(previous);
    const baselineLatest = baselineRows.length > 0 ? (baselineRows[baselineRows.length - 1]!.metrics as unknown as BaselineMetricsDto) : null;
    const baselineTotals: SiteMetricTotalsDto | null = baselineLatest
      ? {
          clicks: baselineLatest.gscMetrics.clicks ?? 0,
          impressions: baselineLatest.gscMetrics.impressions ?? 0,
          ctr: baselineLatest.gscMetrics.ctr ?? 0,
          avgPosition: baselineLatest.gscMetrics.avgPosition,
        }
      : null;

    const openIssues = issues.filter((i) => !CLOSED.has(i.status)).length;
    const criticalOpen = issues.filter((i) => !CLOSED.has(i.status) && i.severity === 'CRITICAL').length;
    const openTasks = tasks.filter((t) => t.status !== 'DONE').length;
    const pendingPackages = packages.filter((p) => ['QUEUED', 'RUNNING', 'AWAITING_APPROVAL'].includes(p.status)).length;
    const published = publications.filter((p) => p.status === 'PUBLISHED' || p.status === 'VERIFIED').length;
    const top = keywords.slice(0, 10);
    const next = keywords.slice(10, 20);

    const needsAi = !aiConfigured;
    const needsGsc = !gscProp;
    const needsBaseline = baselineRows.length === 0;
    const needsCrawl = crawled === 0;
    const needsKeywords = (await this.keywords.count({ where: { siteId } })) === 0;
    const noContent = packages.length === 0;

    return {
      site: {
        id: site.id,
        name: site.name,
        domain: site.domain,
        locale: site.locale,
        language: site.language,
        country: site.country,
        status: site.status,
      },
      header: {
        market: site.country ?? null,
        language: site.language,
        integrationHealth: siteIntegrationLabel(wp, gscProp),
        lastSync: wp?.lastSyncAt?.toISOString() ?? gscProp?.lastSyncAt?.toISOString() ?? null,
        lastCrawl: analysis?.createdAt?.toISOString() ?? null,
      },
      main: {
        seoHealth: baselineLatest ? baselineLatest.seoHealth : null,
        aeoReadiness: baselineLatest ? baselineLatest.aeoReadiness : null,
        geoReadiness: baselineLatest ? baselineLatest.geoReadiness : null,
        clicks: currentTotals.clicks,
        impressions: currentTotals.impressions,
        ctr: currentTotals.ctr,
        avgPosition: currentTotals.avgPosition,
        topKeywords: top,
        nextKeywords: next,
      },
      issues: { open: openIssues, critical: criticalOpen, recommendations: recommendations.length, openTasks },
      content: {
        published,
        pending: pendingPackages,
        stages: contentStages(packages, publications),
      },
      performance: {
        current: currentTotals,
        previous: previousTotals,
        baseline: baselineTotals,
        currentVsPrevious: deltas(currentTotals, previousTotals),
        currentVsBaseline: baselineTotals ? deltas(currentTotals, baselineTotals) : { clicksPct: null, impressionsPct: null, ctrDelta: null, positionDelta: null },
        hasGsc: Boolean(gscProp),
      },
      baselineProgress: baselineRows.length > 0 ? baselineProgress(baselineRows[0]!, baselineRows[baselineRows.length - 1]!) : { exists: false },
      issueSummary: summarizeIssues(issues),
      recommendations: recommendations
        .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.impact - a.impact)
        .slice(0, 10)
        .map((r) => ({ id: r.id, issueId: r.issueId, title: r.title, priority: r.priority as SiteRecommendationDto['priority'], impact: r.impact, confidence: r.confidence, effort: r.effort })),
      contentPipeline: contentStages(packages, publications),
      integrationHealth: await this.integrationHealth(siteId, wp, gscProp, wfJobs, aiConfigured),
      recentActivity: activities.map((activity) => ({ action: activity.action, entityType: activity.entityType, entityId: activity.entityId, createdAt: activity.createdAt.toISOString() })),
      emptyStates: { needsCrawl, needsBaseline, needsGsc, needsKeywords, noContent, needsAi },
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async authorizedSiteIds(user: AuthPrincipal): Promise<string[]> {
    if (user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN')) {
      const rows = await this.sites.find({ select: { id: true } });
      return rows.map((row) => row.id);
    }
    const rows = await this.memberships.find({ where: { userId: user.id }, select: { siteId: true } });
    return rows.map((row) => row.siteId);
  }

  /** Map of siteId → client organization name (for the portfolio client column). */
  private async orgNamesBySite(sites: Site[]): Promise<Map<string, string>> {
    const orgIds = [...new Set(sites.map((site) => site.organizationId))];
    const map = new Map<string, string>();
    if (orgIds.length === 0) {
      return map;
    }
    const orgs = await this.orgs.find({ where: { id: In(orgIds) } });
    const byId = new Map(orgs.map((org) => [org.id, org.name]));
    for (const site of sites) {
      const name = byId.get(site.organizationId);
      if (name) {
        map.set(site.id, name);
      }
    }
    return map;
  }

  private async buildPortfolioRow(site: Site, ctx: SiteContext): Promise<SitePortfolioRowDto> {
    const open = ctx.issues.filter((r) => !CLOSED.has(r.status));
    const openTasks = ctx.tasks.filter((r) => r.status !== 'DONE').reduce((sumVal, r) => sumVal + Number(r.count), 0);
    const current = ctx.currentGsc[0] as GscAggRow | undefined;
    const previous = ctx.previousGsc[0] as GscAggRow | undefined;
    const clicks = Number(current?.clicks ?? 0);
    const prevClicks = Number(previous?.clicks ?? 0);
    const clicksChange = prevClicks > 0 ? Math.round(((clicks - prevClicks) / prevClicks) * 1000) / 10 : null;
    const baseline = ctx.baseline ? (ctx.baseline.metrics as unknown as BaselineMetricsDto) : null;
    const hasReportThisMonth = (ctx.reports.length ?? 0) > 0;
    const hasBaseline = Boolean(baseline);

    return {
      siteId: site.id,
      siteName: site.name,
      domain: site.domain,
      status: site.status,
      clientName: null,
      seoHealth: baseline ? baseline.seoHealth : null,
      aeoReadiness: baseline ? baseline.aeoReadiness : null,
      geoReadiness: baseline ? baseline.geoReadiness : null,
      clicks,
      clicksChange,
      impressions: Number(current?.impressions ?? 0),
      openCriticalIssues: open.filter((r) => r.severity === 'CRITICAL').reduce((sumVal, r) => sumVal + Number(r.count), 0),
      openIssues: open.reduce((sumVal, r) => sumVal + Number(r.count), 0),
      openTasks,
      contentPending: ctx.pkg.filter((r) => ['QUEUED', 'RUNNING', 'AWAITING_APPROVAL'].includes(r.status)).reduce((sumVal, r) => sumVal + Number(r.count), 0),
      lastCrawl: ctx.lastCrawl,
      lastGscSync: ctx.gscProp?.lastSyncAt?.toISOString() ?? null,
      lastAudit: ctx.lastAudit,
      nextReport: hasBaseline && !hasReportThisMonth ? monthEndLabel() : null,
      integrationHealth: siteIntegrationLabel(ctx.wp, ctx.gscProp),
    };
  }

  private needsAttentionFor(site: Site, row: SitePortfolioRowDto, ctx: SiteContext): NeedsAttentionItemDto[] {
    const items: NeedsAttentionItemDto[] = [];
    const open = ctx.issues.filter((r) => !CLOSED.has(r.status));
    const critical = open.filter((r) => r.severity === 'CRITICAL').reduce((sumVal, r) => sumVal + Number(r.count), 0);
    if (critical > 0) {
      items.push(attention(site, 'CRITICAL', 'Critical SEO issue', `${critical} critical issue(s) open`, link(site.id, 'issues'), 'Review and resolve critical issues'));
    }
    if (ctx.wp?.status === 'FAILED') {
      items.push(attention(site, 'HIGH', 'WordPress disconnected', 'WordPress connection failed', link(site.id, 'wordpress'), 'Reconnect WordPress'));
    }
    if (ctx.wp?.status === 'CONNECTED' && !ctx.wp.rankMathDetected) {
      items.push(attention(site, 'MEDIUM', 'Rank Math unavailable', 'Rank Math not detected by the connector', link(site.id, 'wordpress'), 'Verify Rank Math plugin'));
    }
    if (ctx.gscProp && (ctx.gscProp.status === 'EXPIRED' || ctx.gscProp.status === 'DISCONNECTED')) {
      items.push(attention(site, 'HIGH', 'GSC synchronization failed', `Search Console status ${ctx.gscProp.status}`, link(site.id, 'settings'), 'Reconnect Google Search Console'));
    }
    const crawlerFailed = ctx.wf.filter((r) => r.workflow === 'crawl-audit' && (r.status === 'FAILED' || r.status === 'TIMEOUT')).reduce((sumVal, r) => sumVal + Number(r.count), 0);
    if (crawlerFailed > 0) {
      items.push(attention(site, 'HIGH', 'Crawler failed', `${crawlerFailed} failed crawl job(s)`, link(site.id, 'automation'), 'Inspect and rerun crawl'));
    }
    const current = ctx.currentGsc[0] as GscAggRow | undefined;
    const previous = ctx.previousGsc[0] as GscAggRow | undefined;
    if (previous && current) {
      const prevClicks = Number(previous.clicks);
      const currClicks = Number(current.clicks);
      if (prevClicks > 0 && currClicks <= prevClicks * 0.7) {
        items.push(attention(site, 'HIGH', 'Traffic decline detected', `Clicks ${currClicks} vs ${prevClicks} previously`, link(site.id, 'performance'), 'Investigate traffic decline'));
      }
      const prevCtr = ctrOf(previous);
      const currCtr = ctrOf(current);
      if (prevCtr > 0 && currCtr <= prevCtr * 0.8) {
        items.push(attention(site, 'MEDIUM', 'CTR anomaly detected', `CTR ${pct(currCtr)} vs ${pct(prevCtr)} previously`, link(site.id, 'performance'), 'Review titles and meta'));
      }
    }
    const pending = ctx.pkg.filter((r) => r.status === 'AWAITING_APPROVAL').reduce((sumVal, r) => sumVal + Number(r.count), 0);
    if (pending > 0) {
      items.push(attention(site, 'MEDIUM', 'Content approval pending', `${pending} brief(s) awaiting approval`, link(site.id, 'content'), 'Approve or reject pending briefs'));
    }
    if (ctx.overdue > 0) {
      items.push(attention(site, 'MEDIUM', 'Overdue task', `${ctx.overdue} overdue task(s)`, link(site.id, 'tasks'), 'Update overdue tasks'));
    }
    if (row.nextReport) {
      items.push(attention(site, 'LOW', 'Report due', 'No report generated this month', link(site.id, 'reports'), 'Generate the monthly report'));
    }
    const regressed = baselineRegression(ctx.baseline);
    if (regressed > 0) {
      items.push(attention(site, 'MEDIUM', 'Issue regression', `${regressed} issue(s) regressed since baseline`, link(site.id, 'monitoring'), 'Review regressed issues'));
    }
    const cannibalization = open.filter((r) => r.kind === 'CANNIBALIZATION').reduce((sumVal, r) => sumVal + Number(r.count), 0);
    if (cannibalization > 0) {
      items.push(attention(site, 'MEDIUM', 'Cannibalization detected', `${cannibalization} cannibalization issue(s)`, link(site.id, 'issues'), 'Review conflicting pages'));
    }
    const aiFailed = ctx.ai.filter((r) => r.status === 'FAILED').reduce((sumVal, r) => sumVal + Number(r.count), 0);
    if (aiFailed > 0) {
      items.push(attention(site, 'LOW', 'AI job failure', `${aiFailed} AI job(s) failed this month`, link(site.id, 'automation'), 'Check AI job logs'));
    }
    return items;
  }

  private async integrationHealth(siteId: string, wp: WordPressIntegration | null, gscProp: GscProperty | null, wfJobs: WorkflowJob[], aiConfigured: boolean): Promise<SiteIntegrationHealthDto[]> {
    const crawlerFailed = wfJobs.some((job) => job.workflow === 'crawl-audit' && (job.status === 'FAILED' || job.status === 'TIMEOUT'));
    return [
      { component: 'WordPress', status: wpStatus(wp), detail: wp ? `${wp.status}${wp.rankMathDetected ? ' · Rank Math detected' : ''}` : 'No WordPress secret configured', deepLink: wp ? link(siteId, 'wordpress') : null },
      { component: 'Search Visibility Connector', status: wp ? (wp.status === 'CONNECTED' ? 'healthy' : wp.status === 'PENDING' ? 'warning' : 'error') : 'not_configured', detail: wp ? wp.wpUrl ?? null : 'Not connected', deepLink: wp ? link(siteId, 'wordpress') : null },
      { component: 'Rank Math', status: wp ? (wp.rankMathDetected ? 'healthy' : 'warning') : 'not_configured', detail: wp ? (wp.rankMathDetected ? `v${wp.rankMathVersion ?? ''}`.replace('v', 'v') : 'Not detected') : 'Not configured', deepLink: wp ? link(siteId, 'wordpress') : null },
      { component: 'Google Search Console', status: gscProp ? (gscProp.status === 'DISCONNECTED' ? 'disconnected' : gscProp.status === 'EXPIRED' ? 'error' : 'healthy') : 'not_configured', detail: gscProp ? gscProp.siteUrl : 'Connect Google Search Console', deepLink: gscProp ? link(siteId, 'settings') : null },
      { component: 'Google Ads', status: 'not_configured', detail: 'Not configured', deepLink: null },
      { component: 'AI Providers', status: aiConfigured ? 'healthy' : 'not_configured', detail: aiConfigured ? 'Configured' : 'Configure at least one AI provider', deepLink: link(siteId, 'settings') },
      { component: 'n8n', status: wfJobs.length > 0 ? 'healthy' : 'not_configured', detail: wfJobs.length > 0 ? `${wfJobs.length} job(s)` : 'Not configured', deepLink: link(siteId, 'automation') },
      { component: 'Redis', status: 'healthy', detail: 'Operational', deepLink: null },
      { component: 'Queue Worker', status: crawlerFailed ? 'warning' : 'healthy', detail: crawlerFailed ? 'Recent crawl failures' : 'Operational', deepLink: link(siteId, 'automation') },
    ];
  }

  private async aiConfigured(siteId: string): Promise<boolean> {
    const env = loadAppEnv();
    if (env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.PERPLEXITY_API_KEY) {
      return true;
    }
    const config = await this.aiConfigs.findOne({ where: { siteId } });
    return Boolean(config && Object.keys(config.apiKeyOverrides).length > 0);
  }

  // ---- grouped queries ----

  private async issuesGrouped(ids: string[]): Promise<IssueRow[]> {
    return this.issues
      .createQueryBuilder('i')
      .select('i.site_id', 'siteId')
      .addSelect('i.severity', 'severity')
      .addSelect('i.status', 'status')
      .addSelect('i.kind', 'kind')
      .addSelect('COUNT(*)', 'count')
      .where('i.site_id IN (:...ids)', { ids })
      .groupBy('i.site_id')
      .addGroupBy('i.severity')
      .addGroupBy('i.status')
      .addGroupBy('i.kind')
      .getRawMany();
  }

  private async recommendationsGrouped(ids: string[]): Promise<RecommendationRow[]> {
    return this.recommendations
      .createQueryBuilder('r')
      .innerJoin(Issue, 'i', 'i.id = r.issue_id')
      .select('r.site_id', 'siteId')
      .addSelect('r.priority', 'priority')
      .addSelect('i.status', 'issueStatus')
      .addSelect('COUNT(*)', 'count')
      .where('r.site_id IN (:...ids)', { ids })
      .groupBy('r.site_id')
      .addGroupBy('r.priority')
      .addGroupBy('i.status')
      .getRawMany();
  }

  private async tasksGrouped(ids: string[]): Promise<Array<{ siteId: string; status: string; count: string }>> {
    return this.tasks.createQueryBuilder('t').select('t.site_id', 'siteId').addSelect('t.status', 'status').addSelect('COUNT(*)', 'count').where('t.site_id IN (:...ids)', { ids }).groupBy('t.site_id').addGroupBy('t.status').getRawMany();
  }

  private async overdueTasksGrouped(ids: string[]): Promise<Array<{ siteId: string; count: string }>> {
    return this.tasks
      .createQueryBuilder('t')
      .select('t.site_id', 'siteId')
      .addSelect('COUNT(*)', 'count')
      .where('t.site_id IN (:...ids)', { ids })
      .andWhere('t.deadline IS NOT NULL')
      .andWhere('t.deadline < :now', { now: TODAY })
      .andWhere('t.status != :done', { done: 'DONE' })
      .groupBy('t.site_id')
      .getRawMany();
  }

  private async aiJobsGrouped(ids: string[]): Promise<AiRow[]> {
    return this.aiJobs
      .createQueryBuilder('a')
      .select('a.site_id', 'siteId')
      .addSelect('a.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(a.cost_usd), 0)', 'cost')
      .where('a.site_id IN (:...ids)', { ids })
      .andWhere('a.created_at >= :month', { month: firstOfMonth() })
      .groupBy('a.site_id')
      .addGroupBy('a.status')
      .getRawMany();
  }

  private async packagesGrouped(ids: string[]): Promise<Array<{ siteId: string; status: string; count: string }>> {
    return this.packages.createQueryBuilder('p').select('p.site_id', 'siteId').addSelect('p.status', 'status').addSelect('COUNT(*)', 'count').where('p.site_id IN (:...ids)', { ids }).groupBy('p.site_id').addGroupBy('p.status').getRawMany();
  }

  private async publicationsGrouped(ids: string[]): Promise<Array<{ siteId: string; status: string; count: string }>> {
    return this.publications
      .createQueryBuilder('p')
      .select('p.site_id', 'siteId')
      .addSelect('p.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('p.site_id IN (:...ids)', { ids })
      .andWhere('p.published_at >= :month', { month: firstOfMonth() })
      .groupBy('p.site_id')
      .addGroupBy('p.status')
      .getRawMany();
  }

  private async reportsGrouped(ids: string[]): Promise<Array<{ siteId: string; count: string }>> {
    return this.reports
      .createQueryBuilder('r')
      .select('r.site_id', 'siteId')
      .addSelect('COUNT(*)', 'count')
      .where('r.site_id IN (:...ids)', { ids })
      .andWhere('r.created_at >= :month', { month: firstOfMonth() })
      .groupBy('r.site_id')
      .getRawMany();
  }

  private async gscWindow(ids: string[], start: string, end: string): Promise<GscAggRow[]> {
    return this.gscMetrics
      .createQueryBuilder('m')
      .innerJoin(GscProperty, 'p', 'p.id = m.property_id')
      .select('p.site_id', 'siteId')
      .addSelect('COALESCE(SUM(m.clicks), 0)', 'clicks')
      .addSelect('COALESCE(SUM(m.impressions), 0)', 'impressions')
      .addSelect('AVG(m.position) FILTER (WHERE m.position > 0)', 'position')
      .where('p.site_id IN (:...ids)', { ids })
      .andWhere('m.metric_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('p.site_id')
      .getRawMany();
  }

  private async workflowJobsGrouped(ids: string[]): Promise<WorkflowRow[]> {
    return this.workflowJobs
      .createQueryBuilder('w')
      .select('w.site_id', 'siteId')
      .addSelect('w.workflow', 'workflow')
      .addSelect('w.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('w.site_id IN (:...ids)', { ids })
      .andWhere('w.created_at >= :month', { month: firstOfMonth() })
      .groupBy('w.site_id')
      .addGroupBy('w.workflow')
      .addGroupBy('w.status')
      .getRawMany();
  }

  private async latestBaselines(ids: string[]): Promise<BaselineSnapshot[]> {
    const rows = await this.baselines.find({ where: { siteId: In(ids) }, order: { createdAt: 'DESC' } });
    return rows;
  }

  private async latestCrawl(ids: string[]): Promise<Array<{ siteId: string; latest: string }>> {
    return this.crawledPages
      .createQueryBuilder('c')
      .select('c.site_id', 'siteId')
      .addSelect('MAX(c.crawled_at)', 'latest')
      .where('c.site_id IN (:...ids)', { ids })
      .groupBy('c.site_id')
      .getRawMany();
  }

  private async latestAnalysis(ids: string[]): Promise<Array<{ siteId: string; latest: string }>> {
    return this.analyses
      .createQueryBuilder('a')
      .select('a.site_id', 'siteId')
      .addSelect('MAX(a.created_at)', 'latest')
      .where('a.site_id IN (:...ids)', { ids })
      .groupBy('a.site_id')
      .getRawMany();
  }

  private async gscPropertyBySite(ids: string[]): Promise<GscProperty[]> {
    return this.gscProperties.find({ where: { siteId: In(ids) } });
  }

  private async wpBySite(ids: string[]): Promise<WordPressIntegration[]> {
    return this.wpIntegrations.find({ where: { siteId: In(ids) } });
  }

  private async topKeywords(siteId: string, start: string, end: string, limit: number): Promise<SiteKeywordRowDto[]> {
    const rows = await this.keywordMetrics
      .createQueryBuilder('m')
      .innerJoin(Keyword, 'k', 'k.id = m.keyword_id')
      .select('k.keyword', 'keyword')
      .addSelect('COALESCE(SUM(m.clicks), 0)', 'clicks')
      .addSelect('COALESCE(SUM(m.impressions), 0)', 'impressions')
      .addSelect('AVG(m.position) FILTER (WHERE m.position > 0)', 'position')
      .where('k.site_id = :siteId', { siteId })
      .andWhere('m.metric_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('k.keyword')
      .orderBy('clicks', 'DESC')
      .limit(limit)
      .getRawMany();
    return rows.map((row) => ({ keyword: row.keyword, clicks: Number(row.clicks), impressions: Number(row.impressions), position: row.position === null ? null : Math.round(Number(row.position) * 10) / 10 }));
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

interface IssueRow { siteId: string; severity: string; status: string; kind: string; count: string }
interface RecommendationRow { siteId: string; priority: string; issueStatus: string; count: string }
interface AiRow { siteId: string; status: string; count: string; cost: string }
interface GscAggRow { siteId: string; clicks: string; impressions: string; position: string | null }
interface WorkflowRow { siteId: string; workflow: string; status: string; count: string }

interface SiteContext {
  issues: IssueRow[];
  recs: RecommendationRow[];
  tasks: Array<{ status: string; count: string }>;
  overdue: number;
  ai: AiRow[];
  pkg: Array<{ status: string; count: string }>;
  pub: Array<{ status: string; count: string }>;
  reports: Array<{ count: string }>;
  currentGsc: GscAggRow[];
  previousGsc: GscAggRow[];
  wf: WorkflowRow[];
  baseline: BaselineSnapshot | null;
  lastCrawl: string | null;
  lastAudit: string | null;
  gscProp: GscProperty | null;
  wp: WordPressIntegration | null;
}

function emptySummary(): DashboardSummaryDto {
  return {
    totalSites: 0, activeSites: 0, sitesWithIntegrationProblems: 0, sitesRequiringAttention: 0,
    openIssues: 0, criticalIssues: 0, highPriorityIssues: 0,
    openRecommendations: 0, highPriorityRecommendations: 0,
    openTasks: 0, overdueTasks: 0,
    contentAwaitingReview: 0, draftContent: 0, publishedContentThisMonth: 0,
    reportsDue: 0, reportsGeneratedThisMonth: 0,
    sitesGrowing: 0, sitesDeclining: 0,
    seoHealthAverage: null, aeoReadinessAverage: null, geoReadinessAverage: null,
    aiJobsThisMonth: 0, aiEstimatedCostThisMonth: 0,
    crawlerJobsRunning: 0, failedAutomationJobs: 0,
  };
}

function latestPerSite<T extends { siteId: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) map.set(row.siteId, row);
  return map;
}

function sumBy<T extends { count: string }>(rows: T[], predicate: (row: T) => boolean): number {
  return rows.filter(predicate).reduce((sumVal, row) => sumVal + Number(row.count), 0);
}

function recsBySiteAll(rows: RecommendationRow[]): number {
  return rows.filter((row) => !CLOSED.has(row.issueStatus)).reduce((sumVal, row) => sumVal + Number(row.count), 0);
}

function tasksBySiteAll(rows: Array<{ status: string; count: string }>): number {
  return rows.filter((row) => row.status !== 'DONE').reduce((sumVal, row) => sumVal + Number(row.count), 0);
}

function averageOf(rows: SitePortfolioRowDto[], _pick: (row: SitePortfolioRowDto) => number | null): { seo: number | null; aeo: number | null; geo: number | null } {
  const values = (key: 'seoHealth' | 'aeoReadiness' | 'geoReadiness') => rows.map((row) => row[key]).filter((value): value is number => value !== null);
  const avg = (list: number[]) => (list.length > 0 ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null);
  return { seo: avg(values('seoHealth')), aeo: avg(values('aeoReadiness')), geo: avg(values('geoReadiness')) };
}

function ctrOf(row: GscAggRow): number {
  const impressions = Number(row.impressions);
  return impressions > 0 ? Number(row.clicks) / impressions : 0;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function severityRank(severity: string): number {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? 99 : index;
}

function priorityRank(priority: string): number {
  return severityRank(priority);
}

function attention(site: Site, severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW', problem: string, detail: string, deepLink: string, nextAction: string): NeedsAttentionItemDto {
  return { siteId: site.id, siteName: site.name, problem: `${problem} — ${detail}`, severity, detectedAt: new Date().toISOString(), nextAction, deepLink };
}

function link(siteId: string, tab: string): string {
  return `/sites/${siteId}?tab=${tab}`;
}

function siteIntegrationLabel(wp: WordPressIntegration | null, gscProp: GscProperty | null): string {
  if (wp?.status === 'FAILED') return 'error';
  if (gscProp?.status === 'EXPIRED') return 'error';
  if (wp?.status === 'PENDING' || gscProp?.status === 'DISCONNECTED') return 'warning';
  if (wp?.status === 'CONNECTED' && gscProp?.status === 'CONNECTED') return 'healthy';
  if (wp || gscProp) return 'warning';
  return 'not_configured';
}

function wpStatus(wp: WordPressIntegration | null): SiteIntegrationHealthDto['status'] {
  if (!wp) return 'not_configured';
  if (wp.status === 'CONNECTED') return 'healthy';
  if (wp.status === 'PENDING') return 'warning';
  return 'error';
}

function toTotals(row: GscAggRow | undefined): SiteMetricTotalsDto {
  const clicks = Number(row?.clicks ?? 0);
  const impressions = Number(row?.impressions ?? 0);
  const position = row?.position ? Number(row.position) : null;
  return { clicks, impressions, ctr: impressions > 0 ? round2(clicks / impressions) : 0, avgPosition: position === null ? null : Math.round(position * 10) / 10 };
}

function deltas(current: SiteMetricTotalsDto, previous: SiteMetricTotalsDto): { clicksPct: number | null; impressionsPct: number | null; ctrDelta: number | null; positionDelta: number | null } {
  return {
    clicksPct: previous.clicks > 0 ? Math.round(((current.clicks - previous.clicks) / previous.clicks) * 1000) / 10 : null,
    impressionsPct: previous.impressions > 0 ? Math.round(((current.impressions - previous.impressions) / previous.impressions) * 1000) / 10 : null,
    ctrDelta: round2(current.ctr - previous.ctr),
    positionDelta: null,
  };
}

function baselineRegression(baseline: BaselineSnapshot | null): number {
  if (!baseline) return 0;
  const snapshot = baseline.issues as unknown as Array<{ status: string }> | null;
  if (!snapshot) return 0;
  return snapshot.filter((entry) => entry.status === 'DETECTED' || entry.status === 'IN_PROGRESS').length;
}

function summarizeIssues(issues: Issue[]): SiteIssueSummaryDto {
  const bucket = (severity: string) => ({
    open: issues.filter((i) => i.severity === severity && !CLOSED.has(i.status)).length,
    inProgress: issues.filter((i) => i.severity === severity && IN_PROGRESS.has(i.status)).length,
    resolvedThisMonth: issues.filter((i) => i.severity === severity && (i.status === 'RESOLVED' || i.status === 'IGNORED') && isThisMonth(i.resolvedAt ?? i.updatedAt)).length,
  });
  return { critical: bucket('CRITICAL'), high: bucket('HIGH'), medium: bucket('MEDIUM'), low: bucket('LOW') };
}

function isThisMonth(date: Date): boolean {
  return date.getUTCFullYear() === TODAY.getUTCFullYear() && date.getUTCMonth() === TODAY.getUTCMonth();
}

function contentStages(packages: ContentPackage[], publications: ContentPublication[]): ContentStageDto[] {
  const stage = (name: string, count: number, latestAt: string | null): ContentStageDto => ({ stage: name, count, latestAt });
  const complete = (p: ContentPackage) => p.status === 'COMPLETE';
  const latestPkg = packages[0]?.createdAt?.toISOString() ?? null;
  const latestPub = publications[0]?.createdAt?.toISOString() ?? null;
  return [
    stage('Idea', 0, null),
    stage('Research', packages.filter((p) => p.status === 'QUEUED').length, latestPkg),
    stage('Brief', packages.filter((p) => p.status === 'RUNNING').length, latestPkg),
    stage('Draft', packages.filter(complete).length, latestPkg),
    stage('QA', packages.filter(complete).length, latestPkg),
    stage('Review', packages.filter((p) => p.status === 'AWAITING_APPROVAL').length, latestPkg),
    stage('Approved', packages.filter(complete).length, latestPkg),
    stage('WordPress Draft', publications.filter((p) => p.status === 'DRAFT' || p.status === 'APPROVED').length, latestPub),
    stage('Published', publications.filter((p) => p.status === 'PUBLISHED' || p.status === 'VERIFIED').length, publications[0]?.publishedAt?.toISOString() ?? latestPub),
  ];
}

function baselineProgress(first: BaselineSnapshot, latest: BaselineSnapshot): { exists: true; metrics: BaselineProgressMetricDto[] } {
  const initial = first.metrics as unknown as BaselineMetricsDto;
  const current = latest.metrics as unknown as BaselineMetricsDto;
  const n = (value: number | null | undefined): number => value ?? 0;
  const items: Array<{ key: string; label: string; initial: number; current: number }> = [
    { key: 'seoHealth', label: 'SEO Health', initial: n(initial.seoHealth), current: n(current.seoHealth) },
    { key: 'aeoReadiness', label: 'AEO Readiness', initial: n(initial.aeoReadiness), current: n(current.aeoReadiness) },
    { key: 'geoReadiness', label: 'GEO Readiness', initial: n(initial.geoReadiness), current: n(current.geoReadiness) },
    { key: 'criticalIssues', label: 'Critical Issues', initial: n(initial.technicalIssues), current: n(current.technicalIssues) },
    { key: 'highIssues', label: 'High Issues', initial: n(initial.crawlHealth), current: n(current.crawlHealth) },
    { key: 'organicClicks', label: 'Organic Clicks', initial: n(initial.gscMetrics.clicks), current: n(current.gscMetrics.clicks) },
    { key: 'organicImpressions', label: 'Organic Impressions', initial: n(initial.gscMetrics.impressions), current: n(current.gscMetrics.impressions) },
    { key: 'topKeywords', label: 'Top 10 Keywords', initial: n(initial.keywordVisibility), current: n(current.keywordVisibility) },
  ];
  const metrics: BaselineProgressMetricDto[] = items.map((item) => ({
    key: item.key,
    label: item.label,
    initial: item.initial,
    current: item.current,
    change: round2(item.current - item.initial),
  }));
  return { exists: true, metrics };
}

function windows28d() {
  const now = new Date();
  const currentEnd = now.toISOString().slice(0, 10);
  const currentStart = addDays(now, -27).toISOString().slice(0, 10);
  const previousEnd = addDays(now, -28).toISOString().slice(0, 10);
  const previousStart = addDays(now, -55).toISOString().slice(0, 10);
  return { currentStart, currentEnd, previousStart, previousEnd };
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function firstOfMonth(): Date {
  return new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), 1));
}

function monthEndLabel(): string {
  const last = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() + 1, 0));
  return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`;
}

function sum(rows: Array<{ count: string }>): number {
  return rows.reduce((sumVal, row) => sumVal + Number(row.count), 0);
}

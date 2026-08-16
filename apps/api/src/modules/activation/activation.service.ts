import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  GscDailyMetric,
  GscProperty,
  Site,
  SiteActivationStep,
  WordPressPost,
} from '@creative-seo/database';
import { probeOrigin } from '@creative-seo/crawler';
import { AuditService, LinksService } from '@creative-seo/links';
import { AlertService, BaselineService, OperationsService } from '@creative-seo/operations';
import { ReportingService } from '@creative-seo/reporting';
import { VisibilityService } from '@creative-seo/visibility';
import type {
  ActivationStepDto,
  ActivationStepKey,
  ActivationStepStatus,
  ActivationSummaryDto,
  BaselineMetricsDto,
  SiteActivationDto,
} from '@creative-seo/types';
import { Repository } from 'typeorm';
import type { AuthPrincipal } from '../../common/auth.types';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { GscService } from '../gsc/gsc.service';
import { KeywordsService } from '../keywords/keywords.service';
import { WordPressService } from '../wordpress/wordpress.service';

interface ActivationStepDef {
  key: ActivationStepKey;
  label: string;
  expensive?: boolean;
  requiresManualAction?: boolean;
}

interface StepOutcome {
  status: ActivationStepStatus;
  message: string | null;
  detail: Record<string, unknown> | null;
}

interface SiteData {
  site: Site;
  integrationStatus: string | null;
  rankMathDetected: boolean;
  wpPostCount: number;
  crawledPages: Awaited<ReturnType<LinksService['listCrawledPages']>>;
  latestAnalysis: Awaited<ReturnType<LinksService['listAnalyses']>>[number] | null;
  keywords: Awaited<ReturnType<KeywordsService['listKeywords']>>;
  clusters: Awaited<ReturnType<KeywordsService['listClusters']>>;
  mappings: Awaited<ReturnType<KeywordsService['listMappings']>>;
  issues: Awaited<ReturnType<OperationsService['listIssues']>>;
  recommendations: Awaited<ReturnType<OperationsService['listRecommendations']>>;
  baselines: Awaited<ReturnType<BaselineService['listSnapshots']>>;
  observations: Awaited<ReturnType<VisibilityService['listObservations']>>;
  reports: Awaited<ReturnType<ReportingService['listReports']>>;
  gscConnected: boolean;
  gscPropertyStatus: string | null;
  gscKeywordCount: number;
  gscMetricRows: number;
}

const STEPS: ActivationStepDef[] = [
  { key: 'add-site', label: 'Add Site' },
  { key: 'verify-domain', label: 'Verify Domain' },
  { key: 'connect-wordpress', label: 'Connect WordPress' },
  { key: 'verify-connector', label: 'Verify Search Visibility Connector' },
  { key: 'verify-rank-math', label: 'Verify Rank Math' },
  { key: 'import-wordpress-pages', label: 'Import WordPress Pages' },
  { key: 'crawl-website', label: 'Crawl Website' },
  { key: 'run-technical-audit', label: 'Run Technical Audit' },
  { key: 'run-seo-audit', label: 'Run SEO Audit' },
  { key: 'run-aeo-audit', label: 'Run AEO Audit' },
  { key: 'run-geo-readiness', label: 'Run GEO Readiness Audit' },
  { key: 'create-baseline', label: 'Create Immutable Baseline', expensive: true },
  { key: 'connect-gsc', label: 'Connect Search Console', requiresManualAction: true },
  { key: 'import-historical-performance', label: 'Import Historical Search Performance' },
  { key: 'import-existing-queries', label: 'Import Existing Queries' },
  { key: 'build-url-inventory', label: 'Build Existing URL Inventory' },
  { key: 'build-keyword-url-mapping', label: 'Build Initial Keyword/URL Mapping' },
  { key: 'detect-cannibalization', label: 'Detect Cannibalization' },
  { key: 'detect-issues', label: 'Detect Issues' },
  { key: 'generate-recommendations', label: 'Generate Recommendations' },
  { key: 'populate-dashboard', label: 'Populate Dashboard' },
  { key: 'generate-initial-report', label: 'Generate Initial Client Audit Report', expensive: true },
];

const STALE_RUNNING_MS = 10 * 60 * 1000;

@Injectable()
export class ActivationService {
  constructor(
    @InjectRepository(Site)
    private readonly sites: Repository<Site>,
    @InjectRepository(SiteActivationStep)
    private readonly stepRepo: Repository<SiteActivationStep>,
    @InjectRepository(WordPressPost)
    private readonly wpPosts: Repository<WordPressPost>,
    @InjectRepository(GscProperty)
    private readonly gscProperties: Repository<GscProperty>,
    @InjectRepository(GscDailyMetric)
    private readonly gscMetrics: Repository<GscDailyMetric>,
    private readonly wordpress: WordPressService,
    private readonly links: LinksService,
    private readonly audits: AuditService,
    private readonly keywords: KeywordsService,
    private readonly gsc: GscService,
    private readonly operations: OperationsService,
    private readonly alerts: AlertService,
    private readonly baselines: BaselineService,
    private readonly reporting: ReportingService,
    private readonly visibility: VisibilityService,
    private readonly activities: ActivityLogService,
  ) {}

  async getActivation(siteId: string, actor: AuthPrincipal): Promise<SiteActivationDto> {
    const data = await this.collect(siteId, actor);
    await this.ensureRows(siteId);

    const rows = await this.stepRepo.find({ where: { siteId } });
    const byKey = new Map(rows.map((row) => [row.stepKey, row]));

    const steps: ActivationStepDto[] = [];
    for (const [index, def] of STEPS.entries()) {
      const row = byKey.get(def.key);
      const previous = index === 0 ? null : (steps[index - 1] ?? null);
      const reality = this.deriveStatus(def.key, data);
      steps.push(this.toStepDto(def, row, reality, previous));
    }

    const completed = steps.filter((step) => step.status === 'COMPLETED').length;
    const ready = completed === STEPS.length;

    return {
      siteId,
      siteName: data.site.name,
      siteDomain: data.site.domain,
      ready,
      completedSteps: completed,
      totalSteps: STEPS.length,
      progress: Math.round((completed / STEPS.length) * 100),
      steps,
      summary: this.buildSummary(data),
    };
  }

  async runStep(siteId: string, stepKey: ActivationStepKey, actor: AuthPrincipal): Promise<ActivationStepDto> {
    const data = await this.collect(siteId, actor);
    const defIndex = STEPS.findIndex((def) => def.key === stepKey);
    if (defIndex === -1) throw new BadRequestException(`Unknown activation step: ${stepKey}`);
    const def = STEPS[defIndex]!;

    await this.ensureRows(siteId);
    const row = await this.stepRepo.findOne({ where: { siteId, stepKey } });
    if (!row) throw new NotFoundException('Activation step not found');

    // Resumability: an expensive/destructive step that already completed is a
    // no-op — we never repeat it automatically.
    const realityBefore = this.deriveStatus(def.key, data);
    if (def.expensive && row.status === 'COMPLETED') {
      return this.toStepDto(def, row, 'COMPLETED', null);
    }
    if (def.expensive && realityBefore === 'COMPLETED') {
      row.status = 'COMPLETED';
      row.message = this.expensiveAlreadyDoneMessage(def.key, data);
      await this.stepRepo.save(row);
      return this.toStepDto(def, row, 'COMPLETED', null);
    }

    if (defIndex > 0) {
      const previousDef = STEPS[defIndex - 1]!;
      const previousReality = this.deriveStatus(previousDef.key, data);
      if (previousReality !== 'COMPLETED' && row.status !== 'FAILED' && row.status !== 'WARNING') {
        throw new BadRequestException(`Previous step (${previousDef.key}) must complete first`);
      }
    }

    row.status = 'RUNNING';
    row.attemptCount = (row.attemptCount ?? 0) + 1;
    row.startedAt = new Date();
    row.completedAt = null;
    row.message = null;
    await this.stepRepo.save(row);

    try {
      const outcome = await this.run(def.key, data, actor);
      row.status = outcome.status;
      row.message = outcome.message;
      row.detail = outcome.detail;
      row.completedAt = outcome.status === 'COMPLETED' ? new Date() : null;
      await this.stepRepo.save(row);
    } catch (error) {
      row.status = 'FAILED';
      row.message = errorMessage(error, 'Step failed');
      row.detail = { error: row.message };
      row.completedAt = null;
      await this.stepRepo.save(row);
    }

    await this.activities.record({
      action: 'activation.step.run',
      userId: actor.id,
      siteId,
      entityType: 'site_activation_step',
      entityId: row.id,
      meta: { step: stepKey, status: row.status, message: row.message ?? undefined },
    });

    return this.toStepDto(def, row, this.deriveStatus(def.key, await this.collect(siteId, actor)), null);
  }

  // -------------------------------------------------------------------------
  // Step execution
  // -------------------------------------------------------------------------

  private async run(key: ActivationStepKey, data: SiteData, actor: AuthPrincipal): Promise<StepOutcome> {
    switch (key) {
      case 'add-site':
        return { status: 'COMPLETED', message: 'Site created', detail: null };

      case 'verify-domain': {
        const probe = await probeOrigin(data.site.domain);
        return probe.reachable
          ? {
              status: 'COMPLETED',
              message: probe.message,
              detail: { status: probe.status, robotsFound: probe.robotsFound },
            }
          : { status: 'FAILED', message: probe.message, detail: { status: probe.status, robotsFound: probe.robotsFound } };
      }

      case 'connect-wordpress': {
        const result = await this.wordpress.checkConnection(data.site.id, actor);
        if (result.passed) {
          return { status: 'COMPLETED', message: 'WordPress connected', detail: { passed: true } };
        }
        const failed = result.steps.find((step) => step.status !== 'ok');
        return {
          status: 'FAILED',
          message: failed ? `${stepLabel(failed.key)}: ${failed.message}` : 'WordPress connection failed',
          detail: { steps: result.steps },
        };
      }

      case 'verify-connector':
      case 'verify-rank-math': {
        const result = await this.wordpress.checkConnection(data.site.id, actor);
        const step = result.steps.find((entry) => entry.key === (key === 'verify-connector' ? 'connector_reachable' : 'rank_math'));
        if (step?.status === 'ok') {
          return { status: 'COMPLETED', message: step.message, detail: step.detail ?? null };
        }
        return {
          status: 'FAILED',
          message: (step?.message ?? (key === 'verify-connector' ? 'Connector plugin missing' : 'Rank Math not detected')) as string,
          detail: step?.detail ?? null,
        };
      }

      case 'import-wordpress-pages': {
        const result = await this.wordpress.sync(data.site.id, {}, actor);
        if (result.total > 0 || result.created + result.updated > 0) {
          return {
            status: 'COMPLETED',
            message: `Imported ${result.total} WordPress ${result.total === 1 ? 'page' : 'pages'}`,
            detail: { total: result.total, created: result.created, updated: result.updated, postTypes: result.postTypes },
          };
        }
        return { status: 'WARNING', message: 'No WordPress pages imported yet', detail: { total: result.total } };
      }

      case 'crawl-website':
      case 'build-url-inventory': {
        const result = await this.links.runCrawl(
          { id: data.site.id, organizationId: data.site.organizationId, domain: data.site.domain },
          actor.id,
          { maxPages: 50 },
        );
        const { run } = result;
        if (run.pagesCrawled > 0) {
          return {
            status: 'COMPLETED',
            message: `Crawled ${run.pagesCrawled} ${run.pagesCrawled === 1 ? 'page' : 'pages'}`,
            detail: {
              runId: run.id,
              pages: run.pagesCrawled,
              pagesDiscovered: run.pagesDiscovered,
              robotsStatus: run.robotsStatus,
              sitemapStatus: run.sitemapStatus,
            },
          };
        }
        return {
          status: 'FAILED',
          message: run.error ?? 'No pages were crawled',
          detail: {
            runId: run.id,
            robotsStatus: run.robotsStatus,
            sitemapStatus: run.sitemapStatus,
            pagesFailed: run.pagesFailed,
          },
        };
      }

      case 'run-technical-audit': {
        const report = await this.links.runAnalysis(data.site.id, data.site.domain, actor.id);
        return {
          status: 'COMPLETED',
          message: `Technical audit complete (${report.analysis.stats.crawledPages ?? 0} pages analyzed)`,
          detail: report.analysis.stats as unknown as Record<string, unknown>,
        };
      }

      case 'run-seo-audit': {
        const result = await this.keywords.runPipeline(data.site.id, actor.organizationId ?? null, {});
        if (data.keywords.length > 0 || result.createdKeywords > 0) {
          return {
            status: 'COMPLETED',
            message: `SEO audit complete — ${result.clusters.length} keyword clusters`,
            detail: { createdKeywords: result.createdKeywords, clusters: result.clusters.length, errors: result.errors },
          };
        }
        return {
          status: 'WARNING',
          message: 'No keywords seeded yet — run Import Existing Queries or seed keywords first',
          detail: { errors: result.errors },
        };
      }

      case 'run-aeo-audit':
      case 'run-geo-readiness':
        // AEO/GEO site audits are not implemented yet. AI Visibility is a
        // separate module; observations must not be reported as an audit pass.
        return {
          status: 'NOT_IMPLEMENTED',
          message: 'True AEO/GEO site audit is not implemented yet — planned for a later phase.',
          detail: { module: 'ai-visibility', note: 'AI Visibility remains available as a separate module.' },
        };

      case 'create-baseline': {
        const metrics = await this.buildBaselineMetrics(data);
        const snapshot = await this.baselines.createSnapshot(
          data.site.id,
          actor.organizationId ?? null,
          { type: 'BASELINE', metrics, note: 'Initial baseline captured during site activation' },
          actor.id,
        );
        return {
          status: 'COMPLETED',
          message: `Immutable baseline created (${new Date(snapshot.createdAt).toLocaleDateString()})`,
          detail: { snapshotId: snapshot.id, createdAt: snapshot.createdAt },
        };
      }

      case 'connect-gsc': {
        const status = await this.gsc.status(data.site.id, actor);
        if (status.connected) {
          return { status: 'COMPLETED', message: 'Search Console connected', detail: { connected: true } };
        }
        let authorizationUrl: string | null = null;
        try {
          authorizationUrl = (await this.gsc.authorizeUrl(data.site.id, actor)).authorizationUrl;
        } catch {
          authorizationUrl = null;
        }
        return {
          status: 'WARNING',
          message: 'Complete the Google OAuth flow to connect Search Console',
          detail: { authorizationUrl, clientConfigured: status.clientConfigured, property: status.property ?? null },
        };
      }

      case 'import-historical-performance': {
        if (!data.gscConnected) {
          return { status: 'FAILED', message: 'No connected Search Console property — connect GSC first', detail: null };
        }
        const result = await this.gsc.sync(data.site.id, {}, actor);
        const rows = result.properties.reduce((total, property) => total + property.rows, 0);
        if (rows > 0) {
          const first = result.properties[0];
          const days = first
            ? Math.round((new Date(first.endDate).getTime() - new Date(first.startDate).getTime()) / 86_400_000) + 1
            : 0;
          return {
            status: 'COMPLETED',
            message: `Imported ${rows} historical performance ${rows === 1 ? 'row' : 'rows'}`,
            detail: { rows, days },
          };
        }
        return {
          status: 'FAILED',
          message: 'No Search Console historical data found',
          detail: null,
        };
      }

      case 'import-existing-queries': {
        if (!data.gscConnected) {
          return { status: 'FAILED', message: 'No connected Search Console property — connect GSC first', detail: null };
        }
        const result = await this.keywords.runPipeline(data.site.id, actor.organizationId ?? null, { discoverFromGsc: true });
        if (result.createdKeywords > 0 || data.gscKeywordCount > 0) {
          return {
            status: 'COMPLETED',
            message: `Imported ${result.createdKeywords} existing search queries`,
            detail: { createdKeywords: result.createdKeywords, errors: result.errors },
          };
        }
        return {
          status: 'WARNING',
          message: result.errors.join('; ') || 'No Search Console queries found to import',
          detail: { errors: result.errors },
        };
      }

      case 'build-keyword-url-mapping': {
        const result = await this.keywords.runPipeline(data.site.id, actor.organizationId ?? null, {});
        if (result.createdMappings > 0 || data.mappings.length > 0) {
          return {
            status: 'COMPLETED',
            message: `Mapped ${Math.max(result.createdMappings, data.mappings.length)} keywords to URLs`,
            detail: { createdMappings: result.createdMappings, errors: result.errors },
          };
        }
        return {
          status: 'WARNING',
          message: result.errors.join('; ') || 'No keyword/URL mappings created',
          detail: { errors: result.errors },
        };
      }

      case 'detect-cannibalization': {
        const cases = cannibalizationCount(data);
        if (cases > 0) {
          return { status: 'COMPLETED', message: `Detected ${cases} cannibalization ${cases === 1 ? 'case' : 'cases'}`, detail: { cases } };
        }
        return data.keywords.length > 0
          ? { status: 'COMPLETED', message: 'Cannibalization check complete — none detected', detail: { cases: 0 } }
          : { status: 'WARNING', message: 'No keywords to check for cannibalization yet', detail: { cases: 0 } };
      }

      case 'detect-issues':
      case 'generate-recommendations': {
        const input = await this.buildAlertInput(data);
        await this.alerts.evaluate(data.site.id, actor.organizationId ?? null, input);
        const issues = await this.operations.listIssues(data.site.id);
        const recommendations = await this.operations.listRecommendations(data.site.id);
        const freshIssues = issues.length;
        const freshRecs = recommendations.length;
        if (key === 'detect-issues') {
          return freshIssues > 0
            ? { status: 'COMPLETED', message: `Detected ${freshIssues} issue${freshIssues === 1 ? '' : 's'}`, detail: { issues: freshIssues } }
            : { status: 'COMPLETED', message: 'Issue detection complete — none found', detail: { issues: 0 } };
        }
        return freshRecs > 0
          ? {
              status: 'COMPLETED',
              message: `Generated ${freshRecs} recommendation${freshRecs === 1 ? '' : 's'}`,
              detail: { recommendations: freshRecs },
            }
          : { status: 'WARNING', message: 'No recommendations generated yet', detail: { recommendations: 0 } };
      }

      case 'populate-dashboard': {
        const hasData = hasDashboardData(data);
        return hasData
          ? { status: 'COMPLETED', message: 'Dashboard populated from live data', detail: null }
          : { status: 'WARNING', message: 'No dashboard metrics yet — complete the earlier steps first', detail: null };
      }

      case 'generate-initial-report': {
        const existing = data.reports.find((report) => report.type === 'INITIAL');
        if (existing) {
          return {
            status: 'COMPLETED',
            message: `Initial report already generated on ${new Date(existing.createdAt).toLocaleDateString()}`,
            detail: { reportId: existing.id },
          };
        }
        const report = await this.reporting.generate(data.site.id, actor.organizationId ?? null, { type: 'INITIAL' }, actor.id);
        return {
          status: 'COMPLETED',
          message: `Initial client audit report generated (version ${report.version})`,
          detail: { reportId: report.id, version: report.version },
        };
      }
    }
  }

  // -------------------------------------------------------------------------
  // Status derivation (resumability) + summary
  // -------------------------------------------------------------------------

  private deriveStatus(key: ActivationStepKey, data: SiteData): ActivationStepStatus {
    switch (key) {
      case 'add-site':
        return 'COMPLETED';
      case 'connect-wordpress':
        return data.integrationStatus === 'CONNECTED' ? 'COMPLETED' : 'NOT_STARTED';
      case 'verify-connector':
        return data.integrationStatus === 'CONNECTED' ? 'COMPLETED' : 'NOT_STARTED';
      case 'verify-rank-math':
        return data.integrationStatus === 'CONNECTED' && data.rankMathDetected ? 'COMPLETED' : 'NOT_STARTED';
      case 'import-wordpress-pages':
        return data.wpPostCount > 0 ? 'COMPLETED' : 'NOT_STARTED';
      case 'crawl-website':
      case 'build-url-inventory':
        return data.crawledPages.length > 0 ? 'COMPLETED' : 'NOT_STARTED';
      case 'run-technical-audit':
        return data.latestAnalysis?.status === 'COMPLETED' ? 'COMPLETED' : 'NOT_STARTED';
      case 'run-seo-audit':
        return data.keywords.length > 0 ? 'COMPLETED' : 'NOT_STARTED';
      case 'run-aeo-audit':
      case 'run-geo-readiness':
        return 'NOT_IMPLEMENTED';
      case 'create-baseline':
        return data.baselines.length > 0 ? 'COMPLETED' : 'NOT_STARTED';
      case 'connect-gsc':
        return data.gscConnected
          ? 'COMPLETED'
          : data.gscPropertyStatus === 'FAILED'
            ? 'FAILED'
            : 'NOT_STARTED';
      case 'import-historical-performance':
        return data.gscMetricRows > 0 ? 'COMPLETED' : 'NOT_STARTED';
      case 'import-existing-queries':
        return data.gscKeywordCount > 0 ? 'COMPLETED' : 'NOT_STARTED';
      case 'build-keyword-url-mapping':
        return data.mappings.length > 0 ? 'COMPLETED' : 'NOT_STARTED';
      case 'detect-cannibalization':
        if (cannibalizationCount(data) > 0) return 'COMPLETED';
        return data.keywords.length > 0 ? 'COMPLETED' : 'NOT_STARTED';
      case 'detect-issues':
        return data.issues.length > 0 ? 'COMPLETED' : 'NOT_STARTED';
      case 'generate-recommendations':
        return data.recommendations.length > 0 ? 'COMPLETED' : 'NOT_STARTED';
      case 'populate-dashboard':
        return hasDashboardData(data) ? 'COMPLETED' : 'NOT_STARTED';
      case 'generate-initial-report':
        return data.reports.some((report) => report.type === 'INITIAL') ? 'COMPLETED' : 'NOT_STARTED';
      default:
        return 'NOT_STARTED';
    }
  }

  private buildSummary(data: SiteData): ActivationSummaryDto {
    const baseline = data.baselines[0] ?? null;
    const metrics = baseline?.metrics ?? null;
    return {
      pagesImported: data.wpPostCount,
      pagesCrawled: data.crawledPages.length,
      issuesFound: data.issues.length,
      criticalIssues: data.issues.filter((issue) => issue.severity === 'CRITICAL' && issue.status !== 'RESOLVED').length,
      seoHealth: metrics?.onPageHealth ?? null,
      aeoReadiness: metrics?.aeoReadiness ?? null,
      geoReadiness: metrics?.geoReadiness ?? null,
      searchQueriesImported: data.gscKeywordCount,
      keywordOpportunities: data.keywords.length,
      cannibalizationCases: cannibalizationCount(data),
      recommendations: data.recommendations.length,
      baselineDate: baseline ? baseline.createdAt : null,
      baselineExists: Boolean(baseline),
      initialReportExists: data.reports.some((report) => report.type === 'INITIAL'),
    };
  }

  private expensiveAlreadyDoneMessage(key: ActivationStepKey, data: SiteData): string {
    if (key === 'create-baseline') {
      const baseline = data.baselines[0];
      return baseline
        ? `Immutable baseline already created on ${new Date(baseline.createdAt).toLocaleDateString()}`
        : 'Baseline already exists';
    }
    if (key === 'generate-initial-report') {
      const report = data.reports.find((entry) => entry.type === 'INITIAL');
      return report
        ? `Initial report already generated on ${new Date(report.createdAt).toLocaleDateString()}`
        : 'Initial report already exists';
    }
    return 'Step already completed';
  }

  // -------------------------------------------------------------------------
  // Data collection + metrics
  // -------------------------------------------------------------------------

  private async collect(siteId: string, actor: AuthPrincipal): Promise<SiteData> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');

    let integrationStatus: string | null = null;
    let rankMathDetected = false;
    try {
      const integration = await this.wordpress.getIntegration(siteId, actor);
      integrationStatus = integration.status;
      rankMathDetected = Boolean(integration.rankMathDetected);
    } catch {
      // No integration configured yet.
    }

    const [wpPostCount, crawledPages, analyses, keywords, clusters, mappings, issues, recommendations, baselines, observations, reports] =
      await Promise.all([
        this.wpPosts.count({ where: { siteId } }),
        this.links.listCrawledPages(siteId),
        this.links.listAnalyses(siteId),
        this.keywords.listKeywords(siteId),
        this.keywords.listClusters(siteId),
        this.keywords.listMappings(siteId),
        this.operations.listIssues(siteId),
        this.operations.listRecommendations(siteId),
        this.baselines.listSnapshots(siteId),
        this.visibility.listObservations(siteId, { limit: 200 }),
        this.reporting.listReports(siteId, { limit: 100 }),
      ]);

    const gscStatus = await this.gsc.status(siteId, actor).catch(() => ({
      property: null,
      connected: false,
      tokenExpiresAt: null,
      clientConfigured: false,
    }));

    const gscKeywordCount = keywords.filter((keyword) => keyword.source === 'gsc').length;

    let gscMetricRows = 0;
    if (gscStatus.property?.id) {
      gscMetricRows = await this.gscMetrics.count({ where: { propertyId: gscStatus.property.id } });
    }

    const latestAnalysis = analyses.find((analysis) => analysis.status === 'COMPLETED') ?? analyses[0] ?? null;

    return {
      site,
      integrationStatus,
      rankMathDetected,
      wpPostCount,
      crawledPages,
      latestAnalysis,
      keywords,
      clusters,
      mappings,
      issues,
      recommendations,
      baselines,
      observations,
      reports,
      gscConnected: gscStatus.connected,
      gscPropertyStatus: gscStatus.property?.status ?? null,
      gscKeywordCount,
      gscMetricRows,
    };
  }

  /** Defensible directional scores derived only from real platform data. */
  private async buildBaselineMetrics(data: SiteData): Promise<BaselineMetricsDto> {
    const pages = data.crawledPages;
    const withContent = pages.filter((page) => page.wordCount >= 300).length;

    let clicks = 0;
    let impressions = 0;
    let positions: number[] = [];
    if (data.gscConnected) {
      const property = await this.gscProperties.findOne({ where: { siteId: data.site.id, selected: true } });
      if (property) {
        const rows = await this.gscMetrics.find({ where: { propertyId: property.id } });
        clicks = rows.reduce((total, row) => total + Number(row.clicks), 0);
        impressions = rows.reduce((total, row) => total + Number(row.impressions), 0);
        positions = rows.map((row) => Number(row.position)).filter((position) => position > 0);
      }
    }

    const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

    // Versioned Internal Platform Health Score derived from the latest completed
    // audit run (coverage, failed rules, severity, affected URLs). Never derived
    // from page count, and never presented as a Google score.
    const scores = await this.audits.latestScores(data.site.id);

    return {
      crawlHealth: scores?.technicalHealth ?? null,
      technicalIssues: data.issues.filter((issue) => issue.severity === 'CRITICAL' || issue.severity === 'HIGH').length,
      onPageHealth: scores?.onPageHealth ?? null,
      contentHealth: pct(withContent, pages.length),
      // AEO/GEO site audits are not implemented yet — honest null, not AI-visibility proxy.
      aeoReadiness: null,
      geoReadiness: null,
      gscMetrics: {
        clicks: Math.round(clicks),
        impressions: Math.round(impressions),
        ctr: impressions > 0 ? round2(clicks / impressions) : 0,
        avgPosition: positions.length > 0 ? round2(positions.reduce((total, value) => total + value, 0) / positions.length) : null,
      },
      keywordVisibility: data.keywords.filter((keyword) => (keyword.metrics?.impressions ?? 0) > 0).length,
      internalLinkHealth: scores?.internalLinkingHealth ?? null,
      seoHealth: scores?.seoHealth ?? null,
    };
  }

  private async buildAlertInput(data: SiteData): Promise<Record<string, unknown>> {
    const property = await this.gscProperties.findOne({ where: { siteId: data.site.id, selected: true } });
    let traffic: { clicks: number; prevClicks: number } | undefined;
    let ctr: { ctr: number; prevCtr: number } | undefined;
    let position: { avgPosition: number; prevAvgPosition: number; keywords: number } | undefined;

    if (property) {
      const rows = await this.gscMetrics.find({ where: { propertyId: property.id }, order: { metricDate: 'ASC' } });
      const totalClicks = rows.reduce((total, row) => total + Number(row.clicks), 0);
      const totalImpressions = rows.reduce((total, row) => total + Number(row.impressions), 0);
      const positions = rows.map((row) => Number(row.position)).filter((value) => value > 0);
      traffic = { clicks: totalClicks, prevClicks: 0 };
      ctr = { ctr: totalImpressions > 0 ? round2(totalClicks / totalImpressions) : 0, prevCtr: 0 };
      position = {
        avgPosition: positions.length > 0 ? round2(positions.reduce((total, value) => total + value, 0) / positions.length) : 0,
        prevAvgPosition: 0,
        keywords: rows.length,
      };
    }

    const cannibalization: Array<{ query: string; pages: string[] }> = [];
    for (const cluster of data.clusters) {
      if (cluster.cannibalization.length > 0) {
        cannibalization.push({ query: cluster.primaryKeyword, pages: cluster.cannibalization });
      }
    }

    return {
      gscHealthy: data.gscConnected || undefined,
      wordpressHealthy: data.integrationStatus === 'CONNECTED' || undefined,
      traffic,
      ctr,
      position,
      criticalTechnicalIssueCount: data.issues.filter((issue) => issue.severity === 'CRITICAL').length || undefined,
      cannibalization: cannibalization.length > 0 ? cannibalization : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Row helpers
  // -------------------------------------------------------------------------

  private async ensureRows(siteId: string): Promise<void> {
    for (const def of STEPS) {
      const exists = await this.stepRepo.findOne({ where: { siteId, stepKey: def.key } });
      if (!exists) {
        await this.stepRepo.save(
          this.stepRepo.create({ siteId, stepKey: def.key, status: 'NOT_STARTED', attemptCount: 0 }),
        );
      }
    }
  }

  private toStepDto(
    def: ActivationStepDef,
    row: SiteActivationStep | undefined,
    reality: ActivationStepStatus,
    previous: ActivationStepDto | null,
  ): ActivationStepDto {
    let status = reality;
    let message = row?.message ?? null;
    const startedAt = row?.startedAt ? row.startedAt.toISOString() : null;
    const completedAt = row?.completedAt ? row.completedAt.toISOString() : null;

    if (reality === 'NOT_STARTED' && row?.status === 'FAILED') {
      status = 'FAILED';
    } else if (reality === 'NOT_STARTED' && row?.status === 'WARNING') {
      status = 'WARNING';
    } else if (reality === 'NOT_STARTED' && row?.status === 'RUNNING') {
      if (row.startedAt && Date.now() - row.startedAt.getTime() > STALE_RUNNING_MS) {
        status = 'FAILED';
        message = message ?? 'Step timed out';
      } else {
        status = 'RUNNING';
      }
    }

    if (reality === 'COMPLETED') {
      status = 'COMPLETED';
      message = message ?? defaultCompletedMessage(def.key);
    }
    if (reality === 'FAILED' && def.key === 'connect-gsc') {
      status = 'FAILED';
      message = message ?? 'GSC property unavailable';
    }

    const runnable = status === 'FAILED' || status === 'WARNING' || (previous?.status === 'COMPLETED');

    return {
      key: def.key,
      label: def.label,
      status,
      message,
      detail: row?.detail ?? null,
      runnable,
      requiresManualAction: Boolean(def.requiresManualAction),
      expensive: Boolean(def.expensive),
      attemptCount: row?.attemptCount ?? 0,
      startedAt,
      completedAt,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }
}

function cannibalizationCount(data: SiteData): number {
  const clusterCases = data.clusters.reduce((total, cluster) => total + (cluster.cannibalization?.length ?? 0), 0);
  const issueCases = data.issues.filter((issue) => issue.kind === 'CANNIBALIZATION').length;
  return clusterCases + issueCases;
}

function hasDashboardData(data: SiteData): boolean {
  return (
    data.crawledPages.length > 0 ||
    data.gscMetricRows > 0 ||
    data.baselines.length > 0 ||
    data.issues.length > 0 ||
    data.keywords.length > 0 ||
    data.observations.length > 0
  );
}

function defaultCompletedMessage(key: ActivationStepKey): string {
  const messages: Partial<Record<ActivationStepKey, string>> = {
    'add-site': 'Site created',
    'verify-domain': 'Domain verified',
    'connect-wordpress': 'WordPress connected',
    'verify-connector': 'Search Visibility Connector verified',
    'verify-rank-math': 'Rank Math verified',
    'import-wordpress-pages': 'WordPress pages imported',
    'crawl-website': 'Website crawled',
    'run-technical-audit': 'Technical audit complete',
    'run-seo-audit': 'SEO audit complete',
    'run-aeo-audit': 'AEO audit complete',
    'run-geo-readiness': 'GEO readiness audit complete',
    'create-baseline': 'Immutable baseline created',
    'connect-gsc': 'Search Console connected',
    'import-historical-performance': 'Historical search performance imported',
    'import-existing-queries': 'Existing queries imported',
    'build-url-inventory': 'URL inventory built',
    'build-keyword-url-mapping': 'Keyword/URL mapping built',
    'detect-cannibalization': 'Cannibalization detection complete',
    'detect-issues': 'Issue detection complete',
    'generate-recommendations': 'Recommendations generated',
    'populate-dashboard': 'Dashboard populated',
    'generate-initial-report': 'Initial report generated',
  };
  return messages[key] ?? 'Completed';
}

function stepLabel(stepKey: string): string {
  const labels: Record<string, string> = {
    wordpress_reachable: 'WordPress',
    connector_reachable: 'Connector plugin',
    rank_math: 'Rank Math',
    permissions: 'Permissions',
  };
  return labels[stepKey] ?? stepKey;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 1000);
  return fallback;
}

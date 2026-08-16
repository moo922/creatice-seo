import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GscDailyMetric, GscProperty, Site, SiteAutomationSettings } from '@creative-seo/database';
import { Repository } from 'typeorm';
import { LinksService } from '@creative-seo/links';
import { VisibilityService, type VisibilityTarget } from '@creative-seo/visibility';
import { BaselineService, OperationsService, AlertService } from '@creative-seo/operations';
import { ReportingService } from '@creative-seo/reporting';
import type { AutomationOperation, AutomationRunStatus } from '@creative-seo/types';
import { AutomationRun } from '@creative-seo/database';
import { HeadlessGscService } from './headless-gsc';
import { HeadlessKeywordsService } from './headless-keywords';
import type { AutomationFlags } from './definitions';

export interface OperationOutcome {
  status: AutomationRunStatus;
  records: number;
  message: string;
  error?: string;
}

const CONTENT_DECAY_THRESHOLD = 0.2;
const CONTENT_DECAY_WINDOW_DAYS = 28;

/**
 * Executes a claimed automation run against the site, headless. Each operation
 * maps to platform services/engines; failures are never silent — the run is
 * marked FAILED and an operational issue is raised. Published WordPress content
 * is never created, edited, published or "fixed" by any operation here.
 */
@Injectable()
export class AutomationExecutorService {
  private readonly logger = new Logger(AutomationExecutorService.name);

  constructor(
    @InjectRepository(AutomationRun) private readonly runs: Repository<AutomationRun>,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(SiteAutomationSettings) private readonly settings: Repository<SiteAutomationSettings>,
    @InjectRepository(GscProperty) private readonly properties: Repository<GscProperty>,
    @InjectRepository(GscDailyMetric) private readonly dailyMetrics: Repository<GscDailyMetric>,
    private readonly gsc: HeadlessGscService,
    private readonly keywords: HeadlessKeywordsService,
    private readonly links: LinksService,
    private readonly visibility: VisibilityService,
    private readonly baselines: BaselineService,
    private readonly reporting: ReportingService,
    private readonly alerts: AlertService,
    private readonly operations: OperationsService,
  ) {}

  /**
   * Executes a run by id. The RUNNING claim is atomic (UPDATE guarded by the
   * current PENDING status), so two workers can never execute the same run.
   */
  async executeRun(runId: string): Promise<AutomationRunStatus> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run) {
      this.logger.warn(`[automation] run ${runId} not found`);
      return 'FAILED';
    }

    const claimed = await this.runs.update({ id: runId, status: 'PENDING' }, { status: 'RUNNING', startedAt: new Date() });
    if ((claimed.affected ?? 0) === 0) {
      this.logger.warn(`[automation] run ${runId} already claimed elsewhere`);
      return run.status as AutomationRunStatus;
    }

    const site = await this.sites.findOne({ where: { id: run.siteId } });
    if (!site) {
      return this.finalize(run, 'FAILED', 0, 'Site not found', 'Site not found');
    }

    const startedAt = Date.now();
    try {
      const outcome = await this.executeOperation(run.operation as AutomationOperation, site, run.organizationId);
      const durationMs = Date.now() - startedAt;
      return this.finalize(run, outcome.status, outcome.records, outcome.message, outcome.error, durationMs);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2000) : 'unknown automation failure';
      const durationMs = Date.now() - startedAt;
      this.logger.error(`[automation] run ${runId} (${run.operation}) failed: ${message}`);
      await this.raiseAlert(run.operation as AutomationOperation, run.siteId, run.organizationId, message).catch(() => undefined);
      return this.finalize(run, 'FAILED', 0, 'Execution failed', message, durationMs);
    }
  }

  private async executeOperation(operation: AutomationOperation, site: Site, organizationId: string | null): Promise<OperationOutcome> {
    const flags = await this.loadFlags(site.id);
    if (!flags.autoAnalyze && !operationIsReporting(operation)) {
      return { status: 'SKIPPED', records: 0, message: 'Auto-analysis is disabled for this site' };
    }

    switch (operation) {
      case 'gsc-sync': {
        const result = await this.gsc.sync(site.id);
        if (!result.propertyConnected) {
          return { status: 'SKIPPED', records: 0, message: result.message };
        }
        return { status: 'COMPLETED', records: result.rows, message: result.message };
      }

      case 'technical-health':
      case 'internal-link-audit': {
        const report = await this.links.runAnalysis(site.id, site.domain, null);
        const stats = report.analysis.stats;
        await this.evaluateAlerts(site.id, organizationId, flags);
        return {
          status: 'COMPLETED',
          records: (stats.crawledPages ?? 0) + report.suggestions.length,
          message: `Link analysis complete (${report.suggestions.length} suggestions)`,
        };
      }

      case 'full-crawl': {
        const result = await this.links.runCrawl(
          { id: site.id, organizationId, domain: site.domain },
          null,
          { maxPages: 100 },
        );
        const records = result.run.pagesCrawled;
        await this.evaluateAlerts(site.id, organizationId, flags);
        return {
          status: 'COMPLETED',
          records,
          message: `Crawled ${records} page(s) (${result.errors.length} error(s))`,
        };
      }

      case 'seo-audit': {
        const pipeline = await this.keywords.runPipeline(site.id, organizationId, {});
        const target = visibilityTarget(site);
        const observation = await this.visibility.run(site.id, organizationId, target, {}, null);
        await this.evaluateAlerts(site.id, organizationId, flags);
        return {
          status: 'COMPLETED',
          records: pipeline.createdKeywords + observation.observationsCount,
          message: `Audit complete (${pipeline.createdKeywords} keywords, ${observation.observationsCount} observations)`,
        };
      }

      case 'keyword-opportunities': {
        const pipeline = await this.keywords.runPipeline(site.id, organizationId, { discoverFromGsc: true });
        return {
          status: 'COMPLETED',
          records: pipeline.createdKeywords,
          message: `Opportunity detection complete (${pipeline.createdKeywords} keywords ingested)`,
        };
      }

      case 'content-decay': {
        if (!flags.autoDetectIssues) {
          return { status: 'SKIPPED', records: 0, message: 'Auto-detect issues is disabled for this site' };
        }
        const signals = await this.computeContentDecay(site.id);
        await this.alerts.evaluate(
          site.id,
          organizationId,
          { contentDecay: signals },
          { withRecommendations: flags.autoGenerateRecommendations },
        );
        return { status: 'COMPLETED', records: signals.length, message: `Evaluated ${signals.length} content decay signal(s)` };
      }

      case 'ai-visibility': {
        const run = await this.visibility.run(site.id, organizationId, visibilityTarget(site), {}, null);
        return {
          status: run.status === 'FAILED' ? 'FAILED' : 'COMPLETED',
          records: run.observationsCount,
          message: run.status === 'FAILED' ? run.error ?? 'No observations captured' : `${run.observationsCount} observation(s) recorded`,
        };
      }

      case 'monthly-snapshot': {
        const snapshot = await this.baselines.capture(site.id, organizationId, 'MONTHLY', null);
        return { status: 'COMPLETED', records: 1, message: `Monthly snapshot ${snapshot.id} created` };
      }

      case 'client-report': {
        const period = previousMonth();
        const report = await this.reporting.generate(
          site.id,
          organizationId,
          { type: 'MONTHLY', periodStart: period.start, periodEnd: period.end },
          null,
        );
        return { status: 'COMPLETED', records: 1, message: `Monthly report ${report.id} generated` };
      }
    }
  }

  private async evaluateAlerts(siteId: string, organizationId: string | null, flags: AutomationFlags): Promise<void> {
    if (!flags.autoDetectIssues) return;
    await this.alerts.evaluate(
      siteId,
      organizationId,
      { contentDecay: [] },
      { withRecommendations: flags.autoGenerateRecommendations },
    );
  }

  private async computeContentDecay(siteId: string): Promise<Array<{ page: string; clicks: number; prevClicks: number }>> {
    const property = await this.properties.findOne({ where: { siteId, selected: true } });
    if (!property) return [];
    const endDate = today();
    const currentStart = addDays(endDate, -(CONTENT_DECAY_WINDOW_DAYS - 1));
    const previousEnd = addDays(currentStart, -1);
    const previousStart = addDays(previousEnd, -(CONTENT_DECAY_WINDOW_DAYS - 1));

    const rows: Array<{ page: string; clicks: string }> = await this.dailyMetrics.query(
      `
      SELECT "page" AS page, COALESCE(SUM("clicks"), 0)::bigint AS clicks
      FROM "gsc_daily_metrics"
      WHERE "property_id" = $1 AND "metric_date" BETWEEN $2 AND $3 AND "page" <> ''
      GROUP BY "page"
      `,
      [property.id, currentStart, endDate],
    );
    const current = new Map(rows.map((row) => [row.page, Number(row.clicks)]));

    const prevRows: Array<{ page: string; clicks: string }> = await this.dailyMetrics.query(
      `
      SELECT "page" AS page, COALESCE(SUM("clicks"), 0)::bigint AS clicks
      FROM "gsc_daily_metrics"
      WHERE "property_id" = $1 AND "metric_date" BETWEEN $2 AND $3 AND "page" <> ''
      GROUP BY "page"
      `,
      [property.id, previousStart, previousEnd],
    );

    const signals: Array<{ page: string; clicks: number; prevClicks: number }> = [];
    for (const row of prevRows) {
      const clicks = current.get(row.page) ?? 0;
      const prevClicks = Number(row.clicks);
      if (prevClicks > 0 && (prevClicks - clicks) / prevClicks >= CONTENT_DECAY_THRESHOLD) {
        signals.push({ page: row.page, clicks, prevClicks });
      }
    }
    signals.sort((a, b) => b.prevClicks - a.prevClicks);
    return signals.slice(0, 50);
  }

  private async loadFlags(siteId: string): Promise<AutomationFlags> {
    const settings = await this.settings.findOne({ where: { siteId } });
    const defaults = settings?.defaults ?? {};
    return {
      autoAnalyze: defaults.autoAnalyze ?? true,
      autoDetectIssues: defaults.autoDetectIssues ?? true,
      autoGenerateRecommendations: defaults.autoGenerateRecommendations ?? true,
      autoGenerateContent: defaults.autoGenerateContent ?? false,
      autoPublish: defaults.autoPublish ?? false,
      autoApplyFixes: defaults.autoApplyFixes ?? false,
    };
  }

  private async raiseAlert(operation: AutomationOperation, siteId: string, organizationId: string | null, message: string): Promise<void> {
    await this.operations.createIssue(
      siteId,
      organizationId,
      {
        kind: 'ORCHESTRATION',
        severity: 'HIGH',
        title: `Recurring automation failed (${operation})`,
        description: message,
        url: null,
        data: { operation, source: 'automation' },
      },
      { source: 'CRAWLER' },
    );
  }

  private async finalize(
    run: AutomationRun,
    status: AutomationRunStatus,
    records: number,
    message: string,
    error?: string,
    durationMs?: number,
  ): Promise<AutomationRunStatus> {
    await this.runs.update(
      { id: run.id },
      {
        status,
        recordsProcessed: records,
        message,
        error: error ?? null,
        durationMs: durationMs ?? (run.startedAt ? Date.now() - run.startedAt.getTime() : null),
        completedAt: new Date(),
      },
    );
    return status;
  }
}

function operationIsReporting(operation: AutomationOperation): boolean {
  return operation === 'monthly-snapshot' || operation === 'client-report';
}

function visibilityTarget(site: Site): VisibilityTarget {
  const settings = (site.settings ?? {}) as { competitors?: string[]; industry?: string; product?: string; problem?: string };
  return {
    brand: site.name,
    domain: site.domain,
    competitors: settings.competitors ?? [],
    industry: settings.industry ?? '',
    product: settings.product ?? '',
    location: site.country ?? '',
    problem: settings.problem ?? '',
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function previousMonth(): { start: string; end: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

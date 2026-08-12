import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { BaselineService, OperationsService } from '@creative-seo/operations';
import { VisibilityService } from '@creative-seo/visibility';
import { ContentPackagesService } from '@creative-seo/content';
import { LinksService } from '@creative-seo/links';
import { ReportingService } from '@creative-seo/reporting';
import type {
  ClientIssueDto,
  ClientIssuesDto,
  ClientOverviewDto,
  ClientPerformanceDto,
  ClientProgressDto,
  ClientRecommendationDto,
  ClientRecommendationsDto,
  ClientSiteDto,
  ClientWorkDto,
  ClientWorkItemDto,
  ReportContentDto,
  ReportDto,
  ActivityAction,
} from '@creative-seo/types';
import { In, Repository } from 'typeorm';
import { SiteAccessService } from '../../common/guards/site-access.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

const CLOSED = new Set(['RESOLVED', 'IGNORED']);
const MAJOR_SEVERITIES = new Set(['CRITICAL', 'HIGH']);

/**
 * Restricted client portal. Only client-safe data is returned — no API
 * credentials, AI provider settings/prompts, costs, internal notes, other
 * sites or system logs. Every view is audited via the activity log.
 */
@Injectable()
export class ClientService {
  constructor(
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    private readonly siteAccess: SiteAccessService,
    private readonly baselines: BaselineService,
    private readonly operations: OperationsService,
    private readonly visibility: VisibilityService,
    private readonly content: ContentPackagesService,
    private readonly links: LinksService,
    private readonly reporting: ReportingService,
    private readonly activities: ActivityLogService,
  ) {}

  async memberSites(userId: string): Promise<ClientSiteDto[]> {
    const ids = await this.siteAccess.memberSiteIds(userId);
    if (ids.length === 0) return [];
    const rows = await this.sites.find({ where: { id: In(ids) }, order: { name: 'ASC' } });
    return rows.map(toClientSite);
  }

  async overview(siteId: string, userId: string | null): Promise<ClientOverviewDto> {
    const site = await this.requireSite(siteId);
    const [dashboard, issues, reports, logs, links, packages] = await Promise.all([
      this.baselines.dashboard(siteId),
      this.operations.listIssues(siteId, { limit: 200 }),
      this.reporting.listReports(siteId, { limit: 1 }),
      this.operations.listChangeLogs(siteId, { limit: 200 }),
      this.collectAppliedLinks(siteId),
      this.content.list(siteId, { limit: 100 }),
    ]);

    const openIssues = issues.filter((issue) => !CLOSED.has(issue.status)).length;
    const majorIssues = issues.filter((issue) => !CLOSED.has(issue.status) && MAJOR_SEVERITIES.has(issue.severity)).length;
    const completedPackages = packages.filter((item) => item.status === 'COMPLETE').length;
    const workCompleted = logs.length + links.length + completedPackages;

    await this.recordAudit(userId, siteId, 'client.access', { view: 'overview' });
    return {
      site: toClientSite(site),
      status: site.status,
      currentHealth: dashboard.currentMetrics,
      openIssues,
      majorIssues,
      workCompleted,
      latestReport: reports[0] ?? null,
      updatedAt: new Date().toISOString(),
    };
  }

  async progress(siteId: string, userId: string | null): Promise<ClientProgressDto> {
    const dashboard = await this.baselines.dashboard(siteId);
    await this.recordAudit(userId, siteId, 'client.view', { view: 'progress' });
    return {
      baselineToCurrent: dashboard.baselineToCurrent ? {
        metrics: dashboard.baselineToCurrent.metrics,
        issueProgression: dashboard.baselineToCurrent.issueProgression,
      } : null,
      previousToCurrent: dashboard.previousToCurrent ? {
        metrics: dashboard.previousToCurrent.metrics,
        issueProgression: dashboard.previousToCurrent.issueProgression,
      } : null,
      monthToMonth: dashboard.monthToMonth ? { metrics: dashboard.monthToMonth.metrics } : null,
      quarterToQuarter: dashboard.quarterToQuarter ? { metrics: dashboard.quarterToQuarter.metrics } : null,
      currentMetrics: dashboard.currentMetrics,
    };
  }

  async performance(siteId: string, userId: string | null): Promise<ClientPerformanceDto> {
    const [dashboard, trends] = await Promise.all([this.baselines.dashboard(siteId), this.visibility.trends(siteId)]);
    const metrics = dashboard.previousToCurrent?.metrics ?? dashboard.baselineToCurrent?.metrics ?? [];
    const visibility = trends.latestVsPrevious ? trends.latestVsPrevious.latest.metrics : trends.points[trends.points.length - 1]?.metrics ?? null;
    await this.recordAudit(userId, siteId, 'client.view', { view: 'performance' });
    return {
      metrics,
      gsc: dashboard.currentMetrics?.gscMetrics ?? { clicks: 0, impressions: 0, ctr: 0, avgPosition: null },
      visibility,
    };
  }

  async work(siteId: string, userId: string | null): Promise<ClientWorkDto> {
    const [logs, applied, packages] = await Promise.all([
      this.operations.listChangeLogs(siteId, { limit: 200 }),
      this.collectAppliedLinks(siteId),
      this.content.list(siteId, { limit: 100 }),
    ]);
    const items: ClientWorkItemDto[] = [
      ...logs.map((log) => ({ kind: log.changeType, pageUrl: log.pageUrl, label: `${log.changeType.replace(/_/g, ' ')} on ${log.pageUrl}`, changedAt: log.changedAt.slice(0, 10) })),
      ...applied,
      ...packages
        .filter((item) => item.status === 'COMPLETE')
        .map((item) => ({ kind: 'content', pageUrl: item.recommendedUrl || null, label: item.seoTitle || 'Content package', changedAt: item.createdAt.slice(0, 10) })),
    ];
    items.sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1));
    await this.recordAudit(userId, siteId, 'client.view', { view: 'work' });
    return { items };
  }

  async issues(siteId: string, userId: string | null): Promise<ClientIssuesDto> {
    const issues = await this.operations.listIssues(siteId, { limit: 200 });
    const items: ClientIssueDto[] = issues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      kind: issue.kind,
      severity: issue.severity,
      status: issue.status,
      url: issue.url,
      detectedAt: issue.detectedAt,
    }));
    await this.recordAudit(userId, siteId, 'client.view', { view: 'issues' });
    return {
      items,
      open: issues.filter((issue) => !CLOSED.has(issue.status)).length,
      resolved: issues.filter((issue) => CLOSED.has(issue.status)).length,
    };
  }

  async recommendations(siteId: string, userId: string | null): Promise<ClientRecommendationsDto> {
    const issues = await this.operations.listIssues(siteId, { limit: 200 });
    const actioned = issues.filter((issue) => ['APPROVED', 'IN_PROGRESS', 'FIXED', 'VERIFYING'].includes(issue.status));
    const items: ClientRecommendationDto[] = [];
    for (const issue of actioned) {
      const recommendations = await this.operations.listRecommendations(siteId, issue.id);
      items.push(...recommendations.map((recommendation) => ({
        id: recommendation.id,
        issueId: recommendation.issueId,
        title: recommendation.title,
        priority: recommendation.priority,
        suggestedAction: recommendation.suggestedAction,
        createdAt: recommendation.createdAt,
      })));
    }
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    await this.recordAudit(userId, siteId, 'client.view', { view: 'recommendations' });
    return { items };
  }

  async reports(siteId: string, userId: string | null): Promise<ReportDto[]> {
    await this.recordAudit(userId, siteId, 'reports.view', { scope: 'client' });
    return this.reporting.listReports(siteId, { limit: 50 });
  }

  async reportContent(reportId: string, userId: string | null, siteId: string | null): Promise<ReportContentDto> {
    const report = await this.reporting.getReport(reportId);
    if (siteId && report.siteId !== siteId) {
      throw new NotFoundException('Report not found');
    }
    await this.recordAudit(userId, siteId, 'reports.view', { scope: 'client' });
    return report;
  }

  async reportHtml(reportId: string, userId: string | null, siteId: string | null): Promise<string> {
    const report = await this.reportContent(reportId, userId, siteId);
    return report.html;
  }

  private async collectAppliedLinks(siteId: string): Promise<ClientWorkItemDto[]> {
    const [applied, verified] = await Promise.all([
      this.links.listSuggestions(siteId, { status: 'APPLIED', limit: 100 }),
      this.links.listSuggestions(siteId, { status: 'VERIFIED', limit: 100 }),
    ]);
    return [...applied, ...verified].map((suggestion) => ({
      kind: 'internal_link',
      pageUrl: suggestion.sourceUrl,
      label: `Internal link "${suggestion.anchor}" -> ${suggestion.targetUrl}`,
      changedAt: (suggestion.appliedAt ?? suggestion.verifiedAt ?? suggestion.createdAt).slice(0, 10),
    }));
  }

  private async recordAudit(userId: string | null, siteId: string | null, action: ActivityAction, meta: Record<string, unknown>): Promise<void> {
    await this.activities.record({
      action,
      userId,
      siteId,
      entityType: 'client',
      meta,
    });
  }

  private async requireSite(siteId: string): Promise<Site> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    return site;
  }
}

function toClientSite(site: Site): ClientSiteDto {
  return {
    id: site.id,
    name: site.name,
    domain: site.domain,
    status: site.status,
    locale: site.locale,
    language: site.language,
  };
}

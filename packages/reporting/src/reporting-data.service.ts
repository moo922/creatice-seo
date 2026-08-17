import { Injectable } from '@nestjs/common';
import {
  CentralMetricsService,
  BaselineService,
  IssueProgressService,
  WorkCompletedService,
  SeoHealthService,
} from '@creative-seo/operations';
import type { BaselineMetricsDto, PositionBucketCounts } from '@creative-seo/types';

export interface ReportDataSource {
  siteId: string;
  periodStart: string;
  periodEnd: string;
  gscMetrics: BaselineMetricsDto['gscMetrics'];
  positionBuckets: {
    all: PositionBucketCounts[];
    qualified: PositionBucketCounts[];
  };
  seoHealth: {
    seoHealth: number;
    technicalHealth: number;
    onPageHealth: number;
    internalLinkingHealth: number;
  } | null;
  issueProgress: Awaited<ReturnType<IssueProgressService['getIssuePeriodProgress']>>;
  workCompleted: Awaited<ReturnType<WorkCompletedService['getWorkCompleted']>>;
}

/**
 * Reporting Data Service (Section 33).
 *
 * Reports must NOT calculate business metrics independently. This service
 * consumes canonical services to prepare data for reports, delegating all
 * metric computation to the appropriate canonical service:
 *
 *   - CentralMetricsService  → GSC performance metrics, position buckets
 *   - ComparisonService      → period-over-period comparison logic
 *   - BaselineService        → baseline snapshots
 *   - IssueProgressService   → issue progression
 *   - WorkCompletedService   → work activity metrics
 *   - SeoHealthService       → SEO health scores
 *
 * This service NEVER recalculates CTR, baseline logic, percentage-change,
 * or position methodology.
 */
@Injectable()
export class ReportingDataService {
  constructor(
    private readonly centralMetrics: CentralMetricsService,
    private readonly baseline: BaselineService,
    private readonly issueProgress: IssueProgressService,
    private readonly workCompleted: WorkCompletedService,
    private readonly seoHealth: SeoHealthService,
  ) {}

  /**
   * Prepare data for an initial audit report.
   *
   * Resolves current metrics from the latest crawl, audit, GSC period,
   * and AI visibility observations without copying from previous snapshots.
   */
  async getInitialReportData(
    siteId: string,
    baselineVersion?: number,
  ): Promise<ReportDataSource> {
    const snapshots = await this.baseline.listSnapshots(siteId, 'BASELINE');
    const baseline = baselineVersion
      ? snapshots.find((s) => s.baselineVersion === baselineVersion) ?? snapshots[0]
      : snapshots[0] ?? null;

    const periodStart = baseline?.periodStart ?? new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
    const periodEnd = baseline?.periodEnd ?? new Date().toISOString().slice(0, 10);

    return this.buildDataSource(siteId, periodStart, periodEnd);
  }

  /**
   * Prepare data for a monthly report.
   *
   * Uses the full calendar month as the reporting window.
   */
  async getMonthlyReportData(
    siteId: string,
    year: number,
    month: number,
  ): Promise<ReportDataSource> {
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    return this.buildDataSource(siteId, periodStart, periodEnd);
  }

  /**
   * Prepare SEO-specific data for a custom date range.
   */
  async getSeoReportData(
    siteId: string,
    startDate: string,
    endDate: string,
  ): Promise<ReportDataSource> {
    return this.buildDataSource(siteId, startDate, endDate);
  }

  private async buildDataSource(
    siteId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<ReportDataSource> {
    const [
      baselineResult,
      seoHealthScore,
      issueProgressData,
      workCompletedData,
    ] = await Promise.all([
      this.centralMetrics.buildBaselineMetrics(siteId, periodStart, periodEnd),
      this.seoHealth.getLatestScore(siteId),
      this.issueProgress.getIssuePeriodProgress(siteId, periodStart, periodEnd),
      this.workCompleted.getWorkCompleted(siteId, periodStart, periodEnd),
    ]);

    return {
      siteId,
      periodStart,
      periodEnd,
      gscMetrics: baselineResult.gscMetrics,
      positionBuckets: baselineResult.positionBuckets,
      seoHealth: seoHealthScore
        ? {
            seoHealth: seoHealthScore.seoHealth,
            technicalHealth: seoHealthScore.technicalHealth,
            onPageHealth: seoHealthScore.onPageHealth,
            internalLinkingHealth: seoHealthScore.internalLinkingHealth,
          }
        : null,
      issueProgress: issueProgressData,
      workCompleted: workCompletedData,
    };
  }
}

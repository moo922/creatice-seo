import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BaselineSnapshot, GscDailyMetric, GscProperty } from '@creative-seo/database';
import type {
  BaselineMetricsDto,
  BaselineSnapshotDto,
  BaselineType,
  CreateBaselineSnapshotRequest,
  IssueSnapshotEntry,
  ProgressDashboardDto,
  SnapshotComparisonDto,
} from '@creative-seo/types';
import { Repository } from 'typeorm';
import { compareSnapshots, issueProgression, round2 } from './baseline';
import { OperationsService } from './operations.service';

/**
 * Immutable baseline snapshots + progress dashboard. Snapshots are write-once:
 * there is no update path. Recurring snapshots are created by callers (worker /
 * scheduled jobs) with type PERIODIC / MONTHLY / QUARTERLY.
 */
@Injectable()
export class BaselineService {
  constructor(
    @InjectRepository(BaselineSnapshot) private readonly snapshots: Repository<BaselineSnapshot>,
    @InjectRepository(GscProperty) private readonly properties: Repository<GscProperty>,
    @InjectRepository(GscDailyMetric) private readonly dailyMetrics: Repository<GscDailyMetric>,
    private readonly operations: OperationsService,
  ) {}

  async createSnapshot(
    siteId: string,
    organizationId: string | null,
    input: CreateBaselineSnapshotRequest,
    createdBy: string | null,
  ): Promise<BaselineSnapshotDto> {
    const issues = await this.operations.getIssueSnapshot(siteId);
    const row = this.snapshots.create({
      siteId,
      organizationId,
      type: input.type,
      isBaseline: input.type === 'BASELINE',
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      metrics: input.metrics as unknown as Record<string, unknown>,
      issues: issues as unknown as Record<string, unknown>[],
      note: input.note ?? null,
      createdBy,
    });
    const saved = await this.snapshots.save(row);
    return this.toDto(saved);
  }

  /**
   * Recurring snapshot: captures the site's latest known metrics (or a zeroed
   * set when no snapshot exists yet) as a new immutable snapshot. Used by the
   * worker scheduler for MONTHLY / QUARTERLY snapshots.
   */
  async capture(
    siteId: string,
    organizationId: string | null,
    type: BaselineType,
    createdBy: string | null,
  ): Promise<BaselineSnapshotDto> {
    const latest = await this.snapshots.findOne({ where: { siteId }, order: { createdAt: 'DESC' } });
    const metrics: BaselineMetricsDto = latest
      ? (latest.metrics as unknown as BaselineMetricsDto)
      : {
          crawlHealth: 0,
          technicalIssues: 0,
          onPageHealth: 0,
          contentHealth: 0,
          aeoReadiness: null,
          geoReadiness: null,
          gscMetrics: { clicks: 0, impressions: 0, ctr: 0, avgPosition: null },
          keywordVisibility: 0,
          internalLinkHealth: null,
          seoHealth: null,
        };
    return this.createSnapshot(
      siteId,
      organizationId,
      { type, metrics, note: `Recurring ${type.toLowerCase()} snapshot` },
      createdBy,
    );
  }

  async listSnapshots(siteId: string, type?: BaselineType): Promise<BaselineSnapshotDto[]> {
    const where = { siteId } as Record<string, unknown>;
    if (type) where.type = type;
    const rows = await this.snapshots.find({ where, order: { createdAt: 'DESC' } });
    return rows.map((row) => this.toDto(row));
  }

  async getSnapshot(id: string): Promise<BaselineSnapshotDto> {
    const row = await this.snapshots.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Baseline snapshot not found');
    }
    return this.toDto(row);
  }

  /**
   * Progress dashboard: baseline -> current, previous -> current,
   * month -> month and quarter -> quarter comparisons plus issue progression.
   */
  async dashboard(siteId: string): Promise<ProgressDashboardDto> {
    const rows = await this.snapshots.find({ where: { siteId }, order: { createdAt: 'DESC' } });
    if (rows.length === 0) {
      return {
        baselineToCurrent: null,
        previousToCurrent: null,
        monthToMonth: null,
        quarterToQuarter: null,
        issueProgression: null,
        currentMetrics: null,
        updatedAt: new Date().toISOString(),
      };
    }

    const all = rows.map((row) => this.toDto(row));
    const byType = (type: BaselineType) => all.filter((snapshot) => snapshot.type === type);
    const latest = all[0]!;
    const previous = all[1] ?? null;

    const baseline = all.find((snapshot) => snapshot.isBaseline) ?? all[all.length - 1]!;
    const months = byType('MONTHLY');
    const quarters = byType('QUARTERLY');

    const pair = (from: BaselineSnapshotDto | undefined | null, to: BaselineSnapshotDto | undefined | null): SnapshotComparisonDto | null => {
      if (!from || !to || from.id === to.id) return null;
      return compareSnapshots(from, to);
    };

    return {
      baselineToCurrent: pair(baseline, latest),
      previousToCurrent: pair(previous, latest),
      monthToMonth: pair(months[1], months[0]),
      quarterToQuarter: pair(quarters[1], quarters[0]),
      issueProgression: previous
        ? issueProgression(previous.issues, latest.issues)
        : issueProgression([], latest.issues),
      currentMetrics: latest.metrics,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Post-change performance comparison for a page: aggregates GSC daily metrics
   * for the page across the before and after windows.
   */
  async pagePerformanceComparison(
    siteId: string,
    pageUrl: string,
    beforeStart: string,
    beforeEnd: string,
    afterStart: string,
    afterEnd: string,
  ): Promise<{
    pageUrl: string;
    before: BaselineMetricsDto['gscMetrics'];
    after: BaselineMetricsDto['gscMetrics'];
    deltas: { clicks: number | null; impressions: number | null; ctr: number | null; avgPosition: number | null };
  }> {
    const property = await this.properties.findOne({ where: { siteId, selected: true } });
    if (!property) {
      throw new BadRequestException('No selected GSC property for this site');
    }
    const before = await this.aggregatePage(property.id, pageUrl, beforeStart, beforeEnd);
    const after = await this.aggregatePage(property.id, pageUrl, afterStart, afterEnd);
    return {
      pageUrl,
      before,
      after,
      deltas: {
        clicks: before.clicks !== null && after.clicks !== null ? round2(after.clicks - before.clicks) : null,
        impressions: before.impressions !== null && after.impressions !== null ? round2(after.impressions - before.impressions) : null,
        ctr: before.ctr !== null && after.ctr !== null ? round2(after.ctr - before.ctr) : null,
        avgPosition: before.avgPosition !== null && after.avgPosition !== null ? round2(after.avgPosition - before.avgPosition) : null,
      },
    };
  }

  private async aggregatePage(
    propertyId: string,
    pageUrl: string,
    startDate: string,
    endDate: string,
  ): Promise<BaselineMetricsDto['gscMetrics']> {
    const rows = await this.dailyMetrics.find({ where: { propertyId, page: pageUrl } });
    const inWindow = rows.filter((row) => row.metricDate >= startDate && row.metricDate <= endDate);
    if (inWindow.length === 0) {
      return { clicks: 0, impressions: 0, ctr: 0, avgPosition: null };
    }
    const clicks = sum(inWindow.map((row) => Number(row.clicks)));
    const impressions = sum(inWindow.map((row) => Number(row.impressions)));
    const positions = inWindow.map((row) => row.position).filter((position) => position > 0);
    return {
      clicks,
      impressions,
      ctr: impressions > 0 ? round2(clicks / impressions) : 0,
      avgPosition: positions.length > 0 ? round2(positions.reduce((total, position) => total + position, 0) / positions.length) : null,
    };
  }

  private toDto(row: BaselineSnapshot): BaselineSnapshotDto {
    return {
      id: row.id,
      siteId: row.siteId,
      organizationId: row.organizationId,
      type: row.type as BaselineType,
      isBaseline: row.isBaseline,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      metrics: row.metrics as unknown as BaselineMetricsDto,
      issues: (row.issues ?? []) as unknown as IssueSnapshotEntry[],
      note: row.note,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

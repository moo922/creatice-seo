import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GscPageDailyMetric, GscQueryDailyMetric, GscQueryPageDailyMetric, GscSiteDailyMetric, GscSyncState } from '@creative-seo/database';
import type {
  BaselineMetricsDto,
  PagePerformanceDto,
  PositionBucketCounts,
  QueryPagePerformanceDto,
  QueryPerformanceDto,
  SitePerformanceDto,
} from '@creative-seo/types';
import { Between, Repository } from 'typeorm';
import { observe, ObservabilityEvent } from './observability';

const DEFAULT_PERIOD_DAYS = 28;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function weightedAvgPosition(rows: Array<{ impressions: number; position: number | null }>): number | null {
  let totalImpressions = 0;
  let weightedSum = 0;
  for (const row of rows) {
    const impressions = Number(row.impressions);
    const position = row.position;
    if (impressions > 0 && position !== null && position > 0) {
      totalImpressions += impressions;
      weightedSum += impressions * position;
    }
  }
  return totalImpressions > 0 ? round2(weightedSum / totalImpressions) : null;
}

@Injectable()
export class CentralMetricsService {
  constructor(
    @InjectRepository(GscSiteDailyMetric) private readonly siteMetrics: Repository<GscSiteDailyMetric>,
    @InjectRepository(GscPageDailyMetric) private readonly pageMetrics: Repository<GscPageDailyMetric>,
    @InjectRepository(GscQueryDailyMetric) private readonly queryMetrics: Repository<GscQueryDailyMetric>,
    @InjectRepository(GscQueryPageDailyMetric) private readonly queryPageMetrics: Repository<GscQueryPageDailyMetric>,
    @InjectRepository(GscSyncState) private readonly syncStates: Repository<GscSyncState>,
  ) {}

  async getSitePerformance(siteId: string, days: number = DEFAULT_PERIOD_DAYS): Promise<SitePerformanceDto> {
    const now = new Date();
    const periodEnd = now.toISOString().slice(0, 10);
    const periodStart = new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

    const rows = await this.siteMetrics
      .createQueryBuilder('m')
      .where('m.site_id = :siteId', { siteId })
      .andWhere('m.date >= :start AND m.date <= :end', { start: periodStart, end: periodEnd })
      .getMany();

    const totals = this.aggregatePeriod(rows.map((r) => ({ ...r, position: r.averagePosition })));

    return {
      siteId,
      grain: 'SITE_DAILY',
      periodStart,
      periodEnd,
      totals,
      latestAvailableDate: rows.length > 0 ? rows[rows.length - 1]!.date : null,
    };
  }

  async getPagePerformance(siteId: string, days: number = DEFAULT_PERIOD_DAYS): Promise<PagePerformanceDto[]> {
    const now = new Date();
    const periodEnd = now.toISOString().slice(0, 10);
    const periodStart = new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

    const pageUrls = await this.pageMetrics
      .createQueryBuilder('m')
      .where('m.site_id = :siteId', { siteId })
      .andWhere('m.date >= :start AND m.date <= :end', { start: periodStart, end: periodEnd })
      .select('m.page_url', 'pageUrl')
      .addSelect('m.normalized_url', 'normalizedUrl')
      .groupBy('m.page_url')
      .addGroupBy('m.normalized_url')
      .getRawMany<{ pageUrl: string; normalizedUrl: string }>();

    const results: PagePerformanceDto[] = [];

    for (const { pageUrl, normalizedUrl } of pageUrls) {
      const rows = await this.pageMetrics
        .createQueryBuilder('m')
        .where('m.site_id = :siteId', { siteId })
        .andWhere('m.page_url = :pageUrl', { pageUrl })
        .andWhere('m.date >= :start AND m.date <= :end', { start: periodStart, end: periodEnd })
        .getMany();

      results.push({
        siteId,
        pageUrl,
        normalizedUrl,
        periodStart,
        periodEnd,
        totals: this.aggregatePeriod(rows),
        activeDates: rows.length,
      });
    }

    return results.sort((a, b) => b.totals.clicks - a.totals.clicks);
  }

  async getQueryPerformance(siteId: string, days: number = DEFAULT_PERIOD_DAYS): Promise<QueryPerformanceDto[]> {
    const now = new Date();
    const periodEnd = now.toISOString().slice(0, 10);
    const periodStart = new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

    const queries = await this.queryMetrics
      .createQueryBuilder('m')
      .where('m.site_id = :siteId', { siteId })
      .andWhere('m.date >= :start AND m.date <= :end', { start: periodStart, end: periodEnd })
      .select('m.query', 'query')
      .groupBy('m.query')
      .getRawMany<{ query: string }>();

    const results: QueryPerformanceDto[] = [];

    for (const { query } of queries) {
      const rows = await this.queryMetrics
        .createQueryBuilder('m')
        .where('m.site_id = :siteId', { siteId })
        .andWhere('m.query = :query', { query })
        .andWhere('m.date >= :start AND m.date <= :end', { start: periodStart, end: periodEnd })
        .getMany();

      const distinctPages = await this.queryPageMetrics
        .createQueryBuilder('m')
        .where('m.site_id = :siteId', { siteId })
        .andWhere('m.query = :query', { query })
        .andWhere('m.date >= :start AND m.date <= :end', { start: periodStart, end: periodEnd })
        .select('COUNT(DISTINCT m.page_url)', 'count')
        .getRawOne<{ count: string }>();

      results.push({
        siteId,
        query,
        periodStart,
        periodEnd,
        totals: this.aggregatePeriod(rows),
        distinctPages: Number(distinctPages?.count ?? 0),
        activeDates: rows.length,
      });
    }

    return results.sort((a, b) => b.totals.clicks - a.totals.clicks);
  }

  async getQueryPagePerformance(siteId: string, days: number = DEFAULT_PERIOD_DAYS): Promise<QueryPagePerformanceDto[]> {
    const now = new Date();
    const periodEnd = now.toISOString().slice(0, 10);
    const periodStart = new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

    const pairs = await this.queryPageMetrics
      .createQueryBuilder('m')
      .where('m.site_id = :siteId', { siteId })
      .andWhere('m.date >= :start AND m.date <= :end', { start: periodStart, end: periodEnd })
      .select('m.query', 'query')
      .addSelect('m.page_url', 'pageUrl')
      .addSelect('m.normalized_query', 'normalizedQuery')
      .addSelect('m.normalized_url', 'normalizedUrl')
      .groupBy('m.query')
      .addGroupBy('m.page_url')
      .addGroupBy('m.normalized_query')
      .addGroupBy('m.normalized_url')
      .getRawMany<{ query: string; pageUrl: string; normalizedQuery: string; normalizedUrl: string }>();

    const results: QueryPagePerformanceDto[] = [];

    for (const { query, pageUrl, normalizedQuery, normalizedUrl } of pairs) {
      const rows = await this.queryPageMetrics
        .createQueryBuilder('m')
        .where('m.site_id = :siteId', { siteId })
        .andWhere('m.query = :query', { query })
        .andWhere('m.page_url = :pageUrl', { pageUrl })
        .andWhere('m.date >= :start AND m.date <= :end', { start: periodStart, end: periodEnd })
        .getMany();

      results.push({
        siteId,
        query,
        pageUrl,
        normalizedQuery,
        normalizedUrl,
        periodStart,
        periodEnd,
        totals: this.aggregatePeriod(rows),
        activeDates: rows.length,
      });
    }

    return results.sort((a, b) => b.totals.clicks - a.totals.clicks);
  }

  private aggregatePeriod(rows: Array<{ clicks: number | string; impressions: number | string; ctr: number | string; position?: number | string | null }>) {
    const totalClicks = rows.reduce((s, r) => s + Number(r.clicks), 0);
    const totalImpressions = rows.reduce((s, r) => s + Number(r.impressions), 0);
    const positionRows = rows.map((r) => ({ impressions: Number(r.impressions), position: r.position != null ? Number(r.position) : null })).filter((r) => r.position !== null && r.position > 0);

    return {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? round2(totalClicks / totalImpressions) : 0,
      averagePosition: positionRows.length > 0 ? weightedAvgPosition(positionRows) : null,
      positionMethod: positionRows.length > 0 ? ('weighted' as const) : ('unavailable' as const),
    };
  }

  async buildBaselineMetrics(siteId: string, periodStart: string, periodEnd: string): Promise<{
    gscMetrics: BaselineMetricsDto['gscMetrics'];
    positionBuckets: { all: PositionBucketCounts[]; qualified: PositionBucketCounts[] };
  }> {
    const rows = await this.siteMetrics.find({
      where: { siteId, date: Between(periodStart, periodEnd) },
    });

    const totalClicks = rows.reduce((s, r) => s + Number(r.clicks), 0);
    const totalImpressions = rows.reduce((s, r) => s + Number(r.impressions), 0);
    const positionRows = rows
      .map((r) => ({ impressions: Number(r.impressions), position: Number(r.averagePosition) }))
      .filter((r) => r.position > 0);

    const gscMetrics = {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? round2(totalClicks / totalImpressions) : null,
      avgPosition: positionRows.length > 0 ? weightedAvgPosition(positionRows) : null,
    };

    observe(ObservabilityEvent.GSC_SYNC_COMPLETE, {
      rowCount: rows.length,
      totalClicks,
      totalImpressions,
      periodStart,
      periodEnd,
    }, siteId);

    const positionBuckets = await this.getPositionBuckets(siteId, periodStart, periodEnd);
    return { gscMetrics, positionBuckets };
  }

  async getPositionBuckets(
    siteId: string,
    periodStart: string,
    periodEnd: string,
    minImpressions = 10,
  ): Promise<{ all: PositionBucketCounts[]; qualified: PositionBucketCounts[] }> {
    const queryRows = await this.queryMetrics.find({
      where: { siteId, date: Between(periodStart, periodEnd) },
    });

    const byQuery = new Map<string, { clicks: number; impressions: number; avgPosition: number | null }>();
    for (const row of queryRows) {
      const existing = byQuery.get(row.query);
      if (existing) {
        existing.clicks += Number(row.clicks);
        existing.impressions += Number(row.impressions);
      } else {
        byQuery.set(row.query, {
          clicks: Number(row.clicks),
          impressions: Number(row.impressions),
          avgPosition: null,
        });
      }
    }

    for (const [query, agg] of byQuery) {
      const queryPositions = queryRows
        .filter((r) => r.query === query && Number(r.impressions) > 0 && Number(r.position) > 0)
        .map((r) => ({ impressions: Number(r.impressions), position: Number(r.position) }));
      agg.avgPosition = queryPositions.length > 0 ? weightedAvgPosition(queryPositions) : null;
    }

    const bucketize = (queries: Array<{ impressions: number; position: number | null }>): PositionBucketCounts[] => {
      const counts: Record<string, { all: number; qualified: number }> = {
        TOP_3: { all: 0, qualified: 0 },
        TOP_10: { all: 0, qualified: 0 },
        TOP_20: { all: 0, qualified: 0 },
        POSITION_11_20: { all: 0, qualified: 0 },
        POSITION_21_50: { all: 0, qualified: 0 },
        POSITION_51_PLUS: { all: 0, qualified: 0 },
      };

      for (const q of queries) {
        if (q.position === null) continue;
        const p = q.position;
        const qualified = q.impressions >= minImpressions;

        const key = p <= 3 ? 'TOP_3' : p <= 10 ? 'TOP_10' : p <= 20 ? 'TOP_20' : p <= 50 ? 'POSITION_21_50' : 'POSITION_51_PLUS';
        const entry = counts[key]!;
        entry.all++;
        if (qualified) entry.qualified++;
      }

      return (Object.entries(counts) as Array<[string, { all: number; qualified: number }]>).map(([bucket, c]) => ({
        bucket: bucket as PositionBucketCounts['bucket'],
        allQueries: c.all,
        qualifiedQueries: c.qualified,
      }));
    };

    const allQueries = Array.from(byQuery.values()).map((v) => ({
      impressions: v.impressions,
      position: v.avgPosition,
    }));

    const qualifiedQueries = allQueries.filter((q) => q.impressions >= minImpressions);

    return {
      all: bucketize(allQueries),
      qualified: bucketize(qualifiedQueries),
    };
  }
}

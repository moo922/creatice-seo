import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  GscQueryDailyMetric,
  GscQueryPageDailyMetric,
  GscPageDailyMetric,
  GscSiteDailyMetric,
} from '@creative-seo/database';
import type {
  CannibalizationCandidateDto,
  PagePerformanceDto,
  PeriodPerformanceDto,
  QueryPerformanceDto,
  SitePerformanceDto,
} from '@creative-seo/types';
import { Between, Repository } from 'typeorm';
import { aggregateForTest } from './aggregate';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface CannibalizationOptions {
  /** Minimum total impressions across competing URLs before a candidate is flagged. */
  minTotalImpressions?: number;
  /** Minimum impressions per competing URL. */
  minImpressionsPerUrl?: number;
  /** Minimum number of active dates with data for the query. */
  minActiveDates?: number;
  version?: number;
}

const DEFAULT_CANNIBALIZATION_OPTIONS: Required<CannibalizationOptions> = {
  minTotalImpressions: 50,
  minImpressionsPerUrl: 10,
  minActiveDates: 2,
  version: 1,
};

function aggregate(
  rows: Array<{ clicks: number; impressions: number; position: number | null; ctr: number }>,
): PeriodPerformanceDto {
  const result = aggregateForTest(rows);
  return {
    clicks: result.clicks,
    impressions: result.impressions,
    ctr: result.ctr,
    averagePosition: result.averagePosition,
    positionMethod: result.positionMethod,
  };
}

function siteRow(row: GscSiteDailyMetric) {
  return { clicks: Number(row.clicks), impressions: Number(row.impressions), position: row.averagePosition, ctr: row.ctr };
}
function queryRow(row: GscQueryDailyMetric) {
  return { clicks: Number(row.clicks), impressions: Number(row.impressions), position: row.position, ctr: row.ctr };
}
function pageRow(row: GscPageDailyMetric) {
  return { clicks: Number(row.clicks), impressions: Number(row.impressions), position: row.position, ctr: row.ctr };
}
function qpRow(row: GscQueryPageDailyMetric) {
  return { clicks: Number(row.clicks), impressions: Number(row.impressions), position: row.position, ctr: row.ctr };
}

/**
 * Canonical metric repository. Every read method works on a single explicit
 * grain and returns period aggregates with CTR computed from summed
 * clicks/impressions and a documented, impression-weighted average position
 * (null when not computable). This is the ONLY sanctioned way application code
 * reads Search Console performance.
 */
@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(GscSiteDailyMetric) private readonly siteDaily: Repository<GscSiteDailyMetric>,
    @InjectRepository(GscQueryDailyMetric) private readonly queryDaily: Repository<GscQueryDailyMetric>,
    @InjectRepository(GscPageDailyMetric) private readonly pageDaily: Repository<GscPageDailyMetric>,
    @InjectRepository(GscQueryPageDailyMetric) private readonly queryPageDaily: Repository<GscQueryPageDailyMetric>,
  ) {}

  /** SITE_DAILY only. Returns the latest date with data and period totals. */
  async getSitePerformance(siteId: string, range: DateRange): Promise<SitePerformanceDto | null> {
    const rows = await this.siteDaily.find({
      where: { siteId, date: Between(range.startDate, range.endDate) },
      order: { date: 'DESC' },
    });
    if (rows.length === 0) return null;
    const latest = rows[0]!;
    return {
      siteId,
      grain: 'SITE_DAILY',
      periodStart: range.startDate,
      periodEnd: range.endDate,
      totals: aggregate(rows.map(siteRow)),
      latestAvailableDate: latest.date,
    };
  }

  /** QUERY_DAILY only. Original query text is preserved; normalized is for matching. */
  async getQueryPerformance(siteId: string, query: string, range: DateRange): Promise<QueryPerformanceDto | null> {
    const rows = await this.queryDaily.find({
      where: { siteId, query, date: Between(range.startDate, range.endDate) },
      order: { date: 'DESC' },
    });
    if (rows.length === 0) return null;
    const activeDates = new Set(rows.map((row) => row.date)).size;
    return {
      siteId,
      query,
      periodStart: range.startDate,
      periodEnd: range.endDate,
      totals: aggregate(rows.map(queryRow)),
      distinctPages: 0, // QUERY_DAILY has no page dimension.
      activeDates,
    };
  }

  /** PAGE_DAILY only, keyed on the normalized URL (original URL preserved). */
  async getPagePerformance(
    siteId: string,
    pageUrl: string,
    normalizedUrl: string,
    range: DateRange,
  ): Promise<PagePerformanceDto | null> {
    const rows = await this.pageDaily.find({
      where: { siteId, normalizedUrl, date: Between(range.startDate, range.endDate) },
      order: { date: 'DESC' },
    });
    if (rows.length === 0) return null;
    return {
      siteId,
      pageUrl: rows[0]!.pageUrl,
      normalizedUrl,
      periodStart: range.startDate,
      periodEnd: range.endDate,
      totals: aggregate(rows.map(pageRow)),
      activeDates: new Set(rows.map((row) => row.date)).size,
    };
  }

  /** QUERY_PAGE_DAILY only. Used for query<->page analysis and cannibalization. */
  async getQueryPagePerformance(siteId: string, query: string, range: DateRange): Promise<QueryPerformanceDto | null> {
    const rows = await this.queryPageDaily.find({
      where: { siteId, query, date: Between(range.startDate, range.endDate) },
      order: { date: 'DESC' },
    });
    if (rows.length === 0) return null;
    const distinctPages = new Set(rows.map((row) => row.normalizedUrl)).size;
    return {
      siteId,
      query,
      periodStart: range.startDate,
      periodEnd: range.endDate,
      totals: aggregate(rows.map(qpRow)),
      distinctPages,
      activeDates: new Set(rows.map((row) => row.date)).size,
    };
  }

  /**
   * Derives cannibalization candidates from QUERY_PAGE_DAILY evidence only.
   * A candidate is created only when the same query meaningfully appears
   * across multiple indexable URLs and the evidence exceeds the configured,
   * versioned thresholds — a single accidental impression is never flagged.
   */
  async detectCannibalization(
    siteId: string,
    range: DateRange,
    options: CannibalizationOptions = {},
  ): Promise<CannibalizationCandidateDto[]> {
    const opts = { ...DEFAULT_CANNIBALIZATION_OPTIONS, ...options };
    const rows = await this.queryPageDaily
      .createQueryBuilder('m')
      .select('m.normalized_query', 'normalizedQuery')
      .addSelect('m.query', 'query')
      .addSelect('m.normalized_url', 'normalizedUrl')
      .addSelect('SUM(m.impressions)', 'impressions')
      .addSelect('SUM(m.clicks)', 'clicks')
      .addSelect('COUNT(DISTINCT m.date)', 'activeDates')
      .where('m.site_id = :siteId', { siteId })
      .andWhere('m.date BETWEEN :s AND :e', { s: range.startDate, e: range.endDate })
      .groupBy('m.normalized_query')
      .addGroupBy('m.query')
      .addGroupBy('m.normalized_url')
      .getRawMany<{ normalizedQuery: string; query: string; normalizedUrl: string; impressions: string; clicks: string; activeDates: string }>();

    const byQuery = new Map<string, Array<{ pageUrl: string; impressions: number; clicks: number }>>();
    const activeDatesByQuery = new Map<string, number>();
    for (const row of rows) {
      const list = byQuery.get(row.normalizedQuery) ?? [];
      list.push({
        pageUrl: row.normalizedUrl,
        impressions: Number(row.impressions),
        clicks: Number(row.clicks),
      });
      byQuery.set(row.normalizedQuery, list);
      activeDatesByQuery.set(row.normalizedQuery, Math.max(activeDatesByQuery.get(row.normalizedQuery) ?? 0, Number(row.activeDates)));
    }

    const candidates: CannibalizationCandidateDto[] = [];
    for (const [normalizedQuery, urls] of byQuery) {
      const competing = urls.filter((url) => url.impressions >= opts.minImpressionsPerUrl);
      const totalImpressions = urls.reduce((total, url) => total + url.impressions, 0);
      if (competing.length < 2) continue;
      if (totalImpressions < opts.minTotalImpressions) continue;
      const activeDates = activeDatesByQuery.get(normalizedQuery) ?? 0;
      if (activeDates < opts.minActiveDates) continue;
      candidates.push({
        query: normalizedQuery,
        normalizedQuery,
        periodStart: range.startDate,
        periodEnd: range.endDate,
        distinctUrls: competing.length,
        totalImpressions,
        competingUrls: competing.sort((a, b) => b.impressions - a.impressions),
        evidence: {
          minTotalImpressions: opts.minTotalImpressions,
          minImpressionsPerUrl: opts.minImpressionsPerUrl,
          minActiveDates: opts.minActiveDates,
        },
      });
    }
    return candidates;
  }
}

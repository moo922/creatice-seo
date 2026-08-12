import type { GscOpportunityKind } from '@creative-seo/types';
import type { GscDailyMetricRecord } from './sync';
import { summarize } from './aggregate';

export interface OpportunityCandidate {
  kind: GscOpportunityKind;
  query: string | null;
  page: string | null;
  currentValue: Record<string, unknown>;
  previousValue: Record<string, unknown>;
}

export interface OpportunityDetectionOptions {
  /** Minimum impressions for impression-gated rules. */
  minImpressions?: number;
  /** CTR threshold for HIGH_IMPRESSIONS_LOW_CTR. */
  lowCtrThreshold?: number;
  /** Current/previous ratio below which a page is "declining". */
  declineRatio?: number;
  /** Current/previous ratio above which a page is "rising". */
  riseRatio?: number;
  /** Minimum clicks for a query/page to count as established. */
  minClicks?: number;
  /** Minimum impressions for a (query, page) pair to count as a URL conflict. */
  conflictMinImpressions?: number;
}

const DEFAULTS = {
  minImpressions: 500,
  lowCtrThreshold: 0.02,
  declineRatio: 0.7,
  riseRatio: 1.3,
  minClicks: 10,
  conflictMinImpressions: 50,
};

/**
 * Deterministic opportunity detection. Runs against two windows (current vs
 * previous, each 28 days by default). Average positions from Search Console
 * are directional only; the POSITION_* rules are therefore expressed as
 * bands (4-10, 11-20) rather than exact ranking positions.
 */
export function detectOpportunities(
  current: GscDailyMetricRecord[],
  previous: GscDailyMetricRecord[],
  options: OpportunityDetectionOptions = {},
): OpportunityCandidate[] {
  const opts = { ...DEFAULTS, ...options };
  const currentQuery = aggregateByQuery(current);
  const previousQuery = aggregateByQuery(previous);
  const currentPage = aggregateByPage(current);
  const previousPage = aggregateByPage(previous);

  const candidates: OpportunityCandidate[] = [];

  for (const [query, totals] of currentQuery) {
    if (totals.impressions >= opts.minImpressions && totals.ctr <= opts.lowCtrThreshold) {
      candidates.push({
        kind: 'HIGH_IMPRESSIONS_LOW_CTR',
        query,
        page: null,
        currentValue: { ...totals },
        previousValue: previousQuery.get(query) ?? {},
      });
    }
    if (totals.avgPosition >= 4 && totals.avgPosition <= 10 && totals.impressions >= 100 && totals.clicks >= 10) {
      candidates.push({ kind: 'POSITION_4_10', query, page: null, currentValue: { ...totals }, previousValue: previousQuery.get(query) ?? {} });
    }
    if (totals.avgPosition >= 11 && totals.avgPosition <= 20 && totals.impressions >= 100) {
      candidates.push({ kind: 'POSITION_11_20', query, page: null, currentValue: { ...totals }, previousValue: previousQuery.get(query) ?? {} });
    }
    if (totals.clicks > 0 && !previousQuery.has(query)) {
      candidates.push({ kind: 'NEW_QUERY', query, page: null, currentValue: { ...totals }, previousValue: {} });
    }
  }

  for (const [query, prev] of previousQuery) {
    const now = currentQuery.get(query);
    if (prev.clicks >= opts.minClicks && (!now || now.clicks === 0)) {
      candidates.push({ kind: 'LOST_QUERY', query, page: null, currentValue: now ?? {}, previousValue: { ...prev } });
    }
  }

  for (const [page, totals] of currentPage) {
    const prev = previousPage.get(page);
    if (prev && prev.clicks >= opts.minClicks) {
      if (totals.clicks <= prev.clicks * opts.declineRatio) {
        candidates.push({ kind: 'DECLINING_PAGE', query: null, page, currentValue: { ...totals }, previousValue: { ...prev } });
      }
      if (totals.clicks >= prev.clicks * opts.riseRatio && totals.clicks >= opts.minClicks) {
        candidates.push({ kind: 'RISING_PAGE', query: null, page, currentValue: { ...totals }, previousValue: { ...prev } });
      }
      const impressionsStable = totals.impressions >= prev.impressions * 0.5;
      const clicksDeclined = totals.clicks <= prev.clicks * 0.6;
      const positionWorsened = totals.avgPosition > prev.avgPosition;
      if (impressionsStable && clicksDeclined && positionWorsened) {
        candidates.push({ kind: 'CONTENT_DECAY', query: null, page, currentValue: { ...totals }, previousValue: { ...prev } });
      }
    }
  }

  candidates.push(...detectQueryUrlConflicts(current, opts));

  return candidates;
}

/** QUERY_URL_CONFLICT: the same query is served by multiple pages. */
function detectQueryUrlConflicts(
  current: GscDailyMetricRecord[],
  opts: Required<OpportunityDetectionOptions>,
): OpportunityCandidate[] {
  const queryPages = new Map<string, Map<string, number>>();
  for (const row of current) {
    if (!row.query || !row.page) continue;
    if (row.impressions < opts.conflictMinImpressions) continue;
    const pages = queryPages.get(row.query) ?? new Map<string, number>();
    pages.set(row.page, (pages.get(row.page) ?? 0) + row.clicks);
    queryPages.set(row.query, pages);
  }
  const out: OpportunityCandidate[] = [];
  for (const [query, pages] of queryPages) {
    if (pages.size < 2) continue;
    out.push({
      kind: 'QUERY_URL_CONFLICT',
      query,
      page: null,
      currentValue: { pages: Array.from(pages.entries()).sort((a, b) => b[1] - a[1]) },
      previousValue: {},
    });
  }
  return out;
}

function aggregateByQuery(rows: GscDailyMetricRecord[]): Map<string, { clicks: number; impressions: number; ctr: number; avgPosition: number }> {
  const buckets = new Map<string, GscDailyMetricRecord[]>();
  for (const row of rows) {
    if (!row.query) continue;
    const list = buckets.get(row.query) ?? [];
    list.push(row);
    buckets.set(row.query, list);
  }
  return mapTotals(buckets);
}

function aggregateByPage(rows: GscDailyMetricRecord[]): Map<string, { clicks: number; impressions: number; ctr: number; avgPosition: number }> {
  const buckets = new Map<string, GscDailyMetricRecord[]>();
  for (const row of rows) {
    if (!row.page) continue;
    const list = buckets.get(row.page) ?? [];
    list.push(row);
    buckets.set(row.page, list);
  }
  return mapTotals(buckets);
}

function mapTotals(
  buckets: Map<string, GscDailyMetricRecord[]>,
): Map<string, { clicks: number; impressions: number; ctr: number; avgPosition: number }> {
  const out = new Map<string, { clicks: number; impressions: number; ctr: number; avgPosition: number }>();
  for (const [key, group] of buckets) {
    out.set(key, summarize(group));
  }
  return out;
}

import type { GscDailyMetricRecord } from './sync';

export interface MetricTotals {
  clicks: number;
  impressions: number;
  /** clicks / impressions, 0 when there are no impressions. */
  ctr: number;
  /** Impressions-weighted average of Search Console positions. */
  avgPosition: number;
}

/**
 * Summarizes rows. avgPosition is impressions-weighted because Search Console
 * positions are per-row averages across users/impressions.
 */
export function summarize(rows: GscDailyMetricRecord[]): MetricTotals {
  let clicks = 0;
  let impressions = 0;
  let positionWeighted = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    positionWeighted += row.position * row.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    avgPosition: impressions > 0 ? positionWeighted / impressions : 0,
  };
}

export function groupByDate(rows: GscDailyMetricRecord[]): Array<{ date: string; totals: MetricTotals }> {
  const buckets = new Map<string, GscDailyMetricRecord[]>();
  for (const row of rows) {
    const list = buckets.get(row.metricDate) ?? [];
    list.push(row);
    buckets.set(row.metricDate, list);
  }
  return Array.from(buckets.entries())
    .map(([date, group]) => ({ date, totals: summarize(group) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function groupByDimension(
  rows: GscDailyMetricRecord[],
  dimension: 'query' | 'page' | 'country' | 'device',
): Array<{ key: string; totals: MetricTotals }> {
  const buckets = new Map<string, GscDailyMetricRecord[]>();
  for (const row of rows) {
    const key = row[dimension];
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }
  return Array.from(buckets.entries())
    .map(([key, group]) => ({ key, totals: summarize(group) }))
    .sort((a, b) => b.totals.clicks - a.totals.clicks || b.totals.impressions - a.totals.impressions);
}

import type { PeriodPerformanceDto } from '@creative-seo/types';

export interface TestRow {
  clicks: number;
  impressions: number;
  position: number | null;
  ctr: number;
}

/**
 * Pure period aggregation for a single grain. CTR is computed from summed
 * clicks/impressions (never an average of daily CTR). Average position is
 * impression-weighted; null when it cannot be computed from persisted data.
 */
export function aggregateForTest(rows: TestRow[]): PeriodPerformanceDto & { clicks: number; impressions: number } {
  const clicks = rows.reduce((total, row) => total + Number(row.clicks), 0);
  const impressions = rows.reduce((total, row) => total + Number(row.impressions), 0);
  const ctr = impressions > 0 ? round2(clicks / impressions) : 0;

  const weightedNumerator = rows.reduce(
    (total, row) => total + (row.position ?? 0) * Number(row.impressions),
    0,
  );
  const weightedImpressions = rows.reduce((total, row) => total + Number(row.impressions), 0);

  let averagePosition: number | null = null;
  let positionMethod: PeriodPerformanceDto['positionMethod'] = 'unavailable';
  if (weightedImpressions > 0 && rows.some((row) => row.position !== null)) {
    averagePosition = round2(weightedNumerator / weightedImpressions);
    positionMethod = 'weighted';
  }

  return { clicks, impressions, ctr, averagePosition, positionMethod };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

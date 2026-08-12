import {
  GscClient,
  type GscTokens,
  searchAnalyticsUrl,
  shiftDateString,
  toDateString,
} from './client';

/** One row in the gsc_daily_metrics fact table. Empty string = dimension not split. */
export interface GscDailyMetricRecord {
  propertyId: string;
  metricDate: string;
  query: string;
  page: string;
  country: string;
  device: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscSyncStateRecord {
  propertyId: string;
  dimensionsKey: string;
  lastSyncDate: string;
  lastSuccessAt: Date;
}

export interface GscSyncRepos {
  metrics: {
    upsertRows(rows: GscDailyMetricRecord[]): Promise<void>;
  };
  syncStates: {
    find(propertyId: string, dimensionsKey: string): Promise<GscSyncStateRecord | null>;
    save(record: GscSyncStateRecord): Promise<void>;
  };
}

export interface GscSyncInput {
  propertyId: string;
  siteUrl: string;
  tokens: GscTokens;
  dimensions?: string[];
  startDate?: string;
  endDate?: string;
  rowLimit?: number;
  lookbackDays?: number;
}

export interface GscSyncResult {
  rows: number;
  startDate: string;
  endDate: string;
  dimensions: string[];
}

const DEFAULT_ROW_LIMIT = 25_000;
const CHUNK_SIZE = 1_000;

/**
 * Incremental, idempotent import of Search Analytics daily metrics.
 *
 * - Syncs the window `(lastSyncDate + 1) .. endDate` (defaults to yesterday),
 *   so backfills work and repeated runs converge without duplicates.
 * - Only INSERT ... ON CONFLICT UPDATE: historical rows are never deleted.
 * - Supports the dimension breakdowns: date, query, page, country, device.
 */
export class GscSyncService {
  constructor(
    private readonly client: GscClient,
    private readonly repos: GscSyncRepos,
  ) {}

  async sync(input: GscSyncInput): Promise<GscSyncResult> {
    const dimensions = normalizeDimensions(input.dimensions);
    const dimensionsKey = dimensions.join(',');
    const rowLimit = input.rowLimit ?? DEFAULT_ROW_LIMIT;
    const endDate = input.endDate ?? toDateString(yesterday());

    const state = await this.repos.syncStates.find(input.propertyId, dimensionsKey);
    let startDate = input.startDate;
    if (!startDate) {
      const lookback = input.lookbackDays ?? 28;
      startDate = state?.lastSyncDate
        ? shiftDateString(state.lastSyncDate, 1)
        : shiftDateString(endDate, -(lookback - 1));
    }
    if (startDate > endDate) {
      return { rows: 0, startDate, endDate, dimensions };
    }

    const records: GscDailyMetricRecord[] = [];
    let startRow = 0;
    let fetched = rowLimit;
    while (fetched >= rowLimit) {
      const rows = await this.client.searchAnalytics(input.tokens, input.siteUrl, {
        startDate,
        endDate,
        dimensions,
        rowLimit,
        startRow,
      });
      records.push(...rows.map((row) => toRecord(input.propertyId, dimensions, row)));
      fetched = rows.length;
      startRow += rowLimit;
    }

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      await this.repos.metrics.upsertRows(records.slice(i, i + CHUNK_SIZE));
    }

    await this.repos.syncStates.save({
      propertyId: input.propertyId,
      dimensionsKey,
      lastSyncDate: endDate,
      lastSuccessAt: new Date(),
    });

    return { rows: records.length, startDate, endDate, dimensions };
  }

  /** Convenience URL builder (used by tests and tooling). */
  urlFor(siteUrl: string): string {
    return searchAnalyticsUrl(siteUrl);
  }
}

export function normalizeDimensions(dimensions: string[] | undefined): string[] {
  const valid = ['date', 'query', 'page', 'country', 'device'];
  const requested = Array.from(new Set(dimensions ?? [])).filter((dimension) => valid.includes(dimension));
  if (!requested.includes('date')) {
    requested.unshift('date');
  }
  return requested;
}

export function toRecord(
  propertyId: string,
  dimensions: string[],
  row: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number },
): GscDailyMetricRecord {
  const get = (dimension: string): string => {
    const index = dimensions.indexOf(dimension);
    return index >= 0 ? (row.keys[index] ?? '') : '';
  };
  return {
    propertyId,
    metricDate: get('date'),
    query: get('query'),
    page: get('page'),
    country: get('country'),
    device: get('device'),
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  };
}

function yesterday(): Date {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return now;
}

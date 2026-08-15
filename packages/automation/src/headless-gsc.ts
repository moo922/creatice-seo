import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GscDailyMetric, GscOpportunity, GscProperty, GscSyncState, GscToken } from '@creative-seo/database';
import { Repository } from 'typeorm';
import { loadAppEnv } from '@creative-seo/config';
import { AesEncryptor } from '@creative-seo/ai';
import type { GscDimension, GscOpportunityKind } from '@creative-seo/types';
import { HeadlessGscClient, gscRowKey } from './gsc-client';

export interface HeadlessGscResult {
  rows: number;
  days: number;
  failedSets: number;
  propertyConnected: boolean;
  message: string;
}

const DIMENSION_COLUMNS = ['query', 'page', 'country', 'device'] as const;

/**
 * Headless incremental Search Console sync for scheduled runs. Runs with no
 * auth principal, so it never asserts user access — the site's stored property
 * and (encrypted) tokens are used directly. Rows are appended/updated, never
 * deleted, preserving history exactly like the interactive sync.
 */
@Injectable()
export class HeadlessGscService {
  private readonly logger = new Logger(HeadlessGscService.name);

  constructor(
    @InjectRepository(GscProperty) private readonly properties: Repository<GscProperty>,
    @InjectRepository(GscToken) private readonly tokens: Repository<GscToken>,
    @InjectRepository(GscDailyMetric) private readonly metrics: Repository<GscDailyMetric>,
    @InjectRepository(GscSyncState) private readonly syncStates: Repository<GscSyncState>,
    @InjectRepository(GscOpportunity) private readonly opportunities: Repository<GscOpportunity>,
    private readonly encryptor: AesEncryptor,
  ) {}

  async sync(siteId: string): Promise<HeadlessGscResult> {
    const env = loadAppEnv();
    if (!env.GSC_CLIENT_ID || !env.GSC_CLIENT_SECRET) {
      return { rows: 0, days: 0, failedSets: 0, propertyConnected: false, message: 'GSC OAuth credentials are not configured on the server' };
    }

    const property = await this.properties.findOne({ where: { siteId } });
    if (!property || property.status !== 'CONNECTED') {
      return { rows: 0, days: 0, failedSets: 0, propertyConnected: false, message: 'No connected Search Console property for this site' };
    }

    const accessToken = await this.accessToken(siteId);
    const client = new HeadlessGscClient({
      clientId: env.GSC_CLIENT_ID,
      clientSecret: env.GSC_CLIENT_SECRET,
      apiBase: env.GSC_API_BASE,
      tokenBase: env.GSC_TOKEN_BASE,
    });

    const configured = env.GSC_SYNC_DIMENSIONS.split(',')
      .map((dimension) => dimension.trim())
      .filter((dimension): dimension is GscDimension => (DIMENSION_COLUMNS as readonly string[]).includes(dimension));
    const dimensionSets = this.deriveDimensionSets(configured);

    const endDate = this.today();
    const startDate = this.addDays(endDate, -(env.GSC_SYNC_LOOKBACK_DAYS - 1));

    const counters = { rows: 0, days: 0, failedSets: 0 };
    const failures: string[] = [];

    for (const dimensions of dimensionSets) {
      try {
        const rows = await this.syncDimensionSet(client, property, accessToken, dimensions, startDate, endDate);
        counters.rows += rows;
      } catch (error) {
        counters.failedSets += 1;
        const message = error instanceof Error ? error.message : 'sync failed';
        failures.push(`${dimensions.join(',')}: ${message}`);
        this.logger.warn(`[automation.gsc] dimensions=${dimensions.join(',')} failed: ${message}`);
      }
    }

    property.lastSyncAt = new Date();
    property.lastError = failures.length > 0 ? failures.join('; ') : null;
    await this.properties.save(property);

    await this.detectOpportunities(client, property, accessToken, startDate, endDate);

    return {
      rows: counters.rows,
      days: counters.days,
      failedSets: counters.failedSets,
      propertyConnected: true,
      message: failures.length > 0 ? `Synced with ${failures.length} dimension set failure(s)` : 'Search Console sync complete',
    };
  }

  private async accessToken(siteId: string): Promise<string> {
    const row = await this.tokens.findOne({ where: { siteId } });
    if (!row) {
      throw new Error('Search Console is not connected; start OAuth first');
    }
    const accessToken = this.encryptor.decrypt(row.accessTokenEncrypted);
    if (row.accessTokenExpiresAt.getTime() - 60_000 > Date.now()) {
      return accessToken;
    }
    const refreshToken = this.encryptor.decrypt(row.refreshTokenEncrypted);
    const env = loadAppEnv();
    const client = new HeadlessGscClient({
      clientId: env.GSC_CLIENT_ID,
      clientSecret: env.GSC_CLIENT_SECRET,
      apiBase: env.GSC_API_BASE,
      tokenBase: env.GSC_TOKEN_BASE,
    });
    const refreshed = await client.refreshAccessToken(refreshToken);
    row.accessTokenEncrypted = this.encryptor.encrypt(refreshed.access_token);
    row.accessTokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await this.tokens.save(row);
    return refreshed.access_token;
  }

  private async syncDimensionSet(
    client: HeadlessGscClient,
    property: GscProperty,
    accessToken: string,
    dimensions: GscDimension[],
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const key = dimensions.join(',');
    const state = await this.syncStates.findOne({ where: { propertyId: property.id, dimensionsKey: key } });
    const day = state ? state.lastSyncDate : startDate;
    let total = 0;
    for (let cursor = day; cursor <= endDate; cursor = this.addDays(cursor, 1)) {
      const response = await client.searchAnalytics(accessToken, property.siteUrl, cursor, cursor, dimensions);
      total += await this.upsertMetricsDay(property.id, cursor, dimensions, response.rows ?? []);
    }
    await this.syncStates.save(
      this.syncStates.create({ propertyId: property.id, dimensionsKey: key, lastSyncDate: endDate, lastSuccessAt: new Date() }),
    );
    return total;
  }

  private async upsertMetricsDay(propertyId: string, date: string, dimensions: GscDimension[], rows: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>): Promise<number> {
    if (rows.length === 0) return 0;
    const values: unknown[] = [];
    for (const row of rows) {
      const dims: Record<string, string> = {};
      row.keys.forEach((value, index) => {
        const dimension = dimensions[index];
        if (dimension) dims[dimension] = value;
      });
      values.push(
        propertyId,
        date,
        dims.query ?? '',
        dims.page ?? '',
        dims.country ?? '',
        dims.device ?? '',
        gscRowKey(row.keys),
        row.clicks,
        row.impressions,
        row.ctr,
        row.position,
      );
    }

    const CHUNK = 500;
    let written = 0;
    for (let i = 0; i < values.length; i += CHUNK * 11) {
      const chunk = values.slice(i, i + CHUNK * 11);
      const rowCount = chunk.length / 11;
      const placeholders = chunk.map((_, index) => {
        const col = (index % 11) + 1;
        return `$${index + 1}::${metricColumnType(col)}`;
      });
      const joined = Array.from({ length: rowCount }, (_, rowIndex) =>
        `(${placeholders.slice(rowIndex * 11, rowIndex * 11 + 11).join(', ')})`,
      ).join(', ');
      await this.metrics.query(
        `
        INSERT INTO "gsc_daily_metrics"
          ("property_id", "metric_date", "query", "page", "country", "device", "row_key",
           "clicks", "impressions", "ctr", "position")
        VALUES ${joined}
        ON CONFLICT ("property_id", "metric_date", "row_key") DO UPDATE SET
          "clicks" = EXCLUDED."clicks",
          "impressions" = EXCLUDED."impressions",
          "ctr" = EXCLUDED."ctr",
          "position" = EXCLUDED."position",
          "updated_at" = now()
        `,
        chunk,
      );
      written += rowCount;
    }
    return written;
  }

  private async detectOpportunities(
    client: HeadlessGscClient,
    property: GscProperty,
    accessToken: string,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    void client;
    void accessToken;
    try {
      const windowDays = this.dayDiff(startDate, endDate) + 1;
      const previousEnd = this.addDays(startDate, -1);
      const previousStart = this.addDays(previousEnd, -(windowDays - 1));

      const current = await this.queryAggregates(property.id, startDate, endDate);
      const previous = await this.queryAggregates(property.id, previousStart, previousEnd);
      const previousByKey = new Map(previous.map((row) => [row.key, row]));

      const detections: Array<{ kind: GscOpportunityKind; query: string | null; page: string | null; current: Record<string, unknown>; previous: Record<string, unknown> }> = [];

      for (const row of current) {
        const prev = previousByKey.get(row.key);
        for (const detection of applyQueryRules(row, prev)) {
          detections.push(detection);
        }
      }
      const currentKeys = new Set(current.map((row) => row.key));
      for (const row of previous) {
        if (!currentKeys.has(row.key)) {
          detections.push({
            kind: 'LOST_QUERY',
            query: row.key,
            page: null,
            current: { clicks: 0, impressions: 0 },
            previous: { clicks: row.clicks, impressions: row.impressions, position: row.avgPosition },
          });
        }
      }

      if (detections.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < detections.length; i += CHUNK) {
          const chunk = detections.slice(i, i + CHUNK);
          const values = chunk.flatMap((detection) => [
            property.id,
            detection.kind,
            detection.query,
            detection.page,
            'OPEN',
            startDate,
            endDate,
            JSON.stringify(detection.current),
            JSON.stringify(detection.previous),
          ]);
          const placeholders = values.map((_, index) => {
            const col = (index % 9) + 1;
            return `$${index + 1}::${opportunityColumnType(col)}`;
          });
          const rows = chunk.map((_, index) => `(${placeholders.slice(index * 9, index * 9 + 9).join(', ')})`).join(', ');
          await this.opportunities.query(
            `
            INSERT INTO "gsc_opportunities"
              ("property_id", "kind", "query", "page", "status",
               "window_start", "window_end", "current_value", "previous_value")
            VALUES ${rows}
            ON CONFLICT DO NOTHING
            `,
            values,
          );
        }
      }
      this.logger.log(`[automation.gsc.opportunities] ${detections.length} candidate(s) for site ${property.siteId}`);
    } catch (error) {
      this.logger.warn(`[automation.gsc.opportunities] detection failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private async queryAggregates(
    propertyId: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ key: string; clicks: number; impressions: number; ctr: number; avgPosition: number }>> {
    const rows: Array<{ key: string; clicks: string; impressions: string; ctr: string; position: string }> = await this.metrics.query(
      `
      SELECT
        NULLIF("query", '') AS key,
        COALESCE(SUM("clicks"), 0)::bigint AS clicks,
        COALESCE(SUM("impressions"), 0)::bigint AS impressions,
        CASE WHEN SUM("impressions") > 0 THEN (SUM("clicks")::double precision / SUM("impressions")) * 100 ELSE 0 END AS ctr,
        CASE WHEN SUM("impressions") > 0 THEN SUM("position" * "impressions") / SUM("impressions") ELSE 0 END AS position
      FROM "gsc_daily_metrics"
      WHERE "property_id" = $1 AND "metric_date" BETWEEN $2 AND $3 AND "query" <> ''
      GROUP BY 1
      `,
      [propertyId, startDate, endDate],
    );
    return rows.map((row) => ({
      key: row.key as string,
      clicks: Number(row.clicks),
      impressions: Number(row.impressions),
      ctr: Number(row.ctr),
      avgPosition: Number(row.position),
    }));
  }

  private deriveDimensionSets(configured: GscDimension[]): GscDimension[][] {
    const base: GscDimension[] = configured.length > 0 ? configured : ['query', 'page'];
    const sets: GscDimension[][] = [base];
    for (const dimension of base) {
      if (dimension !== 'query' && dimension !== 'page') {
        sets.push([dimension]);
      }
    }
    if (!base.includes('query')) sets.push(['query']);
    if (!base.includes('page')) sets.push(['page']);
    return sets;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private addDays(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  private dayDiff(start: string, end: string): number {
    const startMs = new Date(`${start}T00:00:00Z`).getTime();
    const endMs = new Date(`${end}T00:00:00Z`).getTime();
    return Math.round((endMs - startMs) / 86_400_000);
  }
}

function metricColumnType(column: number): string {
  switch (column) {
    case 1:
      return 'uuid';
    case 2:
      return 'date';
    case 8:
    case 9:
      return 'bigint';
    case 10:
    case 11:
      return 'double precision';
    default:
      return 'text';
  }
}

function opportunityColumnType(column: number): string {
  switch (column) {
    case 1:
      return 'uuid';
    case 6:
    case 7:
      return 'date';
    case 8:
    case 9:
      return 'jsonb';
    default:
      return 'text';
  }
}

function applyQueryRules(
  row: { key: string; clicks: number; impressions: number; ctr: number; avgPosition: number },
  prev: { key: string; clicks: number; impressions: number; ctr: number; avgPosition: number } | undefined,
): Array<{ kind: GscOpportunityKind; query: string; page: null; current: Record<string, unknown>; previous: Record<string, unknown> }> {
  const detections: Array<{ kind: GscOpportunityKind; query: string; page: null; current: Record<string, unknown>; previous: Record<string, unknown> }> = [];
  const current = { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.avgPosition };
  const previous = prev ? { clicks: prev.clicks, impressions: prev.impressions, ctr: prev.ctr, position: prev.avgPosition } : { clicks: 0, impressions: 0, ctr: 0, position: 0 };

  if (row.impressions >= 500 && row.ctr < 1) {
    detections.push({ kind: 'HIGH_IMPRESSIONS_LOW_CTR', query: row.key, page: null, current, previous });
  }
  if (row.avgPosition > 0 && row.avgPosition <= 10 && row.avgPosition >= 4) {
    detections.push({ kind: 'POSITION_4_10', query: row.key, page: null, current, previous });
  }
  if (row.avgPosition > 10 && row.avgPosition <= 20) {
    detections.push({ kind: 'POSITION_11_20', query: row.key, page: null, current, previous });
  }
  if (!prev && row.impressions > 0) {
    detections.push({ kind: 'NEW_QUERY', query: row.key, page: null, current, previous });
  }
  return detections;
}

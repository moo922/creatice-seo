import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import {
  GscDailyMetric,
  GscOpportunity,
  GscProperty,
  GscSyncState,
  GscToken,
  Site,
} from '@creative-seo/database';
import type {
  GscMetricTotals,
  GscOpportunitiesQuery,
  GscOpportunityDto,
  GscOpportunityKind,
  GscPerformanceDto,
  GscPerformancePoint,
  GscPerformanceRowDto,
  GscPropertyDto,
  GscSyncResultDto,
  GscDimension,
} from '@creative-seo/types';
import { AppConfig } from '../../config/app-config';
import type { AuthPrincipal } from '../../common/auth.types';
import { SiteAccessService } from '../../common/guards/site-access.service';
import { EncryptionService } from '../../security/encryption.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import type { RequestMeta } from '../secrets/secrets.service';
import { GscClientService, GscClientError, type GscSearchAnalyticsRow } from './gsc-client.service';

const STATE_TTL_MS = 10 * 60 * 1000;
const DIMENSION_COLUMNS = ['query', 'page', 'country', 'device'] as const;

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
}

@Injectable()
export class GscService {
  private readonly logger = new Logger(GscService.name);

  constructor(
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(GscProperty) private readonly properties: Repository<GscProperty>,
    @InjectRepository(GscToken) private readonly tokens: Repository<GscToken>,
    @InjectRepository(GscDailyMetric) private readonly metrics: Repository<GscDailyMetric>,
    @InjectRepository(GscSyncState) private readonly syncStates: Repository<GscSyncState>,
    @InjectRepository(GscOpportunity) private readonly opportunities: Repository<GscOpportunity>,
    private readonly client: GscClientService,
    private readonly config: AppConfig,
    private readonly encryption: EncryptionService,
    private readonly siteAccess: SiteAccessService,
    private readonly activities: ActivityLogService,
  ) {}

  /** Builds the Google OAuth URL for a site (backend-only token storage). */
  async authorizeUrl(siteId: string, actor: AuthPrincipal): Promise<{ authorizationUrl: string }> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    await this.requireSite(siteId);
    const state = this.signState(siteId);
    try {
      return { authorizationUrl: this.client.buildAuthorizeUrl(state) };
    } catch (error) {
      throw asHttp(error);
    }
  }

  /**
   * OAuth redirect target (public — called by Google). Verifies the signed
   * state, exchanges the code, then lists properties and persists the first
   * user-selected property as CONNECTED.
   */
  async handleCallback(siteId: string, query: { code?: string; state?: string; error?: string }): Promise<{ connected: boolean; siteUrl: string | null; error?: string }> {
    if (!query.state) {
      throw new BadRequestException('Missing OAuth state');
    }
    try {
      this.verifyState(query.state, siteId);
    } catch {
      throw new BadRequestException('Invalid or expired OAuth state; start a new connection');
    }
    if (query.error) {
      return { connected: false, siteUrl: null, error: 'Google denied access: ' + query.error };
    }
    if (!query.code) {
      throw new BadRequestException('Missing OAuth authorization code');
    }

    const token = await this.client.exchangeCode(query.code).catch((error) => {
      throw asHttp(error);
    });
    if (!token.refresh_token) {
      throw new BadRequestException('Google did not return a refresh token (access_type=offline was ignored)');
    }
    await this.storeTokens(siteId, {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
    });

    const entries = await this.client.listSites(token.access_token).catch((error) => {
      throw asHttp(error);
    });
    const property = await this.upsertProperty(siteId, entries);
    if (property && entries.length > 0) {
      property.status = 'CONNECTED';
      await this.properties.save(property);
    }

    await this.activities.record({
      action: 'gsc.connect',
      userId: null,
      siteId,
      entityType: 'gsc_property',
      entityId: property?.id ?? null,
      meta: { oauth: true, properties: entries.length },
    });

    return { connected: true, siteUrl: property?.siteUrl ?? entries[0]?.siteUrl ?? null };
  }

  /**
   * Manual token registration (development/testing without browser OAuth).
   * Still lists properties from Google so the site gets a CONNECTED property.
   */
  async registerTokens(
    siteId: string,
    dto: { accessToken: string; refreshToken: string; expiresIn?: number },
    actor: AuthPrincipal,
    meta: RequestMeta = {},
  ): Promise<GscPropertyDto | null> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    await this.requireSite(siteId);
    await this.storeTokens(siteId, {
      accessToken: dto.accessToken,
      refreshToken: dto.refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + (dto.expiresIn ?? this.config.env.GSC_ACCESS_TOKEN_TTL) * 1000),
    });

    const entries = await this.client.listSites(dto.accessToken).catch((error) => {
      throw asHttp(error);
    });
    const property = await this.upsertProperty(siteId, entries);
    if (property) {
      property.status = 'CONNECTED';
      property.lastError = null;
      await this.properties.save(property);
    }

    const site = await this.sites.findOne({ where: { id: siteId } });
    await this.activities.record({
      action: 'gsc.connect',
      userId: actor.id,
      organizationId: site?.organizationId ?? null,
      siteId,
      entityType: 'gsc_property',
      entityId: property?.id ?? null,
      meta: { oauth: false, properties: entries.length },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return property ? this.toPropertyDto(property) : null;
  }

  /** Connection status: stored property plus whether an active token exists. */
  async status(siteId: string, actor: AuthPrincipal): Promise<{
    property: GscPropertyDto | null;
    connected: boolean;
    tokenExpiresAt: string | null;
    clientConfigured: boolean;
  }> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const property = await this.properties.findOne({ where: { siteId } });
    const token = await this.tokens.findOne({ where: { siteId } });
    return {
      property: property ? this.toPropertyDto(property) : null,
      connected: Boolean(property && token),
      tokenExpiresAt: token?.accessTokenExpiresAt ? token.accessTokenExpiresAt.toISOString() : null,
      clientConfigured: Boolean(this.config.env.GSC_CLIENT_ID && this.config.env.GSC_CLIENT_SECRET),
    };
  }

  /** Raw property list from Google (for the connection picker). */
  async listCandidateProperties(siteId: string, actor: AuthPrincipal): Promise<Array<{ siteUrl: string; permissionLevel: string }>> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const accessToken = await this.getAccessToken(siteId);
    return this.client.listSites(accessToken).catch((error) => {
      throw asHttp(error);
    });
  }

  /** Selects which connected property the site syncs against. */
  async selectProperty(
    siteId: string,
    dto: { siteUrl: string; permissionLevel?: string; type?: 'URL_PREFIX' | 'DOMAIN' },
    actor: AuthPrincipal,
    meta: RequestMeta = {},
  ): Promise<GscPropertyDto> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const site = await this.requireSite(siteId);
    await this.getAccessToken(siteId);

    const existing = await this.properties.findOne({ where: { siteId } });
    const property = existing ?? this.properties.create({ siteId });
    property.siteUrl = dto.siteUrl;
    if (dto.permissionLevel) property.permissionLevel = dto.permissionLevel;
    if (dto.type) property.type = dto.type;
    property.selected = true;
    property.status = 'CONNECTED';
    property.lastError = null;
    const saved = await this.properties.save(property);

    await this.activities.record({
      action: 'gsc.property.select',
      userId: actor.id,
      organizationId: site.organizationId,
      siteId,
      entityType: 'gsc_property',
      entityId: saved.id,
      meta: { siteUrl: dto.siteUrl },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.toPropertyDto(saved);
  }

  /**
   * Incremental Search Analytics sync. Runs per-day queries for each configured
   * dimension set and upserts rows into gsc_daily_metrics. Rows are never
   * deleted; only appended/updated, so history is preserved.
   */
  async sync(
    siteId: string,
    query: { dimensions?: GscDimension[]; startDate?: string; endDate?: string },
    actor: AuthPrincipal,
    meta: RequestMeta = {},
  ): Promise<GscSyncResultDto> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const site = await this.requireSite(siteId);
    const property = await this.properties.findOne({ where: { siteId } });
    if (!property || property.status !== 'CONNECTED') {
      throw new BadRequestException('No connected Search Console property for this site');
    }
    const accessToken = await this.getAccessToken(siteId);

    const configured = this.config.env.GSC_SYNC_DIMENSIONS.split(',')
      .map((d) => d.trim())
      .filter((d): d is GscDimension => (DIMENSION_COLUMNS as readonly string[]).includes(d));
    const dimensionSets = query.dimensions?.length ? [query.dimensions] : this.deriveDimensionSets(configured);

    const endDate = query.endDate ?? this.today();
    const lookback = this.config.env.GSC_SYNC_LOOKBACK_DAYS;
    const startDate = query.startDate ?? this.addDays(endDate, -(lookback - 1));

    const counters = { rows: 0, days: 0, failedSets: 0 };
    const failures: string[] = [];

    for (const dimensions of dimensionSets) {
      try {
        const rows = await this.syncDimensionSet(property, accessToken, dimensions, startDate, endDate);
        counters.rows += rows;
      } catch (error) {
        counters.failedSets += 1;
        const message = errorMessage(error, 'sync failed');
        failures.push(`${dimensions.join(',')}: ${message}`);
        this.logger.warn(`[gsc.sync] dimensions=${dimensions.join(',')} failed: ${message}`);
      }
    }

    property.lastSyncAt = new Date();
    property.lastError = failures.length > 0 ? failures.join('; ') : null;
    await this.properties.save(property);

    await this.activities.record({
      action: 'gsc.sync',
      userId: actor.id,
      organizationId: site.organizationId,
      siteId,
      entityType: 'gsc_property',
      entityId: property.id,
      meta: { rows: counters.rows, days: counters.days, dimensionSets: dimensionSets.length, failures },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    await this.detectOpportunities(property, startDate, endDate, actor.id);

    return {
      siteId,
      properties: [
        {
          siteUrl: property.siteUrl,
          rows: counters.rows,
          startDate,
          endDate,
        },
      ],
    };
  }

  /** Aggregated performance read from stored metrics, with period comparison. */
  async performance(
    siteId: string,
    query: { dimension?: GscDimension; startDate?: string; endDate?: string },
    actor: AuthPrincipal,
  ): Promise<GscPerformanceDto> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const property = await this.properties.findOne({ where: { siteId } });
    if (!property) {
      throw new NotFoundException('Search Console is not connected for this site');
    }

    const dimension = query.dimension ?? 'query';
    const endDate = query.endDate ?? this.today();
    const windowDays = this.config.env.GSC_SYNC_LOOKBACK_DAYS;
    const currentStart = query.startDate ?? this.addDays(endDate, -(windowDays - 1));
    const previousStart = this.addDays(currentStart, -windowDays);
    const previousEnd = this.addDays(currentStart, -1);

    const rows = await this.aggregateWindow(property.id, dimension, currentStart, endDate);
    const prevRows = await this.aggregateWindow(property.id, dimension, previousStart, previousEnd);
    const previousTotals = sumTotals(prevRows.map((row) => row.totals));
    const currentTotals = sumTotals(rows.map((row) => row.totals));

    const previousByKey = new Map(prevRows.map((r) => [r.key, r.totals]));

    const series = await this.buildSeries(property.id, dimension, currentStart, endDate);

    return {
      siteId,
      siteUrl: property.siteUrl,
      dimension,
      comparison: 'prev28',
      currentWindow: { startDate: currentStart, endDate },
      previousWindow: { startDate: previousStart, endDate: previousEnd },
      totals: currentTotals,
      previousTotals,
      rows: rows.map<GscPerformanceRowDto>((row) => {
        const previous = previousByKey.get(row.key) ?? {
          clicks: 0,
          impressions: 0,
          ctr: 0,
          avgPosition: 0,
        };
        return {
          key: row.key,
          totals: row.totals,
          previousTotals: previous,
          deltas: {
            clicksPct: percentDelta(previous.clicks, row.totals.clicks),
            impressionsPct: percentDelta(previous.impressions, row.totals.impressions),
            ctrDelta: toFixedDelta(previous.ctr, row.totals.ctr),
            avgPositionDelta: toFixedDelta(previous.avgPosition, row.totals.avgPosition),
          },
          series: series.get(row.key) ?? [],
        };
      }),
      note: 'avgPosition values come from Search Console and are averages across users, impressions and pages. They are directional, not exact universal ranks.',
    };
  }

  async listOpportunities(
    siteId: string,
    query: GscOpportunitiesQuery,
    actor: AuthPrincipal,
  ): Promise<{ data: GscOpportunityDto[]; total: number }> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const property = await this.properties.findOne({ where: { siteId } });
    if (!property) {
      return { data: [], total: 0 };
    }

    const endDate = query.windowDays ? this.today() : this.today();
    const windowStart = this.addDays(endDate, -((query.windowDays ?? 28) - 1));
    const where: Record<string, unknown> = { propertyId: property.id, status: query.status ?? 'OPEN' };
    if (query.kind) {
      where.kind = query.kind;
    }
    const [rows, total] = await this.opportunities.findAndCount({
      where,
      order: { detectedAt: 'DESC' },
      take: 100,
    });
    return {
      data: rows.filter((row) => row.windowEnd >= windowStart).map((row) => this.toOpportunityDto(row, property)),
      total,
    };
  }

  async disconnect(siteId: string, actor: AuthPrincipal, meta: RequestMeta = {}): Promise<void> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const site = await this.sites.findOne({ where: { id: siteId } });
    const property = await this.properties.findOne({ where: { siteId } });
    await this.tokens.delete({ siteId });
    if (property) {
      await this.metrics.delete({ propertyId: property.id });
      await this.opportunities.delete({ propertyId: property.id });
      await this.syncStates.delete({ propertyId: property.id });
      await this.properties.delete({ siteId });
    }
    await this.activities.record({
      action: 'gsc.disconnect',
      userId: actor.id,
      organizationId: site?.organizationId ?? null,
      siteId,
      entityType: 'gsc_property',
      entityId: property?.id ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  // ---- internals ----

  private async syncDimensionSet(
    property: GscProperty,
    accessToken: string,
    dimensions: GscDimension[],
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const state = await this.syncStates.findOne({ where: { propertyId: property.id, dimensionsKey: dimensions.join(',') } });
    const day = state ? state.lastSyncDate : startDate;
    let total = 0;

    for (let cursor = day; cursor <= endDate; cursor = this.addDays(cursor, 1)) {
      const response = await this.client.searchAnalytics(accessToken, property.siteUrl, cursor, cursor, dimensions);
      total += await this.upsertMetricsDay(property.id, cursor, dimensions, response.rows ?? []);
    }

    await this.syncStates.save(
      this.syncStates.create({
        propertyId: property.id,
        dimensionsKey: dimensions.join(','),
        lastSyncDate: endDate,
        lastSuccessAt: new Date(),
      }),
    );
    return total;
  }

  private async upsertMetricsDay(propertyId: string, date: string, dimensions: GscDimension[], rows: GscSearchAnalyticsRow[]): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    const values: unknown[] = [];
    for (const row of rows) {
      const dims: Record<string, string> = {};
      row.keys.forEach((value, index) => {
        const dimension = dimensions[index];
        if (dimension) {
          dims[dimension] = value;
        }
      });
      values.push(
        propertyId,
        date,
        dims.query ?? '',
        dims.page ?? '',
        dims.country ?? '',
        dims.device ?? '',
        rowKey(row.keys),
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

  private async storeTokens(siteId: string, tokens: StoredTokens): Promise<void> {
    const existing = await this.tokens.findOne({ where: { siteId } });
    const row = existing ?? this.tokens.create({ siteId });
    row.accessTokenEncrypted = this.encryption.encrypt(tokens.accessToken);
    row.refreshTokenEncrypted = this.encryption.encrypt(tokens.refreshToken);
    row.accessTokenExpiresAt = tokens.accessTokenExpiresAt;
    await this.tokens.save(row);
  }

  /** Returns a valid access token, transparently refreshing when expired. */
  private async getAccessToken(siteId: string): Promise<string> {
    const row = await this.tokens.findOne({ where: { siteId } });
    if (!row) {
      throw new BadRequestException('Search Console is not connected; start OAuth first');
    }
    let accessToken: string;
    try {
      accessToken = this.encryption.decrypt(row.accessTokenEncrypted);
    } catch {
      throw new BadRequestException('Stored Search Console token is corrupted; reconnect the account');
    }

    if (row.accessTokenExpiresAt.getTime() - 60_000 > Date.now()) {
      return accessToken;
    }

    let refreshToken: string;
    try {
      refreshToken = this.encryption.decrypt(row.refreshTokenEncrypted);
    } catch {
      throw new BadRequestException('Stored Search Console refresh token is corrupted; reconnect the account');
    }
    const refreshed = await this.client.refreshAccessToken(refreshToken).catch((error) => {
      throw asHttp(error);
    });
    row.accessTokenEncrypted = this.encryption.encrypt(refreshed.access_token);
    row.accessTokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await this.tokens.save(row);
    return refreshed.access_token;
  }

  private async upsertProperty(siteId: string, entries: Array<{ siteUrl: string; permissionLevel: string }>): Promise<GscProperty | null> {
    if (entries.length === 0) {
      return null;
    }
    const existing = await this.properties.findOne({ where: { siteId } });
    const entry = existing
      ? entries.find((e) => e.siteUrl === existing.siteUrl) ?? entries[0]!
      : entries[0]!;
    const property = existing ?? this.properties.create({ siteId });
    property.siteUrl = entry.siteUrl;
    property.permissionLevel = entry.permissionLevel;
    property.type = entry.siteUrl.startsWith('sc-domain:') ? 'DOMAIN' : 'URL_PREFIX';
    if (!existing) {
      property.selected = true;
      property.status = 'CONNECTED';
    }
    return this.properties.save(property);
  }

  private async requireSite(siteId: string): Promise<Site> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    return site;
  }

  private async aggregateWindow(propertyId: string, dimension: GscDimension, startDate: string, endDate: string): Promise<Array<{ key: string; totals: GscMetricTotals }>> {
    const column = this.dimensionColumn(dimension);
    const rows: Array<{ key: string; clicks: string; impressions: string; ctr: string; position: string }> =
      await this.metrics.query(
        `
        SELECT
          NULLIF("${column}", '') AS key,
          COALESCE(SUM("clicks"), 0)::bigint AS clicks,
          COALESCE(SUM("impressions"), 0)::bigint AS impressions,
          CASE WHEN SUM("impressions") > 0 THEN (SUM("clicks")::double precision / SUM("impressions")) * 100 ELSE 0 END AS ctr,
          CASE WHEN SUM("impressions") > 0 THEN SUM("position" * "impressions") / SUM("impressions") ELSE 0 END AS position
        FROM "gsc_daily_metrics"
        WHERE "property_id" = $1 AND "metric_date" BETWEEN $2 AND $3 AND "${column}" <> ''
        GROUP BY 1
        ORDER BY impressions DESC
        LIMIT 500
        `,
        [propertyId, startDate, endDate],
      );
    return rows
      .filter((row) => row.key)
      .map((row) => ({
        key: row.key as string,
        totals: { clicks: Number(row.clicks), impressions: Number(row.impressions), ctr: Number(row.ctr), avgPosition: Number(row.position) },
      }));
  }

  private async buildSeries(
    propertyId: string,
    dimension: GscDimension,
    startDate: string,
    endDate: string,
  ): Promise<Map<string, GscPerformancePoint[]>> {
    const column = this.dimensionColumn(dimension);
    const rows: Array<{ key: string; metric_date: string; clicks: string; impressions: string; ctr: string; position: string }> =
      await this.metrics.query(
        `
        SELECT
          NULLIF("${column}", '') AS key,
          "metric_date",
          "clicks"::bigint AS clicks,
          "impressions"::bigint AS impressions,
          CASE WHEN "impressions" > 0 THEN ("clicks"::double precision / "impressions") * 100 ELSE 0 END AS ctr,
          CASE WHEN "impressions" > 0 THEN "position" * "impressions" / "impressions" ELSE 0 END AS position
        FROM "gsc_daily_metrics"
        WHERE "property_id" = $1 AND "metric_date" BETWEEN $2 AND $3 AND "${column}" <> ''
        ORDER BY "metric_date"
        `,
        [propertyId, startDate, endDate],
      );
    const series = new Map<string, GscPerformancePoint[]>();
    for (const row of rows) {
      if (!row.key) {
        continue;
      }
      const point: GscPerformancePoint = {
        date: row.metric_date,
        clicks: Number(row.clicks),
        impressions: Number(row.impressions),
        ctr: Number(row.ctr),
        avgPosition: Number(row.position),
      };
      const list = series.get(row.key) ?? [];
      list.push(point);
      series.set(row.key, list);
    }
    return series;
  }

  /** Detects opportunities from the synced window vs the prior window. */
  private async detectOpportunities(property: GscProperty, startDate: string, endDate: string, userId: string | null): Promise<void> {
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
          const rows = chunk
            .map((_, index) => `(${placeholders.slice(index * 9, index * 9 + 9).join(', ')})`)
            .join(', ');
          await this.metrics.query(
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

      const count = detections.length;
      this.logger.log(`[gsc.opportunities] ${count} candidate(s) for site ${property.siteId}`);
      void userId;
    } catch (error) {
      this.logger.warn(`[gsc.opportunities] detection failed: ${errorMessage(error, 'unknown error')}`);
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

  private dimensionColumn(dimension: GscDimension): string {
    if (!(DIMENSION_COLUMNS as readonly string[]).includes(dimension)) {
      throw new BadRequestException(`Unsupported dimension: ${dimension}`);
    }
    return dimension;
  }

  private signState(siteId: string): string {
    const payload = `${siteId}.${randomBytes(8).toString('hex')}.${Date.now() + STATE_TTL_MS}`;
    const signature = createHmac('sha256', this.config.env.JWT_ACCESS_SECRET).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  private verifyState(state: string, siteId: string): void {
    const parts = state.split('.');
    if (parts.length !== 4) {
      throw new BadRequestException('Malformed OAuth state');
    }
    const [stateSiteId, nonce, expiresAt, signature] = parts as [string, string, string, string];
    const expected = createHmac('sha256', this.config.env.JWT_ACCESS_SECRET)
      .update(`${stateSiteId}.${nonce}.${expiresAt}`)
      .digest('base64url');
    const expires = Number(expiresAt);
    if (stateSiteId !== siteId || signature !== expected || !Number.isFinite(expires) || expires < Date.now()) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
  }

  private toPropertyDto(property: GscProperty): GscPropertyDto {
    return {
      id: property.id,
      siteId: property.siteId,
      siteUrl: property.siteUrl,
      type: property.type === 'DOMAIN' ? 'DOMAIN' : 'URL_PREFIX',
      permissionLevel: property.permissionLevel,
      selected: property.selected,
      status: property.status === 'CONNECTED' ? 'CONNECTED' : property.status === 'EXPIRED' ? 'EXPIRED' : 'DISCONNECTED',
      lastSyncAt: property.lastSyncAt ? property.lastSyncAt.toISOString() : null,
      lastError: property.lastError,
      createdAt: property.createdAt.toISOString(),
      updatedAt: property.updatedAt.toISOString(),
    };
  }

  private toOpportunityDto(row: GscOpportunity, property: GscProperty): GscOpportunityDto {
    return {
      id: row.id,
      siteId: property.siteId,
      siteUrl: property.siteUrl,
      kind: row.kind as GscOpportunityKind,
      query: row.query,
      page: row.page,
      status: row.status === 'DISMISSED' ? 'DISMISSED' : row.status === 'ACTIONED' ? 'ACTIONED' : 'OPEN',
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      currentValue: row.currentValue,
      previousValue: row.previousValue,
      detectedAt: row.detectedAt.toISOString(),
    };
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

function rowKey(keys: string[]): string {
  return createHmac('sha1', 'gsc').update(keys.join('\u0001')).digest('hex');
}

/** Casts for gsc_daily_metrics columns (1-indexed, 11 per row). */
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

/** Casts for gsc_opportunities columns (1-indexed, 9 per row). */
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

function sumTotals(totals: GscMetricTotals[]): GscMetricTotals {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const total of totals) {
    clicks += total.clicks;
    impressions += total.impressions;
    weighted += total.avgPosition * total.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    avgPosition: impressions > 0 ? weighted / impressions : 0,
  };
}

function percentDelta(previous: number, current: number): number | null {
  if (previous === 0) {
    return current > 0 ? null : 0;
  }
  return ((current - previous) / previous) * 100;
}

function toFixedDelta(previous: number, current: number): number | null {
  if (previous === 0 && current === 0) {
    return 0;
  }
  return round2(current - previous);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof GscClientError || error instanceof Error) {
    return error.message;
  }
  return fallback;
}

/**
 * Maps GSC client errors to HTTP responses: authorization/config problems and
 * Google 4xx responses become 400; upstream Google 5xx/network failures become
 * 502 Bad Gateway so the client can distinguish "your setup" from "Google down".
 */
function asHttp(error: unknown): BadRequestException | BadGatewayException | ServiceUnavailableException {
  if (error instanceof GscClientError) {
    const status = error.status;
    if (error.kind === 'config') {
      return new ServiceUnavailableException(error.message);
    }
    if (status !== null && status >= 400 && status < 500) {
      return new BadRequestException(error.message);
    }
    return new BadGatewayException(error.message);
  }
  if (error instanceof BadRequestException || error instanceof NotFoundException) {
    return error;
  }
  return new BadGatewayException(errorMessage(error, 'Search Console request failed'));
}

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  GoogleAdsIntegration,
  Keyword,
  KeywordDiscoveryJob,
  KeywordPlannerMetric,
  KeywordSource,
  Site,
  SiteSecret,
} from '@creative-seo/database';
import { Repository } from 'typeorm';
import { AppConfig } from '../../config/app-config';
import { EncryptionService } from '../../security/encryption.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import {
  GoogleAdsClientService,
  GoogleAdsClientError,
  isGoogleAdsClientError,
  type GoogleAdsCredentials,
} from './google-ads-client.service';
import type {
  GoogleAdsIntegrationDto,
  GoogleAdsErrorCode,
  KeywordPlannerJobDto,
  KeywordPlannerJobStatus,
} from '@creative-seo/types';

export interface ConfigureGoogleAdsInput {
  customerId: string;
  developerToken: string;
  refreshToken: string;
  clientId?: string;
  clientSecret?: string;
  language?: string;
  locationTargets?: Array<{ id: string; name: string }>;
}

const SECRET_KIND = 'GOOGLE_ADS';

/**
 * Google Ads integration for the Keyword Intelligence layer.
 *
 * Credentials are stored encrypted in site_secrets (kind GOOGLE_ADS) and NEVER
 * returned to the frontend. This service manages integration state, connection
 * tests, and Keyword Planner jobs. Google Ads failure is graceful — it never
 * disables the keyword engine (GSC + manual + site content continue to work).
 */
@Injectable()
export class GoogleAdsService {
  private readonly logger = new Logger(GoogleAdsService.name);

  constructor(
    @InjectRepository(GoogleAdsIntegration) private readonly integrations: Repository<GoogleAdsIntegration>,
    @InjectRepository(SiteSecret) private readonly secrets: Repository<SiteSecret>,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(Keyword) private readonly keywords: Repository<Keyword>,
    @InjectRepository(KeywordSource) private readonly keywordSources: Repository<KeywordSource>,
    @InjectRepository(KeywordPlannerMetric) private readonly plannerMetrics: Repository<KeywordPlannerMetric>,
    @InjectRepository(KeywordDiscoveryJob) private readonly discoveryJobs: Repository<KeywordDiscoveryJob>,
    private readonly client: GoogleAdsClientService,
    private readonly encryption: EncryptionService,
    private readonly activities: ActivityLogService,
    private readonly config: AppConfig,
  ) {}

  // ------------------------------------------------------------------
  // Status
  // ------------------------------------------------------------------

  async getIntegration(siteId: string): Promise<GoogleAdsIntegrationDto> {
    const row = await this.getOrCreate(siteId);
    return this.toDto(row);
  }

  /** Returns whether Google Ads is available for the keyword engine (graceful degradation). */
  async isAvailable(siteId: string): Promise<{ available: boolean; code: GoogleAdsErrorCode | null }> {
    const row = await this.getOrCreate(siteId);
    if (row.status !== 'CONNECTED') {
      return { available: false, code: null };
    }
    const secret = await this.loadSecret(siteId);
    if (!secret) {
      return { available: false, code: 'AUTH_FAILURE' };
    }
    return { available: true, code: null };
  }

  // ------------------------------------------------------------------
  // Configure
  // ------------------------------------------------------------------

  /** Saves Google Ads credentials (encrypted) and updates the integration row. */
  async configure(siteId: string, input: ConfigureGoogleAdsInput, userId: string | null): Promise<GoogleAdsIntegrationDto> {
    await this.sites.findOne({ where: { id: siteId } }).then((site) => {
      if (!site) throw new NotFoundException('Site not found');
    });

    if (!input.customerId.trim() || !input.developerToken.trim() || !input.refreshToken.trim()) {
      throw new BadRequestException('customerId, developerToken and refreshToken are required');
    }

    const payload = JSON.stringify({
      customerId: input.customerId.trim(),
      developerToken: input.developerToken.trim(),
      refreshToken: input.refreshToken.trim(),
      clientId: input.clientId?.trim() || this.config.env.GOOGLE_ADS_CLIENT_ID,
      clientSecret: input.clientSecret?.trim() || this.config.env.GOOGLE_ADS_CLIENT_SECRET,
    });
    const encrypted = this.encryption.encrypt(payload);

    const existing = await this.secrets.findOne({ where: { siteId, kind: SECRET_KIND }, order: { createdAt: 'DESC' } });
    if (existing) {
      existing.encryptedPayload = encrypted;
      await this.secrets.save(existing);
    } else {
      await this.secrets.save(this.secrets.create({ siteId, kind: SECRET_KIND, encryptedPayload: encrypted, createdBy: userId }));
    }

    const integration = await this.getOrCreate(siteId);
    integration.customerId = input.customerId.trim();
    integration.languageTarget = input.language ?? integration.languageTarget ?? 'en';
    integration.locationTargets = (input.locationTargets ?? []).map((l) => ({ id: l.id, name: l.name }));
    integration.status = 'CONFIGURED';
    integration.lastError = null;
    integration.lastErrorCode = null;
    await this.integrations.save(integration);

    await this.activities.record({
      action: 'google-ads.configure',
      userId,
      siteId,
      entityType: 'google_ads_integration',
      entityId: integration.id,
      meta: { customerId: integration.customerId },
    });

    return this.toDto(integration);
  }

  // ------------------------------------------------------------------
  // Connection test
  // ------------------------------------------------------------------

  async testConnection(siteId: string): Promise<{ ok: boolean; integration: GoogleAdsIntegrationDto }> {
    const integration = await this.getOrCreate(siteId);
    const secret = await this.loadSecret(siteId);
    if (!secret) {
      integration.status = 'ERROR';
      integration.lastError = 'Google Ads credentials are not configured';
      integration.lastErrorCode = 'AUTH_FAILURE';
      await this.integrations.save(integration);
      return { ok: false, integration: this.toDto(integration) };
    }
    try {
      // A lightweight reachability probe: exchange a token (no keyword call).
      await this.client.getAccessToken(secret);
      integration.status = 'CONNECTED';
      integration.lastError = null;
      integration.lastErrorCode = null;
      await this.integrations.save(integration);
      return { ok: true, integration: this.toDto(integration) };
    } catch (error) {
      const code = this.mapErrorCode(error);
      integration.status = 'ERROR';
      integration.lastError = error instanceof Error ? error.message.slice(0, 500) : 'Google Ads connection failed';
      integration.lastErrorCode = code;
      await this.integrations.save(integration);
      return { ok: false, integration: this.toDto(integration) };
    }
  }

  // ------------------------------------------------------------------
  // Keyword Planner jobs
  // ------------------------------------------------------------------

  /**
   * Runs a Keyword Planner discovery job: generate ideas, upsert canonical
   * keywords, link GOOGLE_ADS source associations, persist planner metrics.
   */
  async runKeywordPlannerJob(
    siteId: string,
    input: { seeds: string[]; maxIdeas?: number; language?: string; locationIds?: string[] },
  ): Promise<KeywordPlannerJobDto> {
    const integration = await this.getOrCreate(siteId);
    const secret = await this.loadSecret(siteId);
    if (!secret) {
      throw new BadRequestException('Google Ads is not configured. Configure credentials first.');
    }
    if (input.seeds.length === 0) {
      throw new BadRequestException('At least one seed keyword is required');
    }

    const job = await this.discoveryJobs.save(
      this.discoveryJobs.create({
        siteId,
        jobType: 'GOOGLE_ADS',
        input: { seeds: input.seeds, maxIdeas: input.maxIdeas ?? 100, language: input.language, locationIds: input.locationIds ?? [] },
        status: 'RUNNING',
        startedAt: new Date(),
        maxIdeas: input.maxIdeas ?? 100,
      }),
    );

    try {
      const ideas = await this.client.generateKeywordIdeas(secret, {
        seeds: input.seeds,
        language: input.language ?? integration.languageTarget ?? 'en',
        locationIds: input.locationIds ?? integration.locationTargets.map((l) => String(l.id)),
        pageSize: Math.min(input.maxIdeas ?? 100, 200),
      });

      let created = 0;
      for (const idea of ideas.slice(0, job.maxIdeas)) {
        const canonical = await this.upsertFromGoogleAds(siteId, idea.keyword);
        if (canonical.created) created += 1;
        await this.persistPlannerMetric(siteId, canonical.id, idea, input.language ?? integration.languageTarget ?? 'en');
      }

      integration.lastKeywordSyncAt = new Date();
      integration.lastKeywordSyncSummary = { ideasReceived: ideas.length, keywordsCreated: created, seeds: input.seeds };
      integration.status = 'CONNECTED';
      integration.lastError = null;
      integration.lastErrorCode = null;
      await this.integrations.save(integration);

      job.status = 'SUCCEEDED';
      job.ideasReceived = ideas.length;
      job.keywordsCreated = created;
      job.finishedAt = new Date();
      await this.discoveryJobs.save(job);

      await this.activities.record({
        action: 'google-ads.sync',
        userId: null,
        siteId,
        entityType: 'keyword_discovery_job',
        entityId: job.id,
        meta: { ideasReceived: ideas.length, keywordsCreated: created },
      });

      return this.toJobDto(job);
    } catch (error) {
      const code = this.mapErrorCode(error);
      integration.status = 'ERROR';
      integration.lastError = error instanceof Error ? error.message.slice(0, 500) : 'Google Ads keyword sync failed';
      integration.lastErrorCode = code;
      await this.integrations.save(integration);

      job.status = 'FAILED';
      job.error = integration.lastError;
      job.finishedAt = new Date();
      await this.discoveryJobs.save(job);
      throw error;
    }
  }

  async listJobs(siteId: string): Promise<KeywordPlannerJobDto[]> {
    const rows = await this.discoveryJobs.find({ where: { siteId, jobType: 'GOOGLE_ADS' }, order: { createdAt: 'DESC' }, take: 50 });
    return rows.map((row) => this.toJobDto(row));
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private async upsertFromGoogleAds(siteId: string, keywordText: string): Promise<{ id: string; created: boolean }> {
    if (!keywordText || !keywordText.trim()) return { id: '', created: false };
    // Normalize with the shared engine and dedupe by normalized hash.
    const { normalizeKeyword, keywordHash } = await import('@creative-seo/keyword-engine');
    const normalized = normalizeKeyword(keywordText);
    const hash = keywordHash(keywordText);
    const existing = await this.keywords.findOne({ where: { siteId, normalizedHash: hash } });
    if (existing) {
      await this.ensureSource(siteId, existing.id, 'GOOGLE_ADS', keywordText);
      return { id: existing.id, created: false };
    }
    const row = await this.keywords.save(
      this.keywords.create({
        siteId,
        keyword: keywordText.trim(),
        normalized,
        normalizedHash: hash,
        source: 'GOOGLE_ADS',
        intent: 'REVIEW_REQUIRED',
        status: 'DISCOVERED',
        discoveryReason: 'GOOGLE_ADS',
      }),
    );
    await this.ensureSource(siteId, row.id, 'GOOGLE_ADS', keywordText);
    return { id: row.id, created: true };
  }

  private async ensureSource(siteId: string, keywordId: string, source: string, sourceValue: string): Promise<void> {
    const existing = await this.keywordSources.findOne({ where: { keywordId, source } });
    if (existing) {
      existing.count += 1;
      existing.lastSeenAt = new Date();
      existing.sourceValue = sourceValue;
      await this.keywordSources.save(existing);
    } else {
      await this.keywordSources.save(
        this.keywordSources.create({ siteId, keywordId, source, sourceValue, count: 1, lastSeenAt: new Date() }),
      );
    }
  }

  private async persistPlannerMetric(siteId: string, keywordId: string, idea: { avgMonthlySearches: number | null; competition: string | null; competitionIndex: number | null; historicalMonths: unknown }, language: string): Promise<void> {
    await this.plannerMetrics.save(
      this.plannerMetrics.create({
        siteId,
        keywordId,
        locationTarget: null,
        languageTarget: language,
        avgMonthlySearches: idea.avgMonthlySearches,
        competition: idea.competition,
        competitionIndex: idea.competitionIndex,
        historicalMonths: idea.historicalMonths as Record<string, unknown> | null,
        retrievedAt: new Date(),
        sourceVersion: this.config.env.GOOGLE_ADS_API_VERSION,
      }),
    );
  }

  private async loadSecret(siteId: string): Promise<GoogleAdsCredentials | null> {
    const secret = await this.secrets.findOne({ where: { siteId, kind: SECRET_KIND }, order: { createdAt: 'DESC' } });
    if (!secret) return null;
    try {
      const payload = JSON.parse(this.encryption.decrypt(secret.encryptedPayload)) as Partial<GoogleAdsCredentials>;
      return {
        developerToken: payload.developerToken ?? this.config.env.GOOGLE_ADS_DEVELOPER_TOKEN,
        refreshToken: payload.refreshToken ?? '',
        clientId: payload.clientId ?? this.config.env.GOOGLE_ADS_CLIENT_ID,
        clientSecret: payload.clientSecret ?? this.config.env.GOOGLE_ADS_CLIENT_SECRET,
        customerId: payload.customerId ?? '',
      };
    } catch {
      return null;
    }
  }

  private async getOrCreate(siteId: string): Promise<GoogleAdsIntegration> {
    const existing = await this.integrations.findOne({ where: { siteId } });
    if (existing) return existing;
    return this.integrations.save(this.integrations.create({ siteId, status: 'NOT_CONFIGURED', locationTargets: [] }));
  }

  private mapErrorCode(error: unknown): GoogleAdsErrorCode {
    if (isGoogleAdsClientError(error)) return error.code;
    if (error instanceof BadRequestException) return 'CUSTOMER_PERMISSION_DENIED';
    return 'UNKNOWN';
  }

  private toDto(row: GoogleAdsIntegration): GoogleAdsIntegrationDto {
    return {
      id: row.id,
      siteId: row.siteId,
      status: row.status as GoogleAdsIntegrationDto['status'],
      customerId: row.customerId,
      languageTarget: row.languageTarget,
      locationTargets: Array.isArray(row.locationTargets) ? (row.locationTargets as Array<{ id: string; name: string }>) : [],
      lastKeywordSyncAt: row.lastKeywordSyncAt?.toISOString() ?? null,
      lastKeywordSyncSummary: row.lastKeywordSyncSummary,
      lastError: row.lastError,
      lastErrorCode: row.lastErrorCode as GoogleAdsErrorCode | null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toJobDto(row: KeywordDiscoveryJob): KeywordPlannerJobDto {
    const input = (row.input ?? {}) as { seeds?: string[] };
    return {
      id: row.id,
      siteId: row.siteId,
      jobType: row.jobType,
      status: row.status as KeywordPlannerJobStatus,
      seeds: input.seeds ?? [],
      ideasReceived: row.ideasReceived,
      keywordsCreated: row.keywordsCreated,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
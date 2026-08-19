import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  CannibalizationCase,
  Cluster,
  ClusterKeyword,
  CrawlPage,
  CrawlRun,
  GscProperty,
  GscQueryDailyMetric,
  GscQueryPageDailyMetric,
  Keyword,
  KeywordDiscoveryJob,
  KeywordMetric,
  KeywordOpportunity,
  KeywordSource,
  Site,
  UrlMapping,
  WordPressPost,
} from '@creative-seo/database';
import { AiService } from '@creative-seo/ai';
import { buildRecommendedUrl, slugify } from '@creative-seo/content';
import {
  classifyCannibalization,
  heuristicIntent,
  heuristicPageType,
  normalizeKeyword,
  scoreOpportunity,
  validateClusterOutput,
  DEFAULT_CANNIBALIZATION_OPTIONS,
  type QueryPageEvidence,
} from '@creative-seo/keyword-engine';
import type {
  ApproveClusterRequest,
  CannibalizationCaseDto,
  ClusterDto,
  ClusterKeywordRole,
  KeywordDto,
  KeywordExplorerSummaryDto,
  KeywordOpportunityDto,
  KeywordPipelineResultDto,
  KeywordSource as KeywordSourceValue,
  KeywordStatus,
  OverrideMappingRequest,
  UrlMappingDto,
} from '@creative-seo/types';
import { Repository, In } from 'typeorm';
import { GoogleAdsService } from './google-ads.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

/**
 * Keyword Intelligence engine (Gap Closure 04).
 *
 * Pipeline: normalize (Arabic+English) -> dedupe (multi-source merge) -> qualify
 * -> cluster (AI + deterministic candidate groups) -> match existing URLs ->
 * URL map (suggested, never silently approved) -> cannibalization (query-page
 * evidence) -> opportunities (deterministic versioned scoring).
 *
 * Hardcoded pageType=‘BLOG’, recommendedAction=‘CREATE’, confidence=0.8 and
 * English-only slugify have been removed (Sections 108-111).
 */
@Injectable()
export class KeywordsService {
  private readonly logger = new Logger(KeywordsService.name);

  constructor(
    @InjectRepository(Keyword) private readonly keywords: Repository<Keyword>,
    @InjectRepository(KeywordSource) private readonly keywordSources: Repository<KeywordSource>,
    @InjectRepository(KeywordMetric) private readonly metrics: Repository<KeywordMetric>,
    @InjectRepository(Cluster) private readonly clusters: Repository<Cluster>,
    @InjectRepository(ClusterKeyword) private readonly clusterKeywords: Repository<ClusterKeyword>,
    @InjectRepository(UrlMapping) private readonly mappings: Repository<UrlMapping>,
    @InjectRepository(GscProperty) private readonly properties: Repository<GscProperty>,
    @InjectRepository(GscQueryDailyMetric) private readonly queryMetrics: Repository<GscQueryDailyMetric>,
    @InjectRepository(GscQueryPageDailyMetric) private readonly queryPageMetrics: Repository<GscQueryPageDailyMetric>,
    @InjectRepository(KeywordOpportunity) private readonly opportunities: Repository<KeywordOpportunity>,
    @InjectRepository(CannibalizationCase) private readonly cannibalizationCases: Repository<CannibalizationCase>,
    @InjectRepository(KeywordDiscoveryJob) private readonly discoveryJobs: Repository<KeywordDiscoveryJob>,
    @InjectRepository(CrawlRun) private readonly crawlRuns: Repository<CrawlRun>,
    @InjectRepository(CrawlPage) private readonly crawlPages: Repository<CrawlPage>,
    @InjectRepository(WordPressPost) private readonly wpPosts: Repository<WordPressPost>,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    private readonly ai: AiService,
    private readonly googleAds: GoogleAdsService,
    private readonly activities: ActivityLogService,
  ) {}

  // -------------------------------------------------------------------------
  // Keywords — seed / list / explorer
  // -------------------------------------------------------------------------

  /** Seeds one or more keywords (manual or discovery). Dedupes by normalized hash. */
  async seed(
    siteId: string,
    input: { keyword: string; intent?: KeywordDto['intent']; source?: KeywordSourceValue; language?: string | null },
  ): Promise<KeywordDto> {
    const normalized = normalizeKeyword(input.keyword);
    if (!normalized) {
      throw new BadRequestException('keyword must be a non-empty string');
    }
    const source = input.source ?? 'MANUAL';
    const language = input.language ?? detectSiteLanguage(input.keyword);

    const existing = await this.findByHash(siteId, normalized);
    let row = existing;
    if (row) {
      // Merge source association (Section 2: one keyword may have many sources).
      await this.ensureSource(siteId, row.id, source, input.keyword);
    } else {
      row = await this.keywords.save(
        this.keywords.create({
          siteId,
          keyword: input.keyword.trim(),
          normalized,
          normalizedHash: hash(normalized),
          source,
          language,
          intent: input.intent ?? 'REVIEW_REQUIRED',
          status: 'DISCOVERED',
          discoveryReason: 'MANUAL_SEED',
        }),
      );
      await this.ensureSource(siteId, row.id, source, input.keyword);
    }
    return this.toKeywordDto(row);
  }

  async listKeywords(siteId: string): Promise<KeywordDto[]> {
    const rows = await this.keywords.find({ where: { siteId }, order: { createdAt: 'DESC' }, take: 500 });
    return Promise.all(rows.map((row) => this.toKeywordDto(row)));
  }

  async explorerSummary(siteId: string): Promise<KeywordExplorerSummaryDto> {
    const [totalKeywords, gscQueries, clusters, mapped, unmapped, cannibalizationCases, contentOpportunities] = await Promise.all([
      this.keywords.count({ where: { siteId } }),
      this.queryMetrics.count({ where: { siteId } }),
      this.clusters.count({ where: { siteId } }),
      this.mappings.count({ where: { siteId, status: 'APPROVED' } }),
      this.mappings.count({ where: { siteId, status: 'SUGGESTED' } }),
      this.cannibalizationCases.count({ where: { siteId } }),
      this.opportunities.count({ where: { siteId, status: 'OPEN' } }),
    ]);
    const sourceCounts = await this.keywordSources
      .createQueryBuilder('ks')
      .select('ks.source', 'source')
      .addSelect('COUNT(DISTINCT ks.keyword_id)', 'count')
      .where('ks.site_id = :siteId', { siteId })
      .groupBy('ks.source')
      .getRawMany<{ source: string; count: string }>();
    return {
      totalKeywords,
      gscQueries,
      googleAdsKeywords: Number(sourceCounts.find((s) => s.source === 'GOOGLE_ADS')?.count ?? 0),
      unclustered: await this.unclusteredCount(siteId),
      clusters,
      mapped,
      unmapped,
      cannibalizationCases,
      contentOpportunities,
    };
  }

  // -------------------------------------------------------------------------
  // Discovery pipeline
  // -------------------------------------------------------------------------

  /**
   * Discovery (Section 14-16): explicit seeds + GSC queries + site content +
   * optional Google Ads ideas. Persists a discovery job for history.
   */
  async runDiscovery(
    siteId: string,
    input: { keywords?: string[]; discoverFromGsc?: boolean; discoverFromSite?: boolean; googleAdsSeeds?: string[]; maxIdeas?: number },
  ): Promise<{ discovered: number; jobId: string | null; errors: string[] }> {
    const site = await this.requireSite(siteId);
    const errors: string[] = [];
    const job = await this.discoveryJobs.save(
      this.discoveryJobs.create({
        siteId,
        jobType: input.discoverFromGsc ? 'GSC' : 'MANUAL_SEEDS',
        input: { ...input },
        status: 'RUNNING',
        startedAt: new Date(),
        maxIdeas: input.maxIdeas ?? 100,
      }),
    );

    try {
      let discovered = 0;
      // 1. Explicit seeds
      for (const keyword of input.keywords ?? []) {
        try {
          await this.seed(siteId, { keyword, source: 'MANUAL' });
          discovered += 1;
        } catch (error) {
          errors.push(`Failed to seed "${keyword}": ${error instanceof Error ? error.message : 'unknown'}`);
        }
      }

      // 2. GSC discovery (Section 16)
      if (input.discoverFromGsc) {
        discovered += await this.discoverFromGsc(siteId, site, errors);
      }

      // 3. Site content discovery (Section 15)
      if (input.discoverFromSite) {
        discovered += await this.discoverFromSiteContent(siteId, site, errors);
      }

      // 4. Google Ads discovery (Section 11)
      if (input.googleAdsSeeds && input.googleAdsSeeds.length > 0) {
        try {
          await this.googleAds.runKeywordPlannerJob(siteId, {
            seeds: input.googleAdsSeeds,
            maxIdeas: input.maxIdeas,
          });
        } catch (error) {
          errors.push(`Google Ads discovery unavailable (${error instanceof Error ? error.message : 'unknown'})`);
        }
      }

      job.status = 'SUCCEEDED';
      job.keywordsCreated = discovered;
      job.ideasReceived = discovered;
      job.finishedAt = new Date();
      await this.discoveryJobs.save(job);
      return { discovered, jobId: job.id, errors };
    } catch (error) {
      job.status = 'FAILED';
      job.error = error instanceof Error ? error.message.slice(0, 500) : 'Discovery failed';
      job.finishedAt = new Date();
      await this.discoveryJobs.save(job);
      throw error;
    }
  }

  private async discoverFromGsc(siteId: string, site: Site, errors: string[]): Promise<number> {
    const property = await this.properties.findOne({ where: { siteId, selected: true } });
    if (!property) {
      errors.push('discoverFromGsc requested but no selected GSC property exists');
      return 0;
    }
    // Use canonical QUERY_DAILY metrics (Section 6), not the legacy table.
    const rows = await this.queryMetrics
      .createQueryBuilder('m')
      .select('m.query', 'query')
      .addSelect('SUM(m.impressions)', 'impressions')
      .addSelect('SUM(m.clicks)', 'clicks')
      .addSelect('AVG(m.position)', 'position')
      .where('m.site_id = :siteId', { siteId })
      .andWhere("m.query != ''")
      .groupBy('m.query')
      .orderBy('"impressions"', 'DESC')
      .limit(100)
      .getRawMany<{ query: string; impressions: string; clicks: string; position: string }>();

    let created = 0;
    for (const row of rows) {
      if (!row.query || !row.query.trim()) continue;
      try {
        const existing = await this.findByHash(siteId, normalizeKeyword(row.query));
        if (existing) {
          await this.ensureSource(siteId, existing.id, 'GSC', row.query);
          // Write GSC metrics into keyword_metrics (Section 94: link GSC text to canonical keyword).
          await this.recordGscMetrics(siteId, existing.id, row);
        } else {
          const keyword = await this.seed(siteId, {
            keyword: row.query,
            intent: heuristicIntent(row.query).intent,
            source: 'GSC',
            language: detectSiteLanguage(row.query),
          });
          await this.recordGscMetrics(siteId, keyword.id, row);
          created += 1;
        }
      } catch (error) {
        errors.push(`Failed to import GSC query "${row.query}": ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
    return created;
  }

  private async discoverFromSiteContent(siteId: string, site: Site, errors: string[]): Promise<number> {
    const latestRun = await this.crawlRuns.findOne({ where: { siteId }, order: { finishedAt: 'DESC' } });
    const pages = latestRun
      ? await this.crawlPages.find({ where: { siteId, crawlRunId: latestRun.id }, take: 200 })
      : await this.wpPosts.find({ where: { siteId, status: 'publish' }, take: 200 });

    const candidates = new Set<string>();
    for (const page of pages) {
      const title = 'title' in page && page.title ? String(page.title) : '';
      const h1 = 'h1' in page && page.h1 ? String(page.h1) : '';
      const focusKw = 'rankMath' in page && page.rankMath ? String((page.rankMath as { focus_keywords?: string }).focus_keywords ?? '') : '';
      for (const text of [title, h1, focusKw]) {
        const clean = text.trim();
        if (clean.length >= 3 && clean.length <= 100) candidates.add(clean);
      }
    }

    let created = 0;
    for (const text of candidates) {
      try {
        const existing = await this.findByHash(siteId, normalizeKeyword(text));
        if (!existing) {
          await this.seed(siteId, { keyword: text, source: 'SITE_CONTENT', language: detectSiteLanguage(text) });
          created += 1;
        } else {
          await this.ensureSource(siteId, existing.id, 'SITE_CONTENT', text);
        }
      } catch (error) {
        errors.push(`Failed to import site content "${text}": ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
    return created;
  }

  // -------------------------------------------------------------------------
  // Clustering pipeline (Sections 22-28)
  // -------------------------------------------------------------------------

  /**
   * Cluster qualified keywords. Candidate groups are built deterministically
   * (normalize -> dedupe -> coarse lexical groups), then AI makes the final
   * semantic intent grouping decision. On AI failure keywords stay unclustered.
   */
  async cluster(siteId: string, organizationId: string | null): Promise<{ clusters: ClusterDto[]; errors: string[] }> {
    const site = await this.requireSite(siteId);
    const errors: string[] = [];
    const keywords = await this.keywords.find({ where: { siteId }, order: { createdAt: 'ASC' } });
    const unclustered = keywords.filter((k) => k.status === 'DISCOVERED' || k.status === 'QUALIFIED');
    if (unclustered.length === 0) {
      return { clusters: await this.listClusters(siteId), errors };
    }

    // Deterministic candidate groups.
    const { candidateGroups } = await import('@creative-seo/keyword-engine');
    const groups = candidateGroups(unclustered.map((k) => k.keyword));
    const allKeywords: string[] = groups.flatMap((group: { label: string; keywords: string[] }) => group.keywords);

    // AI semantic decision (batched, one call for the candidate groups).
    let aiClusters: Array<{ name: string; primary_keyword: string; keywords: string[] }> = [];
    try {
      const result = await this.ai.generateStructured<{
        clusters: Array<{ name: string; primary_keyword: string; keywords: string[]; intent: string; page_type: string; business_relevance: string; recommended_action: string; confidence: number; reason: string }>;
      }>(
        'clustering',
        {
          site: site.name,
          keywords: JSON.stringify(allKeywords),
          rules: JSON.stringify({
            intent_driven: true,
            arabic_morphology: true,
            no_trivial_variant_pages: true,
            language: site.language,
            market: site.country ?? '',
          }),
        },
        { siteId, organizationId, workflow: 'clustering' },
      );
      aiClusters = validateClusterOutput(result.data.clusters ?? [], new Set(keywords.map((k) => k.keyword)));
      if (aiClusters.length === 0) {
        errors.push('AI clustering returned no valid clusters; keywords remain unclustered.');
      }
    } catch (error) {
      errors.push(`AI clustering unavailable (${error instanceof Error ? error.message : 'unknown'}); keywords remain unclustered`);
    }

    if (aiClusters.length === 0) {
      return { clusters: await this.listClusters(siteId), errors };
    }

    const _created = await this.persistClusters(siteId, site.domain, aiClusters, errors);
    const all = await this.listClusters(siteId);
    return { clusters: all, errors };
  }

  /** Legacy pipeline wrapper: discover -> cluster -> map. */
  async runPipeline(
    siteId: string,
    organizationId: string | null,
    input: { keywords?: string[]; discoverFromGsc?: boolean },
  ): Promise<KeywordPipelineResultDto> {
    const { discovered, errors } = await this.runDiscovery(siteId, { keywords: input.keywords, discoverFromGsc: input.discoverFromGsc });
    const { clusters } = await this.cluster(siteId, organizationId);
    await this.runCannibalizationAnalysis(siteId, organizationId);
    await this.runOpportunityScoring(siteId, organizationId);
    return {
      siteId,
      ingested: discovered,
      createdKeywords: discovered,
      clusters,
      createdMappings: clusters.filter((c) => Boolean(c.targetUrl)).length,
      skippedManualOverrides: 0,
      errors,
    };
  }

  private async persistClusters(
    siteId: string,
    domain: string,
    aiClusters: Array<{ name: string; primary_keyword: string; keywords: string[] }>,
    _errors: string[],
  ): Promise<Array<{ id: string; name: string; url: string }>> {
    const created: Array<{ id: string; name: string; url: string }> = [];
    const site = await this.requireSite(siteId);

    for (const item of aiClusters) {
      const names = item.keywords.filter(Boolean);
      if (names.length === 0) continue;
      const keywordRows: Keyword[] = [];
      for (const name of names) {
        const row = await this.findByHash(siteId, normalizeKeyword(name));
        if (row) keywordRows.push(row);
      }
      if (keywordRows.length === 0) continue;

      const primary = keywordRows.find((r) => r.keyword === item.primary_keyword) ?? keywordRows[0]!;
      // Slug policy: site language-aware (Section 34, 111). Never force English.
      const siteLanguage = site.language === 'Arabic' || site.language === 'ar' ? 'ar' : 'en';
      const slug = slugify(primary.keyword, siteLanguage);
      const url = buildRecommendedUrl(domain, slug);

      const intent = heuristicIntent(primary.keyword);
      const pageType = heuristicPageType(primary.keyword);

      const cluster = await this.clusters.save(
        this.clusters.create({
          siteId,
          name: item.name || primary.keyword,
          intent: intent.intent,
          pageType: pageType.pageType,
          businessRelevance: null, // set by AI classifier in later refinement
          primaryKeywordId: primary.id,
          confidence: intent.confidence, // heuristic confidence, never a hardcoded 0.8
          targetUrl: null,
          recommendedAction: 'REVIEW', // never hardcoded CREATE
          status: 'DRAFT',
          aiReviewed: false,
          clusterVersion: 'clustering-v1',
          note: `Clustered from ${keywordRows.length} keyword(s)`,
        }),
      );

      for (let index = 0; index < keywordRows.length; index += 1) {
        const row = keywordRows[index]!;
        const role: ClusterKeywordRole = row.id === primary.id ? 'PRIMARY' : 'SECONDARY';
        await this.clusterKeywords.save(
          this.clusterKeywords.create({
            clusterId: cluster.id,
            keywordId: row.id,
            role,
            confidence: row.id === primary.id ? intent.confidence : null,
            source: 'clustering',
            approved: false,
          }),
        );
        if (row.id !== primary.id) {
          await this.keywords.update(row.id, { status: 'CLUSTERED' });
        }
      }
      await this.keywords.update(primary.id, { status: 'CLUSTERED' });

      // Suggested mapping (Section 32): never auto-approved.
      const existingMapping = await this.mappings.findOne({ where: { siteId, url } });
      if (!existingMapping) {
        await this.mappings.save(
          this.mappings.create({
            siteId,
            clusterId: cluster.id,
            keywordId: primary.id,
            url,
            mappingType: 'NEW_PLANNED',
            status: 'SUGGESTED',
            source: 'AUTO',
            confidence: intent.confidence,
            manualOverride: false,
            approvedBy: null,
            reason: 'Suggested URL for the new cluster; requires approval before activation.',
          }),
        );
      }
      created.push({ id: cluster.id, name: cluster.name, url });
    }
    return created;
  }

  // -------------------------------------------------------------------------
  // Cannibalization (Sections 35-39) — FIXED: query-page evidence, no cluster-id counting
  // -------------------------------------------------------------------------

  async runCannibalizationAnalysis(siteId: string, _organizationId: string | null): Promise<CannibalizationCaseDto[]> {
    // Pull query-page evidence from the canonical QUERY_PAGE_DAILY grain.
    const rows = await this.queryPageMetrics
      .createQueryBuilder('qp')
      .select('qp.query', 'query')
      .addSelect('qp.page_url', 'pageUrl')
      .addSelect('SUM(qp.impressions)', 'impressions')
      .addSelect('SUM(qp.clicks)', 'clicks')
      .addSelect('AVG(qp.position)', 'position')
      .addSelect('COUNT(DISTINCT qp.date)', 'activeDates')
      .where('qp.site_id = :siteId', { siteId })
      .groupBy('qp.query')
      .addGroupBy('qp.page_url')
      .orderBy('"impressions"', 'DESC')
      .getRawMany<{ query: string; pageUrl: string; impressions: string; clicks: string; position: string; activeDates: string }>();

    // Aggregate evidence per query (Section 36).
    const byQuery = new Map<string, QueryPageEvidence>();
    for (const row of rows) {
      const query = row.query ?? '';
      if (!query) continue;
      const entry = byQuery.get(query) ?? { query, urls: [] };
      entry.urls.push({
        url: row.pageUrl,
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        position: row.position ? Number(row.position) : null,
        activeDates: Number(row.activeDates) || 0,
      });
      byQuery.set(query, entry);
    }

    // Persist cases.
    const cases: CannibalizationCase[] = [];
    for (const evidence of byQuery.values()) {
      const result = classifyCannibalization(evidence.query, evidence.urls, DEFAULT_CANNIBALIZATION_OPTIONS);
      if (result.classification === 'NONE') continue;

      const existing = await this.cannibalizationCases.findOne({ where: { siteId, query: result.query } });
      const row = existing ?? this.cannibalizationCases.create({
        siteId,
        query: result.query,
        urls: result.urls,
        classification: result.classification,
        score: result.score,
        recommendation: result.recommendation,
        reason: result.reason,
        preferredTarget: result.preferredTarget,
        status: 'OPEN',
      });
      row.classification = result.classification;
      row.score = result.score;
      row.recommendation = result.recommendation;
      row.reason = result.reason;
      row.urls = result.urls;
      row.preferredTarget = result.preferredTarget;
      await this.cannibalizationCases.save(row);
      cases.push(row);
    }

    await this.activities.record({
      action: 'keywords.cannibalization.detected',
      userId: null,
      siteId,
      entityType: 'site',
      entityId: siteId,
      meta: { cases: cases.length },
    });

    return cases.map((c) => this.toCannibalizationDto(c));
  }

  async listCannibalization(siteId: string): Promise<CannibalizationCaseDto[]> {
    const rows = await this.cannibalizationCases.find({ where: { siteId }, order: { detectedAt: 'DESC' } });
    return rows.map((row) => this.toCannibalizationDto(row));
  }

  // -------------------------------------------------------------------------
  // Opportunity engine (Sections 42-50)
  // -------------------------------------------------------------------------

  async runOpportunityScoring(siteId: string, _organizationId: string | null): Promise<KeywordOpportunityDto[]> {
    const clusters = await this.clusters.find({ where: { siteId }, order: { createdAt: 'DESC' } });
    const [gscAvailable, googleAdsAvailable] = await Promise.all([
      this.properties.exists({ where: { siteId, selected: true } }),
      this.googleAds.isAvailable(siteId).then((r) => r.available),
    ]);

    const created: KeywordOpportunity[] = [];
    for (const cluster of clusters) {
      const members = await this.clusterKeywords.find({ where: { clusterId: cluster.id } });
      if (members.length === 0) continue;
      const keywordIds = members.map((m) => m.keywordId);
      const kwRows = keywordIds.length > 0 ? await this.keywords.find({ where: { id: In(keywordIds) } }) : [];
      const primary = kwRows.find((k) => k.id === cluster.primaryKeywordId) ?? kwRows[0];
      if (!primary) continue;

      // Gather evidence.
      const gsc = await this.gscEvidenceForKeyword(siteId, primary.keyword);
      const mapping = await this.mappings.findOne({ where: { clusterId: cluster.id } });

      const type = mapping && mapping.status === 'APPROVED' ? 'UPDATE_EXISTING' : 'NEW_PAGE';
      const scored = scoreOpportunity({
        type,
        searchDemand: gsc.impressions > 0 ? gsc.impressions : null,
        position: gsc.position,
        businessRelevance: cluster.businessRelevance ? relevanceToScore(cluster.businessRelevance) : null,
        hasTargetUrl: Boolean(mapping && mapping.status === 'APPROVED'),
        cannibalizationRisk: null,
        evidenceConfidence: evidenceConfidence(gscAvailable, googleAdsAvailable, kwRows.length > 0),
      });

      const existing = await this.opportunities.findOne({ where: { siteId, clusterId: cluster.id } });
      const row = existing ?? this.opportunities.create({
        siteId,
        clusterId: cluster.id,
        keywordId: primary.id,
        type,
        targetUrl: mapping?.url ?? null,
        impact: scored.impact,
        confidence: scored.confidence,
        effort: scored.effort,
        priorityScore: scored.score,
        scoreVersion: scored.scoreVersion,
        evidence: { gsc, mapping: mapping?.url ?? null },
        status: 'OPEN',
        reason: scored.scoreVersion,
      });
      row.type = type;
      row.targetUrl = mapping?.url ?? null;
      row.impact = scored.impact;
      row.confidence = scored.confidence;
      row.effort = scored.effort;
      row.priorityScore = scored.score;
      row.scoreVersion = scored.scoreVersion;
      row.evidence = { gsc, mapping: mapping?.url ?? null };
      await this.opportunities.save(row);
      created.push(row);
    }

    await this.activities.record({
      action: 'keywords.opportunity.create',
      userId: null,
      siteId,
      entityType: 'site',
      entityId: siteId,
      meta: { opportunities: created.length },
    });

    return Promise.all(created.map((o) => this.toOpportunityDto(o)));
  }

  async listOpportunities(siteId: string): Promise<KeywordOpportunityDto[]> {
    const rows = await this.opportunities.find({ where: { siteId }, order: { priorityScore: 'DESC' } });
    return Promise.all(rows.map((row) => this.toOpportunityDto(row)));
  }

  async approveOpportunity(id: string, userId: string | null): Promise<KeywordOpportunityDto> {
    const row = await this.opportunities.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Opportunity not found');
    row.status = 'APPROVED';
    row.decidedBy = userId;
    row.decidedAt = new Date();
    await this.opportunities.save(row);
    return this.toOpportunityDto(row);
  }

  async ignoreOpportunity(id: string, userId: string | null): Promise<KeywordOpportunityDto> {
    const row = await this.opportunities.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Opportunity not found');
    row.status = 'IGNORED';
    row.decidedBy = userId;
    row.decidedAt = new Date();
    await this.opportunities.save(row);
    return this.toOpportunityDto(row);
  }

  /**
   * Builds the content pipeline request from an approved opportunity (Sections
   * 74-75, Test 126). Maps the opportunity action to the correct content mode:
   * CREATE -> new page, UPDATE/EXPAND -> edit existing target. The frontend can
   * POST this payload to the content pipeline without re-entering keyword data.
   */
  async buildContentRequestFromOpportunity(id: string): Promise<{
    clusterId: string | null;
    primaryKeyword: string;
    secondaryKeywords: string[];
    targetUrl: string | null;
    action: string;
    intent: string | null;
    pageType: string | null;
  }> {
    const row = await this.opportunities.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Opportunity not found');
    if (row.status !== 'APPROVED') {
      throw new BadRequestException('Only approved opportunities can launch content creation');
    }

    let primaryKeyword = '';
    let secondaryKeywords: string[] = [];
    let intent: string | null = null;
    let pageType: string | null = null;

    if (row.clusterId) {
      const cluster = await this.clusters.findOne({ where: { id: row.clusterId } });
      if (cluster) {
        intent = cluster.intent;
        pageType = cluster.pageType;
      }
      const members = await this.clusterKeywords.find({ where: { clusterId: row.clusterId } });
      const kwRows = members.length > 0 ? await this.keywords.find({ where: { id: In(members.map((m) => m.keywordId)) } }) : [];
      const primary = kwRows.find((k) => k.id === cluster?.primaryKeywordId) ?? kwRows[0];
      primaryKeyword = primary?.keyword ?? kwRows[1]?.keyword ?? '';
      secondaryKeywords = kwRows.filter((k) => k.id !== primary?.id).map((k) => k.keyword);
    }
    if (!primaryKeyword && row.keywordId) {
      primaryKeyword = (await this.keywords.findOne({ where: { id: row.keywordId } }))?.keyword ?? '';
    }

    // Map opportunity type -> content mode (Section 75).
    const action = opportunityTypeToAction(row.type);
    return {
      clusterId: row.clusterId,
      primaryKeyword,
      secondaryKeywords,
      targetUrl: row.targetUrl,
      action,
      intent,
      pageType,
    };
  }

  async activateMappingAfterPublish(siteId: string, clusterId: string, url: string, wpPostId: string): Promise<void> {
    // Section 79: activate the planned URL mapping only after Gap Closure 03
    // verifies the new WordPress page.
    const mapping = await this.mappings.findOne({ where: { clusterId } });
    if (!mapping) {
      await this.mappings.save(
        this.mappings.create({
          siteId,
          clusterId,
          url,
          wpPostId,
          mappingType: 'NEW_PLANNED',
          status: 'ACTIVE',
          source: 'GSC_OBSERVED',
          confidence: 1,
          manualOverride: true,
          reason: 'Activated after verified WordPress publication.',
        }),
      );
      return;
    }
    if (mapping.manualOverride && mapping.status === 'APPROVED' && mapping.url !== url) {
      // Section 80: URL change safety — do not silently rewrite an approved mapping.
      mapping.status = 'REVIEW_REQUIRED';
      mapping.reason = 'URL changed after publication; redirects/internal links/canonicals may need review.';
    } else {
      mapping.url = url;
      mapping.wpPostId = wpPostId;
      mapping.status = 'ACTIVE';
      mapping.mappingType = 'EXISTING';
      mapping.approvedAt = new Date();
      mapping.reason = 'Activated after verified WordPress publication.';
    }
    await this.mappings.save(mapping);
  }

  // -------------------------------------------------------------------------
  // URL matching & mapping (Sections 29-34)
  // -------------------------------------------------------------------------

  async matchExistingUrls(siteId: string): Promise<number> {
    // Build URL inventory (Section 29): verified WP pages + crawl + mappings.
    const wpPages = await this.wpPosts.find({ where: { siteId, status: 'publish' } });
    const latestRun = await this.crawlRuns.findOne({ where: { siteId }, order: { finishedAt: 'DESC' } });
    const crawlPages = latestRun ? await this.crawlPages.find({ where: { siteId, crawlRunId: latestRun.id } }) : [];
    const inventory = new Map<string, { url: string; title: string; keywords: string[] }>();
    for (const p of wpPages) {
      const url = p.url ?? '';
      const rankMath = (p.rankMath ?? {}) as { focus_keywords?: string };
      inventory.set(url, { url, title: p.title ?? '', keywords: rankMath.focus_keywords ? [rankMath.focus_keywords] : [] });
    }
    for (const p of crawlPages) {
      if (!p.indexable) continue;
      if (!inventory.has(p.url)) {
        inventory.set(p.url, { url: p.url, title: p.title ?? '', keywords: [] });
      }
    }

    // Match each cluster to an existing URL when signals line up (Section 30).
    const clusters = await this.clusters.find({ where: { siteId, status: 'DRAFT' } });
    let matched = 0;
    for (const cluster of clusters) {
      const members = await this.clusterKeywords.find({ where: { clusterId: cluster.id } });
      const kwRows = await this.keywords.find({ where: { id: In(members.map((m) => m.keywordId)) } });
      const primary = kwRows.find((k) => k.id === cluster.primaryKeywordId) ?? kwRows[0];
      if (!primary) continue;
      const normalizedPrimary = normalizeKeyword(primary.keyword);

      const candidate = findBestUrl(inventory, normalizedPrimary);
      if (candidate) {
        const existing = await this.mappings.findOne({ where: { clusterId: cluster.id } });
        if (existing) {
          if (!existing.manualOverride) {
            existing.url = candidate.url;
            existing.status = 'APPROVED';
            existing.mappingType = 'EXISTING';
            existing.confidence = candidate.confidence;
            existing.reason = candidate.reason;
            existing.wpPostId = String(findWpPostId(wpPages, candidate.url) ?? '');
            await this.mappings.save(existing);
          }
        } else {
          await this.mappings.save(
            this.mappings.create({
              siteId,
              clusterId: cluster.id,
              keywordId: primary.id,
              url: candidate.url,
              mappingType: 'EXISTING',
              status: 'APPROVED',
              source: 'GSC_OBSERVED',
              confidence: candidate.confidence,
              manualOverride: false,
              approvedBy: null,
              reason: candidate.reason,
            }),
          );
        }
        cluster.recommendedAction = 'KEEP';
        cluster.targetUrl = candidate.url;
        await this.clusters.save(cluster);
        matched += 1;
      }
    }
    return matched;
  }

  // -------------------------------------------------------------------------
  // Cluster / mapping CRUD
  // -------------------------------------------------------------------------

  async listClusters(siteId: string): Promise<ClusterDto[]> {
    const rows = await this.clusters.find({ where: { siteId }, order: { createdAt: 'DESC' } });
    return Promise.all(rows.map((row) => this.toClusterDto(row)));
  }

  async getCluster(siteId: string, id: string): Promise<ClusterDto> {
    const row = await this.clusters.findOne({ where: { id, siteId } });
    if (!row) {
      throw new NotFoundException('Cluster not found');
    }
    return this.toClusterDto(row);
  }

  async approveCluster(siteId: string, id: string, input: ApproveClusterRequest, userId: string | null): Promise<ClusterDto> {
    const cluster = await this.clusters.findOne({ where: { id, siteId } });
    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }
    cluster.status = 'APPROVED';
    cluster.aiReviewed = true;
    if (input.action) cluster.recommendedAction = input.action;
    if (input.targetUrl) {
      cluster.targetUrl = input.targetUrl;
    }
    await this.clusters.save(cluster);

    const mapping = await this.mappings.findOne({ where: { clusterId: id } });
    if (mapping) {
      if (input.targetUrl) mapping.url = input.targetUrl;
      mapping.status = 'APPROVED';
      mapping.mappingType = input.targetUrl && mapping.url !== input.targetUrl ? 'NEW_PLANNED' : mapping.mappingType;
      mapping.manualOverride = true;
      mapping.approvedBy = userId;
      mapping.approvedAt = new Date();
      await this.mappings.save(mapping);
    }
    await this.activities.record({
      action: 'keywords.mapping.approve',
      userId,
      siteId,
      entityType: 'cluster',
      entityId: id,
      meta: { url: input.targetUrl ?? cluster.targetUrl },
    });
    return this.toClusterDto(cluster);
  }

  async listMappings(siteId: string): Promise<UrlMappingDto[]> {
    const rows = await this.mappings.find({ where: { siteId }, order: { createdAt: 'DESC' } });
    return rows.map((row) => this.toMappingDto(row));
  }

  async overrideMapping(siteId: string, id: string, input: OverrideMappingRequest, userId: string | null): Promise<UrlMappingDto> {
    const row = await this.mappings.findOne({ where: { id, siteId } });
    if (!row) {
      throw new NotFoundException('URL mapping not found');
    }
    if (row.status === 'APPROVED' && input.url !== row.url) {
      // URL change safety (Section 80): never silently rewrite an approved mapping.
      row.status = 'REVIEW_REQUIRED';
      row.reason = 'URL change requires review (redirects/internal links/canonicals may need updates).';
    }
    row.url = input.url;
    row.manualOverride = true;
    row.approvedBy = userId;
    row.approvedAt = new Date();
    await this.mappings.save(row);
    await this.activities.record({
      action: 'keywords.mapping.override',
      userId,
      siteId,
      entityType: 'url_mapping',
      entityId: id,
      meta: { url: input.url, status: row.status },
    });
    return this.toMappingDto(row);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async requireSite(siteId: string): Promise<Site> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    return site;
  }

  private async findByHash(siteId: string, normalized: string): Promise<Keyword | null> {
    if (!normalized) return null;
    return this.keywords.findOne({ where: { siteId, normalizedHash: hash(normalized) } });
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

  private async recordGscMetrics(siteId: string, keywordId: string, row: { impressions: string; clicks: string; position: string }): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    const existing = await this.metrics.findOne({ where: { keywordId, metricDate: date, source: 'GSC' } });
    const impressions = Number(row.impressions) || 0;
    const clicks = Number(row.clicks) || 0;
    const record = existing ?? this.metrics.create({ keywordId, metricDate: date, source: 'GSC' });
    record.impressions = impressions;
    record.clicks = clicks;
    record.ctr = impressions > 0 ? clicks / impressions : 0;
    record.position = row.position ? Number(row.position) : 0;
    await this.metrics.save(record);
  }

  private async gscEvidenceForKeyword(siteId: string, keyword: string): Promise<{ impressions: number; clicks: number; position: number | null }> {
    const normalized = normalizeKeyword(keyword);
    const rows = await this.queryMetrics
      .createQueryBuilder('m')
      .select('SUM(m.impressions)', 'impressions')
      .addSelect('SUM(m.clicks)', 'clicks')
      .addSelect('AVG(m.position)', 'position')
      .where('m.site_id = :siteId', { siteId })
      .andWhere('m.normalized_query = :normalized', { normalized })
      .getRawOne<{ impressions: string; clicks: string; position: string }>();
    if (!rows) return { impressions: 0, clicks: 0, position: null };
    return {
      impressions: Number(rows.impressions) || 0,
      clicks: Number(rows.clicks) || 0,
      position: rows.position ? Number(rows.position) : null,
    };
  }

  private async unclusteredCount(siteId: string): Promise<number> {
    return this.keywords.count({ where: { siteId, status: In(['DISCOVERED', 'QUALIFIED']) } });
  }

  private async toKeywordDto(row: Keyword): Promise<KeywordDto> {
    const [metricRows, sourceRows] = await Promise.all([
      this.metrics.find({ where: { keywordId: row.id } }),
      this.keywordSources.find({ where: { keywordId: row.id } }),
    ]);
    const clicks = sum(metricRows.map((entry) => Number(entry.clicks)));
    const impressions = sum(metricRows.map((entry) => Number(entry.impressions)));
    const positions = metricRows.map((entry) => entry.position).filter((position) => position > 0);
    const monthlySearchVolume = await this.plannerVolume(row.id);
    return {
      id: row.id,
      siteId: row.siteId,
      source: row.source as KeywordDto['source'],
      keyword: row.keyword,
      normalized: row.normalized,
      intent: row.intent as KeywordDto['intent'],
      status: row.status as KeywordStatus,
      language: row.language,
      businessRelevance: (row.businessRelevance ?? null) as KeywordDto['businessRelevance'],
      sources: sourceRows.map((s) => s.source),
      metrics: {
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        avgPosition: positions.length > 0 ? positions.reduce((total, position) => total + position, 0) / positions.length : null,
        monthlySearchVolume,
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async plannerVolume(keywordId: string): Promise<number | null> {
    const latest = await this.metrics.findOne({ where: { keywordId, source: 'GOOGLE_ADS' }, order: { createdAt: 'DESC' } });
    return latest ? Number(latest.monthlySearchVolume) || null : null;
  }

  private async toClusterDto(row: Cluster): Promise<ClusterDto> {
    const links = await this.clusterKeywords.find({ where: { clusterId: row.id } });
    const keywordIds = links.map((link) => link.keywordId);
    const keywordRows = keywordIds.length > 0 ? await this.keywords.find({ where: { id: In(keywordIds) } }) : [];
    const byId = new Map(keywordRows.map((keyword) => [keyword.id, keyword]));
    const ordered = links
      .map((link) => {
        const keyword = byId.get(link.keywordId);
        return keyword ? { keyword: keyword.keyword, role: link.role } : null;
      })
      .filter((entry): entry is { keyword: string; role: string } => entry !== null);

    const primary = ordered.find((entry) => entry.role === 'PRIMARY') ?? ordered[0];
    return {
      id: row.id,
      siteId: row.siteId,
      name: row.name,
      intent: row.intent as ClusterDto['intent'],
      secondaryIntent: (row.secondaryIntent ?? null) as ClusterDto['secondaryIntent'],
      pageType: row.pageType as ClusterDto['pageType'],
      businessRelevance: (row.businessRelevance ?? null) as ClusterDto['businessRelevance'],
      confidence: row.confidence,
      targetUrl: row.targetUrl,
      recommendedAction: row.recommendedAction as ClusterDto['recommendedAction'],
      status: row.status as ClusterDto['status'],
      aiReviewed: row.aiReviewed,
      note: row.note,
      primaryKeyword: primary?.keyword ?? '',
      primaryKeywordId: row.primaryKeywordId,
      secondaryKeywords: ordered.filter((entry) => entry !== primary).map((entry) => entry.keyword),
      cannibalization: [], // derived via query-page cannibalization, not cluster-id counting
      clusterVersion: row.clusterVersion,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toMappingDto(row: UrlMapping): UrlMappingDto {
    return {
      id: row.id,
      siteId: row.siteId,
      clusterId: row.clusterId,
      keywordId: row.keywordId,
      url: row.url,
      wpPostId: row.wpPostId ? Number(row.wpPostId) : null,
      mappingType: (row.mappingType ?? 'EXISTING') as UrlMappingDto['mappingType'],
      status: (row.status ?? 'SUGGESTED') as UrlMappingDto['status'],
      source: row.source,
      confidence: row.confidence,
      reason: row.reason,
      manualOverride: row.manualOverride,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toCannibalizationDto(row: CannibalizationCase): CannibalizationCaseDto {
    return {
      id: row.id,
      siteId: row.siteId,
      clusterId: row.clusterId,
      query: row.query,
      urls: Array.isArray(row.urls) ? (row.urls as Array<{ url: string; impressions: number; clicks: number; position: number | null; activeDates: number }>) : [],
      classification: row.classification as CannibalizationCaseDto['classification'],
      score: row.score,
      recommendation: (row.recommendation ?? 'REVIEW') as CannibalizationCaseDto['recommendation'],
      reason: row.reason,
      status: row.status,
      preferredTarget: row.preferredTarget,
      detectedAt: row.detectedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async toOpportunityDto(row: KeywordOpportunity): Promise<KeywordOpportunityDto> {
    let clusterName: string | null = null;
    if (row.clusterId) {
      clusterName = (await this.clusters.findOne({ where: { id: row.clusterId } }))?.name ?? null;
    }
    let keyword: string | null = null;
    if (row.keywordId) {
      keyword = (await this.keywords.findOne({ where: { id: row.keywordId } }))?.keyword ?? null;
    }
    return {
      id: row.id,
      siteId: row.siteId,
      clusterId: row.clusterId,
      clusterName,
      keywordId: row.keywordId,
      keyword,
      type: row.type as KeywordOpportunityDto['type'],
      targetUrl: row.targetUrl,
      impact: row.impact as KeywordOpportunityDto['impact'],
      confidence: row.confidence,
      effort: row.effort as KeywordOpportunityDto['effort'],
      priorityScore: row.priorityScore,
      scoreVersion: row.scoreVersion,
      evidence: row.evidence,
      status: row.status as KeywordOpportunityDto['status'],
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

// -------------------------------------------------------------------------
// Module-level helpers
// -------------------------------------------------------------------------

function detectSiteLanguage(keyword: string): string | null {
  const ARABIC = /[\u0600-\u06FF]/;
  return ARABIC.test(keyword) ? 'ar' : 'en';
}

/** Maps an opportunity type to the content pipeline mode (Section 75). */
function opportunityTypeToAction(type: string): string {
  switch (type) {
    case 'UPDATE_EXISTING':
      return 'UPDATE';
    case 'EXPAND_EXISTING':
      return 'EXPAND';
    case 'CTR_OPTIMIZATION':
      return 'UPDATE';
    case 'MERGE':
      return 'MERGE';
    case 'REDIRECT':
      return 'REDIRECT';
    case 'CANNIBALIZATION':
      return 'REVIEW';
    default:
      return 'CREATE';
  }
}

import { createHash } from 'node:crypto';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function relevanceToScore(relevance: string): number {
  switch (relevance) {
    case 'CORE':
      return 1;
    case 'RELATED':
      return 0.7;
    case 'INFORMATIONAL_SUPPORT':
      return 0.5;
    case 'LOW_RELEVANCE':
      return 0.2;
    default:
      return 0;
  }
}

function evidenceConfidence(gsc: boolean, ads: boolean, hasContent: boolean): number {
  const sources = Number(gsc) + Number(ads) + Number(hasContent);
  if (sources === 0) return 0.1;
  if (sources === 1) return 0.4;
  if (sources === 2) return 0.7;
  return 0.9;
}

/** Finds the best existing URL for a cluster's primary keyword using title/H1/focus-keyword signals. */
function findBestUrl(
  inventory: Map<string, { url: string; title: string; keywords: string[] }>,
  normalizedPrimary: string,
): { url: string; confidence: number; reason: string } | null {
  if (!normalizedPrimary) return null;
  let best: { url: string; confidence: number; reason: string } | null = null;
  const terms = normalizedPrimary.split(' ').filter((t) => t.length > 2);
  for (const entry of inventory.values()) {
    const haystack = normalizeKeyword(`${entry.title} ${entry.keywords.join(' ')}`);
    const shared = terms.filter((t) => haystack.includes(t)).length;
    if (shared > 0) {
      const confidence = Math.min(0.9, 0.3 + shared / terms.length);
      if (!best || confidence > best.confidence) {
        best = { url: entry.url, confidence, reason: `Existing page matches ${shared}/${terms.length} primary terms` };
      }
    }
  }
  return best;
}

function findWpPostId(pages: WordPressPost[], url: string): string | null {
  const page = pages.find((p) => p.url === url);
  return page ? String(page.wpPostId) : null;
}
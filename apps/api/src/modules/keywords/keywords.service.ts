import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Cluster,
  ClusterKeyword,
  GscDailyMetric,
  GscProperty,
  Keyword,
  KeywordMetric,
  Site,
  UrlMapping,
} from '@creative-seo/database';
import { AiService } from '@creative-seo/ai';
import { buildRecommendedUrl, slugify } from '@creative-seo/content';
import type {
  ApproveClusterRequest,
  ClusterDto,
  KeywordDto,
  KeywordPipelineResultDto,
  KeywordSource,
  OverrideMappingRequest,
  UrlMappingDto,
} from '@creative-seo/types';
import { createHash } from 'crypto';
import { In, Repository } from 'typeorm';

const PIPELINE_SOURCE: KeywordSource = 'manual';

/**
 * Keyword engine: seed keywords, run the discovery -> clustering -> URL mapping
 * pipeline, list clusters/mappings and approve mappings (which is what makes a
 * URL part of the "approved URL map" used by the link-intelligence module).
 * Clustering uses the `clustering` AI workflow with a deterministic fallback.
 */
@Injectable()
export class KeywordsService {
  constructor(
    @InjectRepository(Keyword) private readonly keywords: Repository<Keyword>,
    @InjectRepository(KeywordMetric) private readonly metrics: Repository<KeywordMetric>,
    @InjectRepository(Cluster) private readonly clusters: Repository<Cluster>,
    @InjectRepository(ClusterKeyword) private readonly clusterKeywords: Repository<ClusterKeyword>,
    @InjectRepository(UrlMapping) private readonly mappings: Repository<UrlMapping>,
    @InjectRepository(GscProperty) private readonly properties: Repository<GscProperty>,
    @InjectRepository(GscDailyMetric) private readonly dailyMetrics: Repository<GscDailyMetric>,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    private readonly ai: AiService,
  ) {}

  // -------------------------------------------------------------------------
  // Keywords
  // -------------------------------------------------------------------------

  async seed(
    siteId: string,
    input: { keyword: string; intent?: KeywordDto['intent']; source?: KeywordSource },
  ): Promise<KeywordDto> {
    const normalized = normalizeKeyword(input.keyword);
    if (!normalized) {
      throw new BadRequestException('keyword must be a non-empty string');
    }
    const existing = await this.keywords.findOne({ where: { siteId, normalizedHash: hash(normalized) } });
    const row = existing ?? this.keywords.create({ siteId, normalized, normalizedHash: hash(normalized) });
    row.keyword = input.keyword.trim();
    row.intent = input.intent ?? 'INFORMATIONAL';
    row.source = input.source ?? PIPELINE_SOURCE;
    row.status = 'CANDIDATE';
    const saved = await this.keywords.save(row);
    return this.toKeywordDto(saved);
  }

  async listKeywords(siteId: string): Promise<KeywordDto[]> {
    const rows = await this.keywords.find({ where: { siteId }, order: { createdAt: 'DESC' } });
    return Promise.all(rows.map((row) => this.toKeywordDto(row)));
  }

  // -------------------------------------------------------------------------
  // Pipeline
  // -------------------------------------------------------------------------

  async runPipeline(
    siteId: string,
    organizationId: string | null,
    input: { keywords?: string[]; discoverFromGsc?: boolean },
  ): Promise<KeywordPipelineResultDto> {
    const site = await this.requireSite(siteId);
    const errors: string[] = [];

    // 1. Discover: explicit keywords + (optionally) top GSC queries.
    const ingested = await this.discover(siteId, input.keywords ?? [], input.discoverFromGsc ?? false, errors);

    // 2. Cluster: AI with deterministic fallback.
    const keywords = await this.keywords.find({ where: { siteId }, order: { createdAt: 'ASC' } });
    const keywordTexts = keywords.map((keyword) => keyword.keyword);
    const clusters = await this.clusterKeywordsAI(siteId, organizationId, keywordTexts).catch((error) => {
      errors.push(`AI clustering unavailable (${error instanceof Error ? error.message : 'unknown'}); using deterministic fallback`);
      return deterministicClusters(keywordTexts);
    });

    // 3. Map URLs + persist clusters.
    const createdClusters = await this.persistClusters(siteId, site.domain, clusters);
    const createdMappings = createdClusters.length;

    // Approve nothing automatically — the URL map only becomes "approved" via approveCluster().
    const pipelineClusters = await this.listClusters(siteId);

    return {
      siteId,
      ingested,
      createdKeywords: ingested,
      clusters: pipelineClusters,
      createdMappings,
      skippedManualOverrides: 0,
      errors,
    };
  }

  private async discover(siteId: string, explicit: string[], fromGsc: boolean, errors: string[]): Promise<number> {
    let created = 0;
    for (const keyword of explicit) {
      try {
        await this.seed(siteId, { keyword });
        created += 1;
      } catch (error) {
        errors.push(`Failed to seed "${keyword}": ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
    if (fromGsc) {
      const property = await this.properties.findOne({ where: { siteId, selected: true } });
      if (!property) {
        errors.push('discoverFromGsc requested but no selected GSC property exists');
      } else {
        const rows = await this.dailyMetrics
          .createQueryBuilder('metric')
          .select('metric.query', 'query')
          .addSelect('SUM(metric.impressions)', 'impressions')
          .where('metric.property_id = :propertyId', { propertyId: property.id })
          .andWhere("metric.query != ''")
          .groupBy('metric.query')
          .orderBy('"impressions"', 'DESC')
          .limit(50)
          .getRawMany<{ query: string; impressions: string }>();
        for (const row of rows) {
          if (!row.query || !row.query.trim()) continue;
          try {
            const exists = await this.keywords.findOne({ where: { siteId, normalizedHash: hash(normalizeKeyword(row.query)) } });
            if (!exists) {
              await this.seed(siteId, { keyword: row.query, intent: 'INFORMATIONAL', source: 'gsc' });
              created += 1;
            }
          } catch (error) {
            errors.push(`Failed to import GSC query "${row.query}": ${error instanceof Error ? error.message : 'unknown'}`);
          }
        }
      }
    }
    return created;
  }

  private async clusterKeywordsAI(
    siteId: string,
    organizationId: string | null,
    keywords: string[],
  ): Promise<Array<{ name: string; description: string; keywords: string[] }>> {
    if (keywords.length === 0) {
      return [];
    }
    const result = await this.ai.generateStructured<{ clusters: Array<{ name: string; description: string; keywords: string[] }> }>(
      'clustering',
      {
        site: siteId,
        keywords: JSON.stringify(keywords),
        rules: 'Group into non-overlapping topical clusters; each keyword appears exactly once.',
      },
      { siteId, organizationId, workflow: 'clustering' },
    );
    return result.data.clusters ?? [];
  }

  private async persistClusters(
    siteId: string,
    domain: string,
    clusters: Array<{ name: string; description: string; keywords: string[] }>,
  ): Promise<Array<{ id: string; name: string; url: string }>> {
    const created: Array<{ id: string; name: string; url: string }> = [];
    for (const item of clusters) {
      const names = item.keywords.filter(Boolean);
      if (names.length === 0) continue;
      const keywordRows = await this.findKeywordsByText(siteId, names);
      if (keywordRows.length === 0) continue;

      const primary = keywordRows[0]!;
      const slug = slugify(primary.keyword, 'en');
      const url = buildRecommendedUrl(domain, slug);

      const cluster = await this.clusters.save(
        this.clusters.create({
          siteId,
          name: item.name || primary.keyword,
          intent: primary.intent,
          pageType: 'BLOG',
          confidence: 0.8,
          targetUrl: null,
          recommendedAction: 'CREATE',
          status: 'DRAFT',
          aiReviewed: false,
          note: item.description || null,
        }),
      );

      for (let index = 0; index < keywordRows.length; index += 1) {
        const row = keywordRows[index]!;
        await this.clusterKeywords.save(
          this.clusterKeywords.create({ clusterId: cluster.id, keywordId: row.id, role: index === 0 ? 'PRIMARY' : 'SECONDARY' }),
        );
      }

      const existingMapping = await this.mappings.findOne({ where: { siteId, url } });
      if (!existingMapping) {
        await this.mappings.save(
          this.mappings.create({
            siteId,
            clusterId: cluster.id,
            keywordId: primary.id,
            url,
            source: 'pipeline',
            manualOverride: false,
            approvedBy: null,
          }),
        );
      }
      created.push({ id: cluster.id, name: cluster.name, url });
    }
    return created;
  }

  private async findKeywordsByText(siteId: string, texts: string[]): Promise<Keyword[]> {
    const rows: Keyword[] = [];
    for (const text of texts) {
      const row = await this.keywords.findOne({ where: { siteId, normalizedHash: hash(normalizeKeyword(text)) } });
      if (row) rows.push(row);
    }
    return rows;
  }

  // -------------------------------------------------------------------------
  // Clusters & URL mappings
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
    if (input.targetUrl) cluster.targetUrl = input.targetUrl;
    await this.clusters.save(cluster);

    const mapping = await this.mappings.findOne({ where: { clusterId: id } });
    if (mapping) {
      if (input.targetUrl) mapping.url = input.targetUrl;
      mapping.manualOverride = true;
      mapping.approvedBy = userId;
      await this.mappings.save(mapping);
    }
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
    row.url = input.url;
    row.manualOverride = true;
    row.approvedBy = userId;
    await this.mappings.save(row);
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

  private async toKeywordDto(row: Keyword): Promise<KeywordDto> {
    const metricRows = await this.metrics.find({ where: { keywordId: row.id } });
    const clicks = sum(metricRows.map((entry) => Number(entry.clicks)));
    const impressions = sum(metricRows.map((entry) => Number(entry.impressions)));
    const positions = metricRows.map((entry) => entry.position).filter((position) => position > 0);
    return {
      id: row.id,
      siteId: row.siteId,
      source: row.source as KeywordDto['source'],
      keyword: row.keyword,
      normalized: row.normalized,
      intent: row.intent as KeywordDto['intent'],
      status: row.status as KeywordDto['status'],
      metrics: {
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        avgPosition: positions.length > 0 ? positions.reduce((total, position) => total + position, 0) / positions.length : null,
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
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
    const cannibalization = await this.detectCannibalization(row.siteId, ordered.map((entry) => entry.keyword));

    return {
      id: row.id,
      siteId: row.siteId,
      name: row.name,
      intent: row.intent as ClusterDto['intent'],
      pageType: row.pageType as ClusterDto['pageType'],
      confidence: row.confidence,
      targetUrl: row.targetUrl,
      recommendedAction: row.recommendedAction as ClusterDto['recommendedAction'],
      status: row.status as ClusterDto['status'],
      aiReviewed: row.aiReviewed,
      note: row.note,
      primaryKeyword: primary?.keyword ?? '',
      secondaryKeywords: ordered.filter((entry) => entry !== primary).map((entry) => entry.keyword),
      cannibalization,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async detectCannibalization(siteId: string, keywords: string[]): Promise<string[]> {
    if (keywords.length === 0) return [];
    const others = await this.clusterKeywords
      .createQueryBuilder('link')
      .innerJoin(Keyword, 'keyword', 'keyword.id = link.keyword_id')
      .where('keyword.site_id = :siteId', { siteId })
      .andWhere('keyword.normalized IN (:...keywords)', { keywords: keywords.map(normalizeKeyword) })
      .select('link.cluster_id', 'clusterId')
      .groupBy('link.cluster_id')
      .having('COUNT(DISTINCT link.cluster_id) > 1')
      .getRawMany<{ clusterId: string }>();
    return others.map((row) => row.clusterId);
  }

  private toMappingDto(row: UrlMapping): UrlMappingDto {
    return {
      id: row.id,
      siteId: row.siteId,
      clusterId: row.clusterId,
      keywordId: row.keywordId,
      url: row.url,
      source: row.source,
      manualOverride: row.manualOverride,
      approvedBy: row.approvedBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function normalizeKeyword(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function firstWord(value: string): string {
  const words = value.split(' ').filter(Boolean);
  return words[0] ?? value;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function deterministicClusters(keywords: string[]): Array<{ name: string; description: string; keywords: string[] }> {
  if (keywords.length === 0) return [];
  const groups = new Map<string, string[]>();
  for (const keyword of keywords) {
    const key = firstWord(normalizeKeyword(keyword)) || keyword;
    const bucket = groups.get(key) ?? [];
    bucket.push(keyword);
    groups.set(key, bucket);
  }
  return [...groups.entries()].map(([name, items]) => ({
    name: titleCase(name),
    description: `Keywords grouped by "${name}"`,
    keywords: items,
  }));
}

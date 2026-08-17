import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cluster, ClusterKeyword, GscDailyMetric, GscProperty, Keyword, Site, UrlMapping } from '@creative-seo/database';
import { Repository } from 'typeorm';
import { AiService } from '@creative-seo/ai';
import { buildRecommendedUrl, slugify } from '@creative-seo/content';
import { heuristicIntent, heuristicPageType, normalizeKeyword } from '@creative-seo/keyword-engine';
import type { ClusterKeywordRole, KeywordDto } from '@creative-seo/types';
import { createHash } from 'crypto';

export interface HeadlessKeywordResult {
  ingested: number;
  createdKeywords: number;
  createdMappings: number;
  clusterCount: number;
  errors: string[];
}

/**
 * Headless keyword discovery -> clustering -> URL mapping pipeline for the
 * scheduled automation. Behaves exactly like the interactive pipeline: keywords
 * are discovered (explicit list and/or top GSC queries), clustered with AI and
 * a deterministic fallback, and clusters/URL mappings are persisted. Nothing is
 * approved automatically — the approved URL map remains a human decision.
 */
@Injectable()
export class HeadlessKeywordsService {
  constructor(
    @InjectRepository(Keyword) private readonly keywords: Repository<Keyword>,
    @InjectRepository(Cluster) private readonly clusters: Repository<Cluster>,
    @InjectRepository(ClusterKeyword) private readonly clusterKeywords: Repository<ClusterKeyword>,
    @InjectRepository(UrlMapping) private readonly mappings: Repository<UrlMapping>,
    @InjectRepository(GscProperty) private readonly properties: Repository<GscProperty>,
    @InjectRepository(GscDailyMetric) private readonly dailyMetrics: Repository<GscDailyMetric>,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    private readonly ai: AiService,
  ) {}

  async runPipeline(
    siteId: string,
    organizationId: string | null,
    input: { keywords?: string[]; discoverFromGsc?: boolean },
  ): Promise<HeadlessKeywordResult> {
    const site = await this.requireSite(siteId);
    const errors: string[] = [];

    const ingested = await this.discover(siteId, input.keywords ?? [], input.discoverFromGsc ?? false, errors);

    const keywords = await this.keywords.find({ where: { siteId }, order: { createdAt: 'ASC' } });
    const keywordTexts = keywords.map((keyword) => keyword.keyword);
    const clusters = await this.clusterKeywordsAI(siteId, organizationId, keywordTexts).catch((error) => {
      errors.push(`AI clustering unavailable (${error instanceof Error ? error.message : 'unknown'}); using deterministic fallback`);
      return deterministicClusters(keywordTexts);
    });

    const created = await this.persistClusters(siteId, site.domain, site.language, clusters);

    return {
      ingested,
      createdKeywords: ingested,
      createdMappings: created.length,
      clusterCount: clusters.length,
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
              await this.seed(siteId, { keyword: row.query, intent: 'INFORMATIONAL', source: 'GSC' });
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

  private async seed(siteId: string, input: { keyword: string; intent?: KeywordDto['intent']; source?: KeywordDto['source'] }): Promise<Keyword> {
    const normalized = normalizeKeyword(input.keyword);
    const existing = await this.keywords.findOne({ where: { siteId, normalizedHash: hash(normalized) } });
    const row = existing ?? this.keywords.create({ siteId, normalized, normalizedHash: hash(normalized) });
    row.keyword = input.keyword.trim();
    row.intent = input.intent ?? 'REVIEW_REQUIRED';
    row.source = input.source ?? 'MANUAL';
    row.status = 'DISCOVERED';
    return this.keywords.save(row);
  }

  private async clusterKeywordsAI(
    siteId: string,
    organizationId: string | null,
    keywords: string[],
  ): Promise<Array<{ name: string; description: string; keywords: string[] }>> {
    if (keywords.length === 0) return [];
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
    siteLanguageName: string,
    clusters: Array<{ name: string; description: string; keywords: string[] }>,
  ): Promise<Array<{ id: string; name: string; url: string }>> {
    const created: Array<{ id: string; name: string; url: string }> = [];
    for (const item of clusters) {
      const names = item.keywords.filter(Boolean);
      if (names.length === 0) continue;
      const keywordRows: Keyword[] = [];
      for (const name of names) {
        const row = await this.keywords.findOne({ where: { siteId, normalizedHash: hash(normalizeKeyword(name)) } });
        if (row) keywordRows.push(row);
      }
      if (keywordRows.length === 0) continue;

      const primary = keywordRows[0]!;
      const siteLanguage = siteLanguageName === 'Arabic' || siteLanguageName === 'ar' ? 'ar' : 'en';
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
          primaryKeywordId: primary.id,
          confidence: intent.confidence,
          targetUrl: null,
          recommendedAction: 'REVIEW',
          status: 'DRAFT',
          aiReviewed: false,
          clusterVersion: 'clustering-v1',
          note: item.description || null,
        }),
      );

      for (let index = 0; index < keywordRows.length; index += 1) {
        const row = keywordRows[index]!;
        const role: ClusterKeywordRole = index === 0 ? 'PRIMARY' : 'SECONDARY';
        await this.clusterKeywords.save(
          this.clusterKeywords.create({ clusterId: cluster.id, keywordId: row.id, role, source: 'clustering', approved: false }),
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

  private async requireSite(siteId: string): Promise<Site> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new Error('Site not found');
    }
    return site;
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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

function firstWord(value: string): string {
  const words = value.split(' ').filter(Boolean);
  return words[0] ?? value;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

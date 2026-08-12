import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cluster, ClusterKeyword, Keyword, KeywordMetric, Site } from '@creative-seo/database';
import type { PipelineInput, PipelineLanguage } from '@creative-seo/content';
import { In, Repository } from 'typeorm';
import type { RunPipelineRequestDto } from './content.dto';

/**
 * Resolves the pipeline input for a site from the request + database: site
 * knowledge, keyword cluster (+ its GSC performance) and the existing page
 * content when the caller supplies it. Internal-link candidates, verified
 * facts and research evidence come from the request body.
 */
@Injectable()
export class ContentInputResolver {
  constructor(
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(Cluster) private readonly clusters: Repository<Cluster>,
    @InjectRepository(ClusterKeyword) private readonly clusterKeywords: Repository<ClusterKeyword>,
    @InjectRepository(Keyword) private readonly keywords: Repository<Keyword>,
    @InjectRepository(KeywordMetric) private readonly keywordMetrics: Repository<KeywordMetric>,
  ) {}

  async resolve(siteId: string, dto: RunPipelineRequestDto, createdBy: string | null): Promise<PipelineInput> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }

    const language: PipelineLanguage = dto.language ?? (site.locale === 'ar' ? 'ar' : 'en');
    const settings = (site.settings ?? {}) as { regionalTerms?: string[]; voice?: string; competitorUrls?: string[] };
    const regionalTerms = settings.regionalTerms ?? [];

    const clusterInfo = await this.resolveCluster(dto.clusterId, dto.primaryKeyword, dto.secondaryKeywords);
    const keywordIds = await this.keywordIdsForCluster(dto.clusterId);
    const performance = await this.resolvePerformance(keywordIds);
    const targetUrl = dto.targetUrl ?? clusterInfo.clusterEntity?.targetUrl ?? null;

    return {
      site: {
        siteId: site.id,
        organizationId: site.organizationId,
        domain: site.domain,
        name: site.name,
        language,
        locale: dto.locale ?? site.locale,
        regionalTerms,
        voice: settings.voice ?? '',
        competitorUrls: settings.competitorUrls ?? [],
      },
      cluster: clusterInfo.cluster,
      targetUrl,
      existingPage: { url: dto.existingPageUrl ?? targetUrl, content: dto.existingPageContent ?? null },
      performance,
      internalLinkCandidates: (dto.internalLinkCandidates ?? []).map((link) => ({ url: link.url, anchorText: link.anchorText })),
      verifiedFacts: dto.verifiedFacts ?? [],
      researchEvidence: dto.researchEvidence ?? null,
      additionalInstructions: dto.additionalInstructions ?? '',
      createdBy,
    };
  }

  private async resolveCluster(
    clusterId: string | undefined,
    primaryKeyword?: string,
    secondaryKeywords?: string[],
  ): Promise<{ cluster: PipelineInput['cluster']; clusterEntity: Cluster | null }> {
    if (!clusterId) {
      if (!primaryKeyword) {
        throw new BadRequestException('Either clusterId or primaryKeyword is required');
      }
      return {
        cluster: {
          clusterId: null,
          name: null,
          primaryKeyword,
          secondaryKeywords: secondaryKeywords ?? [],
          intent: null,
          pageType: null,
        },
        clusterEntity: null,
      };
    }

    const entity = await this.clusters.findOne({ where: { id: clusterId } });
    if (!entity) {
      throw new NotFoundException('Cluster not found');
    }
    const keywords = await this.keywordsForCluster(clusterId);
    return {
      cluster: {
        clusterId: entity.id,
        name: entity.name,
        primaryKeyword:
          primaryKeyword ?? keywords.find((keyword) => keyword.role === 'PRIMARY')?.keyword ?? keywords[0]?.keyword ?? entity.name,
        secondaryKeywords: secondaryKeywords ?? keywords.filter((keyword) => keyword.role === 'SECONDARY').map((keyword) => keyword.keyword),
        intent: (entity.intent as PipelineInput['cluster']['intent']) ?? null,
        pageType: (entity.pageType as PipelineInput['cluster']['pageType']) ?? null,
      },
      clusterEntity: entity,
    };
  }

  private async keywordsForCluster(clusterId: string): Promise<Array<{ keyword: string; role: string }>> {
    const links = await this.clusterKeywords.find({ where: { clusterId } });
    const keywordIds = links.map((link) => link.keywordId);
    if (keywordIds.length === 0) return [];
    const keywords = await this.keywords.find({ where: { id: In(keywordIds) } });
    const byId = new Map(keywords.map((keyword) => [keyword.id, keyword]));
    return links
      .map((link) => {
        const keyword = byId.get(link.keywordId);
        return keyword ? { keyword: keyword.keyword, role: link.role } : null;
      })
      .filter((entry): entry is { keyword: string; role: string } => entry !== null);
  }

  private async keywordIdsForCluster(clusterId: string | undefined): Promise<string[]> {
    if (!clusterId) return [];
    const links = await this.clusterKeywords.find({ where: { clusterId } });
    return links.map((link) => link.keywordId);
  }

  private async resolvePerformance(keywordIds: string[]): Promise<PipelineInput['performance']> {
    if (keywordIds.length === 0) {
      return { clicks: 0, impressions: 0, ctr: 0, avgPosition: null };
    }
    const metrics = await this.keywordMetrics.find({ where: { keywordId: In(keywordIds) } });
    const clicks = sum(metrics.map((entry) => Number(entry.clicks)));
    const impressions = sum(metrics.map((entry) => Number(entry.impressions)));
    const positions = metrics.map((entry) => entry.position).filter((position) => position > 0);
    return {
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      avgPosition: positions.length > 0 ? positions.reduce((total, position) => total + position, 0) / positions.length : null,
    };
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

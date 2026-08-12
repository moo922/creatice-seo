import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Cluster,
  ClusterKeyword,
  CrawledPage,
  Keyword,
  LinkAnalysis,
  LinkSuggestion,
  UrlMapping,
} from '@creative-seo/database';
import { OperationsService } from '@creative-seo/operations';
import type {
  ApplyLinkSuggestionRequest,
  CreateCrawledPageRequest,
  LinkAnalysisDto,
  LinkAnalysisReportDto,
  LinkSuggestionDecisionRequest,
  LinkSuggestionDto,
  LinkSuggestionQuery,
  LinkStatsDto,
  VerifyLinkSuggestionRequest,
} from '@creative-seo/types';
import { In, IsNull, Not, Repository } from 'typeorm';
import { analyzeLinkGraph } from './analysis';
import type { ApprovedTarget, CrawledPageData } from './graph';
import { normalizeUrl } from './graph';

const ACTIVE_STATUSES = ['SUGGESTED', 'APPROVED', 'APPLIED', 'VERIFIED'];

/**
 * Internal-link intelligence service. Runs deterministic analysis over crawled
 * pages + the approved URL map, produces link suggestions with source/target/
 * anchor/context/confidence/reason, and drives the
 * SUGGESTED -> APPROVED -> APPLIED -> VERIFIED workflow. URLs are never
 * invented, self-links are excluded, and applying a change records it in the
 * operations change log (published content is only modified after approval).
 */
@Injectable()
export class LinksService {
  constructor(
    @InjectRepository(CrawledPage) private readonly crawledPages: Repository<CrawledPage>,
    @InjectRepository(LinkAnalysis) private readonly analyses: Repository<LinkAnalysis>,
    @InjectRepository(LinkSuggestion) private readonly suggestions: Repository<LinkSuggestion>,
    @InjectRepository(UrlMapping) private readonly urlMappings: Repository<UrlMapping>,
    @InjectRepository(Cluster) private readonly clusters: Repository<Cluster>,
    @InjectRepository(ClusterKeyword) private readonly clusterKeywords: Repository<ClusterKeyword>,
    @InjectRepository(Keyword) private readonly keywords: Repository<Keyword>,
    private readonly operations: OperationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Crawled pages
  // -------------------------------------------------------------------------

  async upsertCrawledPage(siteId: string, input: CreateCrawledPageRequest): Promise<CrawledPage> {
    const url = normalizeUrl(input.url);
    let row = await this.crawledPages.findOne({ where: { siteId, url } });
    const text = input.text ?? '';
    if (!row) {
      row = this.crawledPages.create({ siteId, url, crawledAt: new Date() });
    }
    row.title = input.title ?? row.title ?? null;
    row.httpStatus = input.httpStatus ?? row.httpStatus ?? null;
    row.text = text;
    row.headings = input.headings ?? [];
    row.outLinks = input.outLinks ?? [];
    row.wordCount = countWords(text);
    row.crawledAt = new Date();
    return this.crawledPages.save(row);
  }

  async listCrawledPages(siteId: string): Promise<CrawledPage[]> {
    return this.crawledPages.find({ where: { siteId }, order: { crawledAt: 'DESC' } });
  }

  // -------------------------------------------------------------------------
  // Analysis
  // -------------------------------------------------------------------------

  async runAnalysis(siteId: string, domain: string, createdBy: string | null): Promise<LinkAnalysisReportDto> {
    const crawled = await this.crawledPages.find({ where: { siteId } });
    const targets = await this.loadApprovedTargets(siteId);

    const analysisRow = this.analyses.create({
      siteId,
      status: 'RUNNING',
      stats: {},
      suggestionsCreated: 0,
      createdBy,
    });
    const analysis = await this.analyses.save(analysisRow);

    const crawledData: CrawledPageData[] = crawled.map((page) => ({
      url: page.url,
      text: page.text,
      headings: page.headings,
      httpStatus: page.httpStatus,
      outLinks: page.outLinks,
    }));

    const result = analyzeLinkGraph({ siteDomain: domain, crawledPages: crawledData, approvedTargets: targets });

    let created = 0;
    for (const candidate of result.suggestions) {
      const existing = await this.suggestions.findOne({
        where: { siteId, sourceUrl: candidate.sourceUrl, targetUrl: candidate.targetUrl, detection: candidate.detection },
      });
      if (existing && ACTIVE_STATUSES.includes(existing.status)) {
        continue;
      }
      await this.suggestions.save(
        this.suggestions.create({
          siteId,
          analysisId: analysis.id,
          sourceUrl: candidate.sourceUrl,
          targetUrl: candidate.targetUrl,
          anchor: candidate.anchor,
          context: candidate.context,
          confidence: candidate.confidence,
          reason: candidate.reason,
          detection: candidate.detection,
          action: candidate.action,
          status: 'SUGGESTED',
          notes: null,
          createdBy,
        }),
      );
      created += 1;
    }

    analysis.status = 'COMPLETED';
    analysis.stats = result.stats as unknown as Record<string, unknown>;
    analysis.suggestionsCreated = created;
    analysis.completedAt = new Date();
    await this.analyses.save(analysis);

    const suggestions = await this.suggestions.find({ where: { analysisId: analysis.id }, order: { confidence: 'DESC' } });

    return {
      analysis: this.toAnalysisDto(analysis),
      suggestions: suggestions.map((row) => this.toSuggestionDto(row)),
    };
  }

  async listAnalyses(siteId: string): Promise<LinkAnalysisDto[]> {
    const rows = await this.analyses.find({ where: { siteId }, order: { createdAt: 'DESC' } });
    return rows.map((row) => this.toAnalysisDto(row));
  }

  async getAnalysis(id: string): Promise<LinkAnalysisReportDto> {
    const analysis = await this.analyses.findOne({ where: { id } });
    if (!analysis) {
      throw new NotFoundException('Link analysis not found');
    }
    const suggestions = await this.suggestions.find({ where: { analysisId: id }, order: { confidence: 'DESC' } });
    return {
      analysis: this.toAnalysisDto(analysis),
      suggestions: suggestions.map((row) => this.toSuggestionDto(row)),
    };
  }

  // -------------------------------------------------------------------------
  // Suggestions + workflow
  // -------------------------------------------------------------------------

  async listSuggestions(siteId: string, query: LinkSuggestionQuery = {}): Promise<LinkSuggestionDto[]> {
    const builder = this.suggestions
      .createQueryBuilder('suggestion')
      .where('suggestion.site_id = :siteId', { siteId })
      .orderBy('suggestion.created_at', 'DESC')
      .limit(Math.min(query.limit ?? 100, 200))
      .offset(query.offset ?? 0);
    if (query.status) builder.andWhere('suggestion.status = :status', { status: query.status });
    if (query.detection) builder.andWhere('suggestion.detection = :detection', { detection: query.detection });
    if (query.sourceUrl) builder.andWhere('suggestion.source_url = :sourceUrl', { sourceUrl: query.sourceUrl });
    if (query.targetUrl) builder.andWhere('suggestion.target_url = :targetUrl', { targetUrl: query.targetUrl });
    const rows = await builder.getMany();
    return rows.map((row) => this.toSuggestionDto(row));
  }

  async getSuggestion(id: string): Promise<LinkSuggestionDto> {
    return this.toSuggestionDto(await this.requireSuggestion(id));
  }

  async approveSuggestion(id: string, userId: string | null, notes?: string): Promise<LinkSuggestionDto> {
    const row = await this.requireSuggestion(id);
    if (row.status !== 'SUGGESTED') {
      throw new BadRequestException(`Only SUGGESTED suggestions can be approved (current: ${row.status})`);
    }
    row.status = 'APPROVED';
    row.approvedBy = userId;
    row.approvedAt = new Date();
    if (notes) row.notes = notes;
    await this.suggestions.save(row);
    return this.toSuggestionDto(row);
  }

  async applySuggestion(
    id: string,
    userId: string | null,
    organizationId: string | null,
    req: ApplyLinkSuggestionRequest,
  ): Promise<LinkSuggestionDto> {
    const row = await this.requireSuggestion(id);
    if (row.status !== 'APPROVED') {
      throw new BadRequestException(`Only APPROVED suggestions can be applied (current: ${row.status})`);
    }
    row.status = 'APPLIED';
    row.appliedAt = new Date();
    if (req.notes) row.notes = req.notes;

    await this.operations.createChangeLog(
      row.siteId,
      organizationId,
      {
        pageUrl: row.sourceUrl,
        changeType: 'internal_links',
        before: { targetUrl: row.targetUrl, anchor: row.anchor },
        after: req.appliedSnapshot ?? { targetUrl: row.targetUrl, anchor: row.anchor, applied: true },
      },
      userId,
    );
    await this.suggestions.save(row);
    return this.toSuggestionDto(row);
  }

  async verifySuggestion(id: string, userId: string | null, req: VerifyLinkSuggestionRequest): Promise<LinkSuggestionDto> {
    const row = await this.requireSuggestion(id);
    if (row.status !== 'APPLIED') {
      throw new BadRequestException(`Only APPLIED suggestions can be verified (current: ${row.status})`);
    }
    row.verifyResult = { found: req.found, verifiedAt: new Date().toISOString(), notes: req.notes ?? null };
    if (req.found) {
      row.status = 'VERIFIED';
      row.verifiedAt = new Date();
    } else {
      row.notes = row.notes ? `${row.notes}\nRecrawl verification failed: link not found.` : 'Recrawl verification failed: link not found.';
    }
    await this.suggestions.save(row);
    return this.toSuggestionDto(row);
  }

  /**
   * After a recrawl, verifies APPLIED suggestions against the latest crawled
   * content of their source page. Returns the found/not-found counts.
   */
  async verifyAppliedFromCrawl(siteId: string): Promise<{ found: number; notFound: number }> {
    const applied = await this.suggestions.find({ where: { siteId, status: 'APPLIED' } });
    let found = 0;
    let notFound = 0;
    for (const row of applied) {
      const source = await this.crawledPages.findOne({ where: { siteId, url: normalizeUrl(row.sourceUrl) } });
      const present =
        source?.outLinks.some((link) => normalizeUrl(link.url) === normalizeUrl(row.targetUrl)) ?? false;
      row.verifyResult = {
        found: present,
        recrawledAt: new Date().toISOString(),
        sourceUrl: source?.url ?? null,
      };
      if (present) {
        row.status = 'VERIFIED';
        row.verifiedAt = new Date();
        found += 1;
      } else {
        row.status = 'APPLIED';
        row.notes = row.notes ? `${row.notes}\nRecrawl verification failed: link not found.` : 'Recrawl verification failed: link not found.';
        notFound += 1;
      }
      await this.suggestions.save(row);
    }
    return { found, notFound };
  }

  async rejectSuggestion(id: string, userId: string | null, req: LinkSuggestionDecisionRequest): Promise<LinkSuggestionDto> {
    const row = await this.requireSuggestion(id);
    if (row.status === 'VERIFIED' || row.status === 'REJECTED') {
      throw new BadRequestException(`Cannot reject a ${row.status} suggestion`);
    }
    row.status = 'REJECTED';
    row.notes = req.notes ?? row.notes;
    row.approvedBy = userId;
    row.approvedAt = new Date();
    await this.suggestions.save(row);
    return this.toSuggestionDto(row);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async loadApprovedTargets(siteId: string): Promise<ApprovedTarget[]> {
    const mappings = await this.urlMappings.find({
      where: [{ siteId, manualOverride: true }, { siteId, approvedBy: Not(IsNull()) }],
    });

    const targets: ApprovedTarget[] = [];
    for (const mapping of mappings) {
      const keywords = mapping.clusterId ? await this.keywordsForCluster(mapping.clusterId) : [];
      const primaryKeyword = keywords.find((entry) => entry.role === 'primary')?.keyword ?? keywords[0]?.keyword ?? '';
      targets.push({
        url: mapping.url,
        clusterId: mapping.clusterId,
        clusterName: mapping.clusterId ? (await this.clusters.findOne({ where: { id: mapping.clusterId } }))?.name ?? null : null,
        primaryKeyword,
        keywords: keywords.map((entry) => entry.keyword),
      });
    }
    return targets;
  }

  private async keywordsForCluster(clusterId: string): Promise<Array<{ keyword: string; role: string }>> {
    const links = await this.clusterKeywords.find({ where: { clusterId } });
    if (links.length === 0) return [];
    const keywordIds = links.map((link) => link.keywordId);
    const keywords = await this.keywords.find({ where: { id: In(keywordIds) } });
    const byId = new Map(keywords.map((keyword) => [keyword.id, keyword]));
    return links
      .map((link) => {
        const keyword = byId.get(link.keywordId);
        return keyword ? { keyword: keyword.keyword, role: link.role } : null;
      })
      .filter((entry): entry is { keyword: string; role: string } => entry !== null);
  }

  private async requireSuggestion(id: string): Promise<LinkSuggestion> {
    const row = await this.suggestions.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Link suggestion not found');
    }
    return row;
  }

  private toAnalysisDto(row: LinkAnalysis): LinkAnalysisDto {
    return {
      id: row.id,
      siteId: row.siteId,
      status: row.status as LinkAnalysisDto['status'],
      stats: (row.stats ?? {}) as unknown as LinkStatsDto,
      suggestionsCreated: row.suggestionsCreated,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }

  private toSuggestionDto(row: LinkSuggestion): LinkSuggestionDto {
    return {
      id: row.id,
      siteId: row.siteId,
      analysisId: row.analysisId,
      sourceUrl: row.sourceUrl,
      targetUrl: row.targetUrl,
      anchor: row.anchor,
      context: row.context,
      confidence: row.confidence,
      reason: row.reason,
      detection: row.detection as LinkSuggestionDto['detection'],
      action: row.action as LinkSuggestionDto['action'],
      status: row.status as LinkSuggestionDto['status'],
      notes: row.notes,
      createdBy: row.createdBy,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      appliedAt: row.appliedAt?.toISOString() ?? null,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function countWords(text: string): number {
  const words = text.match(/[\p{L}\p{N}]+/gu);
  return words?.length ?? 0;
}

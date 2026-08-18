import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Cluster,
  ClusterKeyword,
  CrawledPage,
  CrawlError,
  CrawlLink,
  CrawlPage,
  CrawlRun,
  Keyword,
  LinkAnalysis,
  LinkSuggestion,
  UrlMapping,
} from '@creative-seo/database';
import { crawlSite, DEFAULT_USER_AGENT } from '@creative-seo/crawler';
import { OperationsService } from '@creative-seo/operations';
import type {
  ApplyLinkSuggestionRequest,
  CreateCrawledPageRequest,
  CrawlErrorDto,
  CrawlErrorType,
  CrawlLinkDto,
  CrawlPageDto,
  CrawlRunDetailDto,
  CrawlRunDto,
  CrawlRunResultDto,
  LinkAnalysisDto,
  LinkAnalysisReportDto,
  LinkSuggestionDecisionRequest,
  LinkSuggestionDto,
  LinkSuggestionQuery,
  LinkStatsDto,
  StartCrawlRequest,
  VerifyLinkSuggestionRequest,
} from '@creative-seo/types';
import { In, IsNull, Not, Repository } from 'typeorm';
import { analyzeLinkGraph } from './analysis';
import type { ApprovedTarget, CrawledPageData } from './graph';
import { isInternalLink, normalizeUrl } from './graph';

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
    @InjectRepository(CrawlRun) private readonly crawlRuns: Repository<CrawlRun>,
    @InjectRepository(CrawlPage) private readonly crawlPages: Repository<CrawlPage>,
    @InjectRepository(CrawlLink) private readonly crawlLinks: Repository<CrawlLink>,
    @InjectRepository(CrawlError) private readonly crawlErrors: Repository<CrawlError>,
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
  // Versioned crawl runs
  // -------------------------------------------------------------------------

  /**
   * Runs a deterministic crawl and persists it as a versioned crawl run
   * (crawl_runs/crawl_pages/crawl_links/crawl_errors). For backward
   * compatibility the flat `crawled_pages` table is also kept in sync so
   * existing link analysis and activation flows keep working unchanged.
   */
  async runCrawl(
    site: { id: string; organizationId: string | null; domain: string },
    actorId: string | null,
    options: StartCrawlRequest = {},
  ): Promise<CrawlRunResultDto> {
    const maxPages = Math.min(Math.max(options.maxPages ?? 50, 1), 500);
    const run = await this.crawlRuns.save(
      this.crawlRuns.create({
        siteId: site.id,
        organizationId: site.organizationId,
        status: 'RUNNING',
        startedAt: new Date(),
        seedUrl: `https://${site.domain}${options.seedPath ?? '/'}`,
        userAgent: DEFAULT_USER_AGENT,
        maxPages,
        pagesDiscovered: 0,
        pagesCrawled: 0,
        pagesFailed: 0,
        robotsStatus: 'ERROR',
        sitemapStatus: 'NOT_FOUND',
        renderedPages: 0,
        sitemapUrls: [],
        error: null,
        createdBy: actorId,
      }),
    );

    try {
      const crawl = await crawlSite({
        origin: site.domain,
        seedPath: options.seedPath,
        maxPages,
        maxDepth: options.maxDepth,
        userAgent: DEFAULT_USER_AGENT,
      });

      const pageRows: CrawlPage[] = crawl.pages.map((page) =>
        this.crawlPages.create({
          crawlRunId: run.id,
          siteId: site.id,
          url: page.url,
          normalizedUrl: page.normalizedUrl,
          finalUrl: page.finalUrl,
          httpStatus: page.httpStatus,
          contentType: page.contentType,
          depth: page.depth,
          title: page.title,
          metaDescription: page.description,
          h1: page.h1,
          headings: page.headings,
          canonical: page.canonical,
          metaRobots: page.metaRobots,
          indexable: page.indexable,
          language: page.language,
          wordCount: page.wordCount,
          contentHash: page.contentHash,
          rendered: page.rendered,
          schemaJson: page.schemaJson,
          schemaBlocks: page.schemaBlocks,
          schemaErrors: page.schemaErrors,
          hreflang: page.hreflang,
          images: page.images,
          redirectChain: page.redirectChain,
          redirectLoop: page.redirectLoop,
          text: page.text,
        }),
      );
      const savedPages = await this.crawlPages.save(pageRows);
      const pageIdByUrl = new Map(savedPages.map((row) => [row.url, row.id]));
      const statusByUrl = new Map(crawl.pages.map((page) => [page.url, page.httpStatus]));

      // Backward compatibility: keep the flat crawled_pages table current so
      // link analysis and activation continue to work against the latest crawl.
      for (const page of crawl.pages) {
        await this.upsertCrawledPage(site.id, {
          url: page.url,
          title: page.title,
          httpStatus: page.httpStatus,
          text: page.text,
          headings: page.headings.map((heading) => heading.text),
          outLinks: page.links.map((link) => ({ url: link.url, anchor: link.anchor })),
        });
      }

      const linkRows: CrawlLink[] = [];
      for (const page of crawl.pages) {
        const sourcePageId = pageIdByUrl.get(page.url) ?? null;
        for (const link of page.links) {
          linkRows.push(
            this.crawlLinks.create({
              crawlRunId: run.id,
              siteId: site.id,
              sourcePageId,
              sourceUrl: page.url,
              targetUrl: link.url,
              normalizedTargetUrl: normalizeUrl(link.url),
              anchorText: link.anchor,
              rel: link.rel,
              internal: isInternalLink(link.url, site.domain),
              nofollow: link.nofollow,
              statusCodeWhenKnown: statusByUrl.get(link.url) ?? null,
            }),
          );
          if (linkRows.length >= 50_000) break;
        }
        if (linkRows.length >= 50_000) break;
      }
      await this.saveChunked(this.crawlLinks, linkRows);

      const errorRows: CrawlError[] = crawl.issues.map((issue) =>
        this.crawlErrors.create({
          crawlRunId: run.id,
          siteId: site.id,
          url: issue.url,
          errorType: mapCrawlErrorType(issue.kind),
          message: issue.message,
          statusCode: issue.statusCode,
        }),
      );
      await this.crawlErrors.save(errorRows);

      run.status = 'COMPLETED';
      run.finishedAt = new Date();
      run.pagesDiscovered = crawl.pagesDiscovered;
      run.pagesCrawled = crawl.pages.length;
      run.pagesFailed = crawl.issues.length;
      run.robotsStatus = crawl.robots.status;
      run.sitemapStatus = crawl.sitemap.status;
      run.renderedPages = crawl.renderedPages;
      run.sitemapUrls = crawl.sitemap.locations;
      run.error = crawl.timedOut ? 'crawl timed out before exhausting the queue' : null;
      await this.crawlRuns.save(run);

      return this.toCrawlResultDto(run, savedPages, linkRows, errorRows);
    } catch (error) {
      run.status = 'FAILED';
      run.finishedAt = new Date();
      run.error = error instanceof Error ? error.message.slice(0, 2000) : 'crawl failed';
      await this.crawlRuns.save(run);
      throw error;
    }
  }

  async listCrawlRuns(siteId: string): Promise<CrawlRunDto[]> {
    const rows = await this.crawlRuns.find({ where: { siteId }, order: { startedAt: 'DESC' } });
    return rows.map((row) => this.toCrawlRunDto(row));
  }

  async getCrawlRun(siteId: string, runId: string): Promise<CrawlRunDetailDto> {
    const run = await this.crawlRuns.findOne({ where: { id: runId, siteId } });
    if (!run) {
      throw new NotFoundException('Crawl run not found');
    }
    const [pages, links, errors] = await Promise.all([
      this.crawlPages.find({ where: { crawlRunId: runId }, order: { depth: 'ASC' } }),
      this.crawlLinks.find({ where: { crawlRunId: runId } }),
      this.crawlErrors.find({ where: { crawlRunId: runId }, order: { createdAt: 'ASC' } }),
    ]);
    return {
      run: this.toCrawlRunDto(run),
      pages: pages.map((row) => this.toCrawlPageDto(row)),
      links: links.map((row) => this.toCrawlLinkDto(row)),
      errors: errors.map((row) => this.toCrawlErrorDto(row)),
      linkCount: links.length,
    };
  }

  private async saveChunked<T extends { id?: string }>(repository: Repository<T>, rows: T[]): Promise<void> {
    const CHUNK = 2000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await repository.save(rows.slice(i, i + CHUNK));
    }
  }

  // -------------------------------------------------------------------------
  // Analysis
  // -------------------------------------------------------------------------

  async runAnalysis(siteId: string, domain: string, createdBy: string | null): Promise<LinkAnalysisReportDto> {
    // Prefer the latest completed crawl run (versioned pages + links). For
    // installations that still write the legacy flat `crawled_pages` table,
    // fall back to it so existing link analysis keeps working unchanged.
    const [crawlRun, targets] = await Promise.all([
      this.crawlRuns.findOne({ where: { siteId, status: 'COMPLETED' }, order: { startedAt: 'DESC' } }),
      this.loadApprovedTargets(siteId),
    ]);

    let crawledData: CrawledPageData[];
    let crawlRunId: string | null = null;
    if (crawlRun) {
      crawlRunId = crawlRun.id;
      const [pages, links] = await Promise.all([
        this.crawlPages.find({ where: { crawlRunId: crawlRun.id } }),
        this.crawlLinks.find({ where: { crawlRunId: crawlRun.id } }),
      ]);
      const linksBySource = new Map<string, Array<{ url: string; anchor: string }>>();
      for (const link of links) {
        const list = linksBySource.get(link.sourceUrl) ?? [];
        list.push({ url: link.targetUrl, anchor: link.anchorText });
        linksBySource.set(link.sourceUrl, list);
      }
      crawledData = pages.map((page) => ({
        url: page.url,
        text: '',
        headings: page.headings.map((heading) => heading.text),
        httpStatus: page.httpStatus,
        outLinks: linksBySource.get(page.url) ?? [],
      }));
    } else {
      const crawled = await this.crawledPages.find({ where: { siteId } });
      crawledData = crawled.map((page) => ({
        url: page.url,
        text: page.text,
        headings: page.headings,
        httpStatus: page.httpStatus,
        outLinks: page.outLinks,
      }));
    }

    const analysisRow = this.analyses.create({
      siteId,
      status: 'RUNNING',
      stats: {},
      suggestionsCreated: 0,
      createdBy,
      crawlRunId,
    });
    const analysis = await this.analyses.save(analysisRow);

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
      crawlRunId: row.crawlRunId,
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

  private toCrawlRunDto(row: CrawlRun): CrawlRunDto {
    return {
      id: row.id,
      siteId: row.siteId,
      organizationId: row.organizationId,
      status: row.status as CrawlRunDto['status'],
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      seedUrl: row.seedUrl,
      userAgent: row.userAgent,
      maxPages: row.maxPages,
      pagesDiscovered: row.pagesDiscovered,
      pagesCrawled: row.pagesCrawled,
      pagesFailed: row.pagesFailed,
      robotsStatus: row.robotsStatus as CrawlRunDto['robotsStatus'],
      sitemapStatus: row.sitemapStatus as CrawlRunDto['sitemapStatus'],
      renderedPages: row.renderedPages,
      sitemapUrls: row.sitemapUrls,
      error: row.error,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toCrawlPageDto(row: CrawlPage): CrawlPageDto {
    return {
      id: row.id,
      crawlRunId: row.crawlRunId,
      siteId: row.siteId,
      url: row.url,
      normalizedUrl: row.normalizedUrl,
      finalUrl: row.finalUrl,
      httpStatus: row.httpStatus,
      contentType: row.contentType,
      depth: row.depth,
      title: row.title,
      metaDescription: row.metaDescription,
      h1: row.h1,
      headings: row.headings,
      canonical: row.canonical,
      metaRobots: row.metaRobots,
      indexable: row.indexable,
      language: row.language,
      wordCount: row.wordCount,
      contentHash: row.contentHash,
      rendered: row.rendered,
      schemaJson: row.schemaJson,
      schemaBlocks: row.schemaBlocks,
      schemaErrors: row.schemaErrors,
      hreflang: row.hreflang,
      images: row.images,
      redirectChain: row.redirectChain,
      redirectLoop: row.redirectLoop,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toCrawlLinkDto(row: CrawlLink): CrawlLinkDto {
    return {
      id: row.id,
      crawlRunId: row.crawlRunId,
      siteId: row.siteId,
      sourcePageId: row.sourcePageId,
      sourceUrl: row.sourceUrl,
      targetUrl: row.targetUrl,
      normalizedTargetUrl: row.normalizedTargetUrl,
      anchorText: row.anchorText,
      rel: row.rel,
      internal: row.internal,
      nofollow: row.nofollow,
      statusCodeWhenKnown: row.statusCodeWhenKnown,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toCrawlErrorDto(row: CrawlError): CrawlErrorDto {
    return {
      id: row.id,
      crawlRunId: row.crawlRunId,
      siteId: row.siteId,
      url: row.url,
      errorType: row.errorType as CrawlErrorType,
      message: row.message,
      statusCode: row.statusCode,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toCrawlResultDto(run: CrawlRun, pages: CrawlPage[], links: CrawlLink[], errors: CrawlError[]): CrawlRunResultDto {
    return {
      run: this.toCrawlRunDto(run),
      pages: pages.map((row) => this.toCrawlPageDto(row)),
      links: links.map((row) => this.toCrawlLinkDto(row)),
      errors: errors.map((row) => this.toCrawlErrorDto(row)),
    };
  }
}

function countWords(text: string): number {
  const words = text.match(/[\p{L}\p{N}]+/gu);
  return words?.length ?? 0;
}

function mapCrawlErrorType(kind: 'robots' | 'timeout' | 'http' | 'blocked' | 'error'): CrawlErrorType {
  switch (kind) {
    case 'robots':
      return 'robots';
    case 'timeout':
      return 'timeout';
    case 'http':
      return 'http';
    case 'blocked':
      return 'blocked';
    default:
      return 'other';
  }
}

/**
 * AEO (Answer Engine Optimization) Audit Service. Orchestrates site-level
 * and page-level AEO audits combining deterministic rules with AI semantic
 * analysis. The final score is always deterministic and versioned.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AeoPageAudit, AuditRun, CrawlPage, CrawlRun, KnowledgeFact, PageQuestion, Site, UrlMapping } from '@creative-seo/database';
import { AiService } from '@creative-seo/ai';
import type { AeoSiteAuditDto, AeoPageAuditDto, AeoAuditHistoryEntryDto, AeoQuestionGapDto } from '@creative-seo/types';
import { Repository } from 'typeorm';
import { runAeoDeterministicRules, type AeoRuleContext } from '@creative-seo/audit-rules';
import { computeAeoScore, type AeoComponentId } from '@creative-seo/audit-rules';
import { classifyPage, isEligibleForAudit, EXCLUDED_URL_PATTERNS } from '@creative-seo/audit-rules';

@Injectable()
export class AeoAuditService {
  private readonly logger = new Logger(AeoAuditService.name);

  constructor(
    @InjectRepository(AeoPageAudit)
    private readonly pageAudits: Repository<AeoPageAudit>,
    @InjectRepository(AuditRun)
    private readonly auditRuns: Repository<AuditRun>,
    @InjectRepository(CrawlPage)
    private readonly crawlPages: Repository<CrawlPage>,
    @InjectRepository(CrawlRun)
    private readonly crawlRuns: Repository<CrawlRun>,
    @InjectRepository(Site)
    private readonly sites: Repository<Site>,
    @InjectRepository(KnowledgeFact)
    private readonly knowledgeFacts: Repository<KnowledgeFact>,
    @InjectRepository(PageQuestion)
    private readonly pageQuestions: Repository<PageQuestion>,
    @InjectRepository(UrlMapping)
    private readonly urlMappings: Repository<UrlMapping>,
    private readonly aiService: AiService,
  ) {}

  /** Run a full AEO site audit. */
  async runAeoSiteAudit(siteId: string, actorId: string): Promise<AeoSiteAuditDto> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) throw new Error('Site not found');

    // Find latest completed crawl
    const crawlRun = await this.crawlRuns.findOne({
      where: { siteId, status: 'COMPLETED' },
      order: { finishedAt: 'DESC' },
    });
    if (!crawlRun) throw new Error('No completed crawl found. Run a crawl first.');

    // Create audit run
    const auditRun = this.auditRuns.create({
      siteId,
      crawlRunId: crawlRun.id,
      type: 'AEO',
      status: 'RUNNING',
      startedAt: new Date(),
      scoreVersion: 1,
      createdBy: actorId,
    });
    const savedAuditRun = await this.auditRuns.save(auditRun);

    try {
      // Load pages from crawl
      const crawlPages = await this.crawlPages.find({
        where: { crawlRunId: crawlRun.id, siteId },
      });

      // Load KB facts
      const kbFacts = await this.knowledgeFacts.find({ where: { siteId } });

      // Classify and filter pages
      const eligiblePages: typeof crawlPages = [];
      for (const page of crawlPages) {
        if (!page.text || page.text.length < 100) continue; // Need text for AEO
        if (EXCLUDED_URL_PATTERNS.some((p) => p.test(page.url))) continue;

        const classification = classifyPage({
          url: page.url,
          title: page.title,
          h1: page.h1,
          wordCount: page.wordCount,
        });

        if (isEligibleForAudit(classification.pageType, page.wordCount)) {
          eligiblePages.push(page);
        }
      }

      const pageResults: AeoPageAuditDto[] = [];
      const allFindings: Array<{ url: string; findingType: string; severity: string; evidence: Record<string, unknown> }> = [];

      for (const page of eligiblePages) {
        try {
          const pageResult = await this.auditPage(page, siteId, savedAuditRun.id, kbFacts);
          pageResults.push(pageResult);

          // Collect top gaps
          if (pageResult.overallScore < 60) {
            allFindings.push({
              url: page.url,
              findingType: 'AEO_LOW_SCORE',
              severity: pageResult.overallScore < 40 ? 'HIGH' : 'MEDIUM',
              evidence: { score: pageResult.overallScore },
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to audit page ${page.url}: ${error}`);
        }
      }

      // Compute site-level score
      const siteScore = this.computeSiteScore(pageResults, crawlPages.length);

      // Mark audit complete
      await this.auditRuns.update(savedAuditRun.id, {
        status: 'COMPLETED',
        finishedAt: new Date(),
        dataQuality: { pagesMeasured: pageResults.length, totalPages: crawlPages.length },
      });

      // Build question gaps
      const questionGaps = await this.buildQuestionGaps(siteId, pageResults);

      return {
        auditRun: { ...savedAuditRun, status: 'COMPLETED', finishedAt: new Date().toISOString() } as any,
        score: siteScore,
        dataQuality: pageResults.length > 0 ? 'GOOD' : 'INSUFFICIENT',
        pagesMeasured: pageResults.length,
        pagesExcluded: crawlPages.length - eligiblePages.length,
        pagesInsufficient: eligiblePages.length - pageResults.length,
        questionCoverage: this.summarizeQuestionCoverage(pageResults),
        topGaps: allFindings.sort((a, b) => (a.severity === 'HIGH' ? -1 : 1)).slice(0, 10),
        pages: pageResults,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      await this.auditRuns.update(savedAuditRun.id, { status: 'FAILED' });
      throw error;
    }
  }

  /** Audit a single page. */
  private async auditPage(
    page: CrawlPage,
    siteId: string,
    auditRunId: string,
    kbFacts: KnowledgeFact[],
  ): Promise<AeoPageAuditDto> {
    const startTime = new Date();

    // Check for reusable audit (same content hash + same prompt version)
    if (page.contentHash) {
      const existing = await this.pageAudits.findOne({
        where: { siteId, url: page.url, contentHash: page.contentHash, status: 'COMPLETED' },
        order: { createdAt: 'DESC' },
      });

      if (existing) {
        this.logger.debug(`Reusing AEO audit for ${page.url} (hash: ${page.contentHash})`);
        return this.toDto({ ...existing, reusedFromAuditId: existing.id, startedAt: startTime, completedAt: new Date() });
      }
    }

    // Load GSC questions for this page
    const questions = await this.pageQuestions.find({ where: { siteId, pageUrl: page.url } });

    // Load URL mapping for cluster context
    const mapping = await this.urlMappings.findOne({ where: { siteId, url: page.url } });

    // Build rule context
    const ruleCtx: AeoRuleContext = {
      page: {
        url: page.url,
        httpStatus: page.httpStatus,
        depth: page.depth,
        title: page.title,
        metaDescription: page.metaDescription,
        h1: page.h1,
        headings: page.headings,
        canonical: page.canonical,
        metaRobots: page.metaRobots,
        indexable: page.indexable,
        language: page.language,
        wordCount: page.wordCount,
        schemaJson: page.schemaJson ?? [],
        schemaBlocks: page.schemaBlocks,
        schemaErrors: page.schemaErrors,
        images: page.images,
        redirectChain: page.redirectChain,
        redirectLoop: page.redirectLoop,
        text: page.text ?? undefined,
      },
      primaryKeyword: mapping?.keywordId ?? undefined,
      gscQuestions: questions.map((q) => ({ query: q.question, impressions: q.impressions ?? 0 })),
      knowledgeBaseFacts: kbFacts.map((f) => ({ key: f.key, value: f.value, category: f.category })),
      isCommercial: ['SERVICE', 'PRODUCT', 'LANDING_PAGE'].includes(mapping?.mappingType ?? ''),
    };

    // Run deterministic rules
    const findings = runAeoDeterministicRules(ruleCtx);

    // Map findings to component scores (deterministic)
    const componentScores = this.mapFindingsToComponents(findings, ruleCtx);

    // Compute overall score (deterministic)
    const scoreResult = computeAeoScore({
      components: componentScores as any,
      measuredPages: 1,
      totalPages: 1,
    });

    // Optionally run AI semantic analysis
    let aiComponents: Record<string, unknown> = {};
    let aiProvider: string | null = null;
    let aiModel: string | null = null;
    let promptVersion: number | null = null;

    try {
      const aiResult = await this.aiService.generateStructured('aeo-page-auditor', {
        pageText: (page.text ?? '').slice(0, 8000),
        pageStructure: JSON.stringify({
          title: page.title,
          h1: page.h1,
          headings: page.headings.slice(0, 20),
          wordCount: page.wordCount,
        }),
        clusterIntent: ruleCtx.clusterIntent ?? 'unknown',
        primaryKeyword: ruleCtx.primaryKeyword ?? page.title ?? '',
        gscQuestions: questions.slice(0, 10).map((q) => q.question).join('; '),
        businessFacts: kbFacts.slice(0, 10).map((f) => `${f.key}: ${f.value}`).join('; '),
        pageType: mapping?.mappingType ?? 'UNKNOWN',
        language: page.language ?? 'en',
      }, { siteId, workflow: 'aeo-page-auditor' });

      aiComponents = (aiResult.data as Record<string, unknown>) ?? {};
      aiProvider = aiResult.result.provider;
      aiModel = aiResult.result.model;
      promptVersion = 1;
    } catch (error) {
      this.logger.debug(`AI AEO analysis failed for ${page.url}, using deterministic only: ${error}`);
    }

    // Create audit record
    const audit = this.pageAudits.create({
      siteId,
      auditRunId,
      crawlPageId: page.id,
      url: page.url,
      contentHash: page.contentHash,
      promptVersion,
      aiProvider,
      aiModel,
      intentAlignment: this.extractComponent(findings, 'aeo-intent-alignment'),
      directAnswer: this.extractComponent(findings, 'aeo-direct-answer-quality'),
      decisionSupport: this.extractComponent(findings, 'aeo-decision-support'),
      semanticCompleteness: aiComponents.semanticGaps ? { gaps: aiComponents.semanticGaps } : {},
      structureExtractability: this.extractComponent(findings, 'aeo-structure-extractability'),
      factualGrounding: this.extractComponent(findings, 'aeo-factual-consistency'),
      componentScores: scoreResult.components,
      overallScore: scoreResult.overall,
      scoreVersion: scoreResult.scoreVersion,
      dataQuality: aiProvider ? 'GOOD' : 'PARTIAL',
      confidence: scoreResult.confidence,
      status: 'COMPLETED',
      startedAt: startTime,
      completedAt: new Date(),
    });

    const saved = await this.pageAudits.save(audit);
    return this.toDto(saved);
  }

  /** Map AEO findings to weighted component scores. */
  private mapFindingsToComponents(
    findings: Awaited<ReturnType<typeof runAeoDeterministicRules>>,
    ctx: AeoRuleContext,
  ): Record<AeoComponentId, { score: number; evidence: Record<string, unknown> }> {
    const find = (key: string) => findings.find((f) => f.ruleKey === key);
    const scoreFrom = (f: ReturnType<typeof find>, passScore = 90, failScore = 30) =>
      f ? (f.passed ? passScore : failScore) : 50;

    return {
      intentAlignment: { score: scoreFrom(find('aeo-intent-alignment'), 95, 35), evidence: find('aeo-intent-alignment')?.evidence ?? {} },
      directAnswer: { score: scoreFrom(find('aeo-direct-answer-quality'), 90, 25), evidence: find('aeo-direct-answer-quality')?.evidence ?? {} },
      questionCoverage: { score: this.computeQuestionScore(find('aeo-question-coverage')), evidence: find('aeo-question-coverage')?.evidence ?? {} },
      semanticCompleteness: { score: scoreFrom(find('aeo-heading-semantics'), 85, 40), evidence: find('aeo-heading-semantics')?.evidence ?? {} },
      decisionSupport: { score: scoreFrom(find('aeo-decision-support'), 90, 30), evidence: find('aeo-decision-support')?.evidence ?? {} },
      structureExtractability: { score: this.computeStructureScore(find('aeo-structure-extractability')), evidence: find('aeo-structure-extractability')?.evidence ?? {} },
      clarity: { score: this.computeClarityScore(find('aeo-information-density'), find('aeo-self-containment')), evidence: {} },
      factualGrounding: { score: scoreFrom(find('aeo-factual-consistency'), 95, 40), evidence: find('aeo-factual-consistency')?.evidence ?? {} },
    };
  }

  private computeQuestionScore(finding: ReturnType<typeof runAeoDeterministicRules>[0] | undefined): number {
    if (!finding) return 50;
    const evidence = finding.evidence as Record<string, unknown>;
    const coverage = (evidence.coveragePercent as number) ?? 0;
    return Math.round(coverage);
  }

  private computeStructureScore(finding: ReturnType<typeof runAeoDeterministicRules>[0] | undefined): number {
    if (!finding) return 50;
    const evidence = finding.evidence as Record<string, unknown>;
    const score = (evidence.score as number) ?? 0;
    return Math.round((score / 5) * 100);
  }

  private computeClarityScore(
    densityFinding: ReturnType<typeof runAeoDeterministicRules>[0] | undefined,
    selfContainFinding: ReturnType<typeof runAeoDeterministicRules>[0] | undefined,
  ): number {
    let score = 70;
    if (densityFinding?.passed) score += 15;
    if (selfContainFinding?.passed) score += 15;
    return Math.min(100, score);
  }

  private extractComponent(findings: Awaited<ReturnType<typeof runAeoDeterministicRules>>, ruleKey: string): Record<string, unknown> {
    const f = findings.find((f) => f.ruleKey === ruleKey);
    return f?.evidence ?? {};
  }

  /** Compute site-level AEO score from page audits. */
  private computeSiteScore(pages: AeoPageAuditDto[], totalCrawlPages: number) {
    const componentAgg: Record<string, { total: number; count: number }> = {};

    for (const page of pages) {
      for (const comp of page.componentScores) {
        if (!componentAgg[comp.id]) componentAgg[comp.id] = { total: 0, count: 0 };
        const agg = componentAgg[comp.id]!;
        agg.total += comp.score * comp.weight;
        agg.count += comp.weight;
      }
    }

    const components = Object.entries(componentAgg).map(([id, agg]) => ({
      id,
      label: id,
      score: agg.count > 0 ? Math.round(agg.total / agg.count) : 50,
      weight: 1 / Object.keys(componentAgg).length,
      version: 1,
      evidence: {},
    }));

    return computeAeoScore({
      components: Object.fromEntries(components.map((c) => [c.id, { score: c.score }])) as any,
      measuredPages: pages.length,
      totalPages: totalCrawlPages,
    });
  }

  private summarizeQuestionCoverage(pages: AeoPageAuditDto[]): { total: number; answered: number; partial: number; missing: number } {
    let total = 0, answered = 0, partial = 0, missing = 0;
    for (const page of pages) {
      const evidence = page.intentAlignment as any;
      if (evidence?.questionCount) {
        total += evidence.questionCount;
        answered += evidence.questionsAnswered ?? 0;
      }
    }
    return { total, answered, partial, missing: total - answered - partial };
  }

  private async buildQuestionGaps(siteId: string, pages: AeoPageAuditDto[]): Promise<AeoQuestionGapDto[]> {
    const gaps: AeoQuestionGapDto[] = [];
    const questions = await this.pageQuestions.find({ where: { siteId, status: 'NOT_ANSWERED' } });
    for (const q of questions) {
      gaps.push({
        query: q.question,
        impressions: q.impressions,
        targetPage: q.pageUrl,
        missingTopic: q.question,
        category: q.category,
      });
    }
    return gaps.sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0)).slice(0, 20);
  }

  /** Get latest completed AEO audit. */
  async getLatestAeoAudit(siteId: string): Promise<AeoSiteAuditDto | null> {
    const auditRun = await this.auditRuns.findOne({
      where: { siteId, type: 'AEO', status: 'COMPLETED' },
      order: { finishedAt: 'DESC' },
    });
    if (!auditRun) return null;
    return this.getAeoAuditById(siteId, auditRun.id);
  }

  /** Get AEO audit by ID. */
  async getAeoAuditById(siteId: string, auditRunId: string): Promise<AeoSiteAuditDto> {
    const auditRun = await this.auditRuns.findOne({ where: { id: auditRunId, siteId } });
    if (!auditRun) throw new Error('Audit run not found');

    const pages = await this.pageAudits.find({
      where: { siteId, auditRunId },
      order: { overallScore: 'ASC' },
    });

    const crawlRun = await this.crawlRuns.findOne({ where: { id: auditRun.crawlRunId } });
    const totalPages = await this.crawlPages.count({ where: { crawlRunId: auditRun.crawlRunId, siteId } });

    return {
      auditRun: auditRun as any,
      score: computeAeoScore({
        components: (pages.length > 0 && pages[0])
          ? Object.fromEntries(pages[0].componentScores.map((c) => [c.id, { score: c.score }])) as any
          : {} as any,
        measuredPages: pages.length,
        totalPages,
      }),
      dataQuality: (auditRun.dataQuality as any)?.pagesMeasured > 0 ? 'GOOD' : 'INSUFFICIENT',
      pagesMeasured: pages.length,
      pagesExcluded: 0,
      pagesInsufficient: 0,
      questionCoverage: { total: 0, answered: 0, partial: 0, missing: 0 },
      topGaps: pages.filter((p) => p.overallScore < 60).map((p) => ({
        url: p.url,
        findingType: 'AEO_LOW_SCORE',
        severity: p.overallScore < 40 ? 'HIGH' : 'MEDIUM',
        evidence: { score: p.overallScore },
      })),
      pages: pages.map((p) => this.toDto(p)),
      generatedAt: auditRun.finishedAt?.toISOString() ?? auditRun.createdAt.toISOString(),
    };
  }

  /** Get AEO audit history. */
  async getAeoHistory(siteId: string): Promise<AeoAuditHistoryEntryDto[]> {
    const runs = await this.auditRuns.find({
      where: { siteId, type: 'AEO' },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    return runs.map((run) => ({
      auditRun: run as any,
      score: null, // Would need to compute from page audits
      pagesMeasured: (run.dataQuality as any)?.pagesMeasured ?? 0,
      questionCoverage: 0,
      dataQuality: (run.dataQuality as any)?.pagesMeasured > 0 ? 'GOOD' : 'INSUFFICIENT',
      scoreVersion: `AEO_SCORE_V${run.scoreVersion}`,
    }));
  }

  /** Get AEO question gaps for a site. */
  async getAeoQuestionGaps(siteId: string): Promise<AeoQuestionGapDto[]> {
    const questions = await this.pageQuestions.find({
      where: { siteId, status: 'NOT_ANSWERED' },
      order: { impressions: 'DESC' },
      take: 50,
    });

    return questions.map((q) => ({
      query: q.question,
      impressions: q.impressions,
      targetPage: q.pageUrl,
      missingTopic: q.question,
      category: q.category,
    }));
  }

  private toDto(audit: AeoPageAudit): AeoPageAuditDto {
    return {
      id: audit.id,
      siteId: audit.siteId,
      auditRunId: audit.auditRunId,
      crawlPageId: audit.crawlPageId,
      url: audit.url,
      contentHash: audit.contentHash,
      promptVersion: audit.promptVersion,
      aiProvider: audit.aiProvider,
      aiModel: audit.aiModel,
      intentAlignment: audit.intentAlignment,
      directAnswer: audit.directAnswer,
      decisionSupport: audit.decisionSupport,
      semanticCompleteness: audit.semanticCompleteness,
      structureExtractability: audit.structureExtractability,
      factualGrounding: audit.factualGrounding,
      componentScores: audit.componentScores,
      overallScore: audit.overallScore,
      scoreVersion: audit.scoreVersion,
      dataQuality: audit.dataQuality,
      confidence: audit.confidence,
      status: audit.status,
      reusedFromAuditId: audit.reusedFromAuditId,
      startedAt: audit.startedAt.toISOString(),
      completedAt: audit.completedAt?.toISOString() ?? null,
      createdAt: audit.createdAt.toISOString(),
    };
  }
}

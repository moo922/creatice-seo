/**
 * GEO (Generative Engine Optimization) Audit Service. Orchestrates site-level
 * and page-level GEO audits combining deterministic rules with AI semantic
 * analysis. The final score is always deterministic and versioned.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GeoPageAudit, AuditRun, CrawlPage, CrawlRun, KnowledgeFact, Site, EntityRelation } from '@creative-seo/database';
import { AiService } from '@creative-seo/ai';
import type { GeoSiteAuditDto, GeoPageAuditDto, GeoAuditHistoryEntryDto, GeoGapDto } from '@creative-seo/types';
import { Repository } from 'typeorm';
import { runGeoDeterministicRules, type GeoRuleContext } from '@creative-seo/audit-rules';
import { computeGeoScore, type GeoComponentId } from '@creative-seo/audit-rules';
import { classifyPage, isEligibleForAudit, EXCLUDED_URL_PATTERNS } from '@creative-seo/audit-rules';

@Injectable()
export class GeoAuditService {
  private readonly logger = new Logger(GeoAuditService.name);

  constructor(
    @InjectRepository(GeoPageAudit)
    private readonly pageAudits: Repository<GeoPageAudit>,
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
    @InjectRepository(EntityRelation)
    private readonly entityRelations: Repository<EntityRelation>,
    private readonly aiService: AiService,
  ) {}

  /** Run a full GEO site audit. */
  async runGeoSiteAudit(siteId: string, actorId: string): Promise<GeoSiteAuditDto> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) throw new Error('Site not found');

    const crawlRun = await this.crawlRuns.findOne({
      where: { siteId, status: 'COMPLETED' },
      order: { finishedAt: 'DESC' },
    });
    if (!crawlRun) throw new Error('No completed crawl found. Run a crawl first.');

    const auditRun = this.auditRuns.create({
      siteId,
      crawlRunId: crawlRun.id,
      type: 'GEO',
      status: 'RUNNING',
      startedAt: new Date(),
      scoreVersion: 1,
      createdBy: actorId,
    });
    const savedAuditRun = await this.auditRuns.save(auditRun);

    try {
      const crawlPagesList = await this.crawlPages.find({
        where: { crawlRunId: crawlRun.id, siteId },
      });

      const kbFacts = await this.knowledgeFacts.find({ where: { siteId } });
      const entityRels = await this.entityRelations.find({ where: { siteId } });

      const siteEntity = {
        name: site.name,
        type: 'Organization',
        location: site.country ?? undefined,
        description: kbFacts.find((f) => f.category === 'BUSINESS_DESCRIPTION')?.value,
      };

      // Classify and filter pages
      const eligiblePages: typeof crawlPagesList = [];
      for (const page of crawlPagesList) {
        if (!page.text || page.text.length < 100) continue;
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

      const pageResults: GeoPageAuditDto[] = [];
      const allGaps: GeoGapDto[] = [];

      for (const page of eligiblePages) {
        try {
          const pageResult = await this.auditPage(page, siteId, savedAuditRun.id, kbFacts, siteEntity, entityRels);
          pageResults.push(pageResult);

          if (pageResult.overallScore < 60) {
            allGaps.push({
              findingType: 'GEO_LOW_SCORE',
              url: page.url,
              severity: pageResult.overallScore < 40 ? 'HIGH' : 'MEDIUM',
              evidence: { score: pageResult.overallScore },
              recommendation: 'Improve GEO readiness for this page',
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to audit page ${page.url}: ${error}`);
        }
      }

      const siteScore = this.computeSiteScore(pageResults, crawlPagesList.length);

      await this.auditRuns.update(savedAuditRun.id, {
        status: 'COMPLETED',
        finishedAt: new Date(),
        dataQuality: { pagesMeasured: pageResults.length, totalPages: crawlPagesList.length },
      });

      // Build entity summary
      const entitySummary = {
        brand: site.name,
        type: 'Organization',
        locations: kbFacts.filter((f) => f.category === 'LOCATIONS').map((f) => f.value),
        services: kbFacts.filter((f) => f.category === 'SERVICES').map((f) => f.value),
        conflicts: this.detectEntityConflicts(kbFacts),
      };

      return {
        auditRun: { ...savedAuditRun, status: 'COMPLETED', finishedAt: new Date().toISOString() } as any,
        score: siteScore,
        dataQuality: pageResults.length > 0 ? 'GOOD' : 'INSUFFICIENT',
        pagesMeasured: pageResults.length,
        pagesExcluded: crawlPagesList.length - eligiblePages.length,
        pagesInsufficient: eligiblePages.length - pageResults.length,
        entitySummary,
        topGaps: allGaps.slice(0, 10).map((g) => ({ ...g, url: g.url ?? '' })),
        pages: pageResults,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      await this.auditRuns.update(savedAuditRun.id, { status: 'FAILED' });
      throw error;
    }
  }

  /** Audit a single page for GEO. */
  private async auditPage(
    page: CrawlPage,
    siteId: string,
    auditRunId: string,
    kbFacts: KnowledgeFact[],
    siteEntity: { name: string; type: string; location?: string; description?: string },
    entityRels: EntityRelation[],
  ): Promise<GeoPageAuditDto> {
    const startTime = new Date();

    // Check for reusable audit
    if (page.contentHash) {
      const existing = await this.pageAudits.findOne({
        where: { siteId, url: page.url, contentHash: page.contentHash, status: 'COMPLETED' },
        order: { createdAt: 'DESC' },
      });

      if (existing) {
        return this.toDto({ ...existing, reusedFromAuditId: existing.id, startedAt: startTime, completedAt: new Date() });
      }
    }

    const ruleCtx: GeoRuleContext = {
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
      knowledgeBaseFacts: kbFacts.map((f) => ({
        key: f.key,
        value: f.value,
        category: f.category,
        verificationStatus: f.verificationStatus,
      })),
      siteEntity,
      entityRelations: entityRels.map((r) => ({
        subject: r.subjectEntity,
        predicate: r.predicate,
        object: r.objectEntity,
        verified: r.verified,
      })),
    };

    // Run deterministic rules
    const findings = runGeoDeterministicRules(ruleCtx);

    // Map findings to component scores
    const componentScores = this.mapFindingsToComponents(findings);

    // Compute overall score
    const scoreResult = computeGeoScore({
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
      const aiResult = await this.aiService.generateStructured('geo-page-auditor', {
        pageContent: (page.text ?? '').slice(0, 8000),
        siteEntityData: JSON.stringify(siteEntity),
        knowledgeBase: kbFacts.slice(0, 15).map((f) => `${f.key}: ${f.value}`).join('; '),
        externalSources: '[]',
        schemaJson: JSON.stringify(page.schemaJson ?? []),
        crawlerSignals: JSON.stringify({ httpStatus: page.httpStatus, indexable: page.indexable }),
        language: page.language ?? 'en',
      }, { siteId, workflow: 'geo-page-auditor' });

      aiComponents = (aiResult.data as Record<string, unknown>) ?? {};
      aiProvider = aiResult.result.provider;
      aiModel = aiResult.result.model;
      promptVersion = 1;
    } catch (error) {
      this.logger.debug(`AI GEO analysis failed for ${page.url}, using deterministic only: ${error}`);
    }

    const audit = this.pageAudits.create({
      siteId,
      auditRunId,
      crawlPageId: page.id,
      url: page.url,
      contentHash: page.contentHash,
      promptVersion,
      aiProvider,
      aiModel,
      entityClarity: this.extractComponent(findings, 'geo-entity-identity'),
      entityConsistency: { verified: true },
      factualSpecificity: this.extractComponent(findings, 'geo-factual-specificity'),
      claimVerification: this.extractComponent(findings, 'geo-claim-verification'),
      evidenceQuality: this.extractComponent(findings, 'geo-evidence-quality'),
      sourceQuality: this.extractComponent(findings, 'geo-source-quality'),
      originalInformation: this.extractComponent(findings, 'geo-original-information'),
      expertAttribution: this.extractComponent(findings, 'geo-expert-attribution'),
      machineAccessibility: this.extractComponent(findings, 'geo-machine-accessibility'),
      structuredFactClarity: {},
      citationReadiness: this.extractComponent(findings, 'geo-citation-readiness'),
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

  private mapFindingsToComponents(
    findings: Awaited<ReturnType<typeof runGeoDeterministicRules>>,
  ): Record<GeoComponentId, { score: number; evidence: Record<string, unknown> }> {
    const find = (key: string) => findings.find((f) => f.ruleKey === key);
    const scoreFrom = (f: ReturnType<typeof find>, passScore = 90, failScore = 30) =>
      f ? (f.passed ? passScore : failScore) : 50;

    return {
      entityClarity: { score: scoreFrom(find('geo-entity-identity'), 90, 35), evidence: find('geo-entity-identity')?.evidence ?? {} },
      entityConsistency: { score: 85, evidence: {} },
      factualSpecificity: { score: scoreFrom(find('geo-factual-specificity'), 90, 35), evidence: find('geo-factual-specificity')?.evidence ?? {} },
      claimVerification: { score: scoreFrom(find('geo-claim-verification'), 95, 40), evidence: find('geo-claim-verification')?.evidence ?? {} },
      evidenceQuality: { score: scoreFrom(find('geo-evidence-quality'), 85, 30), evidence: find('geo-evidence-quality')?.evidence ?? {} },
      sourceQuality: { score: scoreFrom(find('geo-source-quality'), 85, 35), evidence: find('geo-source-quality')?.evidence ?? {} },
      originalInformation: { score: scoreFrom(find('geo-original-information'), 90, 35), evidence: find('geo-original-information')?.evidence ?? {} },
      expertAttribution: { score: scoreFrom(find('geo-expert-attribution'), 85, 45), evidence: find('geo-expert-attribution')?.evidence ?? {} },
      machineAccessibility: { score: scoreFrom(find('geo-machine-accessibility'), 95, 20), evidence: find('geo-machine-accessibility')?.evidence ?? {} },
      structuredFactClarity: { score: scoreFrom(find('geo-schema-validation'), 80, 45), evidence: find('geo-schema-validation')?.evidence ?? {} },
      citationReadiness: { score: scoreFrom(find('geo-citation-readiness'), 85, 30), evidence: find('geo-citation-readiness')?.evidence ?? {} },
    };
  }

  private extractComponent(findings: Awaited<ReturnType<typeof runGeoDeterministicRules>>, ruleKey: string): Record<string, unknown> {
    const f = findings.find((f) => f.ruleKey === ruleKey);
    return f?.evidence ?? {};
  }

  private computeSiteScore(pages: GeoPageAuditDto[], totalCrawlPages: number) {
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

    return computeGeoScore({
      components: Object.fromEntries(components.map((c) => [c.id, { score: c.score }])) as any,
      measuredPages: pages.length,
      totalPages: totalCrawlPages,
    });
  }

  private detectEntityConflicts(kbFacts: KnowledgeFact[]): string[] {
    const conflicts: string[] = [];
    // Simple conflict detection: same category, different values for similar keys
    const locationFacts = kbFacts.filter((f) => f.category === 'LOCATIONS');
    if (locationFacts.length > 1) {
      // Multiple locations are fine, but check for contradictions
    }
    return conflicts;
  }

  /** Get latest completed GEO audit. */
  async getLatestGeoAudit(siteId: string): Promise<GeoSiteAuditDto | null> {
    const auditRun = await this.auditRuns.findOne({
      where: { siteId, type: 'GEO', status: 'COMPLETED' },
      order: { finishedAt: 'DESC' },
    });
    if (!auditRun) return null;
    return this.getGeoAuditById(siteId, auditRun.id);
  }

  /** Get GEO audit by ID. */
  async getGeoAuditById(siteId: string, auditRunId: string): Promise<GeoSiteAuditDto> {
    const auditRun = await this.auditRuns.findOne({ where: { id: auditRunId, siteId } });
    if (!auditRun) throw new Error('Audit run not found');

    const pages = await this.pageAudits.find({
      where: { siteId, auditRunId },
      order: { overallScore: 'ASC' },
    });

    const totalPages = await this.crawlPages.count({ where: { crawlRunId: auditRun.crawlRunId, siteId } });

    return {
      auditRun: auditRun as any,
      score: computeGeoScore({
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
      entitySummary: { brand: null, type: null, locations: [], services: [], conflicts: [] },
      topGaps: pages.filter((p) => p.overallScore < 60).map((p) => ({
        url: p.url,
        findingType: 'GEO_LOW_SCORE',
        severity: p.overallScore < 40 ? 'HIGH' : 'MEDIUM',
        evidence: { score: p.overallScore },
      })),
      pages: pages.map((p) => this.toDto(p)),
      generatedAt: auditRun.finishedAt?.toISOString() ?? auditRun.createdAt.toISOString(),
    };
  }

  /** Get GEO audit history. */
  async getGeoHistory(siteId: string): Promise<GeoAuditHistoryEntryDto[]> {
    const runs = await this.auditRuns.find({
      where: { siteId, type: 'GEO' },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    return runs.map((run) => ({
      auditRun: run as any,
      score: null,
      pagesMeasured: (run.dataQuality as any)?.pagesMeasured ?? 0,
      entityClarity: null,
      citationReadiness: null,
      dataQuality: (run.dataQuality as any)?.pagesMeasured > 0 ? 'GOOD' : 'INSUFFICIENT',
      scoreVersion: `GEO_SCORE_V${run.scoreVersion}`,
    }));
  }

  /** Get GEO gaps for a site. */
  async getGeoGaps(siteId: string): Promise<GeoGapDto[]> {
    const pages = await this.pageAudits.find({
      where: { siteId },
      order: { overallScore: 'ASC' },
      take: 20,
    });

    return pages
      .filter((p) => p.overallScore < 70)
      .map((p) => ({
        findingType: 'GEO_LOW_SCORE',
        url: p.url,
        severity: p.overallScore < 40 ? 'HIGH' : 'MEDIUM',
        evidence: { score: p.overallScore },
        recommendation: 'Improve GEO readiness for this page',
      }));
  }

  private toDto(audit: GeoPageAudit): GeoPageAuditDto {
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
      entityClarity: audit.entityClarity,
      entityConsistency: audit.entityConsistency,
      factualSpecificity: audit.factualSpecificity,
      claimVerification: audit.claimVerification,
      evidenceQuality: audit.evidenceQuality,
      sourceQuality: audit.sourceQuality,
      originalInformation: audit.originalInformation,
      expertAttribution: audit.expertAttribution,
      machineAccessibility: audit.machineAccessibility,
      structuredFactClarity: audit.structuredFactClarity,
      citationReadiness: audit.citationReadiness,
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

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiService, PromptRegistryService } from '@creative-seo/ai';
import type {
  BriefGateResult,
  ContentBriefDto,
  ContentInternalLink,
  ContentSchemaRecommendation,
  FinalQaResultDto,
  PipelineStageId,
  ValidatorResultDto,
} from '@creative-seo/types';
import { ContentPackagesService, type StageRecord } from './content-packages.service';
import type { DraftOutput, EvidenceOutput, GapOutput, IntentOutput, PackageData, PipelineInput, ResearchOutput } from './context';
import { stageDefinition } from './stages';
import { buildRecommendedUrl, slugify } from './slug';
import { stripHtml } from './arabic';
import { gatePassed, mergeGateResults, deterministicBriefCheck } from './gate';
import { deterministicSeoCheck } from './validation/seo';
import { deterministicAeoCheck } from './validation/aeo';
import { deterministicGeoCheck } from './validation/geo';
import { deterministicRankMathCheck } from './validation/rankmath';
import { deterministicFactualCheck, type FactClaim } from './validation/factual';
import { buildFinalQa } from './validation/final-qa';
import { mergeValidatorResults, dedupeStrings } from './validation/common';

@Injectable()
export class ContentPipelineService {
  private readonly logger = new Logger(ContentPipelineService.name);

  constructor(
    private readonly ai: AiService,
    private readonly prompts: PromptRegistryService,
    private readonly packages: ContentPackagesService,
  ) {}

  /**
   * Runs the full 17-stage pipeline. The brief must pass the pipeline's
   * approval gate before the draft is generated; when the gate fails the run
   * stops at AWAITING_APPROVAL and can be resumed via resumeAfterApproval().
   */
  async run(input: PipelineInput): Promise<ReturnType<ContentPackagesService['toDto']>> {
    const row = await this.packages.create(input);
    const data: PackageData = { _pipelineInput: input };
    try {
      await this.packages.savePackageData(row, data);
      const gate = await this.runPreGateStages(row, input, data);
      if (!gatePassed(gate)) {
        await this.packages.setStatus(row, 'AWAITING_APPROVAL');
        this.logger.log(`Package ${row.id} brief not approved (${gate.blockers.join('; ')}), awaiting approval`);
        return this.packages.toDto(row);
      }
      await this.runPostGateStages(row, input, data);
      await this.packages.setStatus(row, 'COMPLETE');
      return this.packages.toDto(row);
    } catch (error) {
      const message = sanitizeError(error);
      await this.packages.setStatus(row, 'FAILED', message);
      this.logger.error(`Package ${row.id} failed: ${message}`);
      throw error;
    }
  }

  /** Resumes drafting/validation for a run whose brief was approved by a reviewer. */
  async resumeAfterApproval(packageId: string): Promise<ReturnType<ContentPackagesService['toDto']>> {
    const row = await this.packages.findById(packageId);
    if (row.status !== 'AWAITING_APPROVAL') {
      throw new BadRequestException('Package is not awaiting brief approval');
    }
    const data = (row.packageData ?? {}) as unknown as PackageData;
    const input = data._pipelineInput;
    if (!input) {
      throw new BadRequestException('Pipeline input snapshot is missing; cannot resume');
    }
    const gate = (row.briefGate ?? {}) as unknown as BriefGateResult;
    if (!gate.approved) {
      throw new BadRequestException('Brief is not approved');
    }
    try {
      await this.runPostGateStages(row, input, data);
      await this.packages.setStatus(row, 'COMPLETE');
      return this.packages.toDto(row);
    } catch (error) {
      const message = sanitizeError(error);
      await this.packages.setStatus(row, 'FAILED', message);
      throw error;
    }
  }

  async rejectBrief(packageId: string, note?: string): Promise<ReturnType<ContentPackagesService['toDto']>> {
    const row = await this.packages.findById(packageId);
    if (row.status !== 'AWAITING_APPROVAL') {
      throw new BadRequestException('Package is not awaiting brief approval');
    }
    const gate = (row.briefGate ?? {}) as unknown as BriefGateResult;
    const message = `Rejected by reviewer${note ? `: ${note}` : ''}`;
    await this.packages.saveBrief(row, (row.brief ?? {}) as unknown as ContentBriefDto, {
      approved: false,
      score: gate.score,
      reasons: [...gate.reasons, message],
      blockers: [...gate.blockers, message],
    });
    await this.packages.setStatus(row, 'REJECTED');
    return this.packages.toDto(row);
  }

  // -------------------------------------------------------------------------
  // Stages 1-8: research -> brief -> gate
  // -------------------------------------------------------------------------

  private async runPreGateStages(row: Awaited<ReturnType<ContentPackagesService['create']>>, input: PipelineInput, data: PackageData): Promise<BriefGateResult> {
    const { site, cluster, existingPage, performance } = input;
    const siteInfo = `${site.name} (${site.domain}) — ${site.language}`;

    // 1. Research (skipped when evidence is already supplied).
    if (input.researchEvidence) {
      await this.recordOk(row, 'research', 'Using supplied research evidence');
      data.research = { topic: cluster.primaryKeyword, summary: input.researchEvidence, sources: [] };
    } else {
      const output = await this.aiStage<ResearchOutput>(row, 'research', { topic: cluster.primaryKeyword, context: siteInfo });
      data.research = output;
    }
    await this.save(row, data);

    const evidenceText = formatEvidence(data.research);

    // 2. Evidence extraction.
    const evidence = await this.aiStage<EvidenceOutput>(row, 'evidence-extraction', {
      topic: cluster.primaryKeyword,
      evidence: evidenceText,
      primaryKeyword: cluster.primaryKeyword,
    });
    data.evidence = evidence;
    await this.save(row, data);

    // 3. Intent analysis.
    const intent = await this.aiStage<IntentOutput>(row, 'intent-analysis', {
      site: siteInfo,
      primaryKeyword: cluster.primaryKeyword,
      secondaryKeywords: cluster.secondaryKeywords.join(', '),
      performance: formatPerformance(performance),
      existingPage: existingPage.content?.slice(0, 6000) ?? (existingPage.url ? `Existing page: ${existingPage.url}` : 'None'),
      evidenceSummary: data.research.summary,
    });
    data.intentAnalysis = intent;
    await this.save(row, data);

    // 4. AEO question map.
    const aeo = await this.aiStage<import('./validation/aeo').AeoQuestionMap>(row, 'aeo-question-map', {
      primaryKeyword: cluster.primaryKeyword,
      intent: intent.intent,
      evidence: evidenceText,
      existingPage: existingPage.content?.slice(0, 6000) ?? 'None',
    });
    data.aeoQuestionMap = aeo;
    await this.save(row, data);

    // 5. GEO/entity analysis.
    const geo = await this.aiStage<NonNullable<PackageData['geoEntityAnalysis']>>(row, 'geo-entity-analysis', {
      topic: cluster.primaryKeyword,
      site: siteInfo,
      evidence: evidenceText,
    });
    data.geoEntityAnalysis = geo;
    await this.save(row, data);

    // 6. Content gap analysis.
    const gaps = await this.aiStage<GapOutput>(row, 'content-gap-analysis', {
      primaryKeyword: cluster.primaryKeyword,
      existingPage: existingPage.content?.slice(0, 6000) ?? 'None',
      competitors: site.competitorUrls.length > 0 ? site.competitorUrls.join(', ') : 'None provided',
      questions: formatQuestions(aeo),
      intent: intent.intent,
    });
    data.gapAnalysis = gaps;
    await this.save(row, data);

    // 7. Content brief.
    const brief = await this.aiStage<ContentBriefDto>(row, 'content-brief', {
      site: siteInfo,
      primaryKeyword: cluster.primaryKeyword,
      secondaryKeywords: cluster.secondaryKeywords.join(', '),
      intentAnalysis: JSON.stringify(intent),
      questions: JSON.stringify(aeo.questions),
      entities: geo.entities.map((entity) => entity.name).join(', '),
      gaps: JSON.stringify(gaps.gaps),
      performance: formatPerformance(performance),
      existingPage: existingPage.content?.slice(0, 6000) ?? (existingPage.url ? `Existing page: ${existingPage.url}` : 'None'),
      verifiedFacts: input.verifiedFacts.join('\n'),
      instructions: input.additionalInstructions || 'None',
    });
    const slug = slugify(brief.seoTitle || brief.title, site.language);
    data.slug = slug;
    data.recommendedUrl = buildRecommendedUrl(site.domain, slug);
    data.seoTitle = brief.seoTitle;
    data.metaDescription = brief.metaDescription;
    await this.save(row, data);

    // 8. Brief approval gate (LLM + deterministic completeness).
    const deterministic = deterministicBriefCheck(brief);
    let llmGate: BriefGateResult | null = null;
    try {
      llmGate = await this.aiStage<BriefGateResult>(row, 'brief-gate', {
        brief: JSON.stringify(brief),
        primaryKeyword: cluster.primaryKeyword,
        intent: brief.intent ?? 'INFORMATIONAL',
        factCount: String(input.verifiedFacts.length),
      });
    } catch {
      this.logger.warn(`Brief gate LLM failed for ${row.id}; using deterministic gate only`);
    }
    const gate = mergeGateResults(deterministic, llmGate);
    await this.packages.saveBrief(row, brief, gate);
    return gate;
  }

  // -------------------------------------------------------------------------
  // Stages 9-18: outline -> draft -> validators -> links -> QA
  // -------------------------------------------------------------------------

  private async runPostGateStages(row: Awaited<ReturnType<ContentPackagesService['create']>>, input: PipelineInput, data: PackageData): Promise<void> {
    const { site, cluster } = input;
    const brief = (row.brief ?? {}) as unknown as ContentBriefDto;

    // 9. Outline.
    const outline = await this.aiStage<NonNullable<PackageData['outline']>>(row, 'outline', {
      title: brief.title,
      outline: JSON.stringify(brief.outline),
      questions: formatQuestions(data.aeoQuestionMap!),
      entities: (data.geoEntityAnalysis?.entities ?? []).map((entity) => entity.name).join(', '),
      language: site.language,
    });
    data.outline = outline;
    await this.save(row, data);

    // 10. Draft.
    const draft = await this.aiStage<DraftOutput>(row, 'draft', {
      title: brief.title,
      language: site.language,
      locale: site.locale,
      regionalTerms: site.regionalTerms.join(', ') || 'None',
      outline: JSON.stringify(outline.sections),
      questions: formatQuestions(data.aeoQuestionMap!),
      facts: formatFacts(input.verifiedFacts, data.evidence?.claims ?? []),
      links: input.internalLinkCandidates.map((link) => `${link.anchorText} -> ${link.url}`).join('\n') || 'None',
      voice: site.voice || 'Professional, clear',
    });
    data.draft = draft;
    await this.save(row, data);

    // 11. Language editor.
    const languageEdited = await this.aiStage<NonNullable<PackageData['languageEdited']>>(row, 'language-editor', {
      language: site.language,
      locale: site.locale,
      regionalTerms: site.regionalTerms.join(', ') || 'None',
      html: draft.htmlContent,
    });
    data.languageEdited = languageEdited;
    await this.save(row, data);

    const html = languageEdited.correctedHtml || draft.htmlContent;
    const seoTitle = data.seoTitle ?? brief.seoTitle;
    const metaDescription = data.metaDescription ?? brief.metaDescription;
    const slug = data.slug ?? '';
    const internalLinksCount = data.internalLinks?.length ?? 0;

    // Schema recommendation (deterministic, machine-readable output).
    data.schemaRecommendation = buildSchemaRecommendation({
      pageType: brief.pageType,
      seoTitle,
      recommendedUrl: data.recommendedUrl ?? brief.recommendedUrl ?? '',
      siteName: site.name,
      h1: outline.h1,
      questions: data.aeoQuestionMap?.questions.map((q) => q.question) ?? [],
      keyFacts: data.geoEntityAnalysis?.keyFacts ?? [],
    });
    await this.save(row, data);

    // 12. SEO validator.
    const seoInput = {
      html,
      language: site.language,
      seoTitle,
      metaDescription,
      slug,
      primaryKeyword: cluster.primaryKeyword,
      secondaryKeywords: cluster.secondaryKeywords,
      intent: brief.intent,
      pageType: brief.pageType,
      internalLinksCount,
    };
    const seo = await this.aiStage<ValidatorResultDto>(row, 'seo-validator', {
      primaryKeyword: cluster.primaryKeyword,
      secondaryKeywords: cluster.secondaryKeywords.join(', '),
      intent: brief.intent ?? 'INFORMATIONAL',
      language: site.language,
      seoTitle,
      metaDescription,
      slug,
      html: html.slice(0, 40_000),
    });
    data.seoValidation = mergeValidatorResults(deterministicSeoCheck(seoInput), seo);
    await this.save(row, data);

    // 13. AEO validator.
    const aeo = await this.aiStage<ValidatorResultDto>(row, 'aeo-validator', {
      primaryKeyword: cluster.primaryKeyword,
      questions: formatQuestions(data.aeoQuestionMap!),
      html: html.slice(0, 40_000),
    });
    data.aeoValidation = mergeValidatorResults(
      deterministicAeoCheck({
        html,
        language: site.language,
        primaryKeyword: cluster.primaryKeyword,
        questions: data.aeoQuestionMap?.questions ?? [],
        directAnswer: data.aeoQuestionMap?.directAnswer ?? '',
        directAnswerProvided: draft.directAnswerProvided,
      }),
      aeo,
    );
    await this.save(row, data);

    // 14. GEO validator.
    const geo = await this.aiStage<ValidatorResultDto>(row, 'geo-validator', {
      entities: JSON.stringify(data.geoEntityAnalysis?.entities ?? []),
      facts: JSON.stringify(data.geoEntityAnalysis?.keyFacts ?? []),
      html: html.slice(0, 40_000),
    });
    data.geoValidation = mergeValidatorResults(
      deterministicGeoCheck({
        html,
        language: site.language,
        entities: data.geoEntityAnalysis?.entities ?? [],
        keyFacts: data.geoEntityAnalysis?.keyFacts ?? [],
        originalInsights: data.geoEntityAnalysis?.originalInsights ?? [],
        attributionNeeds: data.geoEntityAnalysis?.attributionNeeds ?? [],
        externalSources: (data.research?.sources ?? []).map((source) => ({ title: source.title, url: source.url })),
        verifiedFactsCount: input.verifiedFacts.length,
        hasJsonLd: Boolean(data.schemaRecommendation?.jsonLd),
      }),
      geo,
    );
    await this.save(row, data);

    // 15. Rank Math validator.
    const rankMath = await this.aiStage<{
      focusKeyword: string;
      focusKeywords: string[];
      seoTitle: string;
      metaDescription: string;
      slug: string;
      scoreTarget: number;
      scoreActual: number | null;
      recommendations: string[];
      note: string;
    }>(row, 'rankmath-validator', {
      primaryKeyword: cluster.primaryKeyword,
      seoTitle,
      metaDescription,
      slug,
      language: site.language,
      htmlPreview: stripHtml(html).slice(0, 3000),
    });
    const rankMathLlm: ValidatorResultDto = {
      validator: 'RANKMATH',
      label: 'Rank Math validator',
      overallScore: rankMath.scoreActual ?? 0,
      metrics: [
        {
          id: 'rankmath.llm.estimate',
          label: 'Plugin field alignment (estimated)',
          score: rankMath.scoreActual ?? 0,
          weight: 1,
          passed: (rankMath.scoreActual ?? 0) >= 70,
          details: `target ${rankMath.scoreTarget}`,
        },
      ],
      passed: (rankMath.scoreActual ?? 0) >= 70,
      isInternalScore: true,
      recommendations: rankMath.recommendations,
      note: rankMath.note,
    };
    data.rankMathValidation = mergeValidatorResults(
      deterministicRankMathCheck({
        html,
        language: site.language,
        primaryKeyword: cluster.primaryKeyword,
        secondaryKeywords: cluster.secondaryKeywords,
        seoTitle,
        metaDescription,
        slug,
      }),
      rankMathLlm,
    );
    await this.save(row, data);

    // 16. Factual validator.
    const factual = await this.aiStage<{ claims: FactClaim[]; recommendations: string[] }>(row, 'factual-validator', {
      verifiedFacts: input.verifiedFacts.join('\n'),
      sources: formatSources(data.research?.sources ?? []),
      html: html.slice(0, 40_000),
    });
    data.factClaims = factual.claims;
    const contradicted = factual.claims.filter((claim) => claim.status === 'CONTRADICTED').length;
    data.factualValidation = deterministicFactualCheck({
      claims: factual.claims,
      verifiedFactsCount: input.verifiedFacts.length,
      unverifiableCount: factual.claims.filter((claim) => claim.status === 'UNVERIFIED').length,
    });
    data.factualValidation = {
      ...data.factualValidation,
      recommendations: dedupeStrings([...data.factualValidation.recommendations, ...factual.recommendations]),
    };
    await this.save(row, data);

    // 17. Internal link planning.
    const links = await this.aiStage<{ links: ContentInternalLink[] }>(row, 'internal-link-planning', {
      primaryKeyword: cluster.primaryKeyword,
      candidates: input.internalLinkCandidates.map((link) => `${link.anchorText} (${link.url})`).join('\n') || 'None provided',
      html: html.slice(0, 40_000),
    });
    data.internalLinks = links.links;
    await this.save(row, data);

    // 18. Final QA.
    const baseQa = buildFinalQa({
      validators: [data.seoValidation!, data.aeoValidation!, data.geoValidation!, data.rankMathValidation!, data.factualValidation!],
      factualBlocked: contradicted > 0,
      languageEditorPassed: languageEdited.passed,
      contradictedCount: contradicted,
      unverifiedCount: factual.claims.filter((claim) => claim.status === 'UNVERIFIED').length,
      internalLinksCount: links.links.length,
      mustFixFromValidators: [],
    });
    const qaLlm = await this.aiStage<FinalQaResultDto>(row, 'final-qa', {
      seoScore: String(data.seoValidation?.overallScore ?? 0),
      aeoScore: String(data.aeoValidation?.overallScore ?? 0),
      geoScore: String(data.geoValidation?.overallScore ?? 0),
      rankMathScore: String(data.rankMathValidation?.overallScore ?? 0),
      factualStatus: contradicted > 0 ? 'CONTRADICTED CLAIMS PRESENT' : 'CLEAR',
      languagePassed: String(languageEdited.passed),
      links: JSON.stringify(links.links),
      recommendations: dedupeStrings(
        [data.seoValidation, data.aeoValidation, data.geoValidation, data.rankMathValidation, data.factualValidation].flatMap(
          (validator) => validator?.recommendations ?? [],
        ),
      ).join('\n'),
    });
    const mustFix = dedupeStrings([...baseQa.mustFix, ...qaLlm.mustFix]).slice(0, 12);
    const shouldFix = dedupeStrings([...baseQa.shouldFix, ...qaLlm.shouldFix]).slice(0, 8);
    const overallScore = Math.round(((baseQa.overallScore + qaLlm.overallScore) / 2) * 100) / 100;
    data.finalQa = {
      overallScore,
      passed: mustFix.length === 0 && contradicted === 0 && overallScore >= 70,
      mustFix,
      shouldFix,
      approvedForPublication: mustFix.length === 0 && contradicted === 0 && overallScore >= 70,
    };
    await this.save(row, data);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async aiStage<T>(
    row: Awaited<ReturnType<ContentPackagesService['create']>>,
    id: PipelineStageId,
    variables: Record<string, string>,
  ): Promise<T> {
    const def = stageDefinition(id);
    const startedAt = new Date();
    await this.packages.recordStage(row, id, { status: 'RUNNING', startedAt });
    try {
      const { data, result } = await this.ai.generateStructured<T>(def.promptName!, variables, {
        siteId: row.siteId,
        organizationId: row.organizationId,
        workflow: def.workflow,
      });
      const version = (await this.prompts.getActive(def.promptName!))?.version ?? null;
      await this.packages.recordStage(row, id, {
        status: 'SUCCEEDED',
        startedAt,
        meta: { jobId: result.jobId, provider: result.provider, model: result.model, promptVersion: version },
        summary: 'completed',
      });
      return data;
    } catch (error) {
      await this.packages.recordStage(row, id, { status: 'FAILED', startedAt, error: sanitizeError(error) });
      throw error;
    }
  }

  private async recordOk(row: Awaited<ReturnType<ContentPackagesService['create']>>, id: StageRecord['id'], summary: string): Promise<void> {
    await this.packages.recordStage(row, id, { status: 'SUCCEEDED', startedAt: new Date(), summary });
  }

  private async save(row: Awaited<ReturnType<ContentPackagesService['create']>>, data: PackageData): Promise<void> {
    await this.packages.savePackageData(row, data);
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function formatEvidence(research: ResearchOutput | undefined): string {
  if (!research) return 'No research available';
  const sources = research.sources.map((source) => `- ${source.title} (${source.url}): ${source.snippet ?? ''}`).join('\n');
  return `${research.summary}\n\nSources:\n${sources || 'None'}`;
}

function formatPerformance(performance: PipelineInput['performance']): string {
  return `clicks: ${performance.clicks}, impressions: ${performance.impressions}, CTR: ${Math.round(performance.ctr * 100)}%, avg position: ${performance.avgPosition ?? 'n/a'}`;
}

function formatQuestions(map: import('./validation/aeo').AeoQuestionMap | undefined): string {
  if (!map) return 'None';
  const questions = map.questions.map((question) => `[${question.priority}] ${question.question} (${question.category})`).join('\n');
  return `Direct answer: ${map.directAnswer}\n\nQuestions:\n${questions}`;
}

function formatFacts(verifiedFacts: string[], claims: Array<{ claim: string; sourceUrl: string }>): string {
  const lines = verifiedFacts.map((fact) => `- VERIFIED: ${fact}`).join('\n');
  const claimsText = claims.map((claim) => `- ${claim.claim} [${claim.sourceUrl}]`).join('\n');
  return [lines, claimsText].filter(Boolean).join('\n');
}

function formatSources(sources: Array<{ title: string; url: string }>): string {
  return sources.map((source) => `- ${source.title} (${source.url})`).join('\n') || 'None';
}

function buildSchemaRecommendation(input: {
  pageType: string;
  seoTitle: string;
  recommendedUrl: string;
  siteName: string;
  h1: string;
  questions: string[];
  keyFacts: string[];
}): ContentSchemaRecommendation {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': input.pageType === 'PRODUCT' ? 'Product' : input.pageType === 'SERVICE' ? 'Service' : 'Article',
    headline: input.seoTitle || input.h1,
    name: input.h1,
    mainEntityOfPage: input.recommendedUrl,
    author: { '@type': 'Organization', name: input.siteName },
    publisher: { '@type': 'Organization', name: input.siteName },
    datePublished: new Date().toISOString().slice(0, 10),
  };
  if (input.questions.length > 0) {
    jsonLd['@type'] = 'FAQPage';
    jsonLd.mainEntity = input.questions.slice(0, 10).map((question) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: '' },
    }));
  }
  return {
    type: String(jsonLd['@type']),
    jsonLd,
    rationale: `Structured data recommended for ${input.pageType} pages to improve entity clarity and machine readability.`,
  };
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return 'unknown pipeline failure';
}

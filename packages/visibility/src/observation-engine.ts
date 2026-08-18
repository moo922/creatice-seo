/**
 * Observation engine (GC06 Sections 35-50). Orchestrates:
 * - Multi-provider execution
 * - Contamination protection
 * - Repeat runs
 * - Entity detection
 * - Source provenance extraction
 * - Cost budget enforcement
 * - Observation type classification
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiVisibilityObservationV2, AiVisibilityPrompt, AiVisibilityCompetitor, AiVisibilityPromptSetV2, AiVisibilitySourceProvenance } from '@creative-seo/database';
import type { AiProviderKind } from '@creative-seo/types';
import { AiService, type ProviderObservationResult } from '@creative-seo/ai';
import { detectEntities, type EntityDetectionResult } from './entity-detector';
import { extractProviderSources, extractGeneratedReferences, mergeProvenance, classifyTargetDomainCitation, type SourceProvenanceRecord } from './source-provenance';
import { applyContaminationProtection } from './contamination-protection';
import { createHash } from 'crypto';

export type ObservationType = 'GENERATION_ONLY' | 'SEARCH_ENABLED' | 'SOURCE_GROUNDED';
export type ObservationStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'UNSUPPORTED' | 'RATE_LIMITED';

export interface ObservationRunConfig {
  siteId: string;
  organizationId: string | null;
  promptSetId: string;
  promptSetVersion: number;
  providers: AiProviderKind[];
  repeatCount: number;
  methodologyVersion: string;
  targetBrand: string;
  targetDomain: string;
  createdBy: string | null;
}

export interface ObservationResult {
  observationId: string;
  status: ObservationStatus;
  promptId: string;
  provider: AiProviderKind;
  model: string;
  repeatIndex: number;
  brandMentioned: boolean;
  brandIncluded: boolean;
  verifiedTargetCitation: boolean;
  targetCitedUrls: string[];
  appearanceOrder: number | null;
  competitorResults: Array<{ name: string; mentioned: boolean; included: boolean; appearanceOrder: number | null }>;
  provenanceQuality: string;
  costUsd: number;
  latencyMs: number;
  errorCode: string | null;
}

const VISIBILITY_PROMPT_NAME = 'visibility-observation-v2';
const VISIBILITY_WORKFLOW = 'visibility-observation';

@Injectable()
export class ObservationEngine {
  private readonly logger = new Logger(ObservationEngine.name);

  constructor(
    @InjectRepository(AiVisibilityObservationV2) private readonly observations: Repository<AiVisibilityObservationV2>,
    @InjectRepository(AiVisibilitySourceProvenance) private readonly provenance: Repository<AiVisibilitySourceProvenance>,
    private readonly ai: AiService,
  ) {}

  async executeObservation(
    prompt: AiVisibilityPrompt,
    provider: AiProviderKind,
    repeatIndex: number,
    config: ObservationRunConfig,
    competitors: AiVisibilityCompetitor[],
  ): Promise<ObservationResult> {
    const contamination = applyContaminationProtection(prompt.text, config.targetBrand);

    const observationType = this.classifyObservationType(provider);

    const observation = this.observations.create({
      siteId: config.siteId,
      runId: '',
      promptId: prompt.id,
      promptSetVersion: config.promptSetVersion,
      category: prompt.category,
      text: prompt.text,
      normalizedText: prompt.normalizedText,
      provider,
      model: '',
      methodologyVersion: config.methodologyVersion,
      observationType,
      status: 'RUNNING',
      observedAt: new Date().toISOString().slice(0, 10),
      brandMentioned: false,
      brandIncluded: false,
      verifiedTargetCitation: false,
      targetCitedUrls: [],
      competitorResults: [],
      provenanceQuality: 'UNKNOWN',
      contaminationLogged: contamination.logged,
      kbWithheld: contamination.config.withholdKB,
      context: { repeatIndex, contamination: contamination.withheldItems },
      confidence: 0,
    });

    try {
      const result = await this.ai.generateText(
        VISIBILITY_PROMPT_NAME,
        { prompt: prompt.text },
        { siteId: config.siteId, organizationId: config.organizationId, workflow: VISIBILITY_WORKFLOW },
      );

      const responseText = result.text ?? '';
      const responseHash = createHash('sha256').update(responseText).digest('hex');

      const entityDetection = detectEntities(responseText, config.targetBrand, config.targetDomain, competitors);

      const providerResult: ProviderObservationResult = {
        responseText,
        provider,
        model: result.model,
        providerRequestId: null,
        sources: (result.sources ?? []).map((s) => ({ title: s.title, url: s.url, domain: null, providerSourceId: null, citationIndex: null, rawMetadata: null })),
        provenanceQuality: 'UNKNOWN',
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
        latencyMs: result.latencyMs,
        rawMetadata: null,
      };

      const providerSources = extractProviderSources(providerResult.sources, provider);
      const generatedRefs = extractGeneratedReferences(responseText, provider);
      const allProvenance = mergeProvenance(providerSources, generatedRefs);

      const citationResult = classifyTargetDomainCitation(
        allProvenance,
        config.targetDomain,
        competitors.map((c) => c.domain).filter((d): d is string => !!d),
      );

      const provenanceQuality = this.determineProvenanceQuality(providerSources, generatedRefs);

      observation.status = 'SUCCESS';
      observation.response = responseText;
      observation.responseHash = responseHash;
      observation.model = result.model;
      observation.brandMentioned = entityDetection.brand.mentioned;
      observation.brandIncluded = entityDetection.brand.included;
      observation.appearanceOrder = entityDetection.brand.appearanceOrder;
      observation.verifiedTargetCitation = citationResult.verifiedTargetCitation;
      observation.targetCitedUrls = citationResult.targetCitedUrls;
      observation.competitorResults = entityDetection.competitors;
      observation.provenanceQuality = provenanceQuality;
      observation.costUsd = this.estimateCost({ inputTokens: result.inputTokens, outputTokens: result.outputTokens });
      observation.latencyMs = result.latencyMs;
      observation.context = {
        ...observation.context,
        wordCount: responseText.split(/\s+/).length,
        contamination: contamination.withheldItems,
      };
      observation.confidence = this.computeConfidence(responseText, entityDetection);

      const saved = await this.observations.save(observation);

      await this.saveProvenance(saved.id, provider, allProvenance);

      return {
        observationId: saved.id,
        status: 'SUCCESS',
        promptId: prompt.id,
        provider,
        model: result.model,
        repeatIndex,
        brandMentioned: entityDetection.brand.mentioned,
        brandIncluded: entityDetection.brand.included,
        verifiedTargetCitation: citationResult.verifiedTargetCitation,
        targetCitedUrls: citationResult.targetCitedUrls,
        appearanceOrder: entityDetection.brand.appearanceOrder,
        competitorResults: entityDetection.competitors,
        provenanceQuality,
        costUsd: observation.costUsd,
        latencyMs: result.latencyMs,
        errorCode: null,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message.slice(0, 500) : 'unknown AI failure';
      const errorCode = this.classifyError(errorMsg);

      observation.status = errorCode === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'FAILED';
      observation.errorCode = errorCode;
      observation.error = errorMsg;
      await this.observations.save(observation);

      return {
        observationId: observation.id,
        status: observation.status as ObservationStatus,
        promptId: prompt.id,
        provider,
        model: '',
        repeatIndex,
        brandMentioned: false,
        brandIncluded: false,
        verifiedTargetCitation: false,
        targetCitedUrls: [],
        appearanceOrder: null,
        competitorResults: [],
        provenanceQuality: 'UNKNOWN',
        costUsd: 0,
        latencyMs: 0,
        errorCode,
      };
    }
  }

  private classifyObservationType(provider: AiProviderKind): ObservationType {
    if (provider === 'PERPLEXITY') return 'SEARCH_ENABLED';
    return 'GENERATION_ONLY';
  }

  private determineProvenanceQuality(
    providerSources: SourceProvenanceRecord[],
    generatedRefs: SourceProvenanceRecord[],
  ): string {
    if (providerSources.length > 0) return 'VERIFIED_PROVIDER_SOURCE';
    if (generatedRefs.length > 0) return 'UNVERIFIED_GENERATED_REFERENCE';
    return 'UNKNOWN';
  }

  private estimateCost(usage: { inputTokens: number; outputTokens: number }): number {
    const inputCostPer1k = 0.0025;
    const outputCostPer1k = 0.01;
    return ((usage.inputTokens / 1000) * inputCostPer1k) + ((usage.outputTokens / 1000) * outputCostPer1k);
  }

  private computeConfidence(responseText: string, detection: EntityDetectionResult): number {
    let confidence = 0.4;
    if (responseText.length >= 20) confidence += 0.2;
    if (detection.brand.matchedAlias) confidence += 0.1;
    if (detection.brand.cited) confidence += 0.1;
    if (detection.competitors.length > 0) confidence += 0.05;
    if (responseText.length < 5) confidence = 0.1;
    return Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100;
  }

  private classifyError(errorMsg: string): string {
    const lower = errorMsg.toLowerCase();
    if (lower.includes('rate') && lower.includes('limit')) return 'RATE_LIMITED';
    if (lower.includes('timeout')) return 'TIMEOUT';
    if (lower.includes('unsupported')) return 'UNSUPPORTED';
    return 'PROVIDER_ERROR';
  }

  private async saveProvenance(
    observationId: string,
    provider: string,
    provenance: SourceProvenanceRecord[],
  ): Promise<void> {
    if (provenance.length === 0) return;
    const records = provenance.map((p) =>
      this.provenance.create({
        observationId,
        provider,
        sourceType: p.sourceType,
        title: p.title,
        url: p.url,
        domain: p.domain,
        normalizedUrl: p.normalizedUrl,
        registeredDomain: p.registeredDomain,
        host: p.host,
        providerSourceId: p.providerSourceId,
        citationIndex: p.citationIndex,
        provenanceStatus: p.provenanceStatus,
        rawMetadata: p.rawMetadata,
      }),
    );
    await this.provenance.save(records);
  }
}

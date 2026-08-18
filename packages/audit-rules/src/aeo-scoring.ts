/**
 * Versioned deterministic AEO (Answer Engine Optimization) scoring.
 * AI evaluates semantic subcomponents; the final score is always computed here.
 */

export const AEO_SCORE_V1 = {
  version: 'AEO_SCORE_V1' as const,
  components: {
    intentAlignment: { weight: 0.15, label: 'Intent Alignment', version: 1 },
    directAnswer: { weight: 0.15, label: 'Direct Answer Quality', version: 1 },
    questionCoverage: { weight: 0.15, label: 'Question Coverage', version: 1 },
    semanticCompleteness: { weight: 0.12, label: 'Semantic Completeness', version: 1 },
    decisionSupport: { weight: 0.12, label: 'Decision Support', version: 1 },
    structureExtractability: { weight: 0.12, label: 'Structure / Extractability', version: 1 },
    clarity: { weight: 0.10, label: 'Clarity', version: 1 },
    factualGrounding: { weight: 0.09, label: 'Factual Grounding', version: 1 },
  },
} as const;

export type AeoComponentId = keyof typeof AEO_SCORE_V1.components;

export interface AeoComponentResult {
  id: string;
  label: string;
  score: number;
  weight: number;
  version: number;
  evidence: Record<string, unknown>;
}

export interface AeoScoreInput {
  components: Record<AeoComponentId, { score: number; evidence?: Record<string, unknown> }>;
  measuredPages: number;
  totalPages: number;
}

export interface AeoScoreResult {
  overall: number;
  scoreVersion: string;
  components: AeoComponentResult[];
  confidence: number;
  coverageFactor: number;
  measuredPages: number;
  totalPages: number;
  label: string;
  dataQuality: string;
}

/**
 * Compute the deterministic AEO score from component results.
 * The coverage factor prevents unmeasured pages from dragging scores down.
 * Formula: score = Σ(componentScore × weight) × coverageFactor
 */
export function computeAeoScore(input: AeoScoreInput): AeoScoreResult {
  const { components, measuredPages, totalPages } = input;
  const def = AEO_SCORE_V1;

  const componentResults: AeoComponentResult[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [id, config] of Object.entries(def.components)) {
    const result = components[id as AeoComponentId];
    const score = result?.score ?? 50; // Default to 50 if not measured
    const evidence = result?.evidence ?? {};

    componentResults.push({
      id,
      label: config.label,
      score: Math.max(0, Math.min(100, Math.round(score))),
      weight: config.weight,
      version: config.version,
      evidence,
    });

    weightedSum += score * config.weight;
    totalWeight += config.weight;
  }

  // Normalize weights to sum to 1
  const normalizedScore = totalWeight > 0 ? weightedSum / totalWeight : 50;

  // Coverage factor: 0.5 + 0.5 × (measuredPages / totalPages)
  const coverageFactor = totalPages > 0
    ? Math.min(1, 0.5 + 0.5 * (measuredPages / totalPages))
    : 0.5;

  const overall = Math.max(0, Math.min(100, Math.round(normalizedScore * coverageFactor)));

  // Confidence based on data completeness
  const measuredRatio = totalPages > 0 ? measuredPages / totalPages : 0;
  const hasAllComponents = componentResults.every((c) => c.score !== 50);
  const confidence = Math.min(1, 0.3 + measuredRatio * 0.4 + (hasAllComponents ? 0.3 : 0));

  return {
    overall,
    scoreVersion: def.version,
    components: componentResults,
    confidence: Math.round(confidence * 100) / 100,
    coverageFactor: Math.round(coverageFactor * 100) / 100,
    measuredPages,
    totalPages,
    label: 'Internal AEO Readiness Score',
    dataQuality: measuredPages >= totalPages * 0.8 ? 'GOOD' : measuredPages > 0 ? 'PARTIAL' : 'INSUFFICIENT',
  };
}

/**
 * Versioned deterministic GEO (Generative Engine Optimization) scoring.
 * AI evaluates semantic subcomponents; the final score is always computed here.
 */

export const GEO_SCORE_V1 = {
  version: 'GEO_SCORE_V1' as const,
  components: {
    entityClarity: { weight: 0.12, label: 'Entity Clarity', version: 1 },
    entityConsistency: { weight: 0.12, label: 'Entity Consistency', version: 1 },
    factualSpecificity: { weight: 0.12, label: 'Factual Specificity', version: 1 },
    claimVerification: { weight: 0.10, label: 'Claim Verification', version: 1 },
    evidenceQuality: { weight: 0.10, label: 'Evidence Quality', version: 1 },
    sourceQuality: { weight: 0.08, label: 'Source Quality', version: 1 },
    originalInformation: { weight: 0.08, label: 'Original Information', version: 1 },
    expertAttribution: { weight: 0.08, label: 'Expert Attribution', version: 1 },
    machineAccessibility: { weight: 0.08, label: 'Machine Accessibility', version: 1 },
    structuredFactClarity: { weight: 0.06, label: 'Structured Fact Clarity', version: 1 },
    citationReadiness: { weight: 0.06, label: 'Citation Readiness', version: 1 },
  },
} as const;

export type GeoComponentId = keyof typeof GEO_SCORE_V1.components;

export interface GeoComponentResult {
  id: string;
  label: string;
  score: number;
  weight: number;
  version: number;
  evidence: Record<string, unknown>;
}

export interface GeoScoreInput {
  components: Record<GeoComponentId, { score: number; evidence?: Record<string, unknown> }>;
  measuredPages: number;
  totalPages: number;
}

export interface GeoScoreResult {
  overall: number;
  scoreVersion: string;
  components: GeoComponentResult[];
  confidence: number;
  coverageFactor: number;
  measuredPages: number;
  totalPages: number;
  label: string;
  dataQuality: string;
}

/**
 * Compute the deterministic GEO score from component results.
 */
export function computeGeoScore(input: GeoScoreInput): GeoScoreResult {
  const { components, measuredPages, totalPages } = input;
  const def = GEO_SCORE_V1;

  const componentResults: GeoComponentResult[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [id, config] of Object.entries(def.components)) {
    const result = components[id as GeoComponentId];
    const score = result?.score ?? 50;
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

  const normalizedScore = totalWeight > 0 ? weightedSum / totalWeight : 50;

  const coverageFactor = totalPages > 0
    ? Math.min(1, 0.5 + 0.5 * (measuredPages / totalPages))
    : 0.5;

  const overall = Math.max(0, Math.min(100, Math.round(normalizedScore * coverageFactor)));

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
    label: 'Internal GEO Readiness Score',
    dataQuality: measuredPages >= totalPages * 0.8 ? 'GOOD' : measuredPages > 0 ? 'PARTIAL' : 'INSUFFICIENT',
  };
}

/**
 * Deterministic, versioned priority engine.
 *
 * Score = Σ(factor_i × weight_i) / Σ(weight_i) × 100
 *
 * Each factor is 0-100, weights are configurable per site strategy.
 * AI never sets priority — all inputs come from persisted evidence.
 *
 * DECISION_PRIORITY_V1 weights:
 *   business_value: 0.20, search_opportunity: 0.18, severity: 0.15,
 *   affected_traffic: 0.12, affected_pages: 0.08, confidence: 0.10,
 *   urgency: 0.10, effort_inverse: 0.07
 */

export const PRIORITY_VERSION = 'DECISION_PRIORITY_V1' as const;

export interface PriorityWeights {
  business_value: number;
  search_opportunity: number;
  severity: number;
  affected_traffic: number;
  affected_pages: number;
  confidence: number;
  urgency: number;
  effort_inverse: number;
}

export const DEFAULT_WEIGHTS: PriorityWeights = {
  business_value: 0.20,
  search_opportunity: 0.18,
  severity: 0.15,
  affected_traffic: 0.12,
  affected_pages: 0.08,
  confidence: 0.10,
  urgency: 0.10,
  effort_inverse: 0.07,
};

export interface PriorityFactors {
  businessValue: number;
  searchOpportunity: number;
  severity: number;
  affectedTraffic: number;
  affectedPages: number;
  confidence: number;
  urgency: number;
  effortInverse: number;
}

export interface PriorityResult {
  score: number;
  factors: PriorityFactors;
  version: string;
  impact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  effort: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
}

export function computePriority(
  factors: PriorityFactors,
  weights: PriorityWeights = DEFAULT_WEIGHTS,
): PriorityResult {
  const w = normalizeWeights(weights);
  const raw =
    factors.businessValue * w.business_value +
    factors.searchOpportunity * w.search_opportunity +
    factors.severity * w.severity +
    factors.affectedTraffic * w.affected_traffic +
    factors.affectedPages * w.affected_pages +
    factors.confidence * w.confidence +
    factors.urgency * w.urgency +
    factors.effortInverse * w.effort_inverse;

  const score = clamp(Math.round(raw * 100) / 100);
  const impact = lookupImpact(score);
  const confidence = lookupConfidence(factors.confidence);
  const effort = lookupEffort(100 - factors.effortInverse);

  return { score, factors, version: PRIORITY_VERSION, impact, confidence, effort };
}

function lookupImpact(score: number): PriorityResult['impact'] {
  if (score >= 70) return 'CRITICAL';
  if (score >= 45) return 'HIGH';
  if (score >= 20) return 'MEDIUM';
  return 'LOW';
}

function lookupConfidence(value: number): PriorityResult['confidence'] {
  if (value >= 70) return 'HIGH';
  if (value >= 40) return 'MEDIUM';
  return 'LOW';
}

function lookupEffort(value: number): PriorityResult['effort'] {
  if (value <= 15) return 'VERY_LOW';
  if (value <= 35) return 'LOW';
  if (value <= 60) return 'MEDIUM';
  if (value <= 80) return 'HIGH';
  return 'VERY_HIGH';
}

function normalizeWeights(w: PriorityWeights): PriorityWeights {
  const sum =
    w.business_value + w.search_opportunity + w.severity +
    w.affected_traffic + w.affected_pages + w.confidence +
    w.urgency + w.effort_inverse;
  if (sum === 0) return { ...DEFAULT_WEIGHTS };
  const norm = 1 / sum;
  return {
    business_value: w.business_value * norm,
    search_opportunity: w.search_opportunity * norm,
    severity: w.severity * norm,
    affected_traffic: w.affected_traffic * norm,
    affected_pages: w.affected_pages * norm,
    confidence: w.confidence * norm,
    urgency: w.urgency * norm,
    effort_inverse: w.effort_inverse * norm,
  };
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

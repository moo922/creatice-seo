import type { KeywordOpportunityType, OpportunityImpactLevel, OpportunityEffortLevel } from '@creative-seo/types';

/**
 * Deterministic, versioned opportunity scoring (Sections 42-50).
 *
 * AI never sets priority numbers. The score is computed from persisted evidence
 * (GSC, Google Ads, audit, cluster, URL mapping). Same inputs + same algorithm
 * version -> identical score every run (Section 123).
 *
 * Factors (weighted, documented):
 *   Search Demand         0.25
 *   Existing GSC position 0.20
 *   Business Relevance    0.20
 *   URL Gap               0.15
 *   Cannibalization Risk  0.10
 *   Confidence            0.10
 *
 * Impact / Confidence / Effort are stored separately (Section 44); Priority is
 * derived. Google Ads/GSC unavailability reduces confidence, never produces a
 * fake 0 (Section 85).
 */

export const OPPORTUNITY_SCORE_VERSION = 'opportunity-v1';

export type OpportunityInput = {
  type: KeywordOpportunityType;
  /** Search demand proxy: GSC impressions or Google Ads volume (or null). */
  searchDemand: number | null;
  /** Current average position (lower = better). null when unknown. */
  position: number | null;
  /** 0-1 business relevance (null when unknown). */
  businessRelevance: number | null;
  /** Whether an adequate target URL already exists. */
  hasTargetUrl: boolean;
  /** 0-1 cannibalization risk (null when unknown). */
  cannibalizationRisk: number | null;
  /** 0-1 confidence in the evidence (driven by data availability). */
  evidenceConfidence: number;
};

export type OpportunityScore = {
  score: number;
  impact: OpportunityImpactLevel;
  effort: OpportunityEffortLevel;
  confidence: number;
  scoreVersion: string;
};

/** Intent value weights — agency/site strategy setting (Section 45), not ranking factors. */
export type IntentValueConfig = {
  TRANSACTIONAL: number;
  COMMERCIAL: number;
  LOCAL: number;
  COMPARISON: number;
  INFORMATIONAL: number;
  NAVIGATIONAL: number;
};

export const DEFAULT_INTENT_VALUE_CONFIG: IntentValueConfig = {
  TRANSACTIONAL: 1.0,
  COMMERCIAL: 0.9,
  LOCAL: 0.9,
  COMPARISON: 0.7,
  INFORMATIONAL: 0.5,
  NAVIGATIONAL: 0.3,
};

/** Weights documented in the module header. */
const WEIGHTS = {
  searchDemand: 0.25,
  position: 0.2,
  businessRelevance: 0.2,
  urlGap: 0.15,
  cannibalization: 0.1,
  confidence: 0.1,
};

/** Normalizes search demand to 0..1 (log scale handles Google Ads volume vs GSC impressions). */
export function normalizeSearchDemand(value: number | null): number {
  if (value == null || value <= 0) return 0;
  // log10 scale: 10 -> 0.33, 100 -> 0.5, 1000 -> 0.66, 10000 -> 0.83
  return Math.min(1, Math.max(0, Math.log10(value + 1) / 12));
}

/** Position factor: closer to 1 = more room to gain. position 11-20 is a strong signal. */
export function normalizePosition(position: number | null): number {
  if (position == null || position <= 0) return 0;
  if (position <= 3) return 0.1; // already ranking well
  if (position <= 10) return 0.6; // 4-10: optimization opportunity
  if (position <= 20) return 0.8; // 11-20: near page one
  return 0.9; // beyond page one: biggest gap
}

/** Deterministic opportunity score. Returns the same output for the same inputs + version. */
export function scoreOpportunity(input: OpportunityInput): OpportunityScore {
  const demand = normalizeSearchDemand(input.searchDemand);
  const position = normalizePosition(input.position);
  const relevance = clamp01(input.businessRelevance);
  const urlGap = input.hasTargetUrl ? 0.1 : 1.0;
  const cannib = clamp01(input.cannibalizationRisk);
  const confidence = clamp01(input.evidenceConfidence);

  const score =
    demand * WEIGHTS.searchDemand +
    position * WEIGHTS.position +
    relevance * WEIGHTS.businessRelevance +
    urlGap * WEIGHTS.urlGap +
    (1 - cannib) * WEIGHTS.cannibalization +
    confidence * WEIGHTS.confidence;

  const impact: OpportunityImpactLevel = score >= 0.75 ? 'VERY_HIGH' : score >= 0.55 ? 'HIGH' : score >= 0.35 ? 'MEDIUM' : 'LOW';
  const effort = effortFor(input.type, input.hasTargetUrl);
  const finalScore = Math.round(clamp01(score) * 100);

  return { score: finalScore, impact, effort, confidence, scoreVersion: OPPORTUNITY_SCORE_VERSION };
}

/** Effort estimates by opportunity type + URL gap (Section 44). */
function effortFor(type: KeywordOpportunityType, hasTargetUrl: boolean): OpportunityEffortLevel {
  switch (type) {
    case 'CTR_OPTIMIZATION':
      return 'LOW';
    case 'INTERNAL_LINKING':
      return 'LOW';
    case 'REDIRECT':
      return 'LOW';
    case 'POSITION_4_10':
    case 'POSITION_11_20':
      return 'MEDIUM';
    case 'UPDATE_EXISTING':
      return 'MEDIUM';
    case 'EXPAND_EXISTING':
      return 'MEDIUM';
    case 'MERGE':
      return 'HIGH';
    case 'NEW_PAGE':
    case 'NEW_QUERY':
      return hasTargetUrl ? 'MEDIUM' : 'HIGH';
    default:
      return 'MEDIUM';
  }
}

/**
 * Evidence confidence based on data availability (Section 85). Google Ads and
 * GSC being unavailable reduces confidence but never zeroes the score.
 */
export function evidenceConfidence(data: {
  gscAvailable: boolean;
  googleAdsAvailable: boolean;
  hasManualSeeds: boolean;
}): number {
  const sources = Number(data.gscAvailable) + Number(data.googleAdsAvailable) + Number(data.hasManualSeeds);
  if (sources === 0) return 0.1; // new site with no data — lowest confidence, not zero
  if (sources === 1) return 0.4;
  if (sources === 2) return 0.7;
  return 0.9;
}

function clamp01(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
/**
 * Result Tracker — Recommendation → Task → Change → Verification → Observed Result.
 *
 * Do not close the recommendation merely because a task status became Done.
 * Where possible require verification.
 *
 * Outcome states:
 *   IMPLEMENTED        — work was done
 *   VERIFIED           — verification confirmed the change
 *   POSITIVE_OBSERVATION — positive impact observed
 *   NEUTRAL_OBSERVATION  — no measurable impact
 *   NEGATIVE_OBSERVATION — negative impact observed
 *   INSUFFICIENT_DATA    — not enough data to judge
 */

export type OutcomeState =
  | 'IMPLEMENTED'
  | 'VERIFIED'
  | 'POSITIVE_OBSERVATION'
  | 'NEUTRAL_OBSERVATION'
  | 'NEGATIVE_OBSERVATION'
  | 'INSUFFICIENT_DATA';

export type VerificationType =
  | 'IMMEDIATE_RECRAWL'
  | 'GSC_OBSERVATION'
  | 'AI_VISIBILITY_RUN'
  | 'MANUAL_REVIEW'
  | 'AUTOMATED_CHECK';

export interface RecommendationOutcome {
  recommendationId: string;
  taskId: string | null;
  changeLogId: string | null;
  implementedAt: string | null;
  verifiedAt: string | null;
  outcome: OutcomeState | null;
  verificationType: VerificationType | null;
  observationWindowEnd: string | null;
  evidence: Record<string, unknown>;
}

/**
 * Measurement windows — how long to wait before observing results.
 */
export const MEASUREMENT_WINDOWS: Record<string, number> = {
  TECHNICAL_FIX: 0,                    // immediate recrawl
  TITLE_META_OPTIMIZATION: 7,           // 7 days for GSC data
  CONTENT_UPDATE: 14,                   // 14 days for content changes
  CONTENT_CREATE: 28,                   // 28 days for new content
  INTERNAL_LINK: 14,                    // 14 days for link impact
  AEO_ANSWER_GAP: 7,                   // 7 days for AEO check
  GEO_ENTITY_FIX: 14,                  // 14 days for GEO check
  AI_VISIBILITY_SOURCE_GAP: 28,        // 28 days for next AI visibility run
  KEYWORD_MAPPING: 14,                 // 14 days for mapping impact
  REDIRECT_REVIEW: 7,                  // 7 days for redirect impact
};

/**
 * Determine the next verification step for a recommendation.
 */
export function nextVerificationStep(outcome: RecommendationOutcome): VerificationType | null {
  if (!outcome.implementedAt) return null;
  if (outcome.outcome === 'VERIFIED' || outcome.outcome === 'POSITIVE_OBSERVATION' || outcome.outcome === 'NEGATIVE_OBSERVATION') {
    return null; // Already verified
  }
  if (!outcome.verifiedAt) return 'IMMEDIATE_RECRAWL';
  if (outcome.outcome === 'IMPLEMENTED') return 'GSC_OBSERVATION';
  return null;
}

/**
 * Check if a recommendation's observation window has passed.
 */
export function isObservationWindowPassed(
  outcome: RecommendationOutcome,
  actionType: string,
  currentDate: Date,
): boolean {
  if (!outcome.implementedAt) return false;
  const windowDays = MEASUREMENT_WINDOWS[actionType] ?? 14;
  const implementedDate = new Date(outcome.implementedAt);
  const windowEnd = new Date(implementedDate.getTime() + windowDays * 24 * 60 * 60 * 1000);
  return currentDate >= windowEnd;
}

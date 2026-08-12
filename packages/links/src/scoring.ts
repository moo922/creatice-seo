/**
 * Deterministic confidence scoring for link suggestions. Confidence is derived
 * only from measurable signals (topical keyword overlap, existing inbound
 * links, broken-link HTTP status) — it is never invented or AI-generated.
 */

export interface OpportunitySignals {
  /** Matched cluster keywords / considered keywords (0-1). */
  topicalScore: number;
  /** Whether the source page already has inbound internal links. */
  sourceHasInbound: boolean;
  /** Whether the target already has some inbound links. */
  targetHasInbound: boolean;
}

export function opportunityConfidence(signals: OpportunitySignals): number {
  let confidence = 0.25 + 0.35 * signals.topicalScore;
  if (signals.sourceHasInbound) confidence += 0.2;
  if (!signals.targetHasInbound) confidence += 0.1;
  return clamp(confidence);
}

export function orphanConfidence(topicalScore: number): number {
  return clamp(0.5 + 0.25 * topicalScore);
}

export function weakTargetConfidence(topicalScore: number): number {
  return clamp(0.45 + 0.25 * topicalScore);
}

export function brokenLinkConfidence(httpStatus: number | null): number {
  if (httpStatus !== null && httpStatus >= 400) return 0.9;
  return 0.7;
}

export const OVERUSED_ANCHOR_CONFIDENCE = 0.7;
export const CONFLICT_CONFIDENCE = 0.75;

export function clamp(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

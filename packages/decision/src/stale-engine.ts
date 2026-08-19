/**
 * Stale Engine — detects recommendations that no longer apply.
 *
 * A recommendation becomes stale when:
 *   - The underlying issue was resolved
 *   - The target page was deleted
 *   - The URL mapping changed
 *   - The keyword opportunity disappeared
 *   - The recommendation was superseded by a newer one
 *
 * Stale recommendations must not remain in the active work queue.
 */

export type StaleReason =
  | 'ISSUE_RESOLVED'
  | 'PAGE_DELETED'
  | 'MAPPING_CHANGED'
  | 'OPPORTUNITY_DISAPPEARED'
  | 'SUPERSEDED'
  | 'EVIDENCE_MISSING';

export interface StaleCheckInput {
  recommendationId: string;
  issueId: string;
  issueStatus: string;
  targetUrl: string | null;
  targetUrlExists: boolean;
  supersededById: string | null;
}

export interface StaleCheckResult {
  recommendationId: string;
  isStale: boolean;
  reason: StaleReason | null;
}

export function checkStaleness(input: StaleCheckInput): StaleCheckResult {
  // Issue resolved → recommendation is stale
  if (input.issueStatus === 'RESOLVED' || input.issueStatus === 'IGNORED') {
    return { recommendationId: input.recommendationId, isStale: true, reason: 'ISSUE_RESOLVED' };
  }

  // Page deleted
  if (input.targetUrl && !input.targetUrlExists) {
    return { recommendationId: input.recommendationId, isStale: true, reason: 'PAGE_DELETED' };
  }

  // Superseded by another recommendation
  if (input.supersededById) {
    return { recommendationId: input.recommendationId, isStale: true, reason: 'SUPERSEDED' };
  }

  return { recommendationId: input.recommendationId, isStale: false, reason: null };
}

/**
 * When a recommendation is superseded, mark the old one and link to the new one.
 */
export interface SupersedeInput {
  oldRecommendationId: string;
  newRecommendationId: string;
  reason: string;
}

export interface SupersedeResult {
  oldRecommendationId: string;
  newRecommendationId: string;
  oldStatus: 'SUPERSEDED';
  reason: string;
}

export function supersedeRecommendation(input: SupersedeInput): SupersedeResult {
  return {
    oldRecommendationId: input.oldRecommendationId,
    newRecommendationId: input.newRecommendationId,
    oldStatus: 'SUPERSEDED',
    reason: input.reason,
  };
}

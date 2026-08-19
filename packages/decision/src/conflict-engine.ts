/**
 * Conflict Engine — detects contradictory recommendations.
 *
 * Conflicts occur when two recommendations for the same target (page/cluster)
 * propose materially opposite actions. Examples:
 *   CREATE page X  vs  UPDATE page X
 *   MERGE A → B    vs  EXPAND A
 *   REDIRECT A     vs  OPTIMIZE A
 *   NOINDEX page   vs  CONTENT_EXPANSION
 *
 * Each conflict is classified and must be resolved before both
 * recommendations can proceed as active tasks.
 */

export type ConflictType =
  | 'ACTION_CONFLICT'
  | 'TARGET_CONFLICT'
  | 'MUTUALLY_EXCLUSIVE';

export type ConflictResolution =
  | 'KEEP_A'
  | 'KEEP_B'
  | 'MERGE_RECOMMENDATIONS'
  | 'REQUIRES_REVIEW';

export interface ConflictPair {
  recommendationIdA: string;
  recommendationIdB: string;
  conflictType: ConflictType;
  reason: string;
  targetKey: string;
}

export interface ConflictDetectionResult {
  conflicts: ConflictPair[];
  totalPairsChecked: number;
}

/**
 * Action pairs that conflict with each other.
 * Key = action A, Value = set of actions that conflict with A.
 */
const CONFLICT_MAP: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['CONTENT_CREATE', new Set(['CONTENT_UPDATE', 'CONTENT_EXPANSION', 'CONTENT_MERGE', 'REDIRECT_REVIEW'])],
  ['CONTENT_UPDATE', new Set(['CONTENT_CREATE', 'CONTENT_MERGE', 'REDIRECT_REVIEW'])],
  ['CONTENT_EXPANSION', new Set(['CONTENT_CREATE', 'CONTENT_MERGE', 'REDIRECT_REVIEW'])],
  ['CONTENT_MERGE', new Set(['CONTENT_CREATE', 'CONTENT_UPDATE', 'CONTENT_EXPANSION'])],
  ['REDIRECT_REVIEW', new Set(['CONTENT_CREATE', 'CONTENT_UPDATE', 'CONTENT_EXPANSION', 'INTERNAL_LINK'])],
  ['CANONICAL_FIX', new Set(['REDIRECT_REVIEW'])],
  ['INDEXABILITY_FIX', new Set(['CONTENT_EXPANSION', 'CONTENT_CREATE'])],
  ['AEO_ANSWER_GAP', new Set(['GEO_ENTITY_FIX'])],
  ['TECHNICAL_FIX', new Set(['CONTENT_CREATE'])],
]);

/**
 * Actions classified as DESTRUCTIVE — require explicit review.
 */
const DESTRUCTIVE_ACTIONS = new Set([
  'REDIRECT_REVIEW',
  'INDEXABILITY_FIX',
  'CONTENT_MERGE',
]);

/**
 * Actions classified as SAFE — can be bulk-approved.
 */
const SAFE_ACTIONS = new Set([
  'TITLE_META_OPTIMIZATION',
  'ONPAGE_OPTIMIZATION',
  'INTERNAL_LINK',
  'AEO_ANSWER_GAP',
  'GEO_EVIDENCE',
  'KEYWORD_MAPPING',
  'CONTENT_UPDATE',
  'KNOWLEDGE_BASE_UPDATE',
]);

export function classifyActionSafety(action: string): 'SAFE' | 'REVIEW_REQUIRED' | 'DESTRUCTIVE' {
  if (DESTRUCTIVE_ACTIONS.has(action)) return 'DESTRUCTIVE';
  if (SAFE_ACTIONS.has(action)) return 'SAFE';
  return 'REVIEW_REQUIRED';
}

/**
 * Build a target key from a recommendation's action + target.
 * Two recommendations with the same target key and conflicting actions are in conflict.
 */
export function buildTargetKey(action: string, url: string | null, clusterId: string | null): string {
  if (url) return `${action}:${normalizeUrl(url)}`;
  if (clusterId) return `${action}:cluster:${clusterId}`;
  return `${action}:unknown`;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Detect conflicts between a batch of recommendations.
 * Each recommendation should have: id, action (suggestedAction), url, clusterId.
 */
export function detectConflicts(
  recommendations: Array<{ id: string; action: string; url: string | null; clusterId: string | null }>,
): ConflictDetectionResult {
  const conflicts: ConflictPair[] = [];
  let totalPairsChecked = 0;

  // Group by base target (ignoring action prefix for same-page detection)
  const byTarget = new Map<string, typeof recommendations>();
  for (const rec of recommendations) {
    const baseTarget = rec.url
      ? `page:${normalizeUrl(rec.url)}`
      : rec.clusterId
        ? `cluster:${rec.clusterId}`
        : `other:${rec.id}`;
    const existing = byTarget.get(baseTarget) ?? [];
    existing.push(rec);
    byTarget.set(baseTarget, existing);
  }

  // Within each target group, check for conflicting actions
  for (const [, group] of byTarget) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        totalPairsChecked++;
        const a = group[i]!;
        const b = group[j]!;
        if (a.action === b.action) continue;

        const conflictsAtoB = CONFLICT_MAP.get(a.action);
        if (conflictsAtoB?.has(b.action)) {
          conflicts.push({
            recommendationIdA: a.id,
            recommendationIdB: b.id,
            conflictType: 'ACTION_CONFLICT',
            reason: `${a.action} conflicts with ${b.action} for the same target`,
            targetKey: a.url ?? a.clusterId ?? 'unknown',
          });
        }
      }
    }
  }

  return { conflicts, totalPairsChecked };
}

/**
 * Resolve a conflict deterministically where possible.
 * Returns the resolution and reasoning.
 */
export function resolveConflict(
  recA: { id: string; impact: number; confidence: number; effort: number; action: string },
  recB: { id: string; impact: number; confidence: number; effort: number; action: string },
): { resolution: ConflictResolution; winnerId: string | null; reasoning: string } {
  const scoreA = (recA.impact * recA.confidence) / (recA.effort + 15);
  const scoreB = (recB.impact * recB.confidence) / (recB.effort + 15);

  // If one is clearly superior (>20% difference)
  if (scoreA > scoreB * 1.2) {
    return {
      resolution: 'KEEP_A',
      winnerId: recA.id,
      reasoning: `Recommendation ${recA.id} scores ${Math.round(scoreA)} vs ${Math.round(scoreB)} — ${recA.action} preferred`,
    };
  }
  if (scoreB > scoreA * 1.2) {
    return {
      resolution: 'KEEP_B',
      winnerId: recB.id,
      reasoning: `Recommendation ${recB.id} scores ${Math.round(scoreB)} vs ${Math.round(scoreA)} — ${recB.action} preferred`,
    };
  }

  // If scores are close, check if one is less destructive
  const safetyA = classifyActionSafety(recA.action);
  const safetyB = classifyActionSafety(recB.action);
  const safetyRank = { SAFE: 0, REVIEW_REQUIRED: 1, DESTRUCTIVE: 2 };

  if (safetyRank[safetyA] < safetyRank[safetyB]) {
    return {
      resolution: 'KEEP_A',
      winnerId: recA.id,
      reasoning: `Both similar impact, but ${recA.action} is safer (${safetyA} vs ${safetyB})`,
    };
  }
  if (safetyRank[safetyB] < safetyRank[safetyA]) {
    return {
      resolution: 'KEEP_B',
      winnerId: recB.id,
      reasoning: `Both similar impact, but ${recB.action} is safer (${safetyB} vs ${safetyA})`,
    };
  }

  // Cannot resolve automatically
  return {
    resolution: 'REQUIRES_REVIEW',
    winnerId: null,
    reasoning: `Cannot auto-resolve: ${recA.action} (score ${Math.round(scoreA)}) vs ${recB.action} (score ${Math.round(scoreB)}) — operator review required`,
  };
}

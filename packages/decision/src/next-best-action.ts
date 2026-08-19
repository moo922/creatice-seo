/**
 * Next Best Action Engine — generates the top recommendations requiring attention.
 *
 * Must balance categories. Do not show 10 identical missing-alt recommendations
 * while hiding one critical canonical problem.
 *
 * Default display: Top 10 recommendations requiring attention.
 */

import { computePriority, type PriorityFactors, type PriorityWeights, DEFAULT_WEIGHTS } from './priority-engine';
import { classifyActionSafety, type ConflictPair } from './conflict-engine';

export type WorkCategory = 'TECHNICAL' | 'CONTENT' | 'AEO_GEO' | 'AI_VISIBILITY' | 'KEYWORDS' | 'INTERNAL_LINKS' | 'MONITORING';

export interface NextBestActionInput {
  siteId: string;
  recommendations: Array<{
    id: string;
    title: string;
    action: string;
    targetUrl: string | null;
    clusterId: string | null;
    impact: number;
    confidence: number;
    effort: number;
    source: string;
    status: string;
    issueId: string;
    createdAt: string;
  }>;
  conflicts: ConflictPair[];
  maxResults?: number;
  categoryBalance?: boolean;
}

export interface NextBestAction {
  recommendationId: string;
  title: string;
  action: string;
  targetUrl: string | null;
  category: WorkCategory;
  safety: 'SAFE' | 'REVIEW_REQUIRED' | 'DESTRUCTIVE';
  priorityScore: number;
  impact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  effort: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  isConflicting: boolean;
  conflictingWith: string[];
}

/**
 * Map action types to work categories.
 */
const ACTION_CATEGORY_MAP: Record<string, WorkCategory> = {
  TECHNICAL_FIX: 'TECHNICAL',
  CANONICAL_FIX: 'TECHNICAL',
  INDEXABILITY_FIX: 'TECHNICAL',
  TITLE_META_OPTIMIZATION: 'CONTENT',
  ONPAGE_OPTIMIZATION: 'CONTENT',
  CONTENT_UPDATE: 'CONTENT',
  CONTENT_EXPANSION: 'CONTENT',
  CONTENT_CREATE: 'CONTENT',
  CONTENT_MERGE: 'CONTENT',
  REDIRECT_REVIEW: 'TECHNICAL',
  INTERNAL_LINK: 'INTERNAL_LINKS',
  AEO_ANSWER_GAP: 'AEO_GEO',
  AEO_DECISION_SUPPORT: 'AEO_GEO',
  GEO_ENTITY_FIX: 'AEO_GEO',
  GEO_EVIDENCE: 'AEO_GEO',
  GEO_CITATION_READINESS: 'AEO_GEO',
  AI_VISIBILITY_SOURCE_GAP: 'AI_VISIBILITY',
  KEYWORD_MAPPING: 'KEYWORDS',
  CANNIBALIZATION: 'KEYWORDS',
  KNOWLEDGE_BASE_UPDATE: 'AEO_GEO',
};

/**
 * Generate Next Best Actions from available recommendations.
 * Balances across categories to prevent concentration.
 */
export function generateNextBestActions(
  input: NextBestActionInput,
  weights: PriorityWeights = DEFAULT_WEIGHTS,
): NextBestAction[] {
  const maxResults = input.maxResults ?? 10;
  const candidates = input.recommendations
    .filter((r) => r.status === 'SUGGESTED' || r.status === 'REVIEWED' || r.status === 'APPROVED')
    .map((r) => {
      const effortValue = effortToNumber(r.effort);
      const factors: PriorityFactors = {
        businessValue: r.impact,
        searchOpportunity: r.source === 'KEYWORD_INTELLIGENCE' ? 80 : r.source === 'GSC' ? 70 : 50,
        severity: r.impact,
        affectedTraffic: r.source === 'GSC' ? 75 : 50,
        affectedPages: r.targetUrl ? 60 : 40,
        confidence: r.confidence,
        urgency: r.source === 'SEO_AUDIT' ? 70 : 50,
        effortInverse: 100 - effortValue,
      };
      const priority = computePriority(factors, weights);
      const category = ACTION_CATEGORY_MAP[r.action] ?? 'TECHNICAL';
      const safety = classifyActionSafety(r.action);

      const conflictPair = input.conflicts.find(
        (c) => c.recommendationIdA === r.id || c.recommendationIdB === r.id,
      );

      return {
        recommendationId: r.id,
        title: r.title,
        action: r.action,
        targetUrl: r.targetUrl,
        category,
        safety,
        priorityScore: priority.score,
        impact: priority.impact,
        confidence: priority.confidence,
        effort: priority.effort,
        isConflicting: !!conflictPair,
        conflictingWith: conflictPair
          ? [conflictPair.recommendationIdA, conflictPair.recommendationIdB].filter((id) => id !== r.id)
          : [],
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);

  // Apply category balancing: ensure at least 1 from each represented category
  if (input.categoryBalance !== false) {
    return balancedSelection(candidates, maxResults);
  }

  return candidates.slice(0, maxResults);
}

/**
 * Select candidates ensuring category diversity.
 * Takes the top N while ensuring no more than 40% from any single category.
 */
function balancedSelection(candidates: NextBestAction[], maxResults: number): NextBestAction[] {
  const selected: NextBestAction[] = [];
  const categoryCounts = new Map<WorkCategory, number>();
  const maxPerCategory = Math.max(2, Math.ceil(maxResults * 0.4));

  for (const candidate of candidates) {
    if (selected.length >= maxResults) break;
    const count = categoryCounts.get(candidate.category) ?? 0;
    if (count < maxPerCategory) {
      selected.push(candidate);
      categoryCounts.set(candidate.category, count + 1);
    }
  }

  // Fill remaining slots if we haven't hit maxResults, but still respect category limits
  if (selected.length < maxResults) {
    const selectedIds = new Set(selected.map((s) => s.recommendationId));
    for (const candidate of candidates) {
      if (selected.length >= maxResults) break;
      if (!selectedIds.has(candidate.recommendationId)) {
        const count = categoryCounts.get(candidate.category) ?? 0;
        if (count < maxPerCategory) {
          selected.push(candidate);
          categoryCounts.set(candidate.category, count + 1);
        }
      }
    }
  }

  // Final pass: fill any remaining slots if all categories are at limit
  if (selected.length < maxResults) {
    const selectedIds = new Set(selected.map((s) => s.recommendationId));
    for (const candidate of candidates) {
      if (selected.length >= maxResults) break;
      if (!selectedIds.has(candidate.recommendationId)) {
        selected.push(candidate);
      }
    }
  }

  return selected;
}

function effortToNumber(effort: string | number): number {
  if (typeof effort === 'number') return effort;
  const map: Record<string, number> = {
    VERY_LOW: 10,
    LOW: 25,
    MEDIUM: 50,
    HIGH: 75,
    VERY_HIGH: 90,
  };
  return map[effort] ?? 50;
}

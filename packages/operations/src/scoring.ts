import type { RecommendationPriority } from '@creative-seo/types';

/**
 * Deterministic priority scoring for recommendations.
 *
 * Score = impact * confidence / (effort + floor).
 * All inputs are 0-100 and are supplied deterministically from evidence — the
 * AI never sets them. Priority is derived purely from this formula, so two
 * identical recommendations always get the same priority.
 */
export interface PriorityInput {
  impact: number;
  confidence: number;
  effort: number;
}

export interface PriorityResult {
  priority: RecommendationPriority;
  score: number;
  label: string;
}

export const PRIORITY_LABELS: Record<RecommendationPriority, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

const PRIORITY_BANDS: ReadonlyArray<{ min: number; priority: RecommendationPriority }> = [
  { min: 60, priority: 'CRITICAL' },
  { min: 40, priority: 'HIGH' },
  { min: 20, priority: 'MEDIUM' },
  { min: 0, priority: 'LOW' },
];

/** Effort floor prevents a zero-effort input from producing an infinite score. */
const EFFORT_FLOOR = 15;

export function deterministicPriority(input: PriorityInput): PriorityResult {
  const impact = clamp(input.impact);
  const confidence = clamp(input.confidence);
  const effort = clamp(input.effort);
  const score = clamp(Math.round(((impact * confidence) / (effort + EFFORT_FLOOR)) * 100) / 100);
  const priority = priorityFromScore(score);
  return { priority, score, label: PRIORITY_LABELS[priority] };
}

export function priorityFromScore(score: number): RecommendationPriority {
  for (const band of PRIORITY_BANDS) {
    if (score >= band.min) {
      return band.priority;
    }
  }
  return 'LOW';
}

export function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

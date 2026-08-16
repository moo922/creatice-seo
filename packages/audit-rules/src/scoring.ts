import { AUDIT_HEALTH_SCORE_VERSION } from '@creative-seo/types';

export interface ScoreResultInput {
  ruleKey: string;
  category: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  passed: boolean;
  url: string | null;
}

export interface HealthScoreContext {
  pagesCrawled: number;
}

export interface HealthScores {
  technicalHealth: number | null;
  onPageHealth: number | null;
  internalLinkingHealth: number | null;
  seoHealth: number | null;
  scoreVersion: number;
  label: string;
  coverage: { evaluatedUrls: number; pagesCrawled: number };
}

const SEVERITY_WEIGHT: Record<ScoreResultInput['severity'], number> = {
  info: 1,
  low: 3,
  medium: 10,
  high: 40,
  critical: 100,
};

// A single critical finding per evaluated URL saturates the penalty.
const WEIGHT_BASE = 100;

function groupKey(category: string): 'technical' | 'on-page' | 'internal-linking' | null {
  switch (category) {
    case 'technical':
      return 'technical';
    case 'on-page':
    case 'content':
    case 'rank-math':
    case 'seo':
      return 'on-page';
    case 'internal-linking':
      return 'internal-linking';
    default:
      // aeo / geo / search-performance are not implemented yet.
      return null;
  }
}

/**
 * Computes the deterministic Internal Platform Health Score from persisted
 * audit results. Scores are derived from coverage (evaluated pages), failed
 * rules, severity weighting (critical > high > medium > low > info) and
 * affected URLs — never from page count alone. The score is fully reproducible
 * from the audit_results rows and is explicitly not a Google score.
 */
export function computeHealthScores(results: ScoreResultInput[], context: HealthScoreContext): HealthScores {
  const grouped: Record<'technical' | 'on-page' | 'internal-linking', ScoreResultInput[]> = {
    technical: [],
    'on-page': [],
    'internal-linking': [],
  };

  for (const result of results) {
    const key = groupKey(result.category);
    if (key) grouped[key].push(result);
  }

  const evaluate = (inputs: ScoreResultInput[]): number | null => {
    if (inputs.length === 0) return null;
    const evaluatedUrls = new Set<string>();
    let weightedPenalty = 0;
    for (const input of inputs) {
      if (input.url) evaluatedUrls.add(input.url);
      if (!input.passed) {
        weightedPenalty += SEVERITY_WEIGHT[input.severity] ?? 0;
      }
    }
    const density = Math.min(1, weightedPenalty / (Math.max(evaluatedUrls.size, 1) * WEIGHT_BASE));
    const coverage = Math.min(1, evaluatedUrls.size / Math.max(context.pagesCrawled, 1));
    const coverageFactor = 0.5 + 0.5 * coverage;
    const score = Math.round(100 * (1 - density) * coverageFactor);
    return Math.max(0, Math.min(100, score));
  };

  const technicalHealth = evaluate(grouped.technical);
  const onPageHealth = evaluate(grouped['on-page']);
  const internalLinkingHealth = evaluate(grouped['internal-linking']);

  const available = [technicalHealth, onPageHealth, internalLinkingHealth].filter(
    (score): score is number => score !== null,
  );
  const seoHealth = available.length > 0 ? Math.round(available.reduce((sum, score) => sum + score, 0) / available.length) : null;

  const evaluatedUrls = new Set<string>();
  for (const result of results) {
    if (result.url) evaluatedUrls.add(result.url);
  }

  return {
    technicalHealth,
    onPageHealth,
    internalLinkingHealth,
    seoHealth,
    scoreVersion: AUDIT_HEALTH_SCORE_VERSION,
    label: 'Internal Platform Health Score',
    coverage: { evaluatedUrls: evaluatedUrls.size, pagesCrawled: context.pagesCrawled },
  };
}

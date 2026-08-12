import type { ScoreMetricDto, ValidatorId, ValidatorResultDto } from '@creative-seo/types';

export const VALIDATOR_PASS_THRESHOLD = 70;

/**
 * Internal quality scores. Every validator result is explicitly labelled as an
 * internal score, never an official search-engine score.
 */
export interface MetricOptions {
  weight?: number;
  details?: string;
}

export function metric(id: string, label: string, score: number, options: MetricOptions = {}): ScoreMetricDto {
  const weight = options.weight ?? 1;
  return {
    id,
    label,
    score: clamp(score),
    weight,
    passed: clamp(score) >= VALIDATOR_PASS_THRESHOLD,
    details: options.details ?? '',
  };
}

export function validatorResult(
  validator: ValidatorId,
  label: string,
  metrics: ScoreMetricDto[],
  recommendations: string[],
  note: string | null = null,
): ValidatorResultDto {
  return {
    validator,
    label,
    metrics,
    overallScore: computeOverall(metrics),
    passed: computeOverall(metrics) >= VALIDATOR_PASS_THRESHOLD,
    isInternalScore: true,
    recommendations,
    note,
  };
}

/** Weighted average of metric scores (unweighted when all weights are equal). */
export function computeOverall(metrics: ReadonlyArray<Pick<ScoreMetricDto, 'score' | 'weight'>>): number {
  if (metrics.length === 0) return 0;
  const totalWeight = metrics.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (totalWeight <= 0) return 0;
  const weighted = metrics.reduce((sum, item) => sum + clamp(item.score) * Math.max(0, item.weight), 0);
  return Math.round((weighted / totalWeight) * 100) / 100;
}

/**
 * Merges two validator results (e.g. deterministic checks + an LLM review).
 * Metrics are combined by id; the primary result's weights win. The overall
 * score is recomputed from the merged metric set.
 */
export function mergeValidatorResults(primary: ValidatorResultDto, secondary: ValidatorResultDto): ValidatorResultDto {
  const merged = new Map<string, ScoreMetricDto>();
  for (const item of secondary.metrics) {
    merged.set(item.id, item);
  }
  for (const item of primary.metrics) {
    const existing = merged.get(item.id);
    merged.set(item.id, existing ? { ...existing, score: item.score, details: item.details } : item);
  }
  const metrics = [...merged.values()];
  const recommendations = dedupeStrings([...primary.recommendations, ...secondary.recommendations]);
  return validatorResult(primary.validator, primary.label, metrics, recommendations, primary.note ?? secondary.note);
}

export function clamp(score: number): number {
  return Math.round(Math.min(100, Math.max(0, score)) * 100) / 100;
}

export function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

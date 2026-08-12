import type {
  AiProviderKind,
  VisibilityMetricDelta,
  VisibilityMetricKey,
  VisibilityMetricsDto,
  VisibilityObservationDto,
  VisibilityTrendPointDto,
} from '@creative-seo/types';

/**
 * Metrics computed from a batch of observations. Every metric is explicitly
 * labelled as a controlled observation from the configured AI provider/model —
 * never described as an exact ChatGPT, Claude or Perplexity user ranking.
 */

const PROVIDER_PRODUCT_LABEL: Record<AiProviderKind, string> = {
  OPENAI: 'ChatGPT',
  ANTHROPIC: 'Claude',
  PERPLEXITY: 'Perplexity',
};

const METRIC_LABELS: Record<VisibilityMetricKey, string> = {
  brandMentionRate: 'Brand mention rate',
  citationRate: 'Citation rate',
  sourceCoverage: 'Source coverage',
  competitorInclusion: 'Competitor inclusion',
  shareOfVoice: 'AI share of voice',
};

export function computeMetrics(
  observations: Array<Pick<VisibilityObservationDto, 'brandMentioned' | 'websiteCited' | 'citedUrls' | 'competitorsMentioned'>>,
  provider: AiProviderKind,
  model: string,
): VisibilityMetricsDto {
  const total = observations.length;
  const brandMentioned = observations.filter((o) => o.brandMentioned).length;
  const cited = observations.filter((o) => o.websiteCited).length;
  const anyCitation = observations.filter((o) => o.citedUrls.length > 0).length;
  const competitor = observations.filter((o) => o.competitorsMentioned.length > 0).length;
  const brandPresence = observations.filter((o) => o.brandMentioned || o.websiteCited).length;

  return {
    brandMentionRate: rate(brandMentioned, total),
    citationRate: rate(cited, total),
    sourceCoverage: rate(anyCitation, total),
    competitorInclusion: rate(competitor, total),
    shareOfVoice: {
      brand: rate(brandPresence, total),
      competitors: rate(competitor, total),
    },
    totalObservations: total,
    provider,
    model,
    isControlledObservation: true,
    label: controlledObservationLabel(provider, model),
  };
}

export function controlledObservationLabel(provider: AiProviderKind, model: string): string {
  const product = PROVIDER_PRODUCT_LABEL[provider] ?? provider;
  return (
    `Controlled observation from ${provider} (${model}); measured with standardized prompts. ` +
    `Not an exact ${product} user ranking.`
  );
}

export function metricLabel(key: VisibilityMetricKey): string {
  return METRIC_LABELS[key];
}

/** Latest vs previous deltas across the observable metrics. */
export function trendDeltas(
  latest: VisibilityTrendPointDto,
  previous: VisibilityTrendPointDto,
): VisibilityMetricDelta[] {
  const keys: VisibilityMetricKey[] = ['brandMentionRate', 'citationRate', 'sourceCoverage', 'competitorInclusion'];
  const deltas: VisibilityMetricDelta[] = keys.map((key) => {
    const latestValue = latest.metrics[key] as number;
    const previousValue = previous.metrics[key] as number;
    return {
      key,
      label: METRIC_LABELS[key],
      latest: latestValue,
      previous: previousValue,
      delta: latestValue !== null && previousValue !== null ? round4(latestValue - previousValue) : null,
    };
  });
  deltas.push({
    key: 'shareOfVoice',
    label: METRIC_LABELS.shareOfVoice,
    latest: latest.metrics.shareOfVoice.brand,
    previous: previous.metrics.shareOfVoice.brand,
    delta:
      latest.metrics.shareOfVoice.brand !== null && previous.metrics.shareOfVoice.brand !== null
        ? round4(latest.metrics.shareOfVoice.brand - previous.metrics.shareOfVoice.brand)
        : null,
  });
  return deltas;
}

function rate(count: number, total: number): number {
  if (total === 0) return 0;
  return round4(count / total);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

import { computeMetrics, controlledObservationLabel, trendDeltas } from './metrics';
import type { VisibilityTrendPointDto } from '@creative-seo/types';

const obs = (overrides: Partial<{ brandMentioned: boolean; websiteCited: boolean; citedUrls: string[]; competitorsMentioned: string[] }> = {}) => ({
  brandMentioned: false,
  websiteCited: false,
  citedUrls: [],
  competitorsMentioned: [],
  ...overrides,
});

describe('computeMetrics', () => {
  it('computes the observation metrics', () => {
    const observations = [
      obs({ brandMentioned: true, websiteCited: true, citedUrls: ['https://brightseo.com'] }),
      obs({ websiteCited: true, citedUrls: ['https://brightseo.com/contact'] }),
      obs({ competitorsMentioned: ['rankrocket'] }),
      obs({ citedUrls: ['https://example.org/x'] }),
    ];
    const metrics = computeMetrics(observations, 'OPENAI', 'gpt-4o-mini');
    expect(metrics.brandMentionRate).toBe(0.25);
    expect(metrics.citationRate).toBe(0.5);
    expect(metrics.sourceCoverage).toBe(0.75);
    expect(metrics.competitorInclusion).toBe(0.25);
    expect(metrics.shareOfVoice.brand).toBe(0.5);
    expect(metrics.shareOfVoice.competitors).toBe(0.25);
    expect(metrics.totalObservations).toBe(4);
  });

  it('labels metrics as controlled observations, not official rankings', () => {
    const metrics = computeMetrics([obs({ brandMentioned: true })], 'ANTHROPIC', 'claude-sonnet-4-5');
    expect(metrics.isControlledObservation).toBe(true);
    expect(metrics.label).toContain('Controlled observation');
    expect(metrics.label).toContain('Not an exact Claude user ranking');
    expect(metrics.label).not.toContain('official');
  });

  it('returns zeroed metrics for an empty batch', () => {
    const metrics = computeMetrics([], 'PERPLEXITY', 'sonar-pro');
    expect(metrics.brandMentionRate).toBe(0);
    expect(metrics.shareOfVoice.brand).toBe(0);
  });
});

describe('controlledObservationLabel', () => {
  it('maps providers to product names', () => {
    expect(controlledObservationLabel('OPENAI', 'gpt-4o-mini')).toContain('ChatGPT');
    expect(controlledObservationLabel('PERPLEXITY', 'sonar-pro')).toContain('Perplexity');
  });
});

describe('trendDeltas', () => {
  const point = (overrides: Partial<VisibilityTrendPointDto['metrics']> = {}): VisibilityTrendPointDto => ({
    runId: 'run-1',
    observedAt: '2026-08-01',
    provider: 'OPENAI',
    model: 'gpt-4o-mini',
    metrics: {
      brandMentionRate: 0.5,
      citationRate: 0.4,
      sourceCoverage: 0.6,
      competitorInclusion: 0.3,
      shareOfVoice: { brand: 0.5, competitors: 0.3 },
      totalObservations: 7,
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      isControlledObservation: true,
      label: 'x',
      ...overrides,
    },
  });

  it('computes deltas between the latest and previous run', () => {
    const latest = point({ brandMentionRate: 0.6, citationRate: 0.5 });
    const previous = point({ brandMentionRate: 0.4, citationRate: 0.3 });
    const deltas = trendDeltas(latest, previous);
    const brand = deltas.find((delta) => delta.key === 'brandMentionRate')!;
    expect(brand.delta).toBe(0.2);
    expect(brand.label).toBe('Brand mention rate');
  });
});

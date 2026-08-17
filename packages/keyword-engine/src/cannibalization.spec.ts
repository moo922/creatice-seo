import { classifyCannibalization, clusterCannibalization, DEFAULT_CANNIBALIZATION_OPTIONS } from './cannibalization';

describe('cannibalization detection (Sections 35-39, Tests 119-121)', () => {
  it('detects cannibalization when two URLs split impressions for the same query (Test 119)', () => {
    const result = classifyCannibalization('SEO services', [
      { url: 'https://a.com/seo', impressions: 600, clicks: 40, position: 4, activeDates: 20 },
      { url: 'https://b.com/seo', impressions: 350, clicks: 20, position: 5, activeDates: 18 },
    ]);

    expect(result.classification).not.toBe('NONE');
    expect(result.urls.length).toBe(2);
    expect(result.preferredTarget).toBe('https://a.com/seo');
    expect(result.scoreVersion).toBe('cannibalization-v1');
  });

  it('does NOT flag a URL with 1 impression once as cannibalization (Test 120)', () => {
    const result = classifyCannibalization('SEO services', [
      { url: 'https://a.com/seo', impressions: 999, clicks: 50, position: 3, activeDates: 30 },
      { url: 'https://b.com/seo', impressions: 1, clicks: 0, position: 99, activeDates: 1 },
    ]);

    // The 1-impression URL is below minImpressionsPerUrl + below active date min.
    expect(result.classification).toBe('NONE');
    expect(result.urls.length).toBe(0);
  });

  it('does not flag below-minimum query impressions', () => {
    const result = classifyCannibalization('tiny query', [
      { url: 'https://a.com/x', impressions: 20, clicks: 1, position: 5, activeDates: 5 },
      { url: 'https://b.com/x', impressions: 15, clicks: 1, position: 6, activeDates: 5 },
    ]);
    expect(result.classification).toBe('NONE');
  });

  it('classifies distinct-intent pages separately (Test 121: intent difference is NOT auto-flagged)', () => {
    // Here the two URLs do not share the query — they are distinct intents.
    const result = classifyCannibalization('how to do seo', [
      { url: 'https://a.com/guide', impressions: 800, clicks: 60, position: 2, activeDates: 40 },
    ]);
    // Only one URL -> no cannibalization.
    expect(result.classification).toBe('NONE');
  });

  it('honors configurable thresholds', () => {
    const strict = { ...DEFAULT_CANNIBALIZATION_OPTIONS, minQueryImpressions: 500, minImpressionsPerUrl: 100 };
    const result = classifyCannibalization(
      'SEO services',
      [
        { url: 'https://a.com/seo', impressions: 120, clicks: 8, position: 4, activeDates: 15 },
        { url: 'https://b.com/seo', impressions: 90, clicks: 5, position: 5, activeDates: 14 },
      ],
      strict,
    );
    expect(result.classification).toBe('NONE');
  });
});

describe('cluster-level cannibalization (Section 37)', () => {
  it('aggregates multiple queries within a cluster', () => {
    const results = clusterCannibalization([
      {
        query: 'seo services',
        urls: [
          { url: 'https://a.com/seo', impressions: 400, clicks: 30, position: 4, activeDates: 20 },
          { url: 'https://b.com/seo', impressions: 300, clicks: 20, position: 5, activeDates: 18 },
        ],
      },
      {
        query: 'best seo company',
        urls: [
          { url: 'https://a.com/seo', impressions: 200, clicks: 15, position: 3, activeDates: 12 },
          { url: 'https://b.com/seo', impressions: 150, clicks: 10, position: 6, activeDates: 10 },
        ],
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]!.urls).toHaveLength(2);
    expect(results[0]!.classification).not.toBe('NONE');
  });
});
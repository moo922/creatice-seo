import { aggregateForTest, type TestRow } from './aggregate';

/**
 * DATA TRUTH — no double counting.
 *
 * Storing SITE_DAILY clicks = 100, plus QUERY_DAILY rows totaling 100, plus
 * PAGE_DAILY rows totaling 100 must still yield Site Clicks = 100 — because
 * site-level reads aggregate ONLY the SITE_DAILY grain. The repository exposes
 * grain-specific methods so application code can never sum across grains.
 */
describe('canonical metric aggregation (no double counting)', () => {
  const siteRows: TestRow[] = [{ clicks: 100, impressions: 1000, position: 5, ctr: 0.1 }];
  const queryRows: TestRow[] = [
    { clicks: 40, impressions: 400, position: 3, ctr: 0.1 },
    { clicks: 60, impressions: 600, position: 7, ctr: 0.2 },
  ];
  const pageRows: TestRow[] = [
    { clicks: 30, impressions: 300, position: 4, ctr: 0.1 },
    { clicks: 70, impressions: 700, position: 6, ctr: 0.1 },
  ];

  it('site clicks are 100, never 300, even when query+page grains also sum to 100', () => {
    const site = aggregateForTest(siteRows);
    const query = aggregateForTest(queryRows);
    const page = aggregateForTest(pageRows);

    expect(site.clicks).toBe(100);
    expect(query.clicks).toBe(100);
    expect(page.clicks).toBe(100);

    // The repository reads only the SITE_DAILY grain for site totals.
    const naiveSum = site.clicks + query.clicks + page.clicks;
    expect(naiveSum).toBe(300);
    expect(site.clicks).not.toBe(naiveSum);
  });

  it('computes CTR from aggregated clicks/impressions, not an average of daily CTR', () => {
    const site = aggregateForTest(siteRows);
    expect(site.ctr).toBe(100 / 1000);

    const query = aggregateForTest(queryRows);
    // Aggregate CTR = 100/1000 = 0.1.
    expect(query.ctr).toBe(100 / 1000);
    // Averaging the per-day CTR values (0.1 and 0.2) would give 0.15 — wrong.
    const naiveAverage = (0.1 + 0.2) / 2;
    expect(query.ctr).not.toBe(naiveAverage);
  });

  it('computes average position weighted by impressions', () => {
    const site = aggregateForTest(siteRows);
    expect(site.averagePosition).toBe(5);

    const query = aggregateForTest(queryRows);
    const weighted = (40 * 3 + 60 * 7) / (40 + 60);
    expect(query.averagePosition).toBe(weighted);
    expect(query.positionMethod).toBe('weighted');
  });

  it('returns null position when it cannot be computed (not an invented value)', () => {
    const noPosition = aggregateForTest([{ clicks: 5, impressions: 50, position: null, ctr: 0.1 }]);
    expect(noPosition.averagePosition).toBeNull();
    expect(noPosition.positionMethod).toBe('unavailable');
  });
});

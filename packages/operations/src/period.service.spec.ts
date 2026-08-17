import { aggregateForTest, type TestRow } from '@creative-seo/metrics/src/aggregate';

describe('Period rules', () => {
  it('CTR from aggregate: 10 clicks/100 imp day1 + 90 clicks/900 imp day2 = 100 clicks/1000 imp/10% CTR', () => {
    const day1: TestRow = { clicks: 10, impressions: 100, position: 5, ctr: 0.1 };
    const day2: TestRow = { clicks: 90, impressions: 900, position: 10, ctr: 0.1 };

    const aggregated = aggregateForTest([day1, day2]);

    expect(aggregated.clicks).toBe(100);
    expect(aggregated.impressions).toBe(1000);
    expect(aggregated.ctr).toBe(0.1);
  });

  it('does not average percentages incorrectly', () => {
    // day1 CTR = 10/100 = 0.1, day2 CTR = 80/200 = 0.4
    // Correct aggregate: 90/300 = 0.3
    // Wrong naive average: (0.1 + 0.4) / 2 = 0.25
    const day1: TestRow = { clicks: 10, impressions: 100, position: 5, ctr: 0.1 };
    const day2: TestRow = { clicks: 80, impressions: 200, position: 10, ctr: 0.4 };

    const aggregated = aggregateForTest([day1, day2]);

    expect(aggregated.clicks).toBe(90);
    expect(aggregated.impressions).toBe(300);
    expect(aggregated.ctr).toBe(0.3);
    const naiveAverage = (0.1 + 0.4) / 2;
    expect(aggregated.ctr).not.toBe(naiveAverage);
  });

  it('CTR is zero when there are no impressions', () => {
    const rows: TestRow[] = [{ clicks: 0, impressions: 0, position: null, ctr: 0 }];
    const aggregated = aggregateForTest(rows);
    expect(aggregated.ctr).toBe(0);
  });
});

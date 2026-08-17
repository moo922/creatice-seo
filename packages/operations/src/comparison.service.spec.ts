import { ComparisonService } from './comparison.service';

describe('ComparisonService', () => {
  const svc = new ComparisonService();

  describe('compareValue', () => {
    it('higher-is-better: increased clicks = improved', () => {
      const result = svc.compareValue('clicks', 1200, 1000);
      expect(result.direction).toBe('improved');
      expect(result.absoluteChange).toBe(200);
      expect(result.percentageChange).toBe(20);
    });

    it('lower-is-better: decreased criticalIssues = improved', () => {
      const result = svc.compareValue('criticalIssues', 2, 5);
      expect(result.direction).toBe('improved');
      expect(result.absoluteChange).toBe(-3);
    });

    it('lower-is-better: increased technicalIssues = declined', () => {
      const result = svc.compareValue('technicalIssues', 10, 5);
      expect(result.direction).toBe('declined');
      expect(result.absoluteChange).toBe(5);
    });

    it('zero base: previous=0 current=10 returns +10 absolute, null percentage, reason ZERO_BASE', () => {
      const result = svc.compareValue('clicks', 10, 0);
      expect(result.absoluteChange).toBe(10);
      expect(result.percentageChange).toBeNull();
      expect(result.changeReason).toBe('ZERO_BASE');
      expect(result.direction).toBe('improved');
    });

    it('zero base: both zero returns flat with ZERO_BASE reason', () => {
      const result = svc.compareValue('clicks', 0, 0);
      expect(result.absoluteChange).toBe(0);
      expect(result.direction).toBe('flat');
      expect(result.changeReason).toBe('ZERO_BASE');
    });

    it('null values: both null returns direction n/a, no fake zero', () => {
      const result = svc.compareValue('clicks', null, null);
      expect(result.direction).toBe('n/a');
      expect(result.changeReason).toBe('NULL_VALUE');
      expect(result.absoluteChange).toBeNull();
      expect(result.percentageChange).toBeNull();
      expect(result.comparisonQuality).toBe('none');
    });

    it('null values: one null returns partial quality', () => {
      const result = svc.compareValue('clicks', 100, null);
      expect(result.direction).toBe('n/a');
      expect(result.changeReason).toBe('NULL_VALUE');
      expect(result.absoluteChange).toBeNull();
      expect(result.comparisonQuality).toBe('partial');
      expect(result.availability).toBe('AVAILABLE');

      const result2 = svc.compareValue('clicks', null, 100);
      expect(result2.direction).toBe('n/a');
      expect(result2.comparisonQuality).toBe('partial');
      expect(result2.availability).toBe('NOT_MEASURED');
    });

    it('flat: same value returns direction flat', () => {
      const result = svc.compareValue('clicks', 100, 100);
      expect(result.direction).toBe('flat');
      expect(result.absoluteChange).toBe(0);
      expect(result.percentageChange).toBe(0);
    });
  });

  describe('compareMetrics', () => {
    const baseMetrics = {
      crawlHealth: 80,
      technicalIssues: 5,
      onPageHealth: 70,
      contentHealth: 60,
      aeoReadiness: 50,
      geoReadiness: 45,
      keywordVisibility: 30,
      internalLinkHealth: 65,
      seoHealth: 70,
      pagesCrawled: 100,
      indexablePages: 90,
      noindexPages: 10,
      criticalIssues: 2,
      highIssues: 3,
      mediumIssues: 5,
      lowIssues: 8,
      rankingQueries: 50,
      queriesWithImpressions: 100,
      top3QueryCount: 10,
      top10QueryCount: 25,
      top20QueryCount: 40,
      positions11To20: 15,
      cannibalizationCandidates: 5,
      brokenInternalLinks: 3,
      orphanPages: 2,
      canonicalIssues: 1,
      aiVisibilityObservations: null,
      gscMetrics: { clicks: 1000, impressions: 50000, ctr: 0.02, avgPosition: 12 },
    };

    it('all scalar metrics compared with correct direction', () => {
      const results = svc.compareMetrics({
        current: baseMetrics,
        previous: { ...baseMetrics, crawlHealth: 70, technicalIssues: 10 },
        currentAvailability: {},
      });

      const crawl = results['crawlHealth'];
      expect(crawl).toBeDefined();
      expect(crawl!.direction).toBe('improved');
      expect(crawl!.absoluteChange).toBe(10);

      const tech = results['technicalIssues'];
      expect(tech).toBeDefined();
      expect(tech!.direction).toBe('improved');
      expect(tech!.absoluteChange).toBe(-5);
    });

    it('GSC metrics compared correctly', () => {
      const results = svc.compareMetrics({
        current: { ...baseMetrics, gscMetrics: { clicks: 1500, impressions: 60000, ctr: 0.025, avgPosition: 10 } },
        previous: baseMetrics,
        currentAvailability: {},
      });

      expect(results['gscMetrics.clicks']).toBeDefined();
      expect(results['gscMetrics.clicks']!.direction).toBe('improved');
      expect(results['gscMetrics.clicks']!.absoluteChange).toBe(500);
      expect(results['gscMetrics.impressions']).toBeDefined();
      expect(results['gscMetrics.impressions']!.direction).toBe('improved');
      expect(results['gscMetrics.ctr']).toBeDefined();
      expect(results['gscMetrics.ctr']!.direction).toBe('improved');
    });

    it('returns n/a for all metrics when previous is null', () => {
      const results = svc.compareMetrics({
        current: { ...baseMetrics, aiVisibilityObservations: 42 },
        previous: null,
        currentAvailability: {},
      });

      const values = Object.values(results);
      expect(values.every((v) => v.direction === 'n/a')).toBe(true);
      expect(values.every((v) => v.comparisonQuality === 'partial')).toBe(true);
    });
  });

  describe('determineComparisonQuality', () => {
    it('all full -> full', () => {
      const results = {
        a: { comparisonQuality: 'full' as const },
        b: { comparisonQuality: 'full' as const },
      };
      expect(svc.determineComparisonQuality(results as any)).toBe('full');
    });

    it('mix -> partial', () => {
      const results = {
        a: { comparisonQuality: 'full' as const },
        b: { comparisonQuality: 'partial' as const },
        c: { comparisonQuality: 'partial' as const },
      };
      expect(svc.determineComparisonQuality(results as any)).toBe('partial');
    });

    it('all none -> none', () => {
      const results = {
        a: { comparisonQuality: 'none' as const },
        b: { comparisonQuality: 'none' as const },
      };
      expect(svc.determineComparisonQuality(results as any)).toBe('none');
    });

    it('less than half full -> partial', () => {
      const results = {
        a: { comparisonQuality: 'full' as const },
        b: { comparisonQuality: 'partial' as const },
        c: { comparisonQuality: 'none' as const },
        d: { comparisonQuality: 'none' as const },
      };
      expect(svc.determineComparisonQuality(results as any)).toBe('partial');
    });
  });
});

import { scoreOpportunity, evidenceConfidence, normalizeSearchDemand, OPPORTUNITY_SCORE_VERSION } from './opportunity';

describe('opportunity scoring (Sections 42-50, Tests 123-125)', () => {
  it('produces identical scores for identical inputs (Test 123)', () => {
    const input = {
      type: 'POSITION_11_20' as const,
      searchDemand: 2000,
      position: 14,
      businessRelevance: 0.8,
      hasTargetUrl: false,
      cannibalizationRisk: 0.1,
      evidenceConfidence: 0.7,
    };
    const a = scoreOpportunity(input);
    const b = scoreOpportunity(input);
    expect(a.score).toBe(b.score);
    expect(a.scoreVersion).toBe(OPPORTUNITY_SCORE_VERSION);
  });

  it('never invents data: missing demand reduces confidence, not score to 0 (Test 124-125)', () => {
    const noDemand = scoreOpportunity({
      type: 'NEW_PAGE',
      searchDemand: null,
      position: null,
      businessRelevance: 0.6,
      hasTargetUrl: false,
      cannibalizationRisk: null,
      evidenceConfidence: 0.1, // new site, no data
    });
    // Not zero — strategy still works without GSC/Google Ads.
    expect(noDemand.score).toBeGreaterThan(0);
    expect(noDemand.confidence).toBe(0.1);
  });

  it('scores URL gap: CREATE only when no target exists (Sections 48-49)', () => {
    const withTarget = scoreOpportunity({
      type: 'NEW_PAGE',
      searchDemand: 1000,
      position: null,
      businessRelevance: 0.8,
      hasTargetUrl: true,
      cannibalizationRisk: null,
      evidenceConfidence: 0.7,
    });
    const withoutTarget = scoreOpportunity({
      type: 'NEW_PAGE',
      searchDemand: 1000,
      position: null,
      businessRelevance: 0.8,
      hasTargetUrl: false,
      cannibalizationRisk: null,
      evidenceConfidence: 0.7,
    });
    expect(withoutTarget.score).toBeGreaterThan(withTarget.score);
  });

  it('maps impact levels', () => {
    const high = scoreOpportunity({
      type: 'POSITION_11_20',
      searchDemand: 10000,
      position: 12,
      businessRelevance: 1,
      hasTargetUrl: false,
      cannibalizationRisk: 0,
      evidenceConfidence: 0.9,
    });
    expect(['VERY_HIGH', 'HIGH']).toContain(high.impact);
  });

  it('CTR optimization is LOW effort (Section 128)', () => {
    const ctr = scoreOpportunity({
      type: 'CTR_OPTIMIZATION',
      searchDemand: 5000,
      position: 5,
      businessRelevance: 0.9,
      hasTargetUrl: true,
      cannibalizationRisk: 0.05,
      evidenceConfidence: 0.8,
    });
    expect(ctr.effort).toBe('LOW');
  });

  it('NEW_PAGE without target URL is HIGH effort', () => {
    const np = scoreOpportunity({
      type: 'NEW_PAGE',
      searchDemand: 1000,
      position: null,
      businessRelevance: 0.8,
      hasTargetUrl: false,
      cannibalizationRisk: null,
      evidenceConfidence: 0.7,
    });
    expect(np.effort).toBe('HIGH');
  });

  it('evidence confidence reflects data availability', () => {
    expect(evidenceConfidence({ gscAvailable: true, googleAdsAvailable: true, hasManualSeeds: false })).toBe(0.7);
    expect(evidenceConfidence({ gscAvailable: false, googleAdsAvailable: false, hasManualSeeds: false })).toBe(0.1);
    expect(evidenceConfidence({ gscAvailable: true, googleAdsAvailable: false, hasManualSeeds: true })).toBe(0.7);
  });

  it('normalizes search demand on a log scale', () => {
    expect(normalizeSearchDemand(null)).toBe(0);
    expect(normalizeSearchDemand(0)).toBe(0);
    const bigger = normalizeSearchDemand(10000);
    const smaller = normalizeSearchDemand(10);
    expect(bigger).toBeGreaterThan(smaller);
  });
});
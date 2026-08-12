import {
  brokenLinkConfidence,
  clamp,
  opportunityConfidence,
  orphanConfidence,
  weakTargetConfidence,
} from './scoring';

describe('scoring', () => {
  it('scores opportunities deterministically from topical overlap', () => {
    const high = opportunityConfidence({ topicalScore: 1, sourceHasInbound: true, targetHasInbound: false });
    const low = opportunityConfidence({ topicalScore: 0, sourceHasInbound: false, targetHasInbound: true });
    expect(high).toBeGreaterThan(low);
  });

  it('is deterministic for identical inputs', () => {
    const signals = { topicalScore: 0.6, sourceHasInbound: true, targetHasInbound: false };
    expect(opportunityConfidence(signals)).toBe(opportunityConfidence(signals));
  });

  it('gives broken links with a 4xx/5xx status higher confidence', () => {
    expect(brokenLinkConfidence(404)).toBe(0.9);
    expect(brokenLinkConfidence(null)).toBe(0.7);
  });

  it('clamps scores to 0..1', () => {
    expect(clamp(1.5)).toBe(1);
    expect(clamp(-0.5)).toBe(0);
  });

  it('scores orphan and weak-target suggestions above zero when topically related', () => {
    expect(orphanConfidence(1)).toBeGreaterThan(0.5);
    expect(weakTargetConfidence(0.8)).toBeGreaterThan(0.5);
  });
});

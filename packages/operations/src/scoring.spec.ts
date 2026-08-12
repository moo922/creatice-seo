import { deterministicPriority, priorityFromScore } from './scoring';

describe('deterministicPriority', () => {
  it('is deterministic — identical inputs give identical results', () => {
    const a = deterministicPriority({ impact: 80, confidence: 80, effort: 20 });
    const b = deterministicPriority({ impact: 80, confidence: 80, effort: 20 });
    expect(a).toEqual(b);
    expect(a.score).toBeGreaterThan(0);
  });

  it('ranks high impact + high confidence + low effort as CRITICAL', () => {
    const result = deterministicPriority({ impact: 100, confidence: 100, effort: 0 });
    expect(result.priority).toBe('CRITICAL');
  });

  it('ranks low impact + low confidence + high effort as LOW', () => {
    const result = deterministicPriority({ impact: 10, confidence: 10, effort: 90 });
    expect(result.priority).toBe('LOW');
  });

  it('clamps out-of-range inputs', () => {
    const result = deterministicPriority({ impact: 500, confidence: -5, effort: -100 });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('maps scores to bands via priorityFromScore', () => {
    expect(priorityFromScore(100)).toBe('CRITICAL');
    expect(priorityFromScore(60)).toBe('CRITICAL');
    expect(priorityFromScore(40)).toBe('HIGH');
    expect(priorityFromScore(20)).toBe('MEDIUM');
    expect(priorityFromScore(5)).toBe('LOW');
  });
});

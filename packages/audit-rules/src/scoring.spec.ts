import { computeAeoScore, AEO_SCORE_V1 } from './aeo-scoring';
import { computeGeoScore, GEO_SCORE_V1 } from './geo-scoring';

describe('computeAeoScore', () => {
  it('should compute overall score from components', () => {
    const result = computeAeoScore({
      components: {
        intentAlignment: { score: 80 },
        directAnswer: { score: 75 },
        questionCoverage: { score: 70 },
        semanticCompleteness: { score: 85 },
        decisionSupport: { score: 60 },
        structureExtractability: { score: 90 },
        clarity: { score: 80 },
        factualGrounding: { score: 75 },
      },
      measuredPages: 10,
      totalPages: 10,
    });

    expect(result.overall).toBeGreaterThan(0);
    expect(result.overall).toBeLessThanOrEqual(100);
    expect(result.scoreVersion).toBe('AEO_SCORE_V1');
    expect(result.components.length).toBe(8);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should apply coverage factor when pages are unmeasured', () => {
    const full = computeAeoScore({
      components: {
        intentAlignment: { score: 80 },
        directAnswer: { score: 80 },
        questionCoverage: { score: 80 },
        semanticCompleteness: { score: 80 },
        decisionSupport: { score: 80 },
        structureExtractability: { score: 80 },
        clarity: { score: 80 },
        factualGrounding: { score: 80 },
      },
      measuredPages: 10,
      totalPages: 10,
    });

    const partial = computeAeoScore({
      components: {
        intentAlignment: { score: 80 },
        directAnswer: { score: 80 },
        questionCoverage: { score: 80 },
        semanticCompleteness: { score: 80 },
        decisionSupport: { score: 80 },
        structureExtractability: { score: 80 },
        clarity: { score: 80 },
        factualGrounding: { score: 80 },
      },
      measuredPages: 5,
      totalPages: 10,
    });

    // Partial coverage should result in lower score
    expect(partial.overall).toBeLessThanOrEqual(full.overall);
  });

  it('should handle perfect scores', () => {
    const result = computeAeoScore({
      components: {
        intentAlignment: { score: 100 },
        directAnswer: { score: 100 },
        questionCoverage: { score: 100 },
        semanticCompleteness: { score: 100 },
        decisionSupport: { score: 100 },
        structureExtractability: { score: 100 },
        clarity: { score: 100 },
        factualGrounding: { score: 100 },
      },
      measuredPages: 10,
      totalPages: 10,
    });

    expect(result.overall).toBe(100);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('should handle zero scores', () => {
    const result = computeAeoScore({
      components: {
        intentAlignment: { score: 0 },
        directAnswer: { score: 0 },
        questionCoverage: { score: 0 },
        semanticCompleteness: { score: 0 },
        decisionSupport: { score: 0 },
        structureExtractability: { score: 0 },
        clarity: { score: 0 },
        factualGrounding: { score: 0 },
      },
      measuredPages: 1,
      totalPages: 1,
    });

    expect(result.overall).toBe(0);
  });

  it('should return all component weights that sum to 1', () => {
    const totalWeight = Object.values(AEO_SCORE_V1.components).reduce((sum: number, c: { weight: number }) => sum + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 2);
  });
});

describe('computeGeoScore', () => {
  it('should compute overall score from components', () => {
    const result = computeGeoScore({
      components: {
        entityClarity: { score: 80 },
        entityConsistency: { score: 75 },
        factualSpecificity: { score: 70 },
        claimVerification: { score: 85 },
        evidenceQuality: { score: 60 },
        sourceQuality: { score: 90 },
        originalInformation: { score: 80 },
        expertAttribution: { score: 75 },
        machineAccessibility: { score: 85 },
        structuredFactClarity: { score: 70 },
        citationReadiness: { score: 80 },
      },
      measuredPages: 10,
      totalPages: 10,
    });

    expect(result.overall).toBeGreaterThan(0);
    expect(result.overall).toBeLessThanOrEqual(100);
    expect(result.scoreVersion).toBe('GEO_SCORE_V1');
    expect(result.components.length).toBe(11);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should apply coverage factor', () => {
    const full = computeGeoScore({
      components: {
        entityClarity: { score: 80 },
        entityConsistency: { score: 80 },
        factualSpecificity: { score: 80 },
        claimVerification: { score: 80 },
        evidenceQuality: { score: 80 },
        sourceQuality: { score: 80 },
        originalInformation: { score: 80 },
        expertAttribution: { score: 80 },
        machineAccessibility: { score: 80 },
        structuredFactClarity: { score: 80 },
        citationReadiness: { score: 80 },
      },
      measuredPages: 20,
      totalPages: 20,
    });

    const partial = computeGeoScore({
      components: {
        entityClarity: { score: 80 },
        entityConsistency: { score: 80 },
        factualSpecificity: { score: 80 },
        claimVerification: { score: 80 },
        evidenceQuality: { score: 80 },
        sourceQuality: { score: 80 },
        originalInformation: { score: 80 },
        expertAttribution: { score: 80 },
        machineAccessibility: { score: 80 },
        structuredFactClarity: { score: 80 },
        citationReadiness: { score: 80 },
      },
      measuredPages: 5,
      totalPages: 20,
    });

    expect(partial.overall).toBeLessThanOrEqual(full.overall);
  });

  it('should return all component weights that sum to 1', () => {
    const totalWeight = Object.values(GEO_SCORE_V1.components).reduce((sum: number, c: { weight: number }) => sum + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 2);
  });
});

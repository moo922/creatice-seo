/**
 * Snapshot freshness tests (Section 54).
 *
 * The freshness determination logic lives in SiteSnapshotService.calculateFreshness()
 * which depends on TypeORM repositories. These tests validate the pure freshness
 * determination rules: age-based thresholds that map to availability states.
 */

const STALE_THRESHOLDS = {
  crawl: 14,
  audit: 14,
  gsc: 5,
  aiObservation: 30,
} as const;

function determineAvailability(
  ageDays: number | null,
  threshold: number,
): 'AVAILABLE' | 'STALE' | 'NOT_MEASURED' {
  if (ageDays === null) return 'NOT_MEASURED';
  return ageDays > threshold ? 'STALE' : 'AVAILABLE';
}

describe('Snapshot freshness', () => {
  it('latest audit 45 days old -> status STALE', () => {
    expect(determineAvailability(45, STALE_THRESHOLDS.audit)).toBe('STALE');
  });

  it('fresh audit (3 days old) -> status AVAILABLE', () => {
    expect(determineAvailability(3, STALE_THRESHOLDS.audit)).toBe('AVAILABLE');
  });

  it('audit exactly at threshold boundary (14 days) -> AVAILABLE', () => {
    expect(determineAvailability(14, STALE_THRESHOLDS.audit)).toBe('AVAILABLE');
  });

  it('audit one day over threshold (15 days) -> STALE', () => {
    expect(determineAvailability(15, STALE_THRESHOLDS.audit)).toBe('STALE');
  });

  it('no audit run ever -> NOT_MEASURED', () => {
    expect(determineAvailability(null, STALE_THRESHOLDS.audit)).toBe('NOT_MEASURED');
  });

  it('GSC: fresh data (2 days old) -> AVAILABLE', () => {
    expect(determineAvailability(2, STALE_THRESHOLDS.gsc)).toBe('AVAILABLE');
  });

  it('GSC: stale data (7 days old) -> STALE', () => {
    expect(determineAvailability(7, STALE_THRESHOLDS.gsc)).toBe('STALE');
  });

  it('crawl: 20 days old -> STALE (threshold is 14)', () => {
    expect(determineAvailability(20, STALE_THRESHOLDS.crawl)).toBe('STALE');
  });

  it('AI observation: 25 days old -> AVAILABLE (threshold is 30)', () => {
    expect(determineAvailability(25, STALE_THRESHOLDS.aiObservation)).toBe('AVAILABLE');
  });

  it('AI observation: 35 days old -> STALE (threshold is 30)', () => {
    expect(determineAvailability(35, STALE_THRESHOLDS.aiObservation)).toBe('STALE');
  });

  it('freshness for all sources can be composed', () => {
    const freshness = {
      audit: determineAvailability(3, STALE_THRESHOLDS.audit),
      crawl: determineAvailability(20, STALE_THRESHOLDS.crawl),
      gsc: determineAvailability(2, STALE_THRESHOLDS.gsc),
      aiObservation: determineAvailability(25, STALE_THRESHOLDS.aiObservation),
    };

    expect(freshness.audit).toBe('AVAILABLE');
    expect(freshness.crawl).toBe('STALE');
    expect(freshness.gsc).toBe('AVAILABLE');
    expect(freshness.aiObservation).toBe('AVAILABLE');
  });
});

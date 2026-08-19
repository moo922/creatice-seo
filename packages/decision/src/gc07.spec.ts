import { computePriority, DEFAULT_WEIGHTS, type PriorityFactors, type PriorityWeights } from './priority-engine';
import { detectConflicts, resolveConflict, classifyActionSafety, buildTargetKey } from './conflict-engine';
import { computeFingerprint, mergeEvidence, type EvidenceEntry, type MergedEvidence } from './dedup-engine';
import { checkStaleness, supersedeRecommendation } from './stale-engine';
import { canProceed, hasCycle, topologicalSort, type Dependency } from './dependency-graph';
import { groupRecommendationsIntoPackages, type GroupableRecommendation } from './work-packages';
import { generateNextBestActions, type NextBestActionInput } from './next-best-action';
import { getStrategyWeights, STRATEGY_PRESETS } from './strategy-weights';
import {
  mapIssueToWorkItem,
  mapKeywordOpportunityToWorkItem,
  mapLinkSuggestionToWorkItem,
} from './work-item-collector';
import {
  isObservationWindowPassed,
  MEASUREMENT_WINDOWS,
  nextVerificationStep,
  type RecommendationOutcome,
} from './result-tracker';

describe('GC07 Decision Engine', () => {
  // ── §37: Priority Engine ──
  describe('§37: Deterministic priority engine', () => {
    it('produces same score for same inputs', () => {
      const factors: PriorityFactors = { businessValue: 70, searchOpportunity: 60, severity: 50, affectedTraffic: 40, affectedPages: 30, confidence: 80, urgency: 60, effortInverse: 70 };
      const a = computePriority(factors);
      const b = computePriority(factors);
      expect(a.score).toBe(b.score);
      expect(a.impact).toBe(b.impact);
    });

    it('higher impact produces higher score', () => {
      const low = computePriority({ businessValue: 20, searchOpportunity: 20, severity: 20, affectedTraffic: 20, affectedPages: 20, confidence: 50, urgency: 20, effortInverse: 50 });
      const high = computePriority({ businessValue: 90, searchOpportunity: 90, severity: 90, affectedTraffic: 90, affectedPages: 90, confidence: 90, urgency: 90, effortInverse: 90 });
      expect(high.score).toBeGreaterThan(low.score);
    });

    it('lower effort produces higher score', () => {
      const hard = computePriority({ businessValue: 50, searchOpportunity: 50, severity: 50, affectedTraffic: 50, affectedPages: 50, confidence: 50, urgency: 50, effortInverse: 20 });
      const easy = computePriority({ businessValue: 50, searchOpportunity: 50, severity: 50, affectedTraffic: 50, affectedPages: 50, confidence: 50, urgency: 50, effortInverse: 90 });
      expect(easy.score).toBeGreaterThan(hard.score);
    });

    it('weights are normalized', () => {
      const result = computePriority({ businessValue: 50, searchOpportunity: 50, severity: 50, affectedTraffic: 50, affectedPages: 50, confidence: 50, urgency: 50, effortInverse: 50 });
      expect(result.version).toBe('DECISION_PRIORITY_V1');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  // ── §7: Site Strategy Weights ──
  describe('§7: Site strategy weights', () => {
    it('returns defaults for unknown strategy', () => {
      const w = getStrategyWeights(null);
      expect(w.business_value).toBe(0.20);
    });

    it('returns preset for LEAD_GENERATION', () => {
      const w = getStrategyWeights('LEAD_GENERATION');
      expect(w.business_value).toBeGreaterThan(w.search_opportunity);
    });

    it('returns preset for CONTENT_PUBLICATION', () => {
      const w = getStrategyWeights('CONTENT_PUBLICATION');
      expect(w.search_opportunity).toBeGreaterThan(w.business_value);
    });

    it('different strategies produce different scores', () => {
      const factors: PriorityFactors = { businessValue: 80, searchOpportunity: 30, severity: 50, affectedTraffic: 40, affectedPages: 30, confidence: 70, urgency: 60, effortInverse: 60 };
      const leadScore = computePriority(factors, getStrategyWeights('LEAD_GENERATION'));
      const contentScore = computePriority(factors, getStrategyWeights('CONTENT_PUBLICATION'));
      expect(leadScore.score).not.toBe(contentScore.score);
    });
  });

  // ── §8: Conflict Engine ──
  describe('§8: Conflict detection', () => {
    it('detects CREATE vs UPDATE conflict for same URL', () => {
      const recs = [
        { id: 'a', action: 'CONTENT_CREATE', url: 'https://example.com/page', clusterId: null },
        { id: 'b', action: 'CONTENT_UPDATE', url: 'https://example.com/page', clusterId: null },
      ];
      const result = detectConflicts(recs);
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0]!.conflictType).toBe('ACTION_CONFLICT');
    });

    it('detects REDIRECT vs OPTIMIZE conflict', () => {
      const recs = [
        { id: 'a', action: 'REDIRECT_REVIEW', url: 'https://example.com/old', clusterId: null },
        { id: 'b', action: 'CONTENT_UPDATE', url: 'https://example.com/old', clusterId: null },
      ];
      const result = detectConflicts(recs);
      expect(result.conflicts.length).toBe(1);
    });

    it('does not flag same-action as conflict', () => {
      const recs = [
        { id: 'a', action: 'CONTENT_UPDATE', url: 'https://example.com/page', clusterId: null },
        { id: 'b', action: 'CONTENT_UPDATE', url: 'https://example.com/page', clusterId: null },
      ];
      const result = detectConflicts(recs);
      expect(result.conflicts.length).toBe(0);
    });

    it('resolves conflict by score', () => {
      const result = resolveConflict(
        { id: 'a', impact: 90, confidence: 90, effort: 10, action: 'CONTENT_UPDATE' },
        { id: 'b', impact: 30, confidence: 40, effort: 80, action: 'CONTENT_CREATE' },
      );
      expect(result.resolution).toBe('KEEP_A');
      expect(result.winnerId).toBe('a');
    });

    it('requires review when scores are close and same safety', () => {
      const result = resolveConflict(
        { id: 'a', impact: 50, confidence: 50, effort: 50, action: 'CONTENT_UPDATE' },
        { id: 'b', impact: 48, confidence: 52, effort: 48, action: 'TITLE_META_OPTIMIZATION' },
      );
      expect(result.resolution).toBe('REQUIRES_REVIEW');
    });

    it('classifies SAFE actions', () => {
      expect(classifyActionSafety('TITLE_META_OPTIMIZATION')).toBe('SAFE');
      expect(classifyActionSafety('INTERNAL_LINK')).toBe('SAFE');
    });

    it('classifies DESTRUCTIVE actions', () => {
      expect(classifyActionSafety('REDIRECT_REVIEW')).toBe('DESTRUCTIVE');
      expect(classifyActionSafety('INDEXABILITY_FIX')).toBe('DESTRUCTIVE');
    });
  });

  // ── §10: Duplicate Detection ──
  describe('§10: Duplicate recommendation detection', () => {
    it('generates same fingerprint for same inputs', () => {
      const a = computeFingerprint({ siteId: 's1', actionType: 'TITLE_META_OPTIMIZATION', targetUrl: 'https://example.com/page', clusterId: null, issueKind: 'meta-title-missing' });
      const b = computeFingerprint({ siteId: 's1', actionType: 'TITLE_META_OPTIMIZATION', targetUrl: 'https://example.com/page', clusterId: null, issueKind: 'meta-title-missing' });
      expect(a).toBe(b);
    });

    it('generates different fingerprint for different URL', () => {
      const a = computeFingerprint({ siteId: 's1', actionType: 'TITLE_META_OPTIMIZATION', targetUrl: 'https://example.com/page1', clusterId: null, issueKind: 'meta-title-missing' });
      const b = computeFingerprint({ siteId: 's1', actionType: 'TITLE_META_OPTIMIZATION', targetUrl: 'https://example.com/page2', clusterId: null, issueKind: 'meta-title-missing' });
      expect(a).not.toBe(b);
    });

    it('generates different fingerprint for different action', () => {
      const a = computeFingerprint({ siteId: 's1', actionType: 'TITLE_META_OPTIMIZATION', targetUrl: 'https://example.com/page', clusterId: null, issueKind: 'meta-title-missing' });
      const b = computeFingerprint({ siteId: 's1', actionType: 'CONTENT_CREATE', targetUrl: 'https://example.com/page', clusterId: null, issueKind: 'meta-title-missing' });
      expect(a).not.toBe(b);
    });

    it('merges evidence from multiple sources', () => {
      const entry1: EvidenceEntry = { source: 'SEO_AUDIT', sourceId: 'seo-1', evidence: { rule: 'meta-title' }, detectedAt: '2024-01-01' };
      const entry2: EvidenceEntry = { source: 'GSC', sourceId: 'gsc-1', evidence: { ctr: 0.5 }, detectedAt: '2024-01-02' };
      const merged = mergeEvidence(null, entry1);
      const merged2 = mergeEvidence(merged, entry2);
      expect(merged2.sourceCount).toBe(2);
      expect(merged2.mergedFrom).toContain('seo-1');
      expect(merged2.mergedFrom).toContain('gsc-1');
    });

    it('does not duplicate source ids', () => {
      const entry1: EvidenceEntry = { source: 'SEO_AUDIT', sourceId: 'seo-1', evidence: { rule: 'meta-title' }, detectedAt: '2024-01-01' };
      const merged = mergeEvidence(null, entry1);
      const merged2 = mergeEvidence(merged, entry1);
      expect(merged2.sourceCount).toBe(1);
    });
  });

  // ── §12/13: Stale/Superseded ──
  describe('§12/13: Stale and superseded recommendations', () => {
    it('marks stale when issue resolved', () => {
      const result = checkStaleness({
        recommendationId: 'r1', issueId: 'i1', issueStatus: 'RESOLVED',
        targetUrl: 'https://example.com', targetUrlExists: true, supersededById: null,
      });
      expect(result.isStale).toBe(true);
      expect(result.reason).toBe('ISSUE_RESOLVED');
    });

    it('marks stale when page deleted', () => {
      const result = checkStaleness({
        recommendationId: 'r1', issueId: 'i1', issueStatus: 'DETECTED',
        targetUrl: 'https://example.com/deleted', targetUrlExists: false, supersededById: null,
      });
      expect(result.isStale).toBe(true);
      expect(result.reason).toBe('PAGE_DELETED');
    });

    it('marks stale when superseded', () => {
      const result = checkStaleness({
        recommendationId: 'r1', issueId: 'i1', issueStatus: 'DETECTED',
        targetUrl: 'https://example.com', targetUrlExists: true, supersededById: 'r2',
      });
      expect(result.isStale).toBe(true);
      expect(result.reason).toBe('SUPERSEDED');
    });

    it('not stale when issue is open and page exists', () => {
      const result = checkStaleness({
        recommendationId: 'r1', issueId: 'i1', issueStatus: 'DETECTED',
        targetUrl: 'https://example.com', targetUrlExists: true, supersededById: null,
      });
      expect(result.isStale).toBe(false);
    });

    it('supersede marks old recommendation', () => {
      const result = supersedeRecommendation({
        oldRecommendationId: 'r1', newRecommendationId: 'r2', reason: 'URL mapping changed',
      });
      expect(result.oldStatus).toBe('SUPERSEDED');
      expect(result.newRecommendationId).toBe('r2');
    });
  });

  // ── §29: Dependency Graph ──
  describe('§29: Dependency graph', () => {
    it('blocks when dependency not complete', () => {
      const deps: Dependency[] = [{ dependentId: 'a', dependencyId: 'b', dependencyType: 'BLOCKS' }];
      const result = canProceed('a', deps, new Set(['c']));
      expect(result.canProceed).toBe(false);
      expect(result.blockedBy).toContain('b');
    });

    it('allows when dependency complete', () => {
      const deps: Dependency[] = [{ dependentId: 'a', dependencyId: 'b', dependencyType: 'BLOCKS' }];
      const result = canProceed('a', deps, new Set(['b']));
      expect(result.canProceed).toBe(true);
    });

    it('detects cycles', () => {
      const deps: Dependency[] = [
        { dependentId: 'a', dependencyId: 'b', dependencyType: 'BLOCKS' },
        { dependentId: 'b', dependencyId: 'c', dependencyType: 'BLOCKS' },
        { dependentId: 'c', dependencyId: 'a', dependencyType: 'BLOCKS' },
      ];
      expect(hasCycle(deps)).toBe(true);
    });

    it('no cycle in valid DAG', () => {
      const deps: Dependency[] = [
        { dependentId: 'a', dependencyId: 'b', dependencyType: 'BLOCKS' },
        { dependentId: 'b', dependencyId: 'c', dependencyType: 'BLOCKS' },
      ];
      expect(hasCycle(deps)).toBe(false);
    });

    it('topological sort returns correct order', () => {
      const deps: Dependency[] = [
        { dependentId: 'a', dependencyId: 'b', dependencyType: 'BLOCKS' },
        { dependentId: 'b', dependencyId: 'c', dependencyType: 'BLOCKS' },
      ];
      const sorted = topologicalSort(['a', 'b', 'c'], deps);
      expect(sorted).not.toBeNull();
      expect(sorted!.indexOf('c')).toBeLessThan(sorted!.indexOf('b'));
      expect(sorted!.indexOf('b')).toBeLessThan(sorted!.indexOf('a'));
    });

    it('topological sort returns null for cycle', () => {
      const deps: Dependency[] = [
        { dependentId: 'a', dependencyId: 'b', dependencyType: 'BLOCKS' },
        { dependentId: 'b', dependencyId: 'a', dependencyType: 'BLOCKS' },
      ];
      expect(topologicalSort(['a', 'b'], deps)).toBeNull();
    });
  });

  // ── §17: Work Packages ──
  describe('§17: Work packages', () => {
    it('groups recommendations by target URL', () => {
      const recs: GroupableRecommendation[] = [
        { id: 'r1', siteId: 's1', title: 'Fix title', action: 'TITLE_META_OPTIMIZATION', targetUrl: 'https://example.com/page', clusterId: null, impact: 70, confidence: 80, effort: 20, status: 'SUGGESTED', issueId: 'i1' },
        { id: 'r2', siteId: 's1', title: 'Add links', action: 'INTERNAL_LINK', targetUrl: 'https://example.com/page', clusterId: null, impact: 50, confidence: 70, effort: 30, status: 'SUGGESTED', issueId: 'i2' },
      ];
      const packages = groupRecommendationsIntoPackages(recs);
      expect(packages.length).toBe(1);
      expect(packages[0]!.recommendationIds).toContain('r1');
      expect(packages[0]!.recommendationIds).toContain('r2');
    });

    it('does not create package for single recommendation', () => {
      const recs: GroupableRecommendation[] = [
        { id: 'r1', siteId: 's1', title: 'Fix title', action: 'TITLE_META_OPTIMIZATION', targetUrl: 'https://example.com/page', clusterId: null, impact: 70, confidence: 80, effort: 20, status: 'SUGGESTED', issueId: 'i1' },
      ];
      const packages = groupRecommendationsIntoPackages(recs);
      expect(packages.length).toBe(0);
    });
  });

  // ── §16: Next Best Action ──
  describe('§16: Next best actions', () => {
    it('returns top recommendations sorted by priority', () => {
      const input: NextBestActionInput = {
        siteId: 's1',
        recommendations: [
          { id: 'r1', title: 'Low', action: 'TITLE_META_OPTIMIZATION', targetUrl: 'https://example.com/a', clusterId: null, impact: 20, confidence: 30, effort: 80, source: 'SEO_AUDIT', status: 'SUGGESTED', issueId: 'i1', createdAt: '2024-01-01' },
          { id: 'r2', title: 'High', action: 'TECHNICAL_FIX', targetUrl: 'https://example.com/b', clusterId: null, impact: 90, confidence: 90, effort: 10, source: 'SEO_AUDIT', status: 'SUGGESTED', issueId: 'i2', createdAt: '2024-01-01' },
        ],
        conflicts: [],
        maxResults: 10,
      };
      const actions = generateNextBestActions(input);
      expect(actions.length).toBe(2);
      expect(actions[0]!.recommendationId).toBe('r2');
    });

    it('limits results to maxResults', () => {
      const recs = Array.from({ length: 20 }, (_, i) => ({
        id: `r${i}`, title: `Rec ${i}`, action: 'CONTENT_UPDATE', targetUrl: `https://example.com/${i}`, clusterId: null,
        impact: 50, confidence: 50, effort: 50, source: 'SEO_AUDIT', status: 'SUGGESTED', issueId: `i${i}`, createdAt: '2024-01-01',
      }));
      const input: NextBestActionInput = { siteId: 's1', recommendations: recs, conflicts: [], maxResults: 5 };
      const actions = generateNextBestActions(input);
      expect(actions.length).toBe(5);
    });

    it('balances across categories', () => {
      const recs = [
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `tech${i}`, title: `Tech ${i}`, action: 'TECHNICAL_FIX', targetUrl: `https://example.com/t${i}`, clusterId: null,
          impact: 90, confidence: 90, effort: 10, source: 'SEO_AUDIT', status: 'SUGGESTED', issueId: `i${i}`, createdAt: '2024-01-01',
        })),
        ...Array.from({ length: 2 }, (_, i) => ({
          id: `content${i}`, title: `Content ${i}`, action: 'CONTENT_UPDATE', targetUrl: `https://example.com/c${i}`, clusterId: null,
          impact: 60, confidence: 60, effort: 40, source: 'CONTENT_AUDIT', status: 'SUGGESTED', issueId: `ci${i}`, createdAt: '2024-01-01',
        })),
      ];
      const input: NextBestActionInput = { siteId: 's1', recommendations: recs, conflicts: [], maxResults: 10, categoryBalance: true };
      const actions = generateNextBestActions(input);
      // At least 2 content items should appear even though tech has higher scores
      const contentCount = actions.filter((a) => a.category === 'CONTENT').length;
      expect(contentCount).toBeGreaterThanOrEqual(2);
    });

    it('marks conflicting recommendations', () => {
      const input: NextBestActionInput = {
        siteId: 's1',
        recommendations: [
          { id: 'r1', title: 'Create', action: 'CONTENT_CREATE', targetUrl: 'https://example.com/page', clusterId: null, impact: 70, confidence: 80, effort: 20, source: 'SEO_AUDIT', status: 'SUGGESTED', issueId: 'i1', createdAt: '2024-01-01' },
          { id: 'r2', title: 'Update', action: 'CONTENT_UPDATE', targetUrl: 'https://example.com/page', clusterId: null, impact: 60, confidence: 70, effort: 30, source: 'GSC', status: 'SUGGESTED', issueId: 'i2', createdAt: '2024-01-01' },
        ],
        conflicts: [{ recommendationIdA: 'r1', recommendationIdB: 'r2', conflictType: 'ACTION_CONFLICT', reason: 'test', targetKey: 'test' }],
        maxResults: 10,
      };
      const actions = generateNextBestActions(input);
      const conflicting = actions.filter((a) => a.isConflicting);
      expect(conflicting.length).toBe(2);
    });
  });

  // ── §30: Result Tracker ──
  describe('§30: Result tracking', () => {
    it('observation window for TECHNICAL_FIX is immediate', () => {
      expect(MEASUREMENT_WINDOWS['TECHNICAL_FIX']).toBe(0);
    });

    it('observation window for CONTENT_CREATE is 28 days', () => {
      expect(MEASUREMENT_WINDOWS['CONTENT_CREATE']).toBe(28);
    });

    it('observation window passed after sufficient time', () => {
      const outcome: RecommendationOutcome = {
        recommendationId: 'r1', taskId: null, changeLogId: null,
        implementedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        verifiedAt: null, outcome: 'IMPLEMENTED', verificationType: null,
        observationWindowEnd: null, evidence: {},
      };
      expect(isObservationWindowPassed(outcome, 'CONTENT_CREATE', new Date())).toBe(true);
    });

    it('observation window not yet passed', () => {
      const outcome: RecommendationOutcome = {
        recommendationId: 'r1', taskId: null, changeLogId: null,
        implementedAt: new Date().toISOString(),
        verifiedAt: null, outcome: 'IMPLEMENTED', verificationType: null,
        observationWindowEnd: null, evidence: {},
      };
      expect(isObservationWindowPassed(outcome, 'CONTENT_CREATE', new Date())).toBe(false);
    });

    it('no next step when already verified', () => {
      const outcome: RecommendationOutcome = {
        recommendationId: 'r1', taskId: null, changeLogId: null,
        implementedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        outcome: 'VERIFIED', verificationType: 'MANUAL_REVIEW',
        observationWindowEnd: null, evidence: {},
      };
      expect(nextVerificationStep(outcome)).toBeNull();
    });
  });

  // ── Work Item Collector ──
  describe('Work item collector', () => {
    it('maps Issue to UnifiedWorkItem', () => {
      const item = mapIssueToWorkItem({
        id: 'i1', siteId: 's1', title: 'Missing title', description: 'desc',
        url: 'https://example.com', kind: 'meta-title', severity: 'high', status: 'DETECTED',
        createdAt: '2024-01-01', source: 'SEO_AUDIT',
      });
      expect(item.source).toBe('ISSUE');
      expect(item.category).toBe('meta-title');
      expect(item.priorityScore).toBeGreaterThan(0);
    });

    it('maps KeywordOpportunity to UnifiedWorkItem', () => {
      const item = mapKeywordOpportunityToWorkItem({
        id: 'ko1', siteId: 's1', type: 'POSITION_11_20', targetUrl: 'https://example.com',
        clusterId: null, impact: 'HIGH', confidence: 0.8, priorityScore: 75, status: 'OPEN',
        evidence: {}, createdAt: '2024-01-01',
      });
      expect(item.source).toBe('KEYWORD_OPPORTUNITY');
      expect(item.priorityScore).toBe(75);
    });

    it('maps LinkSuggestion to UnifiedWorkItem', () => {
      const item = mapLinkSuggestionToWorkItem({
        id: 'ls1', siteId: 's1', sourceUrl: 'https://example.com/a',
        targetUrl: 'https://example.com/b', anchor: 'click', detection: 'ORPHAN',
        confidence: 0.7, status: 'SUGGESTED', createdAt: '2024-01-01',
      });
      expect(item.source).toBe('LINK_SUGGESTION');
      expect(item.category).toBe('INTERNAL_LINKS');
    });
  });
});

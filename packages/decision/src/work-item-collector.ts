/**
 * Work Item Collector — aggregates all actionable items from across the platform
 * into a unified scoring model.
 *
 * Sources:
 *   - Issues (from audit findings)
 *   - Recommendations (from operations)
 *   - Keyword Opportunities (from keyword engine)
 *   - Cannibalization Cases
 *   - Link Suggestions
 *   - AEO/GEO findings
 *   - AI Visibility gaps
 *   - Content Decay detections
 *   - GSC Opportunities
 *   - Content Approvals
 *
 * Each source item is mapped to a unified WorkItem with consistent scoring.
 */

import { computePriority, type PriorityFactors, type PriorityWeights, DEFAULT_WEIGHTS } from './priority-engine';

export type WorkItemSource =
  | 'ISSUE'
  | 'RECOMMENDATION'
  | 'KEYWORD_OPPORTUNITY'
  | 'CANNIBALIZATION'
  | 'LINK_SUGGESTION'
  | 'AEO_FINDING'
  | 'GEO_FINDING'
  | 'AI_VISIBILITY'
  | 'CONTENT_DECAY'
  | 'GSC_OPPORTUNITY'
  | 'CONTENT_APPROVAL';

export interface UnifiedWorkItem {
  id: string;
  source: WorkItemSource;
  sourceEntityId: string;
  siteId: string;
  title: string;
  description: string;
  targetUrl: string | null;
  clusterId: string | null;
  category: string;
  severity: string;
  status: string;
  priorityScore: number;
  factors: PriorityFactors;
  createdAt: string;
}

/**
 * Map a platform Issue to a UnifiedWorkItem.
 */
export function mapIssueToWorkItem(issue: {
  id: string;
  siteId: string;
  title: string;
  description: string;
  url: string | null;
  kind: string;
  severity: string;
  status: string;
  createdAt: string;
  source: string;
}): UnifiedWorkItem {
  const severityMap: Record<string, number> = {
    critical: 90,
    high: 70,
    medium: 50,
    low: 30,
    info: 10,
  };
  const severityValue = severityMap[issue.severity.toLowerCase()] ?? 50;

  const factors: PriorityFactors = {
    businessValue: severityValue,
    searchOpportunity: 50,
    severity: severityValue,
    affectedTraffic: issue.url ? 60 : 40,
    affectedPages: 1,
    confidence: 80,
    urgency: issue.severity === 'critical' ? 90 : issue.severity === 'high' ? 70 : 50,
    effortInverse: 70,
  };

  const priority = computePriority(factors);

  return {
    id: issue.id,
    source: 'ISSUE',
    sourceEntityId: issue.id,
    siteId: issue.siteId,
    title: issue.title,
    description: issue.description,
    targetUrl: issue.url,
    clusterId: null,
    category: issue.kind,
    severity: issue.severity,
    status: issue.status,
    priorityScore: priority.score,
    factors,
    createdAt: issue.createdAt,
  };
}

/**
 * Map a Keyword Opportunity to a UnifiedWorkItem.
 */
export function mapKeywordOpportunityToWorkItem(ko: {
  id: string;
  siteId: string;
  type: string;
  targetUrl: string | null;
  clusterId: string | null;
  impact: string;
  confidence: number;
  priorityScore: number;
  status: string;
  evidence: Record<string, unknown>;
  createdAt: string;
}): UnifiedWorkItem {
  const impactMap: Record<string, number> = { VERY_HIGH: 90, HIGH: 70, MEDIUM: 50, LOW: 30 };
  const impactValue = impactMap[ko.impact] ?? 50;

  const factors: PriorityFactors = {
    businessValue: impactValue,
    searchOpportunity: impactValue,
    severity: 30,
    affectedTraffic: impactValue,
    affectedPages: 1,
    confidence: ko.confidence * 100,
    urgency: 50,
    effortInverse: 60,
  };

  return {
    id: ko.id,
    source: 'KEYWORD_OPPORTUNITY',
    sourceEntityId: ko.id,
    siteId: ko.siteId,
    title: `Keyword: ${ko.type}`,
    description: `Target: ${ko.targetUrl ?? 'New page'}`,
    targetUrl: ko.targetUrl,
    clusterId: ko.clusterId,
    category: 'KEYWORDS',
    severity: ko.impact.toLowerCase(),
    status: ko.status,
    priorityScore: ko.priorityScore,
    factors,
    createdAt: ko.createdAt,
  };
}

/**
 * Map a Link Suggestion to a UnifiedWorkItem.
 */
export function mapLinkSuggestionToWorkItem(ls: {
  id: string;
  siteId: string;
  sourceUrl: string;
  targetUrl: string;
  anchor: string;
  detection: string;
  confidence: number;
  status: string;
  createdAt: string;
}): UnifiedWorkItem {
  const factors: PriorityFactors = {
    businessValue: 40,
    searchOpportunity: 50,
    severity: 30,
    affectedTraffic: 40,
    affectedPages: 2,
    confidence: ls.confidence * 100,
    urgency: 40,
    effortInverse: 70,
  };

  const priority = computePriority(factors);

  return {
    id: ls.id,
    source: 'LINK_SUGGESTION',
    sourceEntityId: ls.id,
    siteId: ls.siteId,
    title: `Link: ${ls.detection}`,
    description: `${ls.sourceUrl} → ${ls.targetUrl} (${ls.anchor})`,
    targetUrl: ls.targetUrl,
    clusterId: null,
    category: 'INTERNAL_LINKS',
    severity: 'medium',
    status: ls.status,
    priorityScore: priority.score,
    factors,
    createdAt: ls.createdAt,
  };
}

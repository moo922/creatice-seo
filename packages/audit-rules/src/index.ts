/**
 * Audit rule registry contract. Rules are deterministic code, not AI.
 * Implemented in Phase 2 (technical / on-page / content / Rank Math /
 * internal linking / SEO / AEO / GEO). Phase 1 defines the contract only.
 */

export type AuditCategory =
  | 'technical'
  | 'on-page'
  | 'content'
  | 'rank-math'
  | 'internal-linking'
  | 'seo'
  | 'aeo'
  | 'geo'
  | 'search-performance';

export type AuditSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface AuditRuleDefinition {
  /** Stable machine key, e.g. "meta-title-missing". */
  key: string;
  category: AuditCategory;
  severity: AuditSeverity;
  description: string;
  /** Rules are immutable once published; bump on behavioural change. */
  version: number;
  active: boolean;
}

export interface AuditEvaluationInput {
  ruleKey: string;
  url: string;
  /** Deterministic extracted signals from a crawl page / report. */
  signals: Record<string, unknown>;
}

export interface AuditEvaluationResult {
  ruleKey: string;
  url: string;
  passed: boolean;
  severity: AuditSeverity;
  /** Machine-readable evidence for the Issues engine. */
  evidence: Record<string, unknown>;
}

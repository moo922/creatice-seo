/**
 * Deterministic audit contract. Rules are code, not AI. The contract types are
 * the stable surface consumed by the audit engine and the Issues engine.
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

/** A finding produced by a rule (site-level rules may target the seed URL). */
export interface AuditFinding {
  ruleKey: string;
  category: AuditCategory;
  severity: AuditSeverity;
  url: string | null;
  passed: boolean;
  evidence: Record<string, unknown>;
}

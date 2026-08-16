import type { AuditFinding, AuditRuleDefinition } from './contract';
import type { AuditContext, AuditPageSignal } from './context';
import { technicalRules } from './rules/technical';
import { onPageRules } from './rules/on-page';
import { structuredDataRules } from './rules/structured-data';
import { crawlArchitectureRules } from './rules/crawl-architecture';

export interface AuditRule {
  definition: AuditRuleDefinition;
  evaluate: (ctx: AuditContext) => AuditFinding[];
  /**
   * The set of pages this rule evaluates. Rules with a page scope also emit
   * passing results so coverage is reproducible from persisted results.
   * Site-level rules (aggregate detections) omit this.
   */
  pageScope?: (ctx: AuditContext) => AuditPageSignal[];
}

/** The full deterministic rule registry. */
export const AUDIT_RULES: AuditRule[] = [
  ...technicalRules,
  ...onPageRules,
  ...structuredDataRules,
  ...crawlArchitectureRules,
];

export function ruleDefinitions(): AuditRuleDefinition[] {
  return AUDIT_RULES.map((rule) => rule.definition);
}

/**
 * Evaluates every active rule against a crawl-run audit context. By default
 * only failed findings are returned; with `includePasses` true, page-scoped
 * rules also emit a passed result per evaluated page that did not fail, which
 * is what makes the health score reproducible from persisted results.
 */
export function evaluateAudit(ctx: AuditContext, includePasses = false): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const failedKeysByRule = new Map<string, Set<string>>();
  for (const rule of AUDIT_RULES) {
    if (!rule.definition.active) continue;
    const results = rule.evaluate(ctx);
    findings.push(...results);
    if (includePasses && rule.pageScope) {
      const failed = new Set<string>();
      for (const result of results) {
        if (!result.passed && result.url) failed.add(result.url);
      }
      failedKeysByRule.set(rule.definition.key, failed);
    }
  }

  if (!includePasses) return findings;

  const passes: AuditFinding[] = [];
  for (const rule of AUDIT_RULES) {
    if (!rule.definition.active || !rule.pageScope) continue;
    const failed = failedKeysByRule.get(rule.definition.key) ?? new Set<string>();
    for (const page of rule.pageScope(ctx)) {
      if (failed.has(page.url)) continue;
      passes.push({
        ruleKey: rule.definition.key,
        category: rule.definition.category,
        severity: rule.definition.severity,
        url: page.url,
        passed: true,
        evidence: {},
      });
    }
  }
  return [...findings, ...passes];
}

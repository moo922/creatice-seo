import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditRun, AuditResult } from '@creative-seo/database';
import { AUDIT_HEALTH_SCORE_VERSION } from '@creative-seo/types';
import { computeHealthScores } from '@creative-seo/audit-rules';

export interface SeoHealthScore {
  seoHealth: number;
  technicalHealth: number;
  onPageHealth: number;
  internalLinkingHealth: number;
  scoreVersion: number;
  auditRunId: string;
}

/**
 * Canonical SEO health computation service (Section 19).
 *
 * SEO Health must use the deterministic score from Gap Closure 01.
 * There is exactly one canonical SEO health computation.
 *
 * Scores are computed on-the-fly from persisted AuditResult rows using
 * `computeHealthScores` from @creative-seo/audit-rules, then returned
 * alongside the version tag so callers can distinguish score eras.
 *
 * Components: Technical, On-Page, Internal Linking.
 * GSC traffic, AI visibility, and business outcomes are NOT part of
 * technical SEO health — they belong to visibility/performance metrics.
 */
@Injectable()
export class SeoHealthService {
  constructor(
    @InjectRepository(AuditRun) private readonly auditRuns: Repository<AuditRun>,
    @InjectRepository(AuditResult) private readonly auditResults: Repository<AuditResult>,
  ) {}

  /**
   * Get the latest SEO health score for a site from its most recent completed audit.
   */
  async getLatestScore(siteId: string): Promise<SeoHealthScore | null> {
    const audit = await this.auditRuns.findOne({
      where: { siteId, status: 'COMPLETED' },
      order: { startedAt: 'DESC' },
    });
    if (!audit) return null;
    return this.computeScore(audit);
  }

  /**
   * Get the SEO health score for a specific audit run.
   */
  async getScoreForAudit(auditRunId: string): Promise<SeoHealthScore | null> {
    const audit = await this.auditRuns.findOne({ where: { id: auditRunId } });
    if (!audit) return null;
    return this.computeScore(audit);
  }

  private async computeScore(audit: AuditRun): Promise<SeoHealthScore | null> {
    const rows = await this.auditResults.find({ where: { auditRunId: audit.id } });
    if (rows.length === 0) return null;

    const scores = computeHealthScores(
      rows.map((r) => ({
        ruleKey: r.ruleKey,
        category: r.category,
        severity: r.severity as 'info' | 'low' | 'medium' | 'high' | 'critical',
        passed: r.passed,
        url: r.url,
      })),
      { pagesCrawled: 0 },
    );

    return {
      seoHealth: scores.seoHealth ?? 0,
      technicalHealth: scores.technicalHealth ?? 0,
      onPageHealth: scores.onPageHealth ?? 0,
      internalLinkingHealth: scores.internalLinkingHealth ?? 0,
      scoreVersion: AUDIT_HEALTH_SCORE_VERSION,
      auditRunId: audit.id,
    };
  }
}

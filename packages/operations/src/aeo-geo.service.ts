import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiVisibilityRun, AiVisibilityObservation, AuditRun } from '@creative-seo/database';

export interface AeoGeoReadiness {
  aeoReadiness: number | null;
  geoReadiness: number | null;
  aiMentionRate: number | null;
  aiCitationRate: number | null;
  brandInclusionRate: number | null;
  citationVerified: boolean;
}

/**
 * AEO/GEO score handling (Section 20).
 *
 * AEO Readiness and GEO Readiness are now sourced from real site audits
 * (AuditRun with type AEO/GEO). AI Visibility remains a SEPARATE
 * observational metric.
 */
@Injectable()
export class AeoGeoService {
  constructor(
    @InjectRepository(AiVisibilityRun) private readonly visibilityRuns: Repository<AiVisibilityRun>,
    @InjectRepository(AiVisibilityObservation) private readonly observations: Repository<AiVisibilityObservation>,
    @InjectRepository(AuditRun) private readonly auditRuns: Repository<AuditRun>,
  ) {}

  /**
   * Get AEO/GEO readiness for a site. Sources readiness from real audits;
   * AI Visibility metrics remain separate.
   */
  async getReadiness(siteId: string): Promise<AeoGeoReadiness> {
    // Fetch latest completed AEO/GEO audits
    const [aeoRun, geoRun] = await Promise.all([
      this.auditRuns.findOne({
        where: { siteId, type: 'AEO', status: 'COMPLETED' },
        order: { finishedAt: 'DESC' },
      }),
      this.auditRuns.findOne({
        where: { siteId, type: 'GEO', status: 'COMPLETED' },
        order: { finishedAt: 'DESC' },
      }),
    ]);

    // Compute AEO readiness from audit results
    let aeoReadiness: number | null = null;
    if (aeoRun) {
      const aeoResults = await this.auditRuns
        .createQueryBuilder('run')
        .leftJoin('audit_result', 'ar', 'ar.audit_run_id = run.id')
        .where('run.id = :runId', { runId: aeoRun.id })
        .getCount();
      // Simple heuristic: if there are results, readiness is based on pass rate
      if (aeoResults > 0) {
        const passedCount = await this.auditRuns
          .createQueryBuilder('run')
          .leftJoin('audit_result', 'ar', 'ar.audit_run_id = run.id')
          .where('run.id = :runId', { runId: aeoRun.id })
          .andWhere('ar.passed = :passed', { passed: true })
          .getCount();
        aeoReadiness = Math.round((passedCount / aeoResults) * 100);
      }
    }

    // Compute GEO readiness from audit results
    let geoReadiness: number | null = null;
    if (geoRun) {
      const geoResults = await this.auditRuns
        .createQueryBuilder('run')
        .leftJoin('audit_result', 'ar', 'ar.audit_run_id = run.id')
        .where('run.id = :runId', { runId: geoRun.id })
        .getCount();
      if (geoResults > 0) {
        const passedCount = await this.auditRuns
          .createQueryBuilder('run')
          .leftJoin('audit_result', 'ar', 'ar.audit_run_id = run.id')
          .where('run.id = :runId', { runId: geoRun.id })
          .andWhere('ar.passed = :passed', { passed: true })
          .getCount();
        geoReadiness = Math.round((passedCount / geoResults) * 100);
      }
    }

    // AI Visibility metrics (separate from AEO/GEO)
    const run = await this.visibilityRuns.findOne({
      where: { siteId, status: 'COMPLETED' },
      order: { observedAt: 'DESC' },
    });

    if (!run) {
      return {
        aeoReadiness,
        geoReadiness,
        aiMentionRate: null,
        aiCitationRate: null,
        brandInclusionRate: null,
        citationVerified: false,
      };
    }

    const obs = await this.observations.find({ where: { runId: run.id } });
    const total = obs.length;
    if (total === 0) {
      return {
        aeoReadiness,
        geoReadiness,
        aiMentionRate: null,
        aiCitationRate: null,
        brandInclusionRate: null,
        citationVerified: false,
      };
    }

    const brandMentions = obs.filter((o) => o.brandMentioned).length;
    const websiteCitations = obs.filter((o) => o.websiteCited).length;

    return {
      aeoReadiness,
      geoReadiness,
      aiMentionRate: Math.round((brandMentions / total) * 100) / 100,
      aiCitationRate: Math.round((websiteCitations / total) * 100) / 100,
      brandInclusionRate: Math.round((brandMentions / total) * 100) / 100,
      citationVerified: false,
    };
  }
}

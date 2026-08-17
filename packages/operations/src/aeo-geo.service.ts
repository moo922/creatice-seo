import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiVisibilityRun, AiVisibilityObservation } from '@creative-seo/database';

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
 * Until real AEO and GEO site audits are implemented:
 * - AEO Readiness: NOT_MEASURED (null in metrics)
 * - GEO Readiness: NOT_MEASURED (null in metrics)
 *
 * AI Visibility is a SEPARATE observational metric:
 * - AI Mention Rate
 * - AI Citation Rate
 * - Brand Inclusion Rate
 *
 * These MUST NOT populate AEO Readiness or GEO Readiness.
 *
 * Note: AiVisibilityRun does not store computed metrics as a column.
 * Run-level metrics are aggregated here from individual
 * AiVisibilityObservation rows.
 */
@Injectable()
export class AeoGeoService {
  constructor(
    @InjectRepository(AiVisibilityRun) private readonly visibilityRuns: Repository<AiVisibilityRun>,
    @InjectRepository(AiVisibilityObservation) private readonly observations: Repository<AiVisibilityObservation>,
  ) {}

  /**
   * Get AEO/GEO readiness for a site. Currently returns null for both
   * readiness scores until real audits are implemented.
   */
  async getReadiness(siteId: string): Promise<AeoGeoReadiness> {
    const run = await this.visibilityRuns.findOne({
      where: { siteId, status: 'COMPLETED' },
      order: { observedAt: 'DESC' },
    });

    if (!run) {
      return {
        aeoReadiness: null,
        geoReadiness: null,
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
        aeoReadiness: null,
        geoReadiness: null,
        aiMentionRate: null,
        aiCitationRate: null,
        brandInclusionRate: null,
        citationVerified: false,
      };
    }

    const brandMentions = obs.filter((o) => o.brandMentioned).length;
    const websiteCitations = obs.filter((o) => o.websiteCited).length;

    return {
      aeoReadiness: null,
      geoReadiness: null,
      aiMentionRate: Math.round((brandMentions / total) * 100) / 100,
      aiCitationRate: Math.round((websiteCitations / total) * 100) / 100,
      brandInclusionRate: Math.round((brandMentions / total) * 100) / 100,
      citationVerified: false,
    };
  }
}

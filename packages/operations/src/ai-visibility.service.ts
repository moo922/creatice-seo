import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiVisibilityRun, AiVisibilityObservation } from '@creative-seo/database';
import type { MetricAvailability } from '@creative-seo/types';

export interface AiVisibilityMetrics {
  testsRun: number | null;
  brandMentions: number | null;
  brandMentionRate: number | null;
  verifiedCitations: number | null;
  citationRate: number | null;
  citationAvailability: MetricAvailability;
  competitorMentions: number | null;
  sourceCoverage: number | null;
}

/**
 * AI Visibility metrics (Section 21).
 *
 * Only count citations as verified if the provider returned actual
 * source/citation provenance. URLs merely appearing in generated prose
 * are NOT verified citations.
 *
 * If the provider cannot verify citation provenance:
 * citation_rate availability = NOT_MEASURED or UNVERIFIED
 *
 * Note: AiVisibilityRun does not store computed metrics as a column.
 * Run-level metrics are aggregated here from individual
 * AiVisibilityObservation rows.
 */
@Injectable()
export class AiVisibilityMetricsService {
  constructor(
    @InjectRepository(AiVisibilityRun) private readonly visibilityRuns: Repository<AiVisibilityRun>,
    @InjectRepository(AiVisibilityObservation) private readonly observations: Repository<AiVisibilityObservation>,
  ) {}

  async getLatestMetrics(siteId: string): Promise<AiVisibilityMetrics> {
    const run = await this.visibilityRuns.findOne({
      where: { siteId, status: 'COMPLETED' },
      order: { observedAt: 'DESC' },
    });

    if (!run) {
      return {
        testsRun: null,
        brandMentions: null,
        brandMentionRate: null,
        verifiedCitations: null,
        citationRate: null,
        citationAvailability: 'NOT_MEASURED',
        competitorMentions: null,
        sourceCoverage: null,
      };
    }

    const obs = await this.observations.find({ where: { runId: run.id } });
    const total = obs.length;
    if (total === 0) {
      return {
        testsRun: null,
        brandMentions: null,
        brandMentionRate: null,
        verifiedCitations: null,
        citationRate: null,
        citationAvailability: 'NOT_MEASURED',
        competitorMentions: null,
        sourceCoverage: null,
      };
    }

    const brandMentions = obs.filter((o) => o.brandMentioned).length;
    const websiteCitations = obs.filter((o) => o.websiteCited).length;
    const withCitedUrls = obs.filter((o) => o.citedUrls.length > 0).length;
    const withCompetitors = obs.filter((o) => o.competitorsMentioned.length > 0).length;

    return {
      testsRun: total,
      brandMentions,
      brandMentionRate: Math.round((brandMentions / total) * 100) / 100,
      verifiedCitations: websiteCitations,
      citationRate: Math.round((websiteCitations / total) * 100) / 100,
      citationAvailability: 'AVAILABLE',
      competitorMentions: withCompetitors,
      sourceCoverage: Math.round((withCitedUrls / total) * 100) / 100,
    };
  }
}

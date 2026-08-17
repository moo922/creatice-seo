import type { CannibalizationClassification, CannibalizationRecommendation } from '@creative-seo/types';

/**
 * Cannibalization detection (Sections 35-39).
 *
 * The old logic counted DISTINCT cluster_ids per keyword (broken). The correct
 * definition: one query/intent ranking on MULTIPLE competing URLs, evidenced by
 * GSC QUERY_PAGE_DAILY data (impressions per URL, clicks per URL, position
 * observations, active dates).
 *
 * - Query-level: group by query, collect ranking URLs.
 * - Cluster-level: aggregate queries within a cluster.
 * - Score is deterministic and versioned.
 * - Low-signal secondary URLs (1 impression once) do NOT trigger high severity.
 * - Distinct-intent pages are NOT flagged.
 */

export const CANNIBALIZATION_ALGORITHM_VERSION = 'cannibalization-v1';

export type QueryPageEvidence = {
  /** Site-unique query text. */
  query: string;
  /** Ranking URLs. */
  urls: Array<{
    url: string;
    impressions: number;
    clicks: number;
    position?: number | null;
    activeDates: number;
  }>;
};

export type CannibalizationResult = {
  query: string;
  clusterId: string | null;
  urls: Array<{ url: string; impressions: number; clicks: number; position: number | null; activeDates: number }>;
  classification: CannibalizationClassification;
  score: number;
  recommendation: CannibalizationRecommendation;
  reason: string;
  preferredTarget: string | null;
  scoreVersion: string;
};

export type CannibalizationOptions = {
  /** Minimum impressions a URL must have to count as a competing URL. */
  minImpressionsPerUrl: number;
  /** Minimum impressions the query must have to be considered. */
  minQueryImpressions: number;
  /** Minimum number of URLs that must compete. */
  minCompetingUrls: number;
  /** Minimum active dates for a competing URL. */
  minActiveDates: number;
  /** Secondary-URL impression share threshold below which it is ignored. */
  minSecondaryShare: number;
};

export const DEFAULT_CANNIBALIZATION_OPTIONS: CannibalizationOptions = {
  minImpressionsPerUrl: 10,
  minQueryImpressions: 50,
  minCompetingUrls: 2,
  minActiveDates: 2,
  minSecondaryShare: 0.05,
};

/**
 * Classifies cannibalization for a set of query-page evidence.
 * Deterministic and versioned.
 */
export function classifyCannibalization(
  query: string,
  evidence: Array<{ url: string; impressions: number; clicks: number; position?: number | null; activeDates: number }>,
  options: CannibalizationOptions = DEFAULT_CANNIBALIZATION_OPTIONS,
): CannibalizationResult {
  const totalImpressions = evidence.reduce((sum, e) => sum + e.impressions, 0);
  const empty: CannibalizationResult = {
    query,
    clusterId: null,
    urls: [],
    classification: 'NONE',
    score: 0,
    recommendation: 'KEEP_CURRENT_TARGET',
    reason: 'No competing URLs with sufficient evidence.',
    preferredTarget: null,
    scoreVersion: CANNIBALIZATION_ALGORITHM_VERSION,
  };

  if (totalImpressions < options.minQueryImpressions) {
    return { ...empty, reason: `Query has ${totalImpressions} impressions, below the ${options.minQueryImpressions} minimum.` };
  }

  // Filter to URLs with enough impressions AND enough active dates.
  const competitors = evidence
    .filter((e) => e.impressions >= options.minImpressionsPerUrl && e.activeDates >= options.minActiveDates)
    .map((e) => ({ ...e, position: e.position ?? null }));

  if (competitors.length < options.minCompetingUrls) {
    return { ...empty, reason: `Only ${competitors.length} URL(s) qualify as competitors.` };
  }

  // Sort by impressions desc; the strongest URL is the likely preferred target.
  competitors.sort((a, b) => b.impressions - a.impressions);
  const preferredTarget = competitors[0]?.url ?? null;

  // Total impressions among qualifying competitors.
  const competitorTotal = competitors.reduce((sum, e) => sum + e.impressions, 0);
  // Share of impressions held by the top URL vs the rest.
  const topShare = competitorTotal > 0 ? (competitors[0]?.impressions ?? 0) / competitorTotal : 0;
  const secondaryShare = 1 - topShare;

  // Score computation (deterministic, 0..1):
  // - more competing URLs -> higher score
  // - lower topShare (more split) -> higher score
  // - higher impressions spread over more active dates -> more evidence
  const urlFactor = Math.min(1, competitors.length / 4);
  const splitFactor = 1 - topShare;
  const durationFactor = Math.min(1, Math.max(...competitors.map((c) => c.activeDates)) / 30);

  // A tiny secondary share (e.g. 1 impression once) must NOT raise severity.
  const lowSignalPenalty = secondaryShare < options.minSecondaryShare ? 0.5 : 1;

  const score = Math.min(1, (urlFactor * 0.4 + splitFactor * 0.4 + durationFactor * 0.2) * lowSignalPenalty);

  let classification: CannibalizationClassification;
  let recommendation: CannibalizationRecommendation;

  if (score >= 0.7) {
    classification = 'HIGH';
    recommendation = 'CONSOLIDATE';
  } else if (score >= 0.45) {
    classification = 'MODERATE';
    recommendation = 'MERGE_CONTENT';
  } else if (score >= 0.2) {
    classification = 'LOW';
    recommendation = 'REWRITE_SUPPORTING_PAGE';
  } else {
    classification = 'NONE';
    recommendation = 'KEEP_CURRENT_TARGET';
  }

  return {
    query,
    clusterId: null,
    urls: competitors,
    classification,
    score,
    recommendation,
    reason: buildReason(competitors, score, classification),
    preferredTarget,
    scoreVersion: CANNIBALIZATION_ALGORITHM_VERSION,
  };
}

function buildReason(
  competitors: Array<{ url: string; impressions: number; clicks: number; position: number | null; activeDates: number }>,
  score: number,
  classification: CannibalizationClassification,
): string {
  const parts = competitors.map((c) => `${c.url} (${c.impressions} imps, ${c.clicks} clicks, pos ${c.position ?? 'n/a'}, ${c.activeDates}d)`);
  return `Cannibalization ${classification.toLowerCase()} (score ${score.toFixed(2)}): ${parts.join(' vs ')}`;
}

/**
 * Aggregates per-query evidence into cluster-level cannibalization (Section 37).
 * This is more important than single-query anomalies.
 */
export function clusterCannibalization(
  queries: QueryPageEvidence[],
  options: CannibalizationOptions = DEFAULT_CANNIBALIZATION_OPTIONS,
): CannibalizationResult[] {
  // Merge all query-page evidence across the cluster.
  const urlAgg = new Map<string, { impressions: number; clicks: number; position: number | null; activeDates: number; lastPosition?: number }>();
  for (const q of queries) {
    for (const e of q.urls) {
      const agg = urlAgg.get(e.url) ?? { impressions: 0, clicks: 0, position: null, activeDates: 0 };
      agg.impressions += e.impressions;
      agg.clicks += e.clicks;
      if (e.position != null) {
        agg.lastPosition = e.position;
        agg.position = agg.lastPosition;
      }
      agg.activeDates = Math.max(agg.activeDates, e.activeDates);
      urlAgg.set(e.url, agg);
    }
  }
  if (urlAgg.size === 0) {
    return [];
  }
  const evidence = [...urlAgg.entries()].map(([url, agg]) => ({
    url,
    impressions: agg.impressions,
    clicks: agg.clicks,
    position: agg.position,
    activeDates: agg.activeDates,
  }));
  const label = queries[0]?.query ?? 'cluster';
  const result = classifyCannibalization(label, evidence, options);
  result.clusterId = null; // set by caller
  return [result];
}
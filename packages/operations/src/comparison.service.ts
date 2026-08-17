import { Injectable } from '@nestjs/common';
import type {
  BaselineMetricsDto,
  MetricAvailability,
} from '@creative-seo/types';

export interface ComparisonResult<T> {
  current: T | null;
  previous: T | null;
  absoluteChange: number | null;
  percentageChange: number | null;
  changeReason: 'ZERO_BASE' | 'NULL_VALUE' | null;
  direction: 'improved' | 'declined' | 'flat' | 'n/a';
  availability: MetricAvailability;
  comparisonQuality: 'full' | 'partial' | 'none';
}

export interface ComparisonInput {
  current: BaselineMetricsDto;
  previous: BaselineMetricsDto | null;
  currentAvailability: Record<string, MetricAvailability>;
  previousAvailability?: Record<string, MetricAvailability>;
}

const LOWER_IS_BETTER = new Set([
  'technicalIssues',
  'criticalIssues',
  'highIssues',
  'mediumIssues',
  'lowIssues',
  'brokenInternalLinks',
  'orphanPages',
  'canonicalIssues',
  'cannibalizationCandidates',
  'positions11To20',
]);

@Injectable()
export class ComparisonService {
  /**
   * Compare two metric values, handling edge cases:
   * - Null values: direction = 'n/a'
   * - Zero base: percentageChange = null, reason = 'ZERO_BASE'
   * - Both null: direction = 'n/a'
   */
  compareValue(
    key: string,
    current: number | null,
    previous: number | null,
  ): ComparisonResult<number> {
    // Handle null cases
    if (current === null && previous === null) {
      return {
        current: null,
        previous: null,
        absoluteChange: null,
        percentageChange: null,
        changeReason: 'NULL_VALUE',
        direction: 'n/a',
        availability: 'NOT_MEASURED',
        comparisonQuality: 'none',
      };
    }

    if (current === null || previous === null) {
      return {
        current,
        previous,
        absoluteChange: null,
        percentageChange: null,
        changeReason: 'NULL_VALUE',
        direction: 'n/a',
        availability: current !== null ? 'AVAILABLE' : 'NOT_MEASURED',
        comparisonQuality: 'partial',
      };
    }

    // Both values present - compute change
    const absoluteChange = current - previous;
    let percentageChange: number | null = null;
    let changeReason: 'ZERO_BASE' | null = null;

    if (previous === 0) {
      changeReason = 'ZERO_BASE';
    } else {
      percentageChange = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
    }

    // Determine direction (accounting for lower-is-better metrics)
    let direction: 'improved' | 'declined' | 'flat';
    if (absoluteChange === 0) {
      direction = 'flat';
    } else if (LOWER_IS_BETTER.has(key)) {
      direction = absoluteChange < 0 ? 'improved' : 'declined';
    } else {
      direction = absoluteChange > 0 ? 'improved' : 'declined';
    }

    return {
      current,
      previous,
      absoluteChange,
      percentageChange,
      changeReason,
      direction,
      availability: 'AVAILABLE',
      comparisonQuality: 'full',
    };
  }

  /**
   * Compare all metrics between current and previous periods.
   */
  compareMetrics(input: ComparisonInput): Record<string, ComparisonResult<number>> {
    const results: Record<string, ComparisonResult<number>> = {};

    // Scalar metrics
    const scalarKeys = [
      'crawlHealth', 'technicalIssues', 'onPageHealth', 'contentHealth',
      'aeoReadiness', 'geoReadiness', 'keywordVisibility', 'internalLinkHealth', 'seoHealth',
      'pagesCrawled', 'indexablePages', 'noindexPages',
      'criticalIssues', 'highIssues', 'mediumIssues', 'lowIssues',
      'rankingQueries', 'queriesWithImpressions', 'top3QueryCount', 'top10QueryCount', 'top20QueryCount',
      'positions11To20', 'cannibalizationCandidates',
      'brokenInternalLinks', 'orphanPages', 'canonicalIssues', 'aiVisibilityObservations',
    ];

    for (const key of scalarKeys) {
      const currentVal = input.current[key as keyof BaselineMetricsDto] as number | null;
      const prevVal = input.previous ? (input.previous[key as keyof BaselineMetricsDto] as number | null) : null;
      results[key] = this.compareValue(key, currentVal, prevVal);
    }

    // GSC metrics
    const gscKeys = ['clicks', 'impressions', 'ctr', 'avgPosition'] as const;
    for (const gscKey of gscKeys) {
      const key = `gscMetrics.${gscKey}`;
      const currentVal = input.current.gscMetrics?.[gscKey] ?? null;
      const prevVal = input.previous?.gscMetrics?.[gscKey] ?? null;
      results[key] = this.compareValue(key, currentVal, prevVal);
    }

    return results;
  }

  /**
   * Determine overall comparison quality based on individual metric availability.
   */
  determineComparisonQuality(results: Record<string, ComparisonResult<number>>): 'full' | 'partial' | 'none' {
    const values = Object.values(results);
    const fullCount = values.filter((r) => r.comparisonQuality === 'full').length;
    const noneCount = values.filter((r) => r.comparisonQuality === 'none').length;

    if (noneCount === values.length) return 'none';
    if (fullCount < values.length * 0.5) return 'partial';
    return 'full';
  }
}

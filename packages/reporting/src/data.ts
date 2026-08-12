import type {
  IssueProgressionDto,
  MetricComparisonDto,
  VisibilityMetricsDto,
} from '@creative-seo/types';
import type { BrandingView } from './branding';

/**
 * Report data model. Work completed and performance outcome are kept as
 * strictly separate structures; the report never merges them and never claims
 * causation — every page carries a correlation-only disclaimer.
 */

export interface ReportPeriod {
  start: string | null;
  end: string | null;
  label: string;
}

export interface MetricRow {
  key: string;
  label: string;
  previous: string;
  current: string;
  delta: string;
  direction: 'improved' | 'declined' | 'flat' | 'n/a';
}

export interface WorkItem {
  kind: string;
  pageUrl: string | null;
  label: string;
  changedAt: string;
}

export interface KeywordOpportunity {
  keyword: string;
  position: number | null;
  note: string;
}

export interface ReportData {
  branding: BrandingView;
  period: ReportPeriod;
  generatedAt: string;
  disclaimer: string;
  hasData: boolean;
  hasBaseline: boolean;
  /** Performance outcome metrics (current window). */
  performance: MetricRow[];
  /** Metrics since the baseline snapshot. */
  sinceBaseline: MetricRow[];
  issueProgression: IssueProgressionDto | null;
  issueCounts: Record<string, number>;
  /** Work completed — always separate from performance outcome. */
  workCompleted: WorkItem[];
  contentStats: { packages: number; completed: number };
  visibility: VisibilityMetricsDto | null;
  keywordOpportunities: KeywordOpportunity[];
  wins: string[];
  risks: string[];
  nextActions: string[];
  /** Focused-report metrics (e.g. SEO/AEO/GEO/Technical sections). */
  focusMetrics: MetricRow[];
}

export const METRIC_LABELS: Record<string, string> = {
  crawlHealth: 'Crawl health',
  technicalIssues: 'Technical issues',
  onPageHealth: 'On-page health',
  contentHealth: 'Content health',
  aeoReadiness: 'AEO readiness',
  geoReadiness: 'GEO readiness',
  gscMetrics: 'GSC clicks',
  keywordVisibility: 'Keyword visibility',
  internalLinkHealth: 'Internal-link health',
};

export const CORRELATION_DISCLAIMER =
  'This report presents observations and correlations only. It does not claim causation: changes in metrics and completed work are shown side by side, but no causal link is asserted unless independently proven.';

export function metricRows(comparisons: MetricComparisonDto[]): MetricRow[] {
  return comparisons.map((comparison) => ({
    key: comparison.key,
    label: METRIC_LABELS[comparison.key] ?? comparison.key,
    previous: formatValue(comparison.prev),
    current: formatValue(comparison.curr),
    delta: comparison.deltaPct === null ? 'n/a' : `${sign(comparison.deltaPct)}${Math.abs(comparison.deltaPct).toFixed(1)}%`,
    direction: comparison.direction,
  }));
}

function formatValue(value: number | null): string {
  if (value === null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function sign(value: number): string {
  return value > 0 ? '+' : value < 0 ? '−' : '';
}

export function visibilityRates(metrics: VisibilityMetricsDto | null): { label: string; value: string }[] {
  if (!metrics) return [];
  return [
    { label: 'Brand mention rate', value: percent(metrics.brandMentionRate) },
    { label: 'Citation rate', value: percent(metrics.citationRate) },
    { label: 'Source coverage', value: percent(metrics.sourceCoverage) },
    { label: 'Competitor inclusion', value: percent(metrics.competitorInclusion) },
    { label: 'AI share of voice (brand)', value: percent(metrics.shareOfVoice.brand) },
  ];
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

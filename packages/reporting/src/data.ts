import type {
  IssueProgressionDto,
  MetricComparisonDto,
  ReportLanguage,
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

// ---------------------------------------------------------------------------
// Rich template structures (Initial Audit / Monthly / Executive)
// ---------------------------------------------------------------------------

export interface ReportFinding {
  id: string;
  kind: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: string;
  title: string;
  description: string;
  url: string | null;
  detectedAt: string;
}

/** A single 0-100 health metric with an optional delta vs a previous period. */
export interface HealthBlock {
  key: string;
  labelKey: string;
  value: number | null;
  previous: number | null;
  delta: string | null;
  direction: 'improved' | 'declined' | 'flat' | 'n/a';
}

export interface KeywordVisibilityRow {
  keyword: string;
  position: number | null;
  clicks: number;
  impressions: number;
  ctr: number;
  /** Position change vs previous window (negative = moved up). */
  delta: number | null;
}

export interface CannibalizationRow {
  query: string;
  pages: string[];
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface RankMathStatus {
  detected: boolean;
  version: string | null;
  scanned: number;
  covered: number;
  coveragePct: number | null;
}

export interface InternalLinkStatus {
  stats: {
    pagesCrawled: number;
    orphanPages: number;
    weakTargets: number;
    brokenLinks: number;
    opportunities: number;
    overusedAnchors: number;
    conflictingLinks: number;
    approvedTargets: number;
  } | null;
  pending: number;
  applied: number;
  verified: number;
}

export interface ContentQualityStats {
  packages: number;
  published: number;
  drafts: number;
  avg: { seo: number | null; aeo: number | null; geo: number | null; rankMath: number | null };
}

export interface ContentOpportunity {
  cluster: string;
  keyword: string;
  position: number | null;
  action: string;
  note: string;
}

export interface MatrixQuadrant {
  key: 'quickWins' | 'majorProjects' | 'fillIns' | 'reconsider';
  items: string[];
}

export interface PlanBlock {
  key: 'plan30' | 'plan60' | 'plan90';
  intro: string;
  items: string[];
}

export interface KeywordMove {
  keyword: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  clicksAfter: number;
}

export interface PageMove {
  page: string;
  clicksBefore: number;
  clicksAfter: number;
  impressionsBefore: number;
  impressionsAfter: number;
  positionAfter: number | null;
}

export interface OrganicPerformance {
  hasGsc: boolean;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number | null;
  previous: { clicks: number; impressions: number; ctr: number; avgPosition: number | null };
}

export interface ReportRecommendation {
  id: string;
  issueId: string;
  title: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  impact: number;
  confidence: number;
  effort: number;
  suggestedAction: string;
}

export interface PublishedContentItem {
  title: string;
  url: string | null;
  publishedAt: string;
  language: string;
}

export interface ReportData {
  lang: ReportLanguage;
  branding: BrandingView;
  site: { name: string; domain: string } | null;
  period: ReportPeriod;
  generatedAt: string;
  disclaimer: string;
  hasData: boolean;
  hasBaseline: boolean;
  /** Performance outcome metrics (current window vs previous). */
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

  // Initial audit
  health: { seo: HealthBlock[]; aeo: HealthBlock[]; geo: HealthBlock[] };
  visibilityBaseline: HealthBlock[];
  technicalFindings: ReportFinding[];
  onPageFindings: ReportFinding[];
  contentQuality: ContentQualityStats;
  rankMath: RankMathStatus | null;
  keywordVisibility: KeywordVisibilityRow[];
  cannibalization: CannibalizationRow[];
  internalLinks: InternalLinkStatus;
  aeoGaps: string[];
  geoGaps: string[];
  criticalProblems: ReportFinding[];
  highPriorityProblems: ReportFinding[];
  quickWins: string[];
  contentOpportunities: ContentOpportunity[];
  matrix: MatrixQuadrant[];
  plans: PlanBlock[];

  // Monthly
  organic: OrganicPerformance;
  keywordMoves: KeywordMove[];
  pageMoves: PageMove[];
  issuesResolvedList: ReportFinding[];
  outstandingList: ReportFinding[];
  contentPublishedList: PublishedContentItem[];
  recommendationsList: ReportRecommendation[];
  nextPriorities: string[];
}

export const METRIC_LABELS: Record<string, string> = {
  crawlHealth: 'metric.crawlHealth',
  technicalIssues: 'metric.technicalIssues',
  onPageHealth: 'metric.onPageHealth',
  contentHealth: 'metric.contentHealth',
  aeoReadiness: 'metric.aeoReadiness',
  geoReadiness: 'metric.geoReadiness',
  gscMetrics: 'metric.gscMetrics',
  keywordVisibility: 'metric.keywordVisibility',
  internalLinkHealth: 'metric.internalLinkHealth',
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

export function visibilityRates(metrics: VisibilityMetricsDto | null): { labelKey: string; value: string }[] {
  if (!metrics) return [];
  return [
    { labelKey: 'vis.brandMentionRate', value: percent(metrics.brandMentionRate) },
    { labelKey: 'vis.citationRate', value: percent(metrics.citationRate) },
    { labelKey: 'vis.sourceCoverage', value: percent(metrics.sourceCoverage) },
    { labelKey: 'vis.competitorInclusion', value: percent(metrics.competitorInclusion) },
    { labelKey: 'vis.shareOfVoiceBrand', value: percent(metrics.shareOfVoice.brand) },
  ];
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

import type {
  BaselineMetricKey,
  BaselineMetricsDto,
  BaselineSnapshotDto,
  IssueProgressionDto,
  IssueSnapshotEntry,
  IssueStatus,
  MetricComparisonDto,
  SnapshotComparisonDto,
} from '@creative-seo/types';

/**
 * Baseline snapshot comparisons. Historical snapshots are immutable — nothing
 * here ever mutates one. Comparisons power the progress dashboard
 * (baseline -> current, previous -> current, month -> month, quarter -> quarter).
 */

const SCALAR_KEYS: ReadonlyArray<Exclude<BaselineMetricKey, 'gscMetrics'>> = [
  'crawlHealth',
  'technicalIssues',
  'onPageHealth',
  'contentHealth',
  'aeoReadiness',
  'geoReadiness',
  'keywordVisibility',
  'internalLinkHealth',
  'seoHealth',
];

/** Metrics where a lower value is better. */
const LOWER_IS_BETTER: ReadonlySet<BaselineMetricKey> = new Set<BaselineMetricKey>(['technicalIssues']);

const CLOSED_STATUSES: ReadonlySet<IssueStatus> = new Set<IssueStatus>(['RESOLVED', 'IGNORED']);

export function compareMetric(key: BaselineMetricKey, prev: number | null, curr: number | null): MetricComparisonDto {
  const delta = prev === null || curr === null ? null : round2(curr - prev);
  const deltaPct = prev === null || prev === 0 || curr === null ? null : round2(((curr - prev) / prev) * 100);

  let direction: MetricComparisonDto['direction'] = 'n/a';
  if (prev !== null && curr !== null && delta !== null && delta !== 0) {
    const improved = LOWER_IS_BETTER.has(key) ? delta < 0 : delta > 0;
    direction = improved ? 'improved' : 'declined';
  } else if (prev !== null && curr !== null && delta === 0) {
    direction = 'flat';
  }

  return { key, prev, curr, delta, deltaPct, direction };
}

/** Compares the numeric baseline areas; gscMetrics is compared on clicks. */
export function compareMetrics(prev: BaselineMetricsDto, curr: BaselineMetricsDto): MetricComparisonDto[] {
  const comparisons: MetricComparisonDto[] = [];
  for (const key of SCALAR_KEYS) {
    comparisons.push(compareMetric(key, prev[key], curr[key]));
  }
  comparisons.push(compareMetric('gscMetrics', prev.gscMetrics.clicks, curr.gscMetrics.clicks));
  return comparisons;
}

/**
 * Tracks issue progression between two snapshots:
 * initial (baseline count), new (opened since), resolved (closed since),
 * remaining (still open) and regressed (closed then reopened).
 */
export function issueProgression(prev: IssueSnapshotEntry[], curr: IssueSnapshotEntry[]): IssueProgressionDto {
  const prevById = new Map(prev.map((entry) => [entry.id, entry.status]));

  let newCount = 0;
  let resolvedCount = 0;
  let remainingCount = 0;
  let regressedCount = 0;

  for (const entry of curr) {
    const prevStatus = prevById.get(entry.id);
    if (prevStatus === undefined) {
      newCount += 1;
      continue;
    }
    const prevClosed = CLOSED_STATUSES.has(prevStatus as IssueStatus);
    const currClosed = CLOSED_STATUSES.has(entry.status as IssueStatus);
    if (!prevClosed && currClosed) {
      resolvedCount += 1;
    } else if (!prevClosed && !currClosed) {
      remainingCount += 1;
    } else if (prevClosed && !currClosed) {
      regressedCount += 1;
    }
  }

  const totalOpen = curr.filter((entry) => !CLOSED_STATUSES.has(entry.status as IssueStatus)).length;

  return {
    initial: prev.length,
    new: newCount,
    resolved: resolvedCount,
    remaining: remainingCount,
    regressed: regressedCount,
    totalOpen,
  };
}

export function compareSnapshots(from: BaselineSnapshotDto, to: BaselineSnapshotDto): SnapshotComparisonDto {
  return {
    from,
    to,
    metrics: compareMetrics(from.metrics, to.metrics),
    issueProgression: issueProgression(from.issues, to.issues),
  };
}

export function isClosedStatus(status: IssueStatus): boolean {
  return CLOSED_STATUSES.has(status);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

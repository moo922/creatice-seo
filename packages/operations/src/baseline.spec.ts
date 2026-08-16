import { compareMetrics, compareSnapshots, issueProgression } from './baseline';
import type { BaselineMetricsDto, BaselineSnapshotDto, IssueSnapshotEntry } from '@creative-seo/types';

const metrics = (overrides: Partial<BaselineMetricsDto> = {}): BaselineMetricsDto => ({
  crawlHealth: 80,
  technicalIssues: 5,
  onPageHealth: 70,
  contentHealth: 60,
  aeoReadiness: 50,
  geoReadiness: 45,
  gscMetrics: { clicks: 1000, impressions: 50000, ctr: 0.02, avgPosition: 12 },
  keywordVisibility: 30,
  internalLinkHealth: 65,
  seoHealth: 70,
  ...overrides,
});

describe('compareMetrics', () => {
  it('marks higher-is-better improvements as improved', () => {
    const comparison = compareMetrics(metrics(), metrics({ crawlHealth: 90 }));
    const crawl = comparison.find((entry) => entry.key === 'crawlHealth');
    expect(crawl?.direction).toBe('improved');
    expect(crawl?.delta).toBe(10);
  });

  it('inverts direction for technical issues (lower is better)', () => {
    const comparison = compareMetrics(metrics({ technicalIssues: 5 }), metrics({ technicalIssues: 2 }));
    const tech = comparison.find((entry) => entry.key === 'technicalIssues');
    expect(tech?.direction).toBe('improved');
    expect(tech?.delta).toBe(-3);
  });

  it('reports declines and n/a when previous is null', () => {
    const declined = compareMetrics(metrics({ onPageHealth: 80 }), metrics({ onPageHealth: 60 }));
    expect(declined.find((entry) => entry.key === 'onPageHealth')?.direction).toBe('declined');
  });

  it('compares gscMetrics on clicks', () => {
    const comparison = compareMetrics(metrics(), metrics({ gscMetrics: { clicks: 1200, impressions: 50000, ctr: 0.024, avgPosition: 12 } }));
    const gsc = comparison.find((entry) => entry.key === 'gscMetrics');
    expect(gsc?.delta).toBe(200);
    expect(gsc?.direction).toBe('improved');
  });
});

describe('issueProgression', () => {
  it('computes new, resolved, remaining and regressed', () => {
    const prev: IssueSnapshotEntry[] = [
      { id: 'a', status: 'DETECTED' },
      { id: 'b', status: 'APPROVED' },
      { id: 'c', status: 'RESOLVED' },
    ];
    const curr: IssueSnapshotEntry[] = [
      { id: 'a', status: 'IN_PROGRESS' },
      { id: 'b', status: 'RESOLVED' },
      { id: 'c', status: 'DETECTED' },
      { id: 'd', status: 'DETECTED' },
    ];
    const progression = issueProgression(prev, curr);
    expect(progression.initial).toBe(3);
    expect(progression.new).toBe(1);
    expect(progression.resolved).toBe(1);
    expect(progression.remaining).toBe(1);
    expect(progression.regressed).toBe(1);
    expect(progression.totalOpen).toBe(3);
  });
});

describe('compareSnapshots', () => {
  it('builds a full comparison', () => {
    const from = snapshot(metrics());
    const to = snapshot(metrics({ crawlHealth: 90 }), 'snap-2');
    const comparison = compareSnapshots(from, to);
    expect(comparison.from.id).toBe('snap-1');
    expect(comparison.to.id).toBe('snap-2');
    expect(comparison.metrics.length).toBe(10);
    expect(comparison.issueProgression).toBeDefined();
  });
});

function snapshot(m: BaselineMetricsDto, id = 'snap-1'): BaselineSnapshotDto {
  return {
    id,
    siteId: 'site-1',
    organizationId: null,
    type: 'BASELINE',
    isBaseline: true,
    periodStart: null,
    periodEnd: null,
    metrics: m,
    issues: [
      { id: 'a', status: 'DETECTED' },
      { id: 'b', status: 'RESOLVED' },
    ],
    note: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

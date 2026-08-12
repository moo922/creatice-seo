import type { AlertKind, IssueSeverity } from '@creative-seo/types';

/**
 * Deterministic alert rules. Alerts never modify a live site — they create
 * issues/recommendations that flow through the human-in-the-loop pipeline.
 */

export interface DetectedAlert {
  kind: AlertKind;
  severity: IssueSeverity;
  title: string;
  description: string;
  data: Record<string, unknown>;
}

export interface TrafficSnapshot {
  clicks: number;
  prevClicks: number;
}

export interface CtrSnapshot {
  ctr: number;
  prevCtr: number;
}

export interface PositionSnapshot {
  avgPosition: number;
  prevAvgPosition: number;
  keywords: number;
}

export interface ContentDecaySignal {
  page: string;
  clicks: number;
  prevClicks: number;
}

export interface CannibalizationSignal {
  query: string;
  pages: string[];
}

export interface AlertRuleInput {
  gscHealthy: boolean;
  wordpressHealthy: boolean;
  traffic?: TrafficSnapshot;
  ctr?: CtrSnapshot;
  position?: PositionSnapshot;
  criticalTechnicalIssueCount?: number;
  contentDecay?: ContentDecaySignal[];
  cannibalization?: CannibalizationSignal[];
}

export interface AlertRuleOptions {
  trafficDropPct?: number;
  ctrDropPct?: number;
  positionDeclinePct?: number;
  contentDecayPct?: number;
  minCannibalizingPages?: number;
}

const DEFAULT_OPTIONS: Required<AlertRuleOptions> = {
  trafficDropPct: 0.3,
  ctrDropPct: 0.2,
  positionDeclinePct: 0.2,
  contentDecayPct: 0.3,
  minCannibalizingPages: 2,
};

export function evaluateAlerts(input: AlertRuleInput, options: AlertRuleOptions = {}): DetectedAlert[] {
  const opts: Required<AlertRuleOptions> = { ...DEFAULT_OPTIONS, ...options };
  const alerts: DetectedAlert[] = [];

  const traffic = input.traffic;
  if (traffic && traffic.prevClicks > 0) {
    const pct = (traffic.prevClicks - traffic.clicks) / traffic.prevClicks;
    if (pct >= opts.trafficDropPct) {
      alerts.push({
        kind: 'TRAFFIC_DROP',
        severity: 'HIGH',
        title: `Traffic drop: ${traffic.clicks} clicks`,
        description: `Clicks fell from ${traffic.prevClicks} to ${traffic.clicks} (${percent(pct)} drop).`,
        data: { clicks: traffic.clicks, prevClicks: traffic.prevClicks, dropPct: round2(pct) },
      });
    }
  }

  const ctr = input.ctr;
  if (ctr && ctr.prevCtr > 0) {
    const pct = (ctr.prevCtr - ctr.ctr) / ctr.prevCtr;
    if (pct >= opts.ctrDropPct) {
      alerts.push({
        kind: 'CTR_DROP',
        severity: 'MEDIUM',
        title: `CTR drop: ${percent(pct)} lower`,
        description: `Click-through rate fell from ${round2(ctr.prevCtr)} to ${round2(ctr.ctr)}.`,
        data: { ctr: ctr.ctr, prevCtr: ctr.prevCtr, dropPct: round2(pct) },
      });
    }
  }

  const position = input.position;
  if (position && position.prevAvgPosition > 0 && position.keywords > 0) {
    const pct = (position.avgPosition - position.prevAvgPosition) / position.prevAvgPosition;
    if (pct >= opts.positionDeclinePct) {
      alerts.push({
        kind: 'POSITION_DECLINE',
        severity: 'MEDIUM',
        title: `Average position declined across ${position.keywords} keywords`,
        description: `Average position moved from ${round2(position.prevAvgPosition)} to ${round2(position.avgPosition)}.`,
        data: { avgPosition: position.avgPosition, prevAvgPosition: position.prevAvgPosition, keywords: position.keywords, declinePct: round2(pct) },
      });
    }
  }

  const criticalCount = input.criticalTechnicalIssueCount ?? 0;
  if (criticalCount > 0) {
    alerts.push({
      kind: 'CRITICAL_TECHNICAL_ISSUE',
      severity: 'CRITICAL',
      title: `${criticalCount} critical technical issue(s)`,
      description: `Crawl/tooling detected ${criticalCount} critical technical issue(s) affecting the site.`,
      data: { count: criticalCount },
    });
  }

  if (!input.gscHealthy) {
    alerts.push({
      kind: 'GSC_FAILURE',
      severity: 'HIGH',
      title: 'Google Search Console connection failure',
      description: 'The Search Console connection failed or its token expired; performance data may be stale.',
      data: {},
    });
  }

  if (!input.wordpressHealthy) {
    alerts.push({
      kind: 'WORDPRESS_FAILURE',
      severity: 'HIGH',
      title: 'WordPress connection failure',
      description: 'The WordPress connection failed; the site may be unreachable or the credentials invalid.',
      data: {},
    });
  }

  for (const signal of input.contentDecay ?? []) {
    if (signal.prevClicks > 0) {
      const pct = (signal.prevClicks - signal.clicks) / signal.prevClicks;
      if (pct >= opts.contentDecayPct) {
        alerts.push({
          kind: 'CONTENT_DECAY',
          severity: 'MEDIUM',
          title: `Content decay: ${signal.page}`,
          description: `${signal.page} lost ${percent(pct)} of its clicks (${signal.prevClicks} -> ${signal.clicks}).`,
          data: { page: signal.page, clicks: signal.clicks, prevClicks: signal.prevClicks, dropPct: round2(pct) },
        });
      }
    }
  }

  for (const signal of input.cannibalization ?? []) {
    if (signal.pages.length >= opts.minCannibalizingPages) {
      alerts.push({
        kind: 'NEW_CANNIBALIZATION',
        severity: 'MEDIUM',
        title: `Cannibalization: "${signal.query}"`,
        description: `${signal.pages.length} pages target "${signal.query}": ${signal.pages.join(', ')}.`,
        data: { query: signal.query, pages: signal.pages },
      });
    }
  }

  return alerts;
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

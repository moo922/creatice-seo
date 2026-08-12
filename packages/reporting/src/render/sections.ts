import type { MetricRow, ReportData, WorkItem } from '../data';
import { visibilityRates } from '../data';
import { escapeHtml } from './layout';

export function section(title: string, body: string, subtitle?: string): string {
  return `<section class="card"><h2 class="sec">${escapeHtml(title)}</h2>${subtitle ? `<div class="meta" style="margin-top:-6px;margin-bottom:8px">${escapeHtml(subtitle)}</div>` : ''}${body}</section>`;
}

export function kpiGrid(rows: Array<{ label: string; value: string; delta?: string; direction?: string }>): string {
  return `<div class="grid">${rows
    .map(
      (row) =>
        `<div class="kpi"><div class="k">${escapeHtml(row.label)}</div><div class="v">${escapeHtml(row.value)}</div>${
          row.delta ? `<div class="d ${escapeHtml(row.direction ?? '')}">${escapeHtml(row.delta)}</div>` : ''
        }</div>`,
    )
    .join('')}</div>`;
}

export function metricTable(rows: MetricRow[]): string {
  if (rows.length === 0) return '<p class="empty">No comparable data yet.</p>';
  return `<table><thead><tr><th>Metric</th><th>Previous</th><th>Current</th><th>Change</th><th>Direction</th></tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.previous)}</td><td>${escapeHtml(row.current)}</td><td>${escapeHtml(row.delta)}</td><td class="${escapeHtml(row.direction)}">${escapeHtml(row.direction)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function bulletList(items: string[], empty = 'Nothing to list yet.'): string {
  if (items.length === 0) return `<p class="empty">${escapeHtml(empty)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function workTable(items: WorkItem[]): string {
  if (items.length === 0) return '<p class="empty">No work recorded yet.</p>';
  return `<table><thead><tr><th>Kind</th><th>Page</th><th>Details</th><th>Date</th></tr></thead><tbody>${items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.kind)}</td><td>${item.pageUrl ? escapeHtml(item.pageUrl) : '—'}</td><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.changedAt)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// Shared section builders
// ---------------------------------------------------------------------------

export function sExecutiveSummary(data: ReportData): string {
  const keyMetrics = data.performance.slice(0, 4).map((row) => ({
    label: row.label,
    value: row.current,
    delta: row.delta,
    direction: row.direction,
  }));
  return section(
    'Executive Summary',
    `<p>${escapeHtml(data.branding.clientName)} — this report summarizes the current state, the work completed, and measured outcomes for the period ${escapeHtml(data.period.label)}.</p>${kpiGrid(
      keyMetrics.length > 0 ? keyMetrics : [{ label: 'Data', value: 'Awaiting data' }],
    )}${bulletList(data.wins, 'No wins captured yet.')}`,
  );
}

export function sBaseline(data: ReportData): string {
  if (!data.hasBaseline) {
    return section('Baseline', '<p class="empty">No baseline snapshot has been captured yet. Create a baseline in Monitoring to enable progress tracking.</p>');
  }
  return section('Baseline', `${metricTable(data.sinceBaseline)}<p class="notice">Baseline values are immutable historical snapshots.</p>`);
}

export function sPerformance(data: ReportData): string {
  return section('Performance Outcome', `${metricTable(data.performance)}<p class="notice">Correlations only — causation is not claimed.</p>`);
}

export function sSinceBaseline(data: ReportData): string {
  if (!data.hasBaseline) {
    return section('Since Baseline', '<p class="empty">No baseline snapshot yet.</p>');
  }
  return section('Since Baseline', metricTable(data.sinceBaseline));
}

export function sSeo(data: ReportData): string {
  const rows = data.focusMetrics.filter((row) => ['onPageHealth', 'keywordVisibility', 'internalLinkHealth', 'gscMetrics'].includes(row.key));
  return section('SEO', rows.length > 0 ? metricTable(rows) : '<p class="empty">No SEO metrics yet.</p>', 'Internal SEO signals — not an official ranking.');
}

export function sAeo(data: ReportData): string {
  const rows = data.focusMetrics.filter((row) => ['aeoReadiness', 'contentHealth'].includes(row.key));
  const vis = visibilityRates(data.visibility);
  const visHtml = vis.length > 0 ? kpiGrid(vis.map((v) => ({ label: v.label, value: v.value }))) : '';
  return section(
    'AEO',
    `${rows.length > 0 ? metricTable(rows) : ''}${visHtml || '<p class="empty">No AEO observations yet. Run an AI visibility observation.</p>'}`,
    'Answer-engine readiness based on internal measurements.',
  );
}

export function sGeo(data: ReportData): string {
  const rows = data.focusMetrics.filter((row) => ['geoReadiness', 'aeoReadiness'].includes(row.key));
  const vis = visibilityRates(data.visibility);
  const visHtml = vis.length > 0 ? kpiGrid(vis.slice(1, 4).map((v) => ({ label: v.label, value: v.value }))) : '';
  return section(
    'GEO',
    `${rows.length > 0 ? metricTable(rows) : ''}${visHtml || '<p class="empty">No GEO observations yet.</p>'}`,
    'Internal platform criteria — not an official search-engine score.',
  );
}

export function sTechnical(data: ReportData): string {
  const rows = data.focusMetrics.filter((row) => ['crawlHealth', 'technicalIssues'].includes(row.key));
  return section('Technical Audit', rows.length > 0 ? metricTable(rows) : '<p class="empty">No technical metrics yet.</p>');
}

export function sContent(data: ReportData): string {
  const stats = data.contentStats;
  const packages = stats.packages > 0
    ? `<p>Content packages: <strong>${stats.packages}</strong> (${stats.completed} completed).</p>`
    : '<p class="empty">No content packages generated yet.</p>';
  return section('Content', packages);
}

export function sContentWork(data: ReportData): string {
  const items = data.workCompleted.filter((item) => ['content', 'page_created', 'page_removed', 'title', 'meta', 'headings', 'rank_math'].includes(item.kind));
  return section('Content Work', workTable(items));
}

export function sIssues(data: ReportData): string {
  const counts = data.issueCounts;
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const grid = total > 0
    ? kpiGrid(Object.entries(counts).map(([status, count]) => ({ label: status, value: String(count) })))
    : '<p class="empty">No issues tracked yet.</p>';
  const progression = data.issueProgression
    ? `<p>Issue progression: ${data.issueProgression.initial} initial &middot; ${data.issueProgression.new} new &middot; ${data.issueProgression.resolved} resolved &middot; ${data.issueProgression.remaining} remaining &middot; ${data.issueProgression.regressed} regressed.</p>`
    : '';
  return section('Issues', `${grid}${progression}`);
}

export function sIssuesResolved(data: ReportData): string {
  const count = data.issueProgression?.resolved ?? 0;
  return section('Issues Resolved', `<p><strong>${count}</strong> issue(s) moved to a resolved state during the period.</p>${count === 0 ? '<p class="empty">No issues resolved yet.</p>' : ''}`);
}

export function sNewIssues(data: ReportData): string {
  const count = data.issueProgression?.new ?? 0;
  return section('New Issues', `<p><strong>${count}</strong> new issue(s) detected during the period.</p>${count === 0 ? '<p class="empty">No new issues detected.</p>' : ''}`);
}

export function sSearchPerformance(data: ReportData): string {
  const rows = data.performance.filter((row) => ['gscMetrics', 'keywordVisibility'].includes(row.key));
  return section('Search Performance', rows.length > 0 ? metricTable(rows) : '<p class="empty">No Search Console data yet.</p>', 'Source: Google Search Console (directional averages, not exact ranks).');
}

export function sQuickWins(data: ReportData): string {
  const wins = data.wins.length > 0 ? data.wins : ['Run an AI visibility observation batch.', 'Approve pending link suggestions.', 'Resolve open critical technical issues.'];
  return section('Quick Wins', bulletList(wins));
}

export function sOpportunities(data: ReportData): string {
  const rows = data.keywordOpportunities;
  if (rows.length === 0) return section('Opportunities', '<p class="empty">No keyword opportunities identified yet.</p>');
  return section('Opportunities', `<table><thead><tr><th>Keyword</th><th>Avg position</th><th>Note</th></tr></thead><tbody>${rows
    .map((row) => `<tr><td>${escapeHtml(row.keyword)}</td><td>${row.position === null ? '—' : row.position}</td><td>${escapeHtml(row.note)}</td></tr>`)
    .join('')}</tbody></table>`);
}

export function sPlan(_data: ReportData): string {
  const plan = bulletList([
    'Days 0-30: fix critical technical issues, approve and apply high-confidence link suggestions.',
    'Days 31-60: generate content for approved clusters; run AI visibility observations.',
    'Days 61-90: expand keyword opportunities, monitor progress vs baseline.',
  ]);
  return section('30/60/90 Day Plan', plan);
}

export function sWorkCompleted(data: ReportData): string {
  return section(
    'Work Completed',
    workTable(data.workCompleted),
    'What was done — separate from performance outcome. No causal link is implied.',
  );
}

export function sKeywordOpportunities(data: ReportData): string {
  const rows = data.keywordOpportunities;
  if (rows.length === 0) return section('Keyword Opportunities', '<p class="empty">No keyword opportunities identified yet.</p>');
  const table = `<table><thead><tr><th>Keyword</th><th>Avg position</th><th>Note</th></tr></thead><tbody>${rows
    .map((row) => `<tr><td>${escapeHtml(row.keyword)}</td><td>${row.position === null ? '—' : row.position}</td><td>${escapeHtml(row.note)}</td></tr>`)
    .join('')}</tbody></table>`;
  return section('Keyword Opportunities', table);
}

export function sWins(data: ReportData): string {
  return section('Wins', bulletList(data.wins, 'No wins captured yet.'));
}

export function sRisks(data: ReportData): string {
  return section('Risks', bulletList(data.risks, 'No risks flagged.'));
}

export function sNextActions(data: ReportData): string {
  return section('Next Actions', bulletList(data.nextActions, 'No next actions defined yet.'));
}

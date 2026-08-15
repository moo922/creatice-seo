import type { ReportLanguage } from '@creative-seo/types';
import type { HealthBlock, MetricRow, ReportData, WorkItem } from '../data';
import { visibilityRates } from '../data';
import { rt } from '../i18n';
import { escapeHtml } from './layout';

// ---------------------------------------------------------------------------
// Low-level render helpers
// ---------------------------------------------------------------------------

export function section(title: string, body: string, subtitle?: string): string {
  return `<section class="card"><h2 class="sec">${escapeHtml(title)}</h2>${subtitle ? `<div class="meta" style="margin-top:-6px;margin-bottom:8px">${escapeHtml(subtitle)}</div>` : ''}${body}</section>`;
}

export function kpiGrid(rows: Array<{ label: string; value: string; delta?: string; direction?: string }>): string {
  return `<div class="grid">${rows
    .map(
      (row) =>
        `<div class="kpi"><div class="k">${escapeHtml(row.label)}</div><div class="v num">${escapeHtml(row.value)}</div>${
          row.delta ? `<div class="d ${escapeHtml(row.direction ?? '')}">${escapeHtml(row.delta)}</div>` : ''
        }</div>`,
    )
    .join('')}</div>`;
}

export function metricTable(rows: MetricRow[], lang: ReportLanguage): string {
  if (rows.length === 0) return `<p class="empty">${escapeHtml(rt(lang, 'empty.noComparable'))}</p>`;
  return `<table><thead><tr><th>${escapeHtml(rt(lang, 'th.metric'))}</th><th>${escapeHtml(rt(lang, 'th.previous'))}</th><th>${escapeHtml(rt(lang, 'th.current'))}</th><th>${escapeHtml(rt(lang, 'th.change'))}</th><th>${escapeHtml(rt(lang, 'th.direction'))}</th></tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(rt(lang, row.label))}</td><td class="num">${escapeHtml(row.previous)}</td><td class="num">${escapeHtml(row.current)}</td><td class="num">${escapeHtml(row.delta)}</td><td class="${escapeHtml(row.direction)}">${escapeHtml(rt(lang, `dir.${row.direction}`))}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function bulletList(lang: ReportLanguage, items: string[], empty = 'empty.noFindings'): string {
  if (items.length === 0) return `<p class="empty">${escapeHtml(rt(lang, empty))}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function workTable(items: WorkItem[], lang: ReportLanguage): string {
  if (items.length === 0) return `<p class="empty">${escapeHtml(rt(lang, 'empty.noWork'))}</p>`;
  return `<table><thead><tr><th>${escapeHtml(rt(lang, 'th.kind'))}</th><th>${escapeHtml(rt(lang, 'th.page'))}</th><th>${escapeHtml(rt(lang, 'th.details'))}</th><th>${escapeHtml(rt(lang, 'th.date'))}</th></tr></thead><tbody>${items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(rt(lang, `change.${item.kind}`))}</td><td>${item.pageUrl ? escapeHtml(item.pageUrl) : '—'}</td><td>${escapeHtml(item.label)}</td><td class="num">${escapeHtml(item.changedAt)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function findingsTable(lang: ReportLanguage, rows: Array<{ severity: string; title: string; status: string; url: string | null }>): string {
  return `<table><thead><tr><th>${escapeHtml(rt(lang, 'th.severity'))}</th><th>${escapeHtml(rt(lang, 'th.issue'))}</th><th>${escapeHtml(rt(lang, 'th.status'))}</th><th>${escapeHtml(rt(lang, 'th.url'))}</th></tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr><td>${sevTag(lang, row.severity)}</td><td>${escapeHtml(row.title)}</td><td>${escapeHtml(rt(lang, `iss.${row.status}`))}</td><td>${row.url ? escapeHtml(row.url) : '—'}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function sevTag(lang: ReportLanguage, severity: string): string {
  const tone = severity === 'CRITICAL' ? 'tag-bad' : severity === 'HIGH' ? 'tag-warn' : 'tag';
  return `<span class="tag ${tone}">${escapeHtml(rt(lang, `sev.${severity}`))}</span>`;
}

function healthKpis(blocks: HealthBlock[], lang: ReportLanguage): string {
  if (blocks.length === 0) return `<p class="empty">${escapeHtml(rt(lang, 'sec.healthEmpty'))}</p>`;
  return kpiGrid(
    blocks.map((block) => ({
      label: rt(lang, `metric.${block.key}`),
      value: block.value === null ? rt(lang, 'val.notTracked') : String(block.value),
      delta: block.delta ?? undefined,
      direction: block.direction,
    })),
  );
}

// ---------------------------------------------------------------------------
// Initial audit sections
// ---------------------------------------------------------------------------

export function sExecutiveSummary(data: ReportData): string {
  const lang = data.lang;
  const openIssues = Object.entries(data.issueCounts).reduce((sum, [status, count]) => sum + (['DETECTED', 'REVIEWED', 'APPROVED', 'IN_PROGRESS', 'FIXED', 'VERIFYING'].includes(status) ? count : 0), 0);
  const healthValues = data.health.seo.map((block) => block.value).filter((value): value is number => value !== null);
  const avgHealth = healthValues.length > 0 ? Math.round(healthValues.reduce((sum, value) => sum + value, 0) / healthValues.length) : null;
  const overview = rt(lang, 'exec.overview')
    .replace('{client}', data.branding.clientName)
    .replace('{period}', data.period.label);
  const kpis = [
    ...(avgHealth !== null ? [{ label: rt(lang, 'kpi.healthScore'), value: String(avgHealth) }] : []),
    { label: rt(lang, 'kpi.openIssues'), value: String(openIssues) },
    { label: rt(lang, 'kpi.criticalIssues'), value: String(data.issueCounts['CRITICAL'] ?? 0) },
    ...(data.organic.hasGsc ? [{ label: rt(lang, 'kpi.traffic'), value: formatNumber(data.organic.clicks) }] : []),
    ...(data.visibility ? [{ label: rt(lang, 'kpi.visibility'), value: `${Math.round(data.visibility.brandMentionRate * 100)}%` }] : []),
  ];
  return section(
    rt(lang, 'sec.executiveSummary'),
    `<p>${escapeHtml(overview)}</p><p class="notice">${escapeHtml(rt(lang, 'notice.separates'))}</p>${kpiGrid(
      kpis.length > 0 ? kpis : [{ label: rt(lang, 'kpi.data'), value: rt(lang, 'kpi.noData') }],
    )}${bulletList(lang, data.wins, 'empty.noWork')}`,
  );
}

export function sSeoHealth(data: ReportData): string {
  return section(rt(data.lang, 'sec.seoHealth'), healthKpis(data.health.seo, data.lang), rt(data.lang, 'notice.aeo'));
}

export function sAeoReadinessSection(data: ReportData): string {
  const lang = data.lang;
  const vis = visibilityRates(data.visibility);
  const visHtml = vis.length > 0 ? `<p class="meta" style="margin-top:14px">${escapeHtml(rt(lang, 'notice.visibility'))}</p>${kpiGrid(vis.map((v) => ({ label: rt(lang, v.labelKey), value: v.value })))}` : '';
  return section(rt(lang, 'sec.aeoReadiness'), `${healthKpis(data.health.aeo, lang)}${visHtml}`, rt(lang, 'notice.aeo'));
}

export function sGeoReadinessSection(data: ReportData): string {
  const lang = data.lang;
  const vis = visibilityRates(data.visibility);
  const subset = vis.slice(1, 4).map((v) => ({ label: rt(lang, v.labelKey), value: v.value }));
  const obsCount = data.visibility?.totalObservations ?? 0;
  const visHtml = subset.length > 0 ? kpiGrid(subset) : '';
  const countLine = obsCount > 0 ? `<p class="meta">${escapeHtml(rt(lang, 'vis.totalObservations'))}: <strong>${obsCount}</strong> · ${escapeHtml(rt(lang, 'vis.providerModel'))}: ${escapeHtml(data.visibility?.provider ?? '')} ${escapeHtml(data.visibility?.model ?? '')}</p>` : '';
  return section(rt(lang, 'sec.geoReadiness'), `${healthKpis(data.health.geo, lang)}${visHtml}${countLine}`, rt(lang, 'notice.geo'));
}

export function sVisibilityBaseline(data: ReportData): string {
  const lang = data.lang;
  if (!data.hasBaseline && data.visibilityBaseline.length === 0) {
    return section(rt(lang, 'sec.visibilityBaseline'), `<p class="empty">${escapeHtml(rt(lang, 'sec.visibilityBaselineEmpty'))}</p>`);
  }
  return section(rt(lang, 'sec.visibilityBaseline'), `${healthKpis(data.visibilityBaseline, lang)}<p class="notice">${escapeHtml(rt(lang, 'notice.immutable'))}</p>`);
}

export function sTechnicalFindings(data: ReportData): string {
  const lang = data.lang;
  if (data.technicalFindings.length === 0) return section(rt(lang, 'sec.technicalFindings'), `<p class="empty">${escapeHtml(rt(lang, 'sec.technicalEmpty'))}</p>`);
  return section(rt(lang, 'sec.technicalFindings'), findingsTable(lang, data.technicalFindings));
}

export function sOnPageFindings(data: ReportData): string {
  const lang = data.lang;
  if (data.onPageFindings.length === 0) return section(rt(lang, 'sec.onPageFindings'), `<p class="empty">${escapeHtml(rt(lang, 'sec.onPageEmpty'))}</p>`);
  return section(rt(lang, 'sec.onPageFindings'), findingsTable(lang, data.onPageFindings));
}

export function sContentQuality(data: ReportData): string {
  const lang = data.lang;
  const stats = data.contentQuality;
  if (stats.packages === 0) return section(rt(lang, 'sec.contentQuality'), `<p class="empty">${escapeHtml(rt(lang, 'cq.none'))}</p>`);
  const scores: Array<{ label: string; value: string }> = [];
  if (stats.avg.seo !== null) scores.push({ label: rt(lang, 'cq.avgSeo'), value: String(Math.round(stats.avg.seo)) });
  if (stats.avg.aeo !== null) scores.push({ label: rt(lang, 'cq.avgAeo'), value: String(Math.round(stats.avg.aeo)) });
  if (stats.avg.geo !== null) scores.push({ label: rt(lang, 'cq.avgGeo'), value: String(Math.round(stats.avg.geo)) });
  if (stats.avg.rankMath !== null) scores.push({ label: rt(lang, 'cq.avgRankMath'), value: String(Math.round(stats.avg.rankMath)) });
  const kpis = [
    { label: rt(lang, 'cq.packages'), value: String(stats.packages) },
    { label: rt(lang, 'cq.published'), value: String(stats.published) },
    { label: rt(lang, 'cq.drafts'), value: String(stats.drafts) },
    ...scores,
  ];
  return section(rt(lang, 'sec.contentQuality'), kpiGrid(kpis), rt(lang, 'notice.aeo'));
}

export function sRankMathAnalysis(data: ReportData): string {
  const lang = data.lang;
  if (!data.rankMath) return section(rt(lang, 'sec.rankMath'), `<p class="empty">${escapeHtml(rt(lang, 'rm.notDetected'))}</p>`);
  const rm = data.rankMath;
  const kpis = [
    { label: rt(lang, 'rm.detected'), value: rm.detected ? rt(lang, 'rm.detected') : rt(lang, 'rm.notDetected') },
    ...(rm.version ? [{ label: rt(lang, 'rm.version'), value: rm.version }] : []),
    { label: rt(lang, 'rm.postsTotal'), value: String(rm.scanned) },
    { label: rt(lang, 'rm.coverage'), value: rm.coveragePct === null ? rt(lang, 'val.none') : `${rm.coveragePct}%` },
  ];
  return section(rt(lang, 'sec.rankMath'), kpiGrid(kpis));
}

export function sKeywordVisibility(data: ReportData): string {
  const lang = data.lang;
  const rows = data.keywordVisibility;
  if (rows.length === 0) return section(rt(lang, 'sec.keywordVisibility'), `<p class="empty">${escapeHtml(rt(lang, 'sec.keywordVisibilityEmpty'))}</p>`);
  const table = `<table><thead><tr><th>${escapeHtml(rt(lang, 'th.keyword'))}</th><th>${escapeHtml(rt(lang, 'th.avgPosition'))}</th><th>${escapeHtml(rt(lang, 'th.clicks'))}</th><th>${escapeHtml(rt(lang, 'th.impressions'))}</th><th>${escapeHtml(rt(lang, 'th.ctr'))}</th><th>${escapeHtml(rt(lang, 'th.change'))}</th></tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.keyword)}</td><td class="num">${row.position === null ? '—' : row.position}</td><td class="num">${row.clicks}</td><td class="num">${row.impressions}</td><td class="num">${percentOf(row.ctr)}</td><td class="num ${row.delta === null ? '' : row.delta < 0 ? 'improved' : 'declined'}">${row.delta === null ? '—' : (row.delta > 0 ? '+' : '') + row.delta}</td></tr>`,
    )
    .join('')}</tbody></table>`;
  return section(rt(lang, 'sec.keywordVisibility'), table, rt(lang, 'notice.gsc'));
}

export function sCannibalization(data: ReportData): string {
  const lang = data.lang;
  const rows = data.cannibalization;
  if (rows.length === 0) return section(rt(lang, 'sec.cannibalization'), `<p class="empty">${escapeHtml(rt(lang, 'sec.cannibalizationEmpty'))}</p>`);
  const table = `<table><thead><tr><th>${escapeHtml(rt(lang, 'th.queries'))}</th><th>${escapeHtml(rt(lang, 'th.pages'))}</th><th>${escapeHtml(rt(lang, 'th.severity'))}</th></tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.query)}</td><td>${row.pages.map((page) => escapeHtml(page)).join('<br/>')}</td><td>${sevTag(lang, row.severity)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
  return section(rt(lang, 'sec.cannibalization'), table);
}

export function sInternalLinking(data: ReportData): string {
  const lang = data.lang;
  const links = data.internalLinks;
  if (!links.stats && links.pending === 0 && links.applied === 0) {
    return section(rt(lang, 'sec.internalLinking'), `<p class="empty">${escapeHtml(rt(lang, 'sec.internalLinkingEmpty'))}</p>`);
  }
  const stats = links.stats
    ? [
        { label: rt(lang, 'il.pagesCrawled'), value: String(links.stats.pagesCrawled) },
        { label: rt(lang, 'il.orphanPages'), value: String(links.stats.orphanPages) },
        { label: rt(lang, 'il.weakTargets'), value: String(links.stats.weakTargets) },
        { label: rt(lang, 'il.brokenLinks'), value: String(links.stats.brokenLinks) },
        { label: rt(lang, 'il.opportunities'), value: String(links.stats.opportunities) },
        { label: rt(lang, 'il.approvedTargets'), value: String(links.stats.approvedTargets) },
      ]
    : [];
  const workflow = [
    { label: rt(lang, 'il.pending'), value: String(links.pending) },
    { label: rt(lang, 'il.applied'), value: String(links.applied) },
    { label: rt(lang, 'il.verified'), value: String(links.verified) },
  ];
  return section(rt(lang, 'sec.internalLinking'), `${kpiGrid([...stats, ...workflow])}`);
}

export function sAeoGaps(data: ReportData): string {
  return section(rt(data.lang, 'sec.aeoGaps'), bulletList(data.lang, data.aeoGaps, 'sec.aeoGapsEmpty'));
}

export function sGeoGaps(data: ReportData): string {
  return section(rt(data.lang, 'sec.geoGaps'), bulletList(data.lang, data.geoGaps, 'sec.geoGapsEmpty'));
}

export function sCriticalProblems(data: ReportData): string {
  const lang = data.lang;
  if (data.criticalProblems.length === 0) return section(rt(lang, 'sec.criticalProblems'), `<p class="empty">${escapeHtml(rt(lang, 'sec.criticalEmpty'))}</p>`);
  return section(rt(lang, 'sec.criticalProblems'), findingsTable(lang, data.criticalProblems));
}

export function sHighPriorityProblems(data: ReportData): string {
  const lang = data.lang;
  if (data.highPriorityProblems.length === 0) return section(rt(lang, 'sec.highPriorityProblems'), `<p class="empty">${escapeHtml(rt(lang, 'sec.highEmpty'))}</p>`);
  return section(rt(lang, 'sec.highPriorityProblems'), findingsTable(lang, data.highPriorityProblems));
}

export function sQuickWinsList(data: ReportData): string {
  return section(rt(data.lang, 'sec.quickWins'), bulletList(data.lang, data.quickWins, 'sec.quickWinsEmpty'));
}

export function sContentOpportunities(data: ReportData): string {
  const lang = data.lang;
  const rows = data.contentOpportunities;
  if (rows.length === 0) return section(rt(lang, 'sec.contentOpportunities'), `<p class="empty">${escapeHtml(rt(lang, 'sec.contentOpportunitiesEmpty'))}</p>`);
  const table = `<table><thead><tr><th>${escapeHtml(rt(lang, 'th.keyword'))}</th><th>${escapeHtml(rt(lang, 'th.action'))}</th><th>${escapeHtml(rt(lang, 'th.details'))}</th></tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.cluster)}</td><td>${escapeHtml(row.action)}</td><td>${escapeHtml(row.note)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
  return section(rt(lang, 'sec.contentOpportunities'), table);
}

export function sPriorityMatrix(data: ReportData): string {
  const lang = data.lang;
  const quadrants = data.matrix.filter((quadrant) => quadrant.items.length > 0);
  if (quadrants.length === 0) return section(rt(lang, 'sec.priorityMatrix'), `<p class="empty">${escapeHtml(rt(lang, 'sec.priorityMatrixEmpty'))}</p>`);
  const blocks = quadrants
    .map(
      (quadrant) =>
        `<div class="card" style="margin-bottom:10px"><h3 style="margin:0 0 8px;font-size:.95rem">${escapeHtml(rt(lang, `pm.${quadrant.key}`))}</h3>${bulletList(lang, quadrant.items, 'empty.noFindings')}</div>`,
    )
    .join('');
  return section(rt(lang, 'sec.priorityMatrix'), blocks);
}

export function sPlans(data: ReportData): string {
  const lang = data.lang;
  return data.plans
    .map(
      (plan) =>
        section(
          rt(lang, `sec.${plan.key}`),
          `<p class="meta" style="margin-top:-4px">${escapeHtml(rt(lang, plan.intro))}</p>${bulletList(lang, plan.items, 'empty.noFindings')}`,
        ),
    )
    .join('\n');
}

// ---------------------------------------------------------------------------
// Monthly report sections
// ---------------------------------------------------------------------------

export function sCurrentVsPrevious(data: ReportData): string {
  return section(rt(data.lang, 'sec.currentVsPrevious'), metricTable(data.performance, data.lang), rt(data.lang, 'notice.correlation'));
}

export function sCurrentVsBaseline(data: ReportData): string {
  const lang = data.lang;
  if (!data.hasBaseline) {
    return section(rt(lang, 'sec.currentVsBaseline'), `<p class="empty">${escapeHtml(rt(lang, 'sec.visibilityBaselineEmpty'))}</p>`);
  }
  return section(rt(lang, 'sec.currentVsBaseline'), `${metricTable(data.sinceBaseline, lang)}<p class="notice">${escapeHtml(rt(lang, 'notice.immutable'))}</p>`);
}

export function sSeoProgress(data: ReportData): string {
  const rows = data.focusMetrics.filter((row) => ['onPageHealth', 'keywordVisibility', 'internalLinkHealth', 'gscMetrics'].includes(row.key));
  return section(rt(data.lang, 'sec.seoProgress'), rows.length > 0 ? metricTable(rows, data.lang) : `<p class="empty">${escapeHtml(rt(data.lang, 'empty.noComparable'))}</p>`, rt(data.lang, 'notice.aeo'));
}

export function sAeoProgress(data: ReportData): string {
  const lang = data.lang;
  const rows = data.focusMetrics.filter((row) => ['aeoReadiness', 'contentHealth'].includes(row.key));
  const deltas = data.visibility?.totalObservations
    ? `<p class="meta">${escapeHtml(rt(lang, 'vis.totalObservations'))}: ${data.visibility.totalObservations} · ${escapeHtml(rt(lang, 'notice.visibility'))}</p>`
    : '';
  return section(rt(lang, 'sec.aeoProgress'), `${rows.length > 0 ? metricTable(rows, lang) : ''}${deltas || `<p class="empty">${escapeHtml(rt(lang, 'empty.noComparable'))}</p>`}`, rt(lang, 'notice.aeo'));
}

export function sGeoProgress(data: ReportData): string {
  const lang = data.lang;
  const rows = data.focusMetrics.filter((row) => ['geoReadiness', 'aeoReadiness'].includes(row.key));
  const vis = visibilityRates(data.visibility);
  const visHtml = vis.length > 0 ? kpiGrid(vis.map((v) => ({ label: rt(lang, v.labelKey), value: v.value }))) : '';
  return section(rt(lang, 'sec.geoProgress'), `${rows.length > 0 ? metricTable(rows, lang) : ''}${visHtml || ''}`, rt(lang, 'notice.geo'));
}

export function sOrganicPerformance(data: ReportData): string {
  const lang = data.lang;
  const organic = data.organic;
  if (!organic.hasGsc) return section(rt(lang, 'sec.organicPerformance'), `<p class="empty">${escapeHtml(rt(lang, 'empty.noComparable'))}</p>`, rt(lang, 'notice.gsc'));
  const delta = (current: number | null, previous: number | null): { value: string; direction?: string } => {
    if (current === null || previous === null || previous === 0) return { value: current === null ? '—' : String(current) };
    const pct = ((current - previous) / previous) * 100;
    return { value: `${current} (${pct > 0 ? '+' : ''}${Math.round(pct)}%)`, direction: pct > 0 ? 'improved' : pct < 0 ? 'declined' : 'flat' };
  };
  const kpis = [
    { label: rt(lang, 'th.clicks'), ...delta(organic.clicks, organic.previous.clicks) },
    { label: rt(lang, 'th.impressions'), ...delta(organic.impressions, organic.previous.impressions) },
    { label: rt(lang, 'th.ctr'), ...delta(round2(organic.ctr * 100), round2(organic.previous.ctr * 100)) },
    { label: rt(lang, 'th.avgPosition'), ...delta(organic.avgPosition, organic.previous.avgPosition) },
  ];
  return section(rt(lang, 'sec.organicPerformance'), `${kpiGrid(kpis)}<p class="notice">${escapeHtml(rt(lang, 'notice.gsc'))}</p>`);
}

export function sKeywordImprovements(data: ReportData): string {
  const lang = data.lang;
  const rows = data.keywordMoves;
  if (rows.length === 0) return section(rt(lang, 'sec.keywordImprovements'), `<p class="empty">${escapeHtml(rt(lang, 'sec.keywordImprovementsEmpty'))}</p>`);
  const table = `<table><thead><tr><th>${escapeHtml(rt(lang, 'th.keyword'))}</th><th>${escapeHtml(rt(lang, 'th.before'))}</th><th>${escapeHtml(rt(lang, 'th.after'))}</th><th>${escapeHtml(rt(lang, 'th.change'))}</th><th>${escapeHtml(rt(lang, 'th.clicks'))}</th></tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.keyword)}</td><td class="num">${row.before === null ? '—' : row.before}</td><td class="num">${row.after === null ? '—' : row.after}</td><td class="num ${row.delta === null ? '' : row.delta < 0 ? 'improved' : row.delta > 0 ? 'declined' : ''}">${row.delta === null ? '—' : (row.delta > 0 ? '+' : '') + row.delta}</td><td class="num">${row.clicksAfter}</td></tr>`,
    )
    .join('')}</tbody></table>`;
  return section(rt(lang, 'sec.keywordImprovements'), table, rt(lang, 'notice.gsc'));
}

export function sPageImprovements(data: ReportData): string {
  const lang = data.lang;
  const rows = data.pageMoves;
  if (rows.length === 0) return section(rt(lang, 'sec.pageImprovements'), `<p class="empty">${escapeHtml(rt(lang, 'sec.pageImprovementsEmpty'))}</p>`);
  const table = `<table><thead><tr><th>${escapeHtml(rt(lang, 'th.page'))}</th><th>${escapeHtml(rt(lang, 'th.clicks'))} (${escapeHtml(rt(lang, 'th.before'))})</th><th>${escapeHtml(rt(lang, 'th.clicks'))} (${escapeHtml(rt(lang, 'th.after'))})</th><th>${escapeHtml(rt(lang, 'th.avgPosition'))}</th></tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.page)}</td><td class="num">${row.clicksBefore}</td><td class="num">${row.clicksAfter}</td><td class="num">${row.positionAfter === null ? '—' : row.positionAfter}</td></tr>`,
    )
    .join('')}</tbody></table>`;
  return section(rt(lang, 'sec.pageImprovements'), table, rt(lang, 'notice.gsc'));
}

export function sCompletedWork(data: ReportData): string {
  return section(rt(data.lang, 'sec.completedWork'), workTable(data.workCompleted, data.lang), rt(data.lang, 'notice.work'));
}

export function sIssuesResolvedDetailed(data: ReportData): string {
  const lang = data.lang;
  const progression = data.issueProgression
    ? `<p class="meta">${escapeHtml(rt(lang, 'th.details'))}: ${data.issueProgression.initial} ${escapeHtml(rt(lang, 'iss.DETECTED'))} · ${data.issueProgression.new} ${escapeHtml(rt(lang, 'iss.DETECTED'))} · ${data.issueProgression.resolved} ${escapeHtml(rt(lang, 'iss.RESOLVED'))} · ${data.issueProgression.remaining} ${escapeHtml(rt(lang, 'iss.IN_PROGRESS'))}</p>`
    : '';
  if (data.issuesResolvedList.length === 0) {
    return section(rt(lang, 'sec.issuesResolved'), `${progression}<p class="empty">${escapeHtml(rt(lang, 'empty.noIssues'))}</p>`);
  }
  return section(rt(lang, 'sec.issuesResolved'), `${progression}${findingsTable(lang, data.issuesResolvedList)}`);
}

export function sOutstandingIssues(data: ReportData): string {
  const lang = data.lang;
  if (data.outstandingList.length === 0) return section(rt(lang, 'sec.outstandingIssues'), `<p class="empty">${escapeHtml(rt(lang, 'sec.outstandingEmpty'))}</p>`);
  return section(rt(lang, 'sec.outstandingIssues'), findingsTable(lang, data.outstandingList));
}

export function sContentPublished(data: ReportData): string {
  const lang = data.lang;
  const rows = data.contentPublishedList;
  if (rows.length === 0) return section(rt(lang, 'sec.contentPublished'), `<p class="empty">${escapeHtml(rt(lang, 'sec.contentPublishedEmpty'))}</p>`);
  const table = `<table><thead><tr><th>${escapeHtml(rt(lang, 'th.title'))}</th><th>${escapeHtml(rt(lang, 'th.url'))}</th><th>${escapeHtml(rt(lang, 'th.date'))}</th></tr></thead><tbody>${rows
    .map((row) => `<tr><td>${escapeHtml(row.title)}</td><td>${row.url ? escapeHtml(row.url) : '—'}</td><td class="num">${escapeHtml(row.publishedAt)}</td></tr>`)
    .join('')}</tbody></table>`;
  return section(rt(lang, 'sec.contentPublished'), table);
}

export function sRecommendationsList(data: ReportData): string {
  const lang = data.lang;
  const rows = data.recommendationsList;
  if (rows.length === 0) return section(rt(lang, 'sec.recommendations'), `<p class="empty">${escapeHtml(rt(lang, 'sec.recommendationsEmpty'))}</p>`);
  const table = `<table><thead><tr><th>${escapeHtml(rt(lang, 'th.priority'))}</th><th>${escapeHtml(rt(lang, 'th.title'))}</th><th>${escapeHtml(rt(lang, 'th.impact'))}</th><th>${escapeHtml(rt(lang, 'th.confidence'))}</th><th>${escapeHtml(rt(lang, 'th.effort'))}</th><th>${escapeHtml(rt(lang, 'th.recommended'))}</th></tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr><td>${sevTag(lang, row.priority)}</td><td>${escapeHtml(row.title)}</td><td class="num">${row.impact}</td><td class="num">${row.confidence}</td><td class="num">${row.effort}</td><td>${escapeHtml(row.suggestedAction || '—')}</td></tr>`,
    )
    .join('')}</tbody></table>`;
  return section(rt(lang, 'sec.recommendations'), table);
}

export function sNextPriorities(data: ReportData): string {
  return section(rt(data.lang, 'sec.nextPriorities'), bulletList(data.lang, data.nextPriorities, 'sec.nextPrioritiesEmpty'));
}

// ---------------------------------------------------------------------------
// Legacy / focused sections (used by focused report types) — bilingualized
// ---------------------------------------------------------------------------

export function sBaseline(data: ReportData): string {
  const lang = data.lang;
  if (!data.hasBaseline) {
    return section(rt(lang, 'sec.visibilityBaseline'), `<p class="empty">${escapeHtml(rt(lang, 'sec.visibilityBaselineEmpty'))}</p>`);
  }
  return section(rt(lang, 'sec.visibilityBaseline'), `${metricTable(data.sinceBaseline, lang)}<p class="notice">${escapeHtml(rt(lang, 'notice.immutable'))}</p>`);
}

export function sPerformance(data: ReportData): string {
  return section(rt(data.lang, 'sec.currentVsPrevious'), `${metricTable(data.performance, data.lang)}<p class="notice">${escapeHtml(rt(data.lang, 'notice.correlation'))}</p>`);
}

export function sSinceBaseline(data: ReportData): string {
  const lang = data.lang;
  if (!data.hasBaseline) {
    return section(rt(lang, 'sec.currentVsBaseline'), `<p class="empty">${escapeHtml(rt(lang, 'sec.visibilityBaselineEmpty'))}</p>`);
  }
  return section(rt(lang, 'sec.currentVsBaseline'), metricTable(data.sinceBaseline, lang));
}

export function sSeo(data: ReportData): string {
  const rows = data.focusMetrics.filter((row) => ['onPageHealth', 'keywordVisibility', 'internalLinkHealth', 'gscMetrics'].includes(row.key));
  return section(rt(data.lang, 'title.seo'), rows.length > 0 ? metricTable(rows, data.lang) : `<p class="empty">${escapeHtml(rt(data.lang, 'empty.noComparable'))}</p>`, rt(data.lang, 'notice.aeo'));
}

export function sAeo(data: ReportData): string {
  const lang = data.lang;
  const rows = data.focusMetrics.filter((row) => ['aeoReadiness', 'contentHealth'].includes(row.key));
  const vis = visibilityRates(data.visibility);
  const visHtml = vis.length > 0 ? kpiGrid(vis.map((v) => ({ label: rt(lang, v.labelKey), value: v.value }))) : '';
  return section(rt(lang, 'title.aeo'), `${rows.length > 0 ? metricTable(rows, lang) : ''}${visHtml || `<p class="empty">${escapeHtml(rt(lang, 'empty.noComparable'))}</p>`}`, rt(lang, 'notice.aeo'));
}

export function sGeo(data: ReportData): string {
  const lang = data.lang;
  const rows = data.focusMetrics.filter((row) => ['geoReadiness', 'aeoReadiness'].includes(row.key));
  const vis = visibilityRates(data.visibility);
  const visHtml = vis.length > 0 ? kpiGrid(vis.slice(1, 4).map((v) => ({ label: rt(lang, v.labelKey), value: v.value }))) : '';
  return section(rt(lang, 'title.geo'), `${rows.length > 0 ? metricTable(rows, lang) : ''}${visHtml || `<p class="empty">${escapeHtml(rt(lang, 'empty.noComparable'))}</p>`}`, rt(lang, 'notice.geo'));
}

export function sTechnical(data: ReportData): string {
  const lang = data.lang;
  const rows = data.focusMetrics.filter((row) => ['crawlHealth', 'technicalIssues'].includes(row.key));
  return section(rt(lang, 'title.technical'), rows.length > 0 ? metricTable(rows, lang) : `<p class="empty">${escapeHtml(rt(lang, 'empty.noComparable'))}</p>`);
}

export function sContent(data: ReportData): string {
  const lang = data.lang;
  const stats = data.contentStats;
  const packages = stats.packages > 0
    ? `<p>${escapeHtml(rt(lang, 'cq.packages'))}: <strong>${stats.packages}</strong> (${stats.completed} ${escapeHtml(rt(lang, 'cq.published'))}).</p>`
    : `<p class="empty">${escapeHtml(rt(lang, 'cq.none'))}</p>`;
  return section(rt(lang, 'title.content'), packages);
}

export function sContentWork(data: ReportData): string {
  const items = data.workCompleted.filter((item) => ['content', 'page_created', 'page_removed', 'title', 'meta', 'headings', 'rank_math'].includes(item.kind));
  return section(rt(data.lang, 'sec.completedWork'), workTable(items, data.lang));
}

export function sIssues(data: ReportData): string {
  const lang = data.lang;
  const counts = data.issueCounts;
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const grid = total > 0
    ? kpiGrid(Object.entries(counts).map(([status, count]) => ({ label: rt(lang, `iss.${status}`), value: String(count) })))
    : `<p class="empty">${escapeHtml(rt(lang, 'empty.noIssues'))}</p>`;
  const progression = data.issueProgression
    ? `<p>${data.issueProgression.initial} ${escapeHtml(rt(lang, 'iss.DETECTED'))} &middot; ${data.issueProgression.new} ${escapeHtml(rt(lang, 'iss.DETECTED'))} &middot; ${data.issueProgression.resolved} ${escapeHtml(rt(lang, 'iss.RESOLVED'))} &middot; ${data.issueProgression.remaining} ${escapeHtml(rt(lang, 'iss.IN_PROGRESS'))} &middot; ${data.issueProgression.regressed} ${escapeHtml(rt(lang, 'dir.declined'))}.</p>`
    : '';
  return section(rt(lang, 'title.issues'), `${grid}${progression}`);
}

export function sIssuesResolved(data: ReportData): string {
  const lang = data.lang;
  const count = data.issueProgression?.resolved ?? 0;
  return section(rt(lang, 'sec.issuesResolved'), `<p><strong>${count}</strong> ${escapeHtml(rt(lang, 'iss.RESOLVED'))}.</p>${count === 0 ? `<p class="empty">${escapeHtml(rt(lang, 'empty.noIssues'))}</p>` : ''}`);
}

export function sNewIssues(data: ReportData): string {
  const lang = data.lang;
  const count = data.issueProgression?.new ?? 0;
  return section(rt(lang, 'sec.outstandingIssues'), `<p><strong>${count}</strong> ${escapeHtml(rt(lang, 'iss.DETECTED'))}.</p>${count === 0 ? `<p class="empty">${escapeHtml(rt(lang, 'empty.noIssues'))}</p>` : ''}`);
}

export function sSearchPerformance(data: ReportData): string {
  const lang = data.lang;
  const rows = data.performance.filter((row) => ['gscMetrics', 'keywordVisibility'].includes(row.key));
  return section(rt(lang, 'sec.organicPerformance'), rows.length > 0 ? metricTable(rows, lang) : `<p class="empty">${escapeHtml(rt(lang, 'empty.noComparable'))}</p>`, rt(lang, 'notice.gsc'));
}

export function sQuickWins(data: ReportData): string {
  const items = data.quickWins.length > 0 ? data.quickWins : [];
  return section(rt(data.lang, 'sec.quickWins'), bulletList(data.lang, items, 'sec.quickWinsEmpty'));
}

export function sOpportunities(data: ReportData): string {
  const lang = data.lang;
  const rows = data.keywordOpportunities;
  if (rows.length === 0) return section(rt(lang, 'sec.contentOpportunities'), `<p class="empty">${escapeHtml(rt(lang, 'sec.contentOpportunitiesEmpty'))}</p>`);
  return section(rt(lang, 'sec.contentOpportunities'), `<table><thead><tr><th>${escapeHtml(rt(lang, 'th.keyword'))}</th><th>${escapeHtml(rt(lang, 'th.avgPosition'))}</th><th>${escapeHtml(rt(lang, 'th.details'))}</th></tr></thead><tbody>${rows
    .map((row) => `<tr><td>${escapeHtml(row.keyword)}</td><td class="num">${row.position === null ? '—' : row.position}</td><td>${escapeHtml(row.note)}</td></tr>`)
    .join('')}</tbody></table>`);
}

export function sPlan(_data: ReportData): string {
  return section('30/60/90 Day Plan', bulletList('en', [
    'Days 0-30: fix critical technical issues, approve and apply high-confidence link suggestions.',
    'Days 31-60: generate content for approved clusters; run AI visibility observations.',
    'Days 61-90: expand keyword opportunities, monitor progress vs baseline.',
  ]));
}

export function sWorkCompleted(data: ReportData): string {
  return section(rt(data.lang, 'sec.completedWork'), workTable(data.workCompleted, data.lang), rt(data.lang, 'notice.work'));
}

export function sKeywordOpportunities(data: ReportData): string {
  const lang = data.lang;
  const rows = data.keywordOpportunities;
  if (rows.length === 0) return section(rt(lang, 'sec.contentOpportunities'), `<p class="empty">${escapeHtml(rt(lang, 'sec.contentOpportunitiesEmpty'))}</p>`);
  const table = `<table><thead><tr><th>${escapeHtml(rt(lang, 'th.keyword'))}</th><th>${escapeHtml(rt(lang, 'th.avgPosition'))}</th><th>${escapeHtml(rt(lang, 'th.details'))}</th></tr></thead><tbody>${rows
    .map((row) => `<tr><td>${escapeHtml(row.keyword)}</td><td class="num">${row.position === null ? '—' : row.position}</td><td>${escapeHtml(row.note)}</td></tr>`)
    .join('')}</tbody></table>`;
  return section(rt(lang, 'sec.contentOpportunities'), table);
}

export function sWins(data: ReportData): string {
  return section(rt(data.lang, 'sec.quickWins'), bulletList(data.lang, data.wins, 'empty.noWork'));
}

export function sRisks(data: ReportData): string {
  return section(rt(data.lang, 'sec.nextPriorities'), bulletList(data.lang, data.risks, 'sec.nextPrioritiesEmpty'));
}

export function sNextActions(data: ReportData): string {
  return section(rt(data.lang, 'sec.nextPriorities'), bulletList(data.lang, data.nextActions, 'sec.nextPrioritiesEmpty'));
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function percentOf(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatNumber(value: number): string {
  return value >= 1000 ? `${(Math.round((value / 1000) * 10) / 10).toLocaleString()}k` : String(value);
}

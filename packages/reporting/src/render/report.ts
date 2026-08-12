import type { ReportType } from '@creative-seo/types';
import type { ReportData } from '../data';
import { CORRELATION_DISCLAIMER } from '../data';
import { layout } from './layout';
import {
  sAeo,
  sBaseline,
  sContent,
  sContentWork,
  sExecutiveSummary,
  sGeo,
  sIssues,
  sIssuesResolved,
  sKeywordOpportunities,
  sNewIssues,
  sNextActions,
  sOpportunities,
  sPerformance,
  sPlan,
  sQuickWins,
  sRisks,
  sSearchPerformance,
  sSeo,
  sSinceBaseline,
  sTechnical,
  sWins,
  sWorkCompleted,
} from './sections';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  INITIAL: 'Initial Search & AI Visibility Audit',
  MONTHLY: 'Monthly Progress',
  EXECUTIVE: 'Executive Report',
  SEO: 'SEO Report',
  AEO: 'AEO Report',
  GEO: 'GEO Report',
  TECHNICAL: 'Technical Report',
  CONTENT: 'Content Report',
  ISSUES: 'Issues Report',
  WORK_COMPLETED: 'Work Completed Report',
};

type SectionFn = (data: ReportData) => string;

const INITIAL_SECTIONS: SectionFn[] = [
  sExecutiveSummary,
  sBaseline,
  sSeo,
  sAeo,
  sGeo,
  sTechnical,
  sContent,
  sSearchPerformance,
  sIssues,
  sQuickWins,
  sOpportunities,
  sPlan,
];

const MONTHLY_SECTIONS: SectionFn[] = [
  sExecutiveSummary,
  sPerformance,
  sSinceBaseline,
  sWorkCompleted,
  sIssuesResolved,
  sNewIssues,
  sContentWork,
  sKeywordOpportunities,
  sSeo,
  sAeo,
  sGeo,
  sWins,
  sRisks,
  sNextActions,
];

const FOCUSED_SECTIONS: Partial<Record<ReportType, SectionFn[]>> = {
  EXECUTIVE: [sExecutiveSummary],
  SEO: [sSeo],
  AEO: [sAeo],
  GEO: [sGeo],
  TECHNICAL: [sTechnical],
  CONTENT: [sContent, sContentWork],
  ISSUES: [sIssues],
  WORK_COMPLETED: [sWorkCompleted],
};

export function reportTitle(type: ReportType, data: ReportData): string {
  return `${data.branding.clientName} — ${REPORT_TYPE_LABELS[type]} — ${data.period.label}`;
}

/**
 * Renders a full, self-contained responsive HTML report for a type.
 * The correlation-only disclaimer always precedes the body, and work completed
 * is always rendered as a distinct section from performance outcome.
 */
export function renderReport(type: ReportType, data: ReportData): string {
  const sections: SectionFn[] =
    type === 'INITIAL' ? INITIAL_SECTIONS : type === 'MONTHLY' ? MONTHLY_SECTIONS : FOCUSED_SECTIONS[type] ?? [sExecutiveSummary];

  const disclaimer = `<div class="disc">${escapeHtml(CORRELATION_DISCLAIMER)}</div>`;
  const body = `${disclaimer}${sections.map((sectionFn) => sectionFn(data)).join('\n')}`;
  return layout(reportTitle(type, data), data, body);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

import type { ReportData } from '../data';
import { renderReport } from './report';

function sampleData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    lang: 'en',
    branding: {
      agencyName: 'Agency Co',
      agencyLogoUrl: 'https://agency.co/logo.png',
      clientName: 'Client Ltd',
      clientLogoUrl: '',
      contactDetails: { email: 'hello@agency.co' },
      footer: 'Confidential',
    },
    period: { start: '2026-08-01', end: '2026-08-31', label: '2026-08-01 to 2026-08-31' },
    generatedAt: '2026-09-01T00:00:00.000Z',
    disclaimer: 'correlation only',
    hasData: true,
    hasBaseline: true,
    performance: [
      { key: 'gscMetrics', label: 'GSC clicks', previous: '1000', current: '1200', delta: '+20.0%', direction: 'improved' },
      { key: 'keywordVisibility', label: 'Keyword visibility', previous: '30', current: '28', delta: '−6.7%', direction: 'declined' },
    ],
    sinceBaseline: [
      { key: 'onPageHealth', label: 'On-page health', previous: '70', current: '80', delta: '+14.3%', direction: 'improved' },
    ],
    focusMetrics: [
      { key: 'onPageHealth', label: 'On-page health', previous: '70', current: '80', delta: '+14.3%', direction: 'improved' },
      { key: 'aeoReadiness', label: 'AEO readiness', previous: '50', current: '60', delta: '+20.0%', direction: 'improved' },
      { key: 'geoReadiness', label: 'GEO readiness', previous: '45', current: '55', delta: '+22.2%', direction: 'improved' },
      { key: 'crawlHealth', label: 'Crawl health', previous: '80', current: '90', delta: '+12.5%', direction: 'improved' },
      { key: 'technicalIssues', label: 'Technical issues', previous: '5', current: '2', delta: '−60.0%', direction: 'improved' },
    ],
    issueProgression: { initial: 10, new: 2, resolved: 3, remaining: 7, regressed: 0, totalOpen: 9 },
    issueCounts: { DETECTED: 2, IN_PROGRESS: 5, RESOLVED: 3 },
    workCompleted: [
      { kind: 'content', pageUrl: '/guide', label: 'Updated meta on /guide', changedAt: '2026-08-05' },
      { kind: 'internal_links', pageUrl: '/home', label: 'Internal link "seo tools" -> /seo-tools', changedAt: '2026-08-12' },
    ],
    contentStats: { packages: 3, completed: 2 },
    visibility: {
      brandMentionRate: 0.4,
      citationRate: 0.3,
      sourceCoverage: 0.5,
      competitorInclusion: 0.6,
      shareOfVoice: { brand: 0.5, competitors: 0.6 },
      totalObservations: 7,
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      isControlledObservation: true,
      label: 'Controlled observation',
    },
    keywordOpportunities: [{ keyword: 'seo tools', position: 9, note: 'Opportunity' }],
    wins: ['GSC clicks improved +20.0% (correlation only).'],
    risks: ['Keyword visibility declined −6.7% (correlation only).'],
    nextActions: ['Review pending link suggestions.', 'Continue visibility observations.'],
    site: null,
    health: { seo: [], aeo: [], geo: [] },
    visibilityBaseline: [],
    technicalFindings: [],
    onPageFindings: [],
    contentQuality: { packages: 0, published: 0, drafts: 0, avg: { seo: null, aeo: null, geo: null, rankMath: null } },
    rankMath: null,
    keywordVisibility: [],
    cannibalization: [],
    internalLinks: { stats: null, pending: 0, applied: 0, verified: 0 },
    aeoGaps: [],
    geoGaps: [],
    criticalProblems: [],
    highPriorityProblems: [],
    quickWins: [],
    contentOpportunities: [],
    matrix: [],
    plans: [
      { key: 'plan30', intro: 'plan30.intro', items: ['Fix critical issues'] },
      { key: 'plan60', intro: 'plan60.intro', items: ['Implement recommendations'] },
      { key: 'plan90', intro: 'plan90.intro', items: ['Grow visibility'] },
    ],
    organic: { hasGsc: false, clicks: 0, impressions: 0, ctr: 0, avgPosition: null, previous: { clicks: 0, impressions: 0, ctr: 0, avgPosition: null } },
    keywordMoves: [],
    pageMoves: [],
    issuesResolvedList: [],
    outstandingList: [],
    contentPublishedList: [],
    recommendationsList: [],
    nextPriorities: [],
    ...overrides,
  };
}

describe('renderReport', () => {
  it('renders all required INITIAL report sections', () => {
    const html = renderReport('INITIAL', sampleData());
    const expected = [
      'Executive Summary',
      'SEO Health',
      'AEO Readiness',
      'GEO Readiness',
      'Search Visibility Baseline',
      'Technical Findings',
      'On-Page Findings',
      'Content Quality',
      'Rank Math Analysis',
      'Keyword Visibility',
      'Cannibalization',
      'Internal Linking',
      'AEO Gaps',
      'GEO Gaps',
      'Critical Problems',
      'High Priority Problems',
      'Quick Wins',
      'Content Opportunities',
      'Priority Matrix',
      '30-Day Plan',
      '60-Day Plan',
      '90-Day Plan',
    ];
    for (const section of expected) {
      expect(html).toContain(section);
    }
  });

  it('renders all required MONTHLY report sections', () => {
    const html = renderReport('MONTHLY', sampleData());
    const expected = [
      'Executive Summary',
      'Current vs Previous Month',
      'Current vs Project Baseline',
      'SEO Progress',
      'AEO Progress',
      'GEO Progress',
      'Organic Performance',
      'Keyword Improvements',
      'Page Improvements',
      'Completed Work',
      'Issues Resolved',
      'Outstanding Issues',
      'Content Published',
      'Recommendations',
      'Priorities for Next Period',
    ];
    for (const section of expected) {
      expect(html).toContain(section);
    }
  });

  it('renders all required EXECUTIVE report sections', () => {
    const html = renderReport('EXECUTIVE', sampleData());
    const expected = ['Executive Summary', 'Current vs Previous Month', 'Organic Performance', 'Completed Work', 'Outstanding Issues', 'Priorities for Next Period'];
    for (const section of expected) {
      expect(html).toContain(section);
    }
  });

  it('keeps WORK COMPLETED separate from PERFORMANCE OUTCOME', () => {
    const html = renderReport('MONTHLY', sampleData());
    const workIndex = html.indexOf('<h2 class="sec">Completed Work</h2>');
    const perfIndex = html.indexOf('<h2 class="sec">Organic Performance</h2>');
    expect(workIndex).toBeGreaterThan(-1);
    expect(perfIndex).toBeGreaterThan(-1);
    expect(workIndex).not.toBe(perfIndex);
    // The Work Completed section states it is separate from performance outcome.
    expect(html).toContain('separate from performance outcome');
  });

  it('never claims causation — always includes the correlation disclaimer', () => {
    const html = renderReport('INITIAL', sampleData());
    expect(html).toContain('correlations only');
    expect(html).toContain('does not claim causation');
  });

  it('includes white-label branding (agency, client, footer, contact)', () => {
    const html = renderReport('SEO', sampleData());
    expect(html).toContain('Agency Co');
    expect(html).toContain('Client Ltd');
    expect(html).toContain('hello@agency.co');
    expect(html).toContain('Confidential');
  });

  it('renders Arabic reports right-to-left with bilingual section titles', () => {
    const html = renderReport('INITIAL', sampleData({ lang: 'ar' }));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('الملخص التنفيذي');
    expect(html).toContain('صحة تحسين محركات البحث');
  });

  it('renders empty states gracefully when there is no data', () => {
    const html = renderReport('MONTHLY', sampleData({ hasData: false, performance: [], sinceBaseline: [], workCompleted: [], focusMetrics: [], issueProgression: null, issueCounts: {} }));
    expect(html).toContain('No comparable data yet');
  });
});

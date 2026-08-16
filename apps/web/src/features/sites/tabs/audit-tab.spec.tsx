import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuditOverviewDto, CrawlRunDetailDto, PageInspectionDto } from '@creative-seo/types';
import { AuditTab } from './audit-tab';

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { api } from '@/lib/api';

const apiGet = api.get as jest.Mock;

function overview(overrides: Partial<AuditOverviewDto> = {}): AuditOverviewDto {
  return {
    scores: {
      technicalHealth: 90,
      onPageHealth: 87,
      internalLinkingHealth: 100,
      seoHealth: 92,
      scoreVersion: 1,
      label: 'Internal Platform Health Score',
      coverage: { evaluatedUrls: 1, pagesCrawled: 1 },
    },
    auditRun: {
      id: 'audit-1', siteId: 'site-1', crawlRunId: 'crawl-1', type: 'FULL', status: 'COMPLETED',
      startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), scoreVersion: 1, createdBy: null, createdAt: new Date().toISOString(),
    },
    crawlRun: {
      id: 'crawl-1', siteId: 'site-1', organizationId: null, status: 'COMPLETED',
      startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), seedUrl: 'https://example.com/', userAgent: 'x', maxPages: 50,
      pagesDiscovered: 1, pagesCrawled: 1, pagesFailed: 0, robotsStatus: 'ALLOWED', sitemapStatus: 'NOT_FOUND', renderedPages: 0, sitemapUrls: [], error: null, createdBy: null, createdAt: new Date().toISOString(),
    },
    pagesCrawled: 1,
    pagesIndexable: 1,
    pagesNoindex: 0,
    counts: {
      http4xx: 0, http5xx: 1, redirects: 0, missingTitles: 0, missingMeta: 1, missingH1: 0,
      duplicateTitles: 0, canonicalProblems: 1, brokenInternalLinks: 0, schemaErrors: 0, orphanPages: 0,
    },
    issues: { critical: 0, high: 1, medium: 2, low: 1 },
    sitemap: null,
    measuredAt: new Date().toISOString(),
    ...overrides,
  };
}

const crawlDetail: CrawlRunDetailDto = {
  run: overview().crawlRun!,
  pages: [{
    id: 'page-1', crawlRunId: 'crawl-1', siteId: 'site-1', url: 'https://example.com/', normalizedUrl: 'https://example.com/', finalUrl: null,
    httpStatus: 200, contentType: 'text/html', depth: 0, title: 'Fixture Home', metaDescription: 'meta', h1: 'Fixture Home',
    headings: [{ tag: 'h1', text: 'Fixture Home' }], canonical: null, metaRobots: [], indexable: true, language: 'en', wordCount: 120,
    contentHash: 'abc', rendered: false, schemaJson: [], schemaBlocks: 0, schemaErrors: [], hreflang: [], images: [], redirectChain: ['https://example.com/'], redirectLoop: false, createdAt: new Date().toISOString(),
  }],
  links: [],
  errors: [],
  linkCount: 0,
};

const inspection: PageInspectionDto = {
  url: 'https://example.com/',
  current: crawlDetail.pages[0]!,
  inLinks: [],
  outLinks: [{ id: 'l1', crawlRunId: 'crawl-1', siteId: 'site-1', sourcePageId: 'page-1', sourceUrl: 'https://example.com/', targetUrl: 'https://example.com/about', normalizedTargetUrl: 'example.com/about', anchorText: 'About', rel: null, internal: true, nofollow: false, statusCodeWhenKnown: null, createdAt: new Date().toISOString() }],
  findings: [{ id: 'r1', auditRunId: 'audit-1', siteId: 'site-1', crawlPageId: 'page-1', url: 'https://example.com/', ruleKey: 'CANONICAL_MISSING', ruleVersion: 1, category: 'technical', severity: 'medium', passed: false, evidence: { httpStatus: 200 }, createdAt: new Date().toISOString() }],
  history: [crawlDetail.pages[0]!],
};

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditTab siteId="site-1" />
    </QueryClientProvider>,
  );
}

describe('AuditTab', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the audit overview with health scores and counts', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/audit/summary')) return Promise.resolve(overview());
      if (path.includes('/audit/history')) return Promise.resolve([]);
      if (path.includes('/audit/runs/')) return Promise.resolve({ run: {}, results: [] });
      return Promise.resolve(null);
    });
    renderTab();

    expect(await screen.findByText('Overall Internal Health')).toBeInTheDocument();
    expect(screen.getByText('92')).toBeInTheDocument();
    expect(screen.getByText('Technical Health')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByText('Pages Crawled')).toBeInTheDocument();
    expect(screen.getByText('Indexable URLs')).toBeInTheDocument();
  });

  it('shows a not-measured / empty state when no audit run exists', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/audit/summary')) return Promise.resolve(overview({ scores: null, auditRun: null, crawlRun: null }));
      if (path.includes('/audit/history')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderTab();

    expect(await screen.findByText('Overall Internal Health')).toBeInTheDocument();
    expect(screen.getAllByText('Not measured').length).toBeGreaterThan(0);
    expect(await screen.findByText('No failed audit rules for the latest run.')).toBeInTheDocument();
  });

  it('shows an empty state for a failed crawl (no pages)', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/audit/summary')) return Promise.resolve(overview({ crawlRun: null, pagesCrawled: 0 }));
      if (path.includes('/audit/history')) return Promise.resolve([]);
      if (path.includes('/audit/runs/')) return Promise.resolve({ run: {}, results: [] });
      return Promise.resolve(null);
    });
    renderTab();

    await userEvent.click(await screen.findByRole('tab', { name: 'Pages' }));
    expect(await screen.findByText('Run a crawl to inspect pages.')).toBeInTheDocument();
  });

  it('opens the page inspector with crawl signals and findings', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/audit/summary')) return Promise.resolve(overview());
      if (path.includes('/audit/history')) return Promise.resolve([]);
      if (path.includes('/audit/runs/')) return Promise.resolve({ run: {}, results: [] });
      if (path.includes('/links/crawls/')) return Promise.resolve(crawlDetail);
      if (path.includes('/links/analyses')) return Promise.resolve([]);
      if (path.includes('/audit/pages?')) return Promise.resolve(inspection);
      return Promise.resolve(null);
    });
    renderTab();

    await userEvent.click(await screen.findByRole('tab', { name: 'Pages' }));
    const inspectButton = await screen.findByRole('button', { name: /Inspect/ });
    await userEvent.click(inspectButton);

    expect(await screen.findByText('HTTP status')).toBeInTheDocument();
    expect(screen.getByText('Word count')).toBeInTheDocument();
    expect(screen.getByText('Meta description')).toBeInTheDocument();
    expect(screen.getByText('Redirect chain')).toBeInTheDocument();
    expect(screen.getByText('Internal incoming (0)')).toBeInTheDocument();
    expect(screen.getByText('Crawl history (1)')).toBeInTheDocument();
    // Audit findings for the URL are shown.
    const card = screen.getByText('Audit findings').closest('div')!;
    expect(within(card).getByText('CANONICAL_MISSING')).toBeInTheDocument();
  });
});

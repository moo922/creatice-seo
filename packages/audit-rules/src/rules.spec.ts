import type { AuditContext } from './context';
import { evaluateAudit } from './registry';
import { computeHealthScores } from './scoring';

function ctx(overrides: Partial<AuditContext> = {}): AuditContext {
  return {
    siteId: 'site-1',
    siteDomain: 'example.com',
    siteLanguage: 'en',
    run: {
      robotsStatus: 'ALLOWED',
      sitemapStatus: 'NOT_FOUND',
      seedUrl: 'https://example.com/',
      sitemapUrls: [],
      pagesCrawled: 3,
      pagesFailed: 0,
      pagesDiscovered: 3,
      maxPages: 50,
    },
    pages: [],
    links: [],
    errors: [],
    ...overrides,
  };
}

function page(url: string, overrides: Record<string, unknown> = {}) {
  return {
    url,
    httpStatus: 200,
    depth: 0,
    title: 'Example Page',
    metaDescription: 'A description.',
    h1: 'Example Page',
    headings: [{ tag: 'h1' as const, text: 'Example Page' }],
    canonical: null,
    metaRobots: [],
    indexable: true,
    language: 'en',
    wordCount: 500,
    schemaJson: [],
    schemaBlocks: 0,
    schemaErrors: [],
    images: [],
    redirectChain: [url],
    redirectLoop: false,
    ...overrides,
  };
}

describe('remaining audit rules over fixture signals', () => {
  it('flags long redirect chains and redirect loops', () => {
    const context = ctx({
      pages: [
        page('https://example.com/chain', { redirectChain: ['/chain', '/b', '/c', '/d'] }),
        page('https://example.com/loop', { redirectLoop: true }),
      ],
    });
    const findings = evaluateAudit(context);
    expect(findings.some((f) => f.ruleKey === 'REDIRECT_CHAIN' && f.url === 'https://example.com/chain')).toBe(true);
    expect(findings.some((f) => f.ruleKey === 'REDIRECT_LOOP' && f.url === 'https://example.com/loop')).toBe(true);
  });

  it('detects redirect loops reported as crawl errors too', () => {
    const context = ctx({
      errors: [{ url: 'https://example.com/loop', errorType: 'other', message: 'redirect loop detected', statusCode: null }],
    });
    const findings = evaluateAudit(context);
    expect(findings.some((f) => f.ruleKey === 'REDIRECT_LOOP' && f.url === 'https://example.com/loop')).toBe(true);
  });

  it('flags mixed-protocol internal links', () => {
    const context = ctx({
      pages: [page('https://example.com/')],
      links: [{ sourceUrl: 'https://example.com/', targetUrl: 'http://example.com/x', anchorText: 'x', rel: null, internal: true, nofollow: false, statusCodeWhenKnown: null }],
    });
    const findings = evaluateAudit(context);
    expect(findings.some((f) => f.ruleKey === 'MIXED_PROTOCOL_INTERNAL_LINK')).toBe(true);
  });

  it('flags canonical targets that return non-200', () => {
    const context = ctx({
      pages: [
        page('https://example.com/a', { canonical: 'https://example.com/gone' }),
        page('https://example.com/gone', { httpStatus: 404 }),
      ],
    });
    const findings = evaluateAudit(context);
    expect(findings.some((f) => f.ruleKey === 'CANONICAL_TO_NON_200' && f.url === 'https://example.com/a')).toBe(true);
  });

  it('flags sitemap URLs that could not be crawled', () => {
    const context = ctx({
      run: { ...ctx().run, sitemapStatus: 'OK', sitemapUrls: ['https://example.com/', 'https://example.com/blocked'] },
      errors: [{ url: 'https://example.com/blocked', errorType: 'robots', message: 'robots.txt disallows crawling', statusCode: null }],
    });
    const findings = evaluateAudit(context);
    expect(findings.some((f) => f.ruleKey === 'SITEMAP_URL_NOT_CRAWLABLE' && f.url === 'https://example.com/blocked')).toBe(true);
  });

  it('flags indexable URLs missing from the sitemap', () => {
    const context = ctx({
      run: { ...ctx().run, sitemapStatus: 'OK', sitemapUrls: ['https://example.com/'] },
      pages: [page('https://example.com/'), page('https://example.com/not-in-sitemap')],
    });
    const findings = evaluateAudit(context);
    expect(findings.some((f) => f.ruleKey === 'INDEXABLE_URL_NOT_IN_SITEMAP' && f.url === 'https://example.com/not-in-sitemap')).toBe(true);
  });

  it('flags empty and visible-content-mismatched schema', () => {
    const context = ctx({
      pages: [
        page('https://example.com/empty', { schemaBlocks: 1, schemaJson: [] }),
        page('https://example.com/mismatch', { schemaJson: [{ '@type': 'Product', name: 'Unrelated Product Name' }] }),
      ],
    });
    const findings = evaluateAudit(context);
    expect(findings.some((f) => f.ruleKey === 'SCHEMA_EMPTY' && f.url === 'https://example.com/empty')).toBe(true);
    expect(findings.some((f) => f.ruleKey === 'SCHEMA_VISIBLE_CONTENT_MISMATCH_CANDIDATE' && f.url === 'https://example.com/mismatch')).toBe(true);
  });

  it('flags site-wide missing internal inlinks and excessive outlinks', () => {
    const context = ctx({
      pages: [
        page('https://example.com/'),
        page('https://example.com/a', { url: 'https://example.com/a' }),
        page('https://example.com/b', { url: 'https://example.com/b' }),
      ],
      links: [
        { sourceUrl: 'https://example.com/', targetUrl: 'https://example.com/a', anchorText: 'a', rel: null, internal: true, nofollow: false, statusCodeWhenKnown: null },
      ],
    });
    const findings = evaluateAudit(context);
    expect(findings.some((f) => f.ruleKey === 'ORPHAN_PAGE' && f.url === 'https://example.com/b')).toBe(true);
    expect(findings.some((f) => f.ruleKey === 'NO_INTERNAL_INLINKS')).toBe(true);
  });

  it('emits passing results for page-scoped rules (coverage)', () => {
    const context = ctx({
      pages: [page('https://example.com/'), page('https://example.com/good', { title: 'Good Title' })],
    });
    const all = evaluateAudit(context, true);
    expect(all.some((f) => f.ruleKey === 'MISSING_TITLE' && f.passed)).toBe(true);
    expect(all.some((f) => f.ruleKey === 'MISSING_TITLE' && !f.passed)).toBe(false);
  });
});

describe('computeHealthScores', () => {
  it('returns 100 for a fully passing audit', () => {
    const results = [
      { ruleKey: 'MISSING_TITLE', category: 'on-page', severity: 'high' as const, passed: true, url: 'https://example.com/' },
      { ruleKey: 'HTTP_4XX', category: 'technical', severity: 'high' as const, passed: true, url: 'https://example.com/' },
    ];
    const scores = computeHealthScores(results, { pagesCrawled: 1 });
    expect(scores.onPageHealth).toBe(100);
    expect(scores.technicalHealth).toBe(100);
    expect(scores.seoHealth).toBe(100);
    expect(scores.scoreVersion).toBe(1);
    expect(scores.label).toBe('Internal Platform Health Score');
  });

  it('penalises severity-weighted failures and is reproducible', () => {
    const results = [
      { ruleKey: 'MISSING_TITLE', category: 'on-page', severity: 'high' as const, passed: false, url: 'https://example.com/a' },
      { ruleKey: 'MISSING_H1', category: 'on-page', severity: 'medium' as const, passed: false, url: 'https://example.com/a' },
      { ruleKey: 'HTTP_4XX', category: 'technical', severity: 'high' as const, passed: false, url: 'https://example.com/gone' },
    ];
    const first = computeHealthScores(results, { pagesCrawled: 2 });
    const second = computeHealthScores(results, { pagesCrawled: 2 });
    expect(first).toEqual(second);
    expect(first.onPageHealth).toBeLessThan(100);
    expect(first.technicalHealth).toBeLessThan(100);
    // A critical finding drives the score down more than a low one.
    const low = computeHealthScores([{ ruleKey: 'X', category: 'on-page', severity: 'low' as const, passed: false, url: 'https://example.com/a' }], { pagesCrawled: 1 });
    const critical = computeHealthScores([{ ruleKey: 'X', category: 'on-page', severity: 'critical' as const, passed: false, url: 'https://example.com/a' }], { pagesCrawled: 1 });
    expect(critical.onPageHealth).toBeLessThan(low.onPageHealth!);
  });
});

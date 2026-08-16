import type { AuditContext } from './context';
import { evaluateAudit, ruleDefinitions } from './registry';

function baseContext(overrides: Partial<AuditContext> = {}): AuditContext {
  return {
    siteId: 'site-1',
    siteDomain: 'example.com',
    siteLanguage: 'en',
    run: {
      robotsStatus: 'ALLOWED',
      sitemapStatus: 'NOT_FOUND',
      seedUrl: 'https://example.com/',
      sitemapUrls: [],
      pagesCrawled: 1,
      pagesFailed: 0,
      pagesDiscovered: 1,
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

describe('audit registry', () => {
  it('registers every required rule', () => {
    const definitions = ruleDefinitions();
    const keys = new Set(definitions.map((rule) => rule.key));
    for (const key of [
      'HTTP_4XX',
      'HTTP_5XX',
      'REDIRECT_CHAIN',
      'REDIRECT_LOOP',
      'BROKEN_INTERNAL_LINK',
      'MIXED_PROTOCOL_INTERNAL_LINK',
      'ROBOTS_BLOCKED_PAGE',
      'NOINDEX_PAGE',
      'SITEMAP_URL_NOT_CRAWLABLE',
      'INDEXABLE_URL_NOT_IN_SITEMAP',
      'CANONICAL_MISSING',
      'CANONICAL_INVALID',
      'CANONICAL_CONFLICT',
      'CANONICAL_TO_NON_200',
      'DUPLICATE_CANONICAL_TARGET',
      'MISSING_TITLE',
      'EMPTY_TITLE',
      'DUPLICATE_TITLE',
      'TITLE_TOO_GENERIC',
      'MISSING_META_DESCRIPTION',
      'DUPLICATE_META_DESCRIPTION',
      'MISSING_H1',
      'MULTIPLE_H1',
      'EMPTY_H1',
      'TITLE_H1_MISMATCH_SIGNAL',
      'EMPTY_CONTENT',
      'THIN_CONTENT_SIGNAL',
      'IMAGE_MISSING_ALT',
      'INVALID_LANGUAGE_DECLARATION',
      'INVALID_JSON_LD',
      'SCHEMA_PARSE_ERROR',
      'SCHEMA_EMPTY',
      'SCHEMA_VISIBLE_CONTENT_MISMATCH_CANDIDATE',
      'ORPHAN_PAGE',
      'EXCESSIVE_CRAWL_DEPTH',
      'NO_INTERNAL_INLINKS',
      'TOO_MANY_INTERNAL_OUTLINKS_SIGNAL',
    ]) {
      expect(keys.has(key)).toBe(true);
    }
  });

  it('flags HTTP_4XX / HTTP_5XX from crawl errors', () => {
    const ctx = baseContext({
      errors: [
        { url: 'https://example.com/missing', errorType: 'http', message: 'HTTP 404', statusCode: 404 },
        { url: 'https://example.com/error', errorType: 'http', message: 'HTTP 500', statusCode: 500 },
      ],
    });
    const findings = evaluateAudit(ctx);
    expect(findings.some((f) => f.ruleKey === 'HTTP_4XX' && f.severity === 'high')).toBe(true);
    expect(findings.some((f) => f.ruleKey === 'HTTP_5XX' && f.severity === 'critical')).toBe(true);
  });

  it('flags missing/empty titles, missing descriptions and missing H1', () => {
    const ctx = baseContext({
      pages: [
        page('https://example.com/a', { title: null }),
        page('https://example.com/b', { title: '   ' }),
        page('https://example.com/c', { metaDescription: null }),
        page('https://example.com/d', { h1: null }),
      ],
    });
    const findings = evaluateAudit(ctx);
    expect(findings.some((f) => f.ruleKey === 'MISSING_TITLE' && f.url === 'https://example.com/a')).toBe(true);
    expect(findings.some((f) => f.ruleKey === 'EMPTY_TITLE' && f.url === 'https://example.com/b')).toBe(true);
    expect(findings.some((f) => f.ruleKey === 'MISSING_META_DESCRIPTION' && f.url === 'https://example.com/c')).toBe(true);
    expect(findings.some((f) => f.ruleKey === 'MISSING_H1' && f.url === 'https://example.com/d')).toBe(true);
  });

  it('classifies thin content and generic titles as recommendations', () => {
    const ctx = baseContext({
      pages: [
        page('https://example.com/thin', { wordCount: 40 }),
        page('https://example.com/generic', { title: 'Home' }),
      ],
    });
    const findings = evaluateAudit(ctx);
    const thin = findings.find((f) => f.ruleKey === 'THIN_CONTENT_SIGNAL');
    const generic = findings.find((f) => f.ruleKey === 'TITLE_TOO_GENERIC');
    expect(thin?.severity).toBe('low');
    expect(thin?.evidence.recommendation).toBe(true);
    expect(generic?.severity).toBe('low');
    expect(generic?.evidence.recommendation).toBe(true);
  });

  it('flags noindex and robots-blocked pages', () => {
    const ctx = baseContext({
      pages: [page('https://example.com/noindex', { metaRobots: ['noindex'] })],
      errors: [{ url: 'https://example.com/blocked', errorType: 'robots', message: 'robots.txt disallows crawling', statusCode: null }],
    });
    const findings = evaluateAudit(ctx);
    expect(findings.some((f) => f.ruleKey === 'NOINDEX_PAGE' && f.url === 'https://example.com/noindex')).toBe(true);
    expect(findings.some((f) => f.ruleKey === 'ROBOTS_BLOCKED_PAGE' && f.url === 'https://example.com/blocked')).toBe(true);
  });

  it('flags orphan pages and excessive depth', () => {
    const ctx = baseContext({
      pages: [
        page('https://example.com/', { url: 'https://example.com/', depth: 0 }),
        page('https://example.com/orphan', { depth: 6 }),
      ],
    });
    const findings = evaluateAudit(ctx);
    expect(findings.some((f) => f.ruleKey === 'ORPHAN_PAGE' && f.url === 'https://example.com/orphan')).toBe(true);
    expect(findings.some((f) => f.ruleKey === 'EXCESSIVE_CRAWL_DEPTH' && f.url === 'https://example.com/orphan')).toBe(true);
  });

  it('flags canonical conflicts and duplicate canonical targets', () => {
    const ctx = baseContext({
      pages: [
        page('https://example.com/a', { canonical: 'https://example.com/b' }),
        page('https://example.com/b', { canonical: 'https://example.com/a' }),
        page('https://example.com/c', { canonical: 'https://example.com/dup' }),
        page('https://example.com/d', { canonical: 'https://example.com/dup' }),
      ],
    });
    const findings = evaluateAudit(ctx);
    expect(findings.some((f) => f.ruleKey === 'CANONICAL_CONFLICT')).toBe(true);
    expect(findings.some((f) => f.ruleKey === 'DUPLICATE_CANONICAL_TARGET')).toBe(true);
  });

  it('flags schema parse errors and invalid JSON-LD', () => {
    const ctx = baseContext({
      pages: [
        page('https://example.com/bad', {
          schemaBlocks: 1,
          schemaErrors: [{ message: 'JSON-LD block is not valid JSON' }],
          schemaJson: [],
        }),
        page('https://example.com/notype', {
          schemaBlocks: 1,
          schemaJson: [{ description: 'no type here' }],
        }),
      ],
    });
    const findings = evaluateAudit(ctx);
    expect(findings.some((f) => f.ruleKey === 'SCHEMA_PARSE_ERROR' && f.url === 'https://example.com/bad')).toBe(true);
    expect(findings.some((f) => f.ruleKey === 'INVALID_JSON_LD' && f.url === 'https://example.com/notype')).toBe(true);
  });

  it('flags broken internal links via the integrated link analysis engine', () => {
    const ctx = baseContext({
      pages: [page('https://example.com/')],
      links: [
        {
          sourceUrl: 'https://example.com/',
          targetUrl: 'https://example.com/gone',
          anchorText: 'gone',
          rel: null,
          internal: true,
          nofollow: false,
          statusCodeWhenKnown: 404,
        },
      ],
      linkAnalysis: { brokenLinks: [{ sourceUrl: 'https://example.com/', targetUrl: 'https://example.com/gone' }] },
    });
    const findings = evaluateAudit(ctx);
    expect(findings.some((f) => f.ruleKey === 'BROKEN_INTERNAL_LINK')).toBe(true);
  });

  it('flags image missing alt as a low recommendation', () => {
    const ctx = baseContext({
      pages: [page('https://example.com/', { images: [{ src: 'https://example.com/img.png', alt: null }] })],
    });
    const findings = evaluateAudit(ctx);
    const img = findings.find((f) => f.ruleKey === 'IMAGE_MISSING_ALT');
    expect(img?.severity).toBe('low');
    expect(img?.evidence.missingCount).toBe(1);
  });
});

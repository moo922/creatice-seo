import { crawlSite } from './crawler';
import { fixtureResponse, type FixtureOptions } from './fixtures';

const ORIGIN = 'https://example.com';
let fixed = false;

function installFixtureFetch(): void {
  const options: FixtureOptions = { fixed, origin: ORIGIN };
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    const response = fixtureResponse(url.pathname, options);
    const headers = new Headers({ 'content-type': response.contentType });
    if (response.location) headers.set('location', response.location);
    return new Response(response.body, { status: response.status, headers });
  }) as typeof fetch;
}

describe('crawler over the deterministic fixture site', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fixed = false;
    installFixtureFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('crawls breadth-first, respects robots and discovers the sitemap', async () => {
    const result = await crawlSite({ origin: ORIGIN, maxPages: 60 });
    const urls = result.pages.map((page) => page.url);

    expect(result.robots.status).toBe('ALLOWED');
    expect(result.sitemap.status).toBe('OK');
    expect(result.sitemap.locations.length).toBeGreaterThan(0);

    // Core healthy pages crawled.
    expect(urls).toContain(`${ORIGIN}/`);
    expect(urls).toContain(`${ORIGIN}/about`);
    expect(urls).toContain(`${ORIGIN}/services`);
    // The sitemap-only orphan page was discovered via sitemap.
    expect(urls).toContain(`${ORIGIN}/orphan`);
    // robots.txt disallows /blocked*.
    expect(result.issues.some((issue) => issue.kind === 'robots' && issue.url.includes('/blocked-page'))).toBe(true);
    // HTTP errors reported.
    expect(result.issues.some((issue) => issue.kind === 'http' && issue.url.includes('/missing-page') && issue.statusCode === 404)).toBe(true);
    expect(result.issues.some((issue) => issue.kind === 'http' && issue.url.includes('/server-error') && issue.statusCode === 500)).toBe(true);
  });

  it('extracts the deterministic on-page signals', async () => {
    const result = await crawlSite({ origin: ORIGIN, maxPages: 60 });
    const byUrl = new Map(result.pages.map((page) => [page.url, page]));

    const missingTitle = byUrl.get(`${ORIGIN}/missing-title`);
    expect(missingTitle?.title).toBeNull();

    const dup1 = byUrl.get(`${ORIGIN}/duplicate-title`);
    const dup2 = byUrl.get(`${ORIGIN}/duplicate-title-2`);
    expect(dup1?.title).toBe('Duplicate Title Page');
    expect(dup2?.title).toBe('Duplicate Title Page');

    const noindex = byUrl.get(`${ORIGIN}/noindex`);
    expect(noindex?.metaRobots).toContain('noindex');
    expect(noindex?.indexable).toBe(false);

    const missingAlt = byUrl.get(`${ORIGIN}/missing-alt`);
    expect(missingAlt?.images[0]?.alt).toBeNull();

    const invalidJson = byUrl.get(`${ORIGIN}/invalid-jsonld`);
    expect(invalidJson?.schemaBlocks).toBe(1);
    expect(invalidJson?.schemaErrors.length).toBe(1);

    const canonicalConflict = byUrl.get(`${ORIGIN}/canonical-conflict`);
    expect(canonicalConflict?.canonical).toBe(`${ORIGIN}/canonical-conflict-2`);

    const broken = byUrl.get(`${ORIGIN}/broken-link`);
    expect(broken?.links.some((entry) => entry.url.includes('/missing-page'))).toBe(true);
  });

  it('tracks redirects, chains and loops', async () => {
    const result = await crawlSite({ origin: ORIGIN, maxPages: 60 });
    const byUrl = new Map(result.pages.map((page) => [page.url, page]));

    const single = byUrl.get(`${ORIGIN}/redirect`);
    expect(single?.finalUrl).toBe(`${ORIGIN}/redirect-target`);
    expect(single?.redirectChain).toEqual([`${ORIGIN}/redirect`, `${ORIGIN}/redirect-target`]);

    const chain = byUrl.get(`${ORIGIN}/redirect-chain`);
    expect(chain?.redirectChain).toHaveLength(4);
    expect(chain?.redirectChain[3]).toBe(`${ORIGIN}/redirect-chain-4`);

    expect(result.issues.some((issue) => issue.message.includes('redirect loop') && issue.url.includes('/redirect-loop'))).toBe(true);
  });

  it('reports SSRF-blocked redirect destinations', async () => {
    // A redirect to a private host must be blocked even though the origin is public.
    const options: FixtureOptions = { fixed, origin: ORIGIN };
    globalThis.fetch = (async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/redirect-to-private') {
        return new Response('', { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
      }
      const response = fixtureResponse(url.pathname, options);
      const headers = new Headers({ 'content-type': response.contentType });
      if (response.location) headers.set('location', response.location);
      return new Response(response.body, { status: response.status, headers });
    }) as typeof fetch;

    // Seed points at a URL that redirects to a metadata endpoint.
    const result = await crawlSite({ origin: ORIGIN, seedPath: '/redirect-to-private', maxPages: 5 });
    // The seed redirect to the metadata host is blocked.
    expect(result.issues.some((issue) => issue.kind === 'blocked' && issue.url.includes('/redirect-to-private'))).toBe(true);
    // The private metadata endpoint is never crawled.
    expect(result.pages.some((page) => page.url.includes('169.254'))).toBe(false);
  });
});

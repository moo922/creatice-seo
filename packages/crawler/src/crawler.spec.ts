import { crawlSite, probeOrigin } from './crawler';

function stubHtml(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

describe('crawlSite', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('respects robots.txt and reports when the seed is disallowed', async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nDisallow: /', { status: 200 });
      }
      return stubHtml('<html><body>blocked</body></html>');
    }) as typeof fetch;

    const result = await crawlSite({ origin: 'https://example.com' });
    expect(result.robots.disallowsSeed).toBe(true);
    expect(result.pages).toHaveLength(0);
    expect(result.issues.some((issue) => issue.kind === 'robots')).toBe(true);
  });

  it('crawls allowed pages breadth-first and follows same-origin links', async () => {
    const paths = new Map<string, string>([
      ['/robots.txt', 'User-agent: *\nDisallow: /admin'],
      ['/', '<html><body><a href="/about">About</a><a href="https://ext.test/">x</a></body></html>'],
      ['/about', '<html><head><title>About</title></head><body><a href="/">Home</a></body></html>'],
    ]);
    globalThis.fetch = (async (input: string | URL) => {
      const path = new URL(String(input)).pathname;
      const body = paths.get(path);
      if (body === undefined) return new Response('', { status: 404 });
      if (path === '/robots.txt') return new Response(body, { status: 200 });
      return stubHtml(body);
    }) as typeof fetch;

    const result = await crawlSite({ origin: 'https://example.com', maxPages: 10 });
    expect(result.pages.map((page) => page.url).sort()).toEqual(['https://example.com/', 'https://example.com/about']);
    const about = result.pages.find((page) => page.url.endsWith('/about'));
    expect(about?.title).toBe('About');
    expect(result.timedOut).toBe(false);
  });

  it('reports crawler timeouts as diagnostics', async () => {
    globalThis.fetch = (async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    }) as typeof fetch;

    const result = await crawlSite({ origin: 'https://example.com', perRequestTimeoutMs: 1 });
    expect(result.pages).toHaveLength(0);
    expect(result.issues.some((issue) => issue.kind === 'timeout' && issue.message === 'crawler timeout')).toBe(true);
  });

  it('rejects non-http URLs and blocked hosts', async () => {
    const result = await crawlSite({ origin: 'ftp://example.com' });
    expect(result.issues.some((issue) => issue.message === 'Invalid URL')).toBe(true);
  });
});

describe('probeOrigin', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('reports reachable domain with robots.txt present', async () => {
    globalThis.fetch = (async () => new Response('User-agent: *', { status: 200 })) as typeof fetch;
    const probe = await probeOrigin('https://example.com');
    expect(probe.reachable).toBe(true);
    expect(probe.robotsFound).toBe(true);
  });

  it('reports an unreachable domain with a diagnostic', async () => {
    globalThis.fetch = (async () => {
      throw new Error('fetch failed');
    }) as typeof fetch;
    const probe = await probeOrigin('https://example.com');
    expect(probe.reachable).toBe(false);
    expect(probe.message).toContain('fetch failed');
  });
});

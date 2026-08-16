/**
 * Deterministic production crawler. Fetches robots.txt, discovers sitemaps
 * (robots directives + /sitemap.xml), then breadth-first crawls same-origin
 * pages respecting robots + SSRF egress guard. Every page yields the full set
 * of deterministic on-page signals an audit engine needs; failures are
 * reported honestly (robots block, timeouts, HTTP errors) instead of being
 * swallowed.
 *
 * SSRF defence: redirects are followed manually and EVERY hop (initial host
 * and each redirect destination) is DNS-resolved and validated against the
 * public-address blocklist before the request, then re-resolved after the
 * request to catch DNS rebinding. The private-network override is only
 * available through the CRAWLER_ALLOW_PRIVATE_HOSTS configuration flag (dev).
 *
 * The crawler stays a pure library — callers persist results into versioned
 * crawl runs.
 */
import { createHash } from 'node:crypto';
import {
  extractHtmlMetadata,
  resolveUrl,
  type ExtractedHeading,
  type ExtractedHreflang,
  type ExtractedImage,
  type ExtractedLink,
  type SchemaError,
} from './html';
import { extractSitemapDirectives, isPathAllowed, parseRobotsTxt, type RobotsRules } from './robots';
import { resolvePublicAddresses } from './ssrf';

export type CrawlRobotsStatus = 'ALLOWED' | 'BLOCKED' | 'NOT_FOUND' | 'ERROR';
export type CrawlSitemapStatus = 'OK' | 'NOT_FOUND' | 'ERROR';

export interface CrawlPageData {
  url: string;
  normalizedUrl: string;
  finalUrl: string | null;
  depth: number;
  httpStatus: number;
  contentType: string | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  metaRobots: string[];
  indexable: boolean;
  language: string | null;
  wordCount: number;
  contentHash: string;
  h1: string | null;
  headings: ExtractedHeading[];
  schemaJson: unknown[];
  schemaBlocks: number;
  schemaErrors: SchemaError[];
  hreflang: ExtractedHreflang[];
  images: ExtractedImage[];
  links: ExtractedLink[];
  /** Full redirect chain (requested URL first, final URL last). */
  redirectChain: string[];
  redirectLoop: boolean;
  text: string;
  rendered: boolean;
}

export interface CrawlIssue {
  url: string;
  kind: 'robots' | 'timeout' | 'http' | 'blocked' | 'error';
  message: string;
  statusCode: number | null;
}

export interface CrawlResult {
  origin: string;
  startedAt: string;
  finishedAt: string;
  userAgent: string;
  maxPages: number;
  pages: CrawlPageData[];
  issues: CrawlIssue[];
  /** Distinct URLs discovered (seed + sitemap + linked), including failures. */
  pagesDiscovered: number;
  /** Pages rendered with JS (always 0 — this crawler does not execute JS). */
  renderedPages: number;
  robots: { url: string; found: boolean; disallowsSeed: boolean; status: CrawlRobotsStatus };
  sitemap: { url: string | null; found: boolean; status: CrawlSitemapStatus; locations: string[] };
  timedOut: boolean;
}

export interface CrawlOptions {
  origin: string;
  /** Seed path to start from. Defaults to the origin root. */
  seedPath?: string;
  userAgent?: string;
  maxPages?: number;
  maxDepth?: number;
  perRequestTimeoutMs?: number;
  overallTimeoutMs?: number;
  /** Allow crawling private/loopback hosts. Defaults to the CRAWLER_ALLOW_PRIVATE_HOSTS env flag. */
  allowPrivate?: boolean;
}

export const DEFAULT_USER_AGENT = 'CreativeSEO-Crawler/1.0 (site activation)';
const SITEMAP_MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 5;

export async function crawlSite(options: CrawlOptions): Promise<CrawlResult> {
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 50, 500));
  const maxDepth = options.maxDepth ?? 4;
  const perRequestTimeoutMs = options.perRequestTimeoutMs ?? 15_000;
  const overallTimeoutMs = options.overallTimeoutMs ?? 180_000;
  const allowPrivate = options.allowPrivate ?? configuredAllowPrivate();
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + overallTimeoutMs;

  const empty = (status: CrawlRobotsStatus, issues: CrawlIssue[] = [], robotsUrl = ''): CrawlResult => ({
    origin: options.origin,
    startedAt,
    finishedAt: new Date().toISOString(),
    userAgent,
    maxPages,
    pages: [],
    issues,
    pagesDiscovered: 0,
    renderedPages: 0,
    robots: { url: robotsUrl, found: false, disallowsSeed: false, status },
    sitemap: { url: null, found: false, status: 'NOT_FOUND', locations: [] },
    timedOut: false,
  });

  const origin = normalizeOrigin(options.origin);
  if (!origin) {
    return empty('ERROR', [{ url: options.origin, kind: 'blocked', message: 'Invalid URL', statusCode: null }]);
  }

  const egress = await resolvePublicAddresses(new URL(origin).hostname, allowPrivate);
  if (!egress.allowed) {
    return empty('ERROR', [{ url: origin, kind: 'blocked', message: egress.reason ?? 'Host blocked', statusCode: null }]);
  }

  const robotsUrl = `${origin}/robots.txt`;
  const robotsFetch = await fetchRobots(robotsUrl, userAgent, perRequestTimeoutMs, allowPrivate);
  const { rules } = robotsFetch;
  const seed = resolveUrl(options.seedPath ?? '/', origin) ?? `${origin}/`;
  const disallowsSeed = !isPathAllowed(rules, userAgent, new URL(seed).pathname);

  const robotsStatus: CrawlRobotsStatus = disallowsSeed
    ? 'BLOCKED'
    : robotsFetch.status === 'ERROR'
      ? 'ERROR'
      : robotsFetch.status === 'NOT_FOUND'
        ? 'NOT_FOUND'
        : 'ALLOWED';

  const sitemap = await discoverSitemap(
    robotsFetch.sitemapDirectives,
    origin,
    userAgent,
    perRequestTimeoutMs,
    allowPrivate,
  );

  const pages: CrawlPageData[] = [];
  const issues: CrawlIssue[] = [];
  const seen = new Set<string>([seed]);
  const queue: Array<{ url: string; depth: number }> = [{ url: seed, depth: 0 }];
  for (const sitemapUrl of sitemap.locations) {
    if (!seen.has(sitemapUrl)) {
      seen.add(sitemapUrl);
      queue.push({ url: sitemapUrl, depth: 1 });
    }
  }

  let timedOut = false;

  while (queue.length > 0 && pages.length < maxPages) {
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }
    const { url, depth } = queue.shift()!;
    if (disallowsSeed && url === seed) {
      issues.push({ url, kind: 'robots', message: 'robots.txt disallows the seed URL', statusCode: null });
      break;
    }
    if (!isPathAllowed(rules, userAgent, new URL(url).pathname)) {
      issues.push({ url, kind: 'robots', message: 'robots.txt disallows crawling', statusCode: null });
      continue;
    }

    let fetched: SafeFetchResult;
    try {
      fetched = await fetchGuarded(url, userAgent, perRequestTimeoutMs, allowPrivate);
    } catch (error) {
      if (error instanceof EgressBlockedError) {
        issues.push({ url, kind: 'blocked', message: error.message, statusCode: null });
      } else if (error instanceof RedirectError) {
        issues.push({ url, kind: 'error', message: error.message, statusCode: null });
      } else {
        issues.push({ url, kind: 'timeout', message: messageFor(error, 'request failed'), statusCode: null });
      }
      continue;
    }

    const { response } = fetched;
    if (!response.ok) {
      issues.push({ url, kind: 'http', message: `HTTP ${response.status}`, statusCode: response.status });
      continue;
    }

    const contentType = response.headers.get('content-type') ?? null;
    if (!contentType?.includes('text/html') && !contentType?.includes('application/xhtml+xml')) {
      continue;
    }

    let html: string;
    try {
      html = await response.text();
    } catch (error) {
      issues.push({ url, kind: 'error', message: messageFor(error, 'failed to read body'), statusCode: null });
      continue;
    }

    const meta = extractHtmlMetadata(html, url);
    const finalUrl = fetched.chain.length > 1 ? fetched.chain[fetched.chain.length - 1]! : null;
    const text = html.slice(0, 100_000);
    const contentHash = createHash('sha1').update(text).digest('hex');
    const indexable = !meta.metaRobots.includes('noindex') && response.ok;

    pages.push({
      url,
      normalizedUrl: normalizeUrl(url),
      finalUrl,
      depth,
      httpStatus: response.status,
      contentType,
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical,
      metaRobots: meta.metaRobots,
      indexable,
      language: meta.language,
      wordCount: countWords(text),
      contentHash,
      h1: meta.headings.find((heading) => heading.tag === 'h1')?.text ?? null,
      headings: meta.headings,
      schemaJson: meta.schemaJson,
      schemaBlocks: meta.schemaBlocks,
      schemaErrors: meta.schemaErrors,
      hreflang: meta.hreflang,
      images: meta.images,
      links: meta.links,
      redirectChain: fetched.chain,
      redirectLoop: fetched.loop,
      text,
      rendered: false,
    });

    if (depth < maxDepth) {
      for (const link of meta.links) {
        if (!isSameOrigin(link.url, origin)) continue;
        if (seen.has(link.url)) continue;
        seen.add(link.url);
        queue.push({ url: link.url, depth: depth + 1 });
      }
    }
  }

  return {
    origin,
    startedAt,
    finishedAt: new Date().toISOString(),
    userAgent,
    maxPages,
    pages,
    issues: issues.slice(0, 500),
    pagesDiscovered: seen.size,
    renderedPages: 0,
    robots: { url: robotsUrl, found: robotsFetch.status !== 'NOT_FOUND', disallowsSeed, status: robotsStatus },
    sitemap: { url: sitemap.url, found: sitemap.status === 'OK', status: sitemap.status, locations: sitemap.locations },
    timedOut,
  };
}

/** Lightweight read-only reachability probe for domain verification. */
export async function probeOrigin(
  origin: string,
  options: { userAgent?: string; timeoutMs?: number; allowPrivate?: boolean } = {},
): Promise<{ origin: string; reachable: boolean; status: number | null; robotsFound: boolean; message: string }> {
  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return { origin, reachable: false, status: null, robotsFound: false, message: 'Invalid URL' };
  }
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const allowPrivate = options.allowPrivate ?? configuredAllowPrivate();

  const egress = await resolvePublicAddresses(new URL(normalized).hostname, allowPrivate);
  if (!egress.allowed) {
    return { origin, reachable: false, status: null, robotsFound: false, message: egress.reason ?? 'Host blocked' };
  }

  try {
    const { response } = await fetchGuarded(`${normalized}/robots.txt`, userAgent, timeoutMs, allowPrivate, 3);
    const reachable = response.status < 500;
    return {
      origin: normalized,
      reachable,
      status: response.status,
      robotsFound: response.ok,
      message: reachable
        ? response.ok
          ? `Domain responded HTTP ${response.status}; robots.txt present`
          : `Domain responded HTTP ${response.status}; robots.txt not found`
        : `Domain responded HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      origin: normalized,
      reachable: false,
      status: null,
      robotsFound: false,
      message: messageFor(error, 'domain did not respond'),
    };
  }
}

class EgressBlockedError extends Error {}
class RedirectError extends Error {
  constructor(message: string, readonly loop: boolean) {
    super(message);
  }
}

interface SafeFetchResult {
  response: Response;
  chain: string[];
  loop: boolean;
}

/**
 * Fetch that manually follows redirects, validating EVERY hop (initial host
 * and each destination) against the SSRF blocklist before requesting it and
 * re-validating after the request to detect DNS rebinding.
 */
async function fetchGuarded(
  url: string,
  userAgent: string,
  timeoutMs: number,
  allowPrivate: boolean,
  maxRedirects = MAX_REDIRECTS,
): Promise<SafeFetchResult> {
  const chain: string[] = [url];
  const seen = new Set<string>([url]);
  let current = url;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const host = new URL(current).hostname;
    const before = await resolvePublicAddresses(host, allowPrivate);
    if (!before.allowed) {
      throw new EgressBlockedError(before.reason ?? 'blocked host');
    }

    const response = await fetch(current, {
      headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    // Re-resolve after the request: a different address set between the
    // pre-flight check and the actual connection indicates DNS rebinding.
    const after = await resolvePublicAddresses(host, allowPrivate);
    if (!after.allowed) {
      throw new EgressBlockedError(after.reason ?? 'blocked host');
    }
    if (!sameAddressSet(before.addresses, after.addresses)) {
      throw new EgressBlockedError('DNS rebinding detected (host resolved to different addresses)');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { response, chain, loop: false };
      const next = resolveUrl(location, current);
      if (!next) return { response, chain, loop: false };
      if (seen.has(next)) throw new RedirectError('redirect loop detected', true);
      seen.add(next);
      chain.push(next);
      current = next;
      continue;
    }
    return { response, chain, loop: false };
  }

  throw new RedirectError(`too many redirects (${maxRedirects + 1})`, false);
}

function sameAddressSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((address) => setB.has(address));
}

interface SitemapDiscovery {
  url: string | null;
  status: CrawlSitemapStatus;
  locations: string[];
}

async function discoverSitemap(
  robotDirectives: string[],
  origin: string,
  userAgent: string,
  timeoutMs: number,
  allowPrivate: boolean,
): Promise<SitemapDiscovery> {
  const candidates = robotDirectives.length > 0 ? robotDirectives : [`${origin}/sitemap.xml`];
  for (const candidate of candidates) {
    try {
      const { response, chain } = await fetchGuarded(candidate, userAgent, timeoutMs, allowPrivate);
      if (!response.ok) {
        continue;
      }
      const xml = (await response.text()).slice(0, SITEMAP_MAX_BYTES);
      const locations = extractSitemapLocations(xml, chain[chain.length - 1] ?? candidate).slice(0, 10_000);
      if (locations.length > 0) {
        return { url: chain[chain.length - 1] ?? candidate, status: 'OK', locations };
      }
    } catch {
      return { url: candidate, status: 'ERROR', locations: [] };
    }
  }
  return { url: candidates[0] ?? null, status: 'NOT_FOUND', locations: [] };
}

function extractSitemapLocations(xml: string, baseUrl: string): string[] {
  const out: string[] = [];
  const re = /<loc>([\s\S]*?)<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const url = match[1]?.trim();
    if (!url) continue;
    const absolute = resolveUrl(url, baseUrl);
    if (!absolute) continue;
    out.push(absolute);
  }
  return out;
}

async function fetchRobots(
  url: string,
  userAgent: string,
  timeoutMs: number,
  allowPrivate: boolean,
): Promise<{ rules: RobotsRules; status: 'OK' | 'NOT_FOUND' | 'ERROR'; sitemapDirectives: string[] }> {
  try {
    const { response } = await fetchGuarded(url, userAgent, timeoutMs, allowPrivate);
    if (!response.ok) {
      return { rules: parseRobotsTxt(''), status: 'NOT_FOUND', sitemapDirectives: [] };
    }
    const text = (await response.text()).slice(0, 64_000);
    return { rules: parseRobotsTxt(text), status: 'OK', sitemapDirectives: extractSitemapDirectives(text) };
  } catch (error) {
    if (error instanceof EgressBlockedError) {
      return { rules: parseRobotsTxt(''), status: 'ERROR', sitemapDirectives: [] };
    }
    return { rules: parseRobotsTxt(''), status: 'ERROR', sitemapDirectives: [] };
  }
}

function normalizeOrigin(origin: string): string | null {
  let value = origin.trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  if (!hasScheme) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/** Scheme-agnostic-ish normalization: lowercase host, drop default port and trailing slash. */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    const defaultPort = (u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443');
    const port = defaultPort ? '' : u.port;
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return `${u.protocol}//${u.hostname.toLowerCase()}${port ? `:${port}` : ''}${path}${u.search}`;
  } catch {
    return url;
  }
}

function countWords(text: string): number {
  const words = text.match(/[\p{L}\p{N}]+/gu);
  return words?.length ?? 0;
}

function configuredAllowPrivate(): boolean {
  const raw = process.env.CRAWLER_ALLOW_PRIVATE_HOSTS;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'crawler timeout';
  return error instanceof Error && error.message ? error.message.slice(0, 300) : fallback;
}

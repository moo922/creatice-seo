/**
 * Minimal real crawler for the site activation flow. Fetches robots.txt, then
 * breadth-first crawls same-origin pages (respecting robots + SSRF egress
 * guard) and returns lightweight metadata. Page bodies are never persisted —
 * only extracted signals (title, links, word count) via the existing Links
 * service. Failures are reported honestly (robots blocked, timeouts, HTTP
 * errors) instead of being silently swallowed.
 */
import { extractHtmlMetadata, resolveUrl } from './html';
import { isPathAllowed, parseRobotsTxt } from './robots';
import { assertPublicHost } from './ssrf';

export interface CrawlPageData {
  url: string;
  title: string | null;
  description: string | null;
  canonical: string | null;
  /** Same-origin absolute URLs linked from the page (deduped). */
  links: string[];
  httpStatus: number;
  text: string;
  headings: Array<{ text: string; level: number }>;
}

export interface CrawlIssue {
  url: string;
  kind: 'robots' | 'timeout' | 'http' | 'blocked' | 'error';
  message: string;
}

export interface CrawlResult {
  origin: string;
  startedAt: string;
  finishedAt: string;
  pages: CrawlPageData[];
  issues: CrawlIssue[];
  robots: { url: string; found: boolean; disallowsSeed: boolean };
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
  /** Allow crawling private/loopback hosts (local development only). */
  allowPrivate?: boolean;
}

const DEFAULT_USER_AGENT = 'CreativeSEO-Crawler/1.0 (site activation)';

export async function crawlSite(options: CrawlOptions): Promise<CrawlResult> {
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 50, 500));
  const maxDepth = options.maxDepth ?? 4;
  const perRequestTimeoutMs = options.perRequestTimeoutMs ?? 15_000;
  const overallTimeoutMs = options.overallTimeoutMs ?? 180_000;
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + overallTimeoutMs;

  const origin = normalizeOrigin(options.origin);
  if (!origin) {
    return {
      origin: options.origin,
      startedAt,
      finishedAt: new Date().toISOString(),
      pages: [],
      issues: [{ url: options.origin, kind: 'blocked', message: 'Invalid URL' }],
      robots: { url: '', found: false, disallowsSeed: false },
      timedOut: false,
    };
  }

  const egress = await assertPublicHost(new URL(origin).hostname, options.allowPrivate ?? false);
  if (!egress.allowed) {
    return {
      origin,
      startedAt,
      finishedAt: new Date().toISOString(),
      pages: [],
      issues: [{ url: origin, kind: 'blocked', message: egress.reason ?? 'Host blocked' }],
      robots: { url: '', found: false, disallowsSeed: false },
      timedOut: false,
    };
  }

  const robotsUrl = `${origin}/robots.txt`;
  const { rules, found } = await fetchRobots(robotsUrl, userAgent, perRequestTimeoutMs);
  const seed = resolveUrl(options.seedPath ?? '/', origin) ?? `${origin}/`;
  const disallowsSeed = !isPathAllowed(rules, userAgent, new URL(seed).pathname);

  const pages: CrawlPageData[] = [];
  const issues: CrawlIssue[] = [];
  const seen = new Set<string>([seed]);
  const queue: Array<{ url: string; depth: number }> = [{ url: seed, depth: 0 }];

  let timedOut = false;

  while (queue.length > 0 && pages.length < maxPages) {
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }
    const { url, depth } = queue.shift()!;
    if (disallowsSeed && url === seed) {
      issues.push({ url, kind: 'robots', message: 'robots.txt disallows the seed URL' });
      break;
    }
    if (!isPathAllowed(rules, userAgent, new URL(url).pathname)) {
      issues.push({ url, kind: 'robots', message: 'robots.txt disallows crawling' });
      continue;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal: AbortSignal.timeout(perRequestTimeoutMs),
      });
    } catch (error) {
      issues.push({ url, kind: 'timeout', message: messageFor(error, 'request failed') });
      continue;
    }

    if (!response.ok) {
      issues.push({ url, kind: 'http', message: `HTTP ${response.status}` });
      if (response.status === 403 || response.status === 404) continue;
      continue;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      continue;
    }

    let html: string;
    try {
      html = await response.text();
    } catch (error) {
      issues.push({ url, kind: 'error', message: messageFor(error, 'failed to read body') });
      continue;
    }

    const meta = extractHtmlMetadata(html, url);
    pages.push({
      url,
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical,
      links: meta.links,
      httpStatus: response.status,
      text: html.slice(0, 100_000),
      headings: extractHeadings(html),
    });

    if (depth < maxDepth) {
      for (const link of meta.links) {
        if (!isSameOrigin(link, origin)) continue;
        if (seen.has(link)) continue;
        seen.add(link);
        queue.push({ url: link, depth: depth + 1 });
      }
    }
  }

  const result: CrawlResult = {
    origin,
    startedAt,
    finishedAt: new Date().toISOString(),
    pages,
    issues: issues.slice(0, 200),
    robots: { url: robotsUrl, found, disallowsSeed },
    timedOut,
  };
  return result;
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

  const egress = await assertPublicHost(new URL(normalized).hostname, options.allowPrivate ?? false);
  if (!egress.allowed) {
    return { origin, reachable: false, status: null, robotsFound: false, message: egress.reason ?? 'Host blocked' };
  }

  try {
    const response = await fetch(`${normalized}/robots.txt`, {
      headers: { 'user-agent': userAgent },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
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

async function fetchRobots(
  url: string,
  userAgent: string,
  timeoutMs: number,
): Promise<{ rules: import('./robots').RobotsRules; found: boolean }> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': userAgent },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { rules: parseRobotsTxt(''), found: false };
    const text = (await response.text()).slice(0, 64_000);
    return { rules: parseRobotsTxt(text), found: true };
  } catch {
    return { rules: parseRobotsTxt(''), found: false };
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

function extractHeadings(html: string): Array<{ text: string; level: number }> {
  const out: Array<{ text: string; level: number }> = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const text = (match[2] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text) out.push({ text: text.slice(0, 200), level: Number(match[1]) });
    if (out.length >= 50) break;
  }
  return out;
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'crawler timeout';
  return error instanceof Error && error.message ? error.message.slice(0, 300) : fallback;
}

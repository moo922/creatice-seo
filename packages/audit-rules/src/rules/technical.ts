import type { AuditFinding } from '../contract';
import type { AuditContext } from '../context';
import type { AuditRule } from '../registry';
import { allPages, indexablePages, makeFinding, normalizeUrlForCompare } from '../helpers';

const REDIRECT_CHAIN_THRESHOLD = 3;

export const technicalRules: AuditRule[] = [
  {
    definition: {
      key: 'HTTP_4XX',
      category: 'technical',
      severity: 'high',
      description: 'URL returned an HTTP 4xx status during the crawl',
      version: 1,
      active: true,
    },
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const seen = new Set<string>();
      for (const error of ctx.errors) {
        if (error.errorType !== 'http' || error.statusCode === null || error.statusCode < 400 || error.statusCode >= 500) {
          continue;
        }
        if (seen.has(error.url)) continue;
        seen.add(error.url);
        findings.push(
          makeFinding('HTTP_4XX', 'technical', 'high', error.url, {
            statusCode: error.statusCode,
            message: error.message,
          }),
        );
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'HTTP_5XX',
      category: 'technical',
      severity: 'critical',
      description: 'URL returned an HTTP 5xx status during the crawl',
      version: 1,
      active: true,
    },
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const seen = new Set<string>();
      for (const error of ctx.errors) {
        if (error.errorType !== 'http' || error.statusCode === null || error.statusCode < 500 || error.statusCode >= 600) {
          continue;
        }
        if (seen.has(error.url)) continue;
        seen.add(error.url);
        findings.push(
          makeFinding('HTTP_5XX', 'technical', 'critical', error.url, {
            statusCode: error.statusCode,
            message: error.message,
          }),
        );
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'REDIRECT_CHAIN',
      category: 'technical',
      severity: 'medium',
      description: 'Page is reachable only through a long redirect chain',
      version: 1,
      active: true,
    },
    pageScope: allPages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        const hops = page.redirectChain.length - 1;
        if (hops >= REDIRECT_CHAIN_THRESHOLD) {
          findings.push(
            makeFinding('REDIRECT_CHAIN', 'technical', 'medium', page.url, {
              hops,
              chain: page.redirectChain.slice(0, 10),
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'REDIRECT_LOOP',
      category: 'technical',
      severity: 'critical',
      description: 'URL redirects to itself (redirect loop)',
      version: 1,
      active: true,
    },
    pageScope: allPages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (page.redirectLoop) {
          findings.push(
            makeFinding('REDIRECT_LOOP', 'technical', 'critical', page.url, {
              chain: page.redirectChain.slice(0, 10),
            }),
          );
        }
      }
      for (const error of ctx.errors) {
        if (error.message.includes('redirect loop')) {
          findings.push(
            makeFinding('REDIRECT_LOOP', 'technical', 'critical', error.url, {
              message: error.message,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'BROKEN_INTERNAL_LINK',
      category: 'technical',
      severity: 'high',
      description: 'Internal link points to a URL that returns an error or could not be crawled',
      version: 1,
      active: true,
    },
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const seen = new Set<string>();
      const brokenFromAnalysis = ctx.linkAnalysis?.brokenLinks ?? [];
      for (const broken of brokenFromAnalysis) {
        const key = `${normalizeUrlForCompare(broken.sourceUrl)}|${normalizeUrlForCompare(broken.targetUrl)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push(
          makeFinding('BROKEN_INTERNAL_LINK', 'technical', 'high', broken.sourceUrl, {
            targetUrl: broken.targetUrl,
            source: 'link-analysis-engine',
          }),
        );
      }
      const targetStatus = new Map(ctx.pages.map((page) => [normalizeUrlForCompare(page.url), page.httpStatus]));
      for (const link of ctx.links) {
        if (!link.internal) continue;
        const status =
          link.statusCodeWhenKnown ?? targetStatus.get(normalizeUrlForCompare(link.targetUrl)) ?? null;
        if (status !== null && status >= 400) {
          const key = `${normalizeUrlForCompare(link.sourceUrl)}|${normalizeUrlForCompare(link.targetUrl)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          findings.push(
            makeFinding('BROKEN_INTERNAL_LINK', 'technical', 'high', link.sourceUrl, {
              targetUrl: link.targetUrl,
              statusCode: status,
              source: 'crawl-links',
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'MIXED_PROTOCOL_INTERNAL_LINK',
      category: 'technical',
      severity: 'low',
      description: 'Internal link switches between http and https',
      version: 1,
      active: true,
    },
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const seen = new Set<string>();
      for (const link of ctx.links) {
        if (!link.internal) continue;
        const sourceProto = link.sourceUrl.split('://')[0];
        const targetProto = link.targetUrl.split('://')[0];
        if (sourceProto && targetProto && sourceProto !== targetProto) {
          const key = `${link.sourceUrl}|${link.targetUrl}`;
          if (seen.has(key)) continue;
          seen.add(key);
          findings.push(
            makeFinding('MIXED_PROTOCOL_INTERNAL_LINK', 'technical', 'low', link.sourceUrl, {
              sourceProtocol: sourceProto,
              targetUrl: link.targetUrl,
              targetProtocol: targetProto,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'ROBOTS_BLOCKED_PAGE',
      category: 'technical',
      severity: 'medium',
      description: 'URL was blocked by robots.txt',
      version: 1,
      active: true,
    },
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const seen = new Set<string>();
      for (const error of ctx.errors) {
        if (error.errorType !== 'robots') continue;
        if (seen.has(error.url)) continue;
        seen.add(error.url);
        findings.push(
          makeFinding('ROBOTS_BLOCKED_PAGE', 'technical', 'medium', error.url, {
            message: error.message,
          }),
        );
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'NOINDEX_PAGE',
      category: 'technical',
      severity: 'info',
      description: 'Page declares noindex (excluded from search indexes)',
      version: 1,
      active: true,
    },
    pageScope: allPages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (page.metaRobots.includes('noindex')) {
          findings.push(
            makeFinding('NOINDEX_PAGE', 'technical', 'info', page.url, {
              metaRobots: page.metaRobots,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'SITEMAP_URL_NOT_CRAWLABLE',
      category: 'technical',
      severity: 'medium',
      description: 'URL listed in the sitemap could not be crawled',
      version: 1,
      active: true,
    },
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      if (ctx.run.sitemapUrls.length === 0) return [];
      const findings: AuditFinding[] = [];
      const seen = new Set<string>();
      const sitemapSet = new Set(ctx.run.sitemapUrls.map((url) => normalizeUrlForCompare(url)));
      const errorUrls = new Map(ctx.errors.map((error) => [normalizeUrlForCompare(error.url), error]));
      for (const sitemapUrl of sitemapSet) {
        const error = errorUrls.get(sitemapUrl);
        if (!error) continue;
        if (seen.has(sitemapUrl)) continue;
        seen.add(sitemapUrl);
        findings.push(
          makeFinding('SITEMAP_URL_NOT_CRAWLABLE', 'technical', 'medium', error.url, {
            errorType: error.errorType,
            message: error.message,
            statusCode: error.statusCode,
          }),
        );
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'INDEXABLE_URL_NOT_IN_SITEMAP',
      category: 'technical',
      severity: 'medium',
      description: 'Indexable page is not referenced in the sitemap',
      version: 1,
      active: true,
    },
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      if (ctx.run.sitemapStatus !== 'OK' || ctx.run.sitemapUrls.length === 0) return [];
      const findings: AuditFinding[] = [];
      const sitemapSet = new Set(ctx.run.sitemapUrls.map((url) => normalizeUrlForCompare(url)));
      for (const page of ctx.pages) {
        if (!page.indexable || page.httpStatus === null || page.httpStatus >= 400) continue;
        if (!sitemapSet.has(normalizeUrlForCompare(page.url))) {
          findings.push(
            makeFinding('INDEXABLE_URL_NOT_IN_SITEMAP', 'technical', 'medium', page.url, {
              httpStatus: page.httpStatus,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'CANONICAL_MISSING',
      category: 'technical',
      severity: 'medium',
      description: 'Indexable page does not declare a canonical URL',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (page.indexable && page.httpStatus !== null && page.httpStatus < 400 && !page.canonical) {
          findings.push(
            makeFinding('CANONICAL_MISSING', 'technical', 'medium', page.url, {
              httpStatus: page.httpStatus,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'CANONICAL_INVALID',
      category: 'technical',
      severity: 'high',
      description: 'Canonical URL is malformed or points to a different domain',
      version: 1,
      active: true,
    },
    pageScope: allPages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (!page.canonical) continue;
        let canonicalUrl: URL;
        try {
          canonicalUrl = new URL(page.canonical);
        } catch {
          findings.push(
            makeFinding('CANONICAL_INVALID', 'technical', 'high', page.url, {
              canonical: page.canonical,
              reason: 'malformed URL',
            }),
          );
          continue;
        }
        if (canonicalUrl.protocol !== 'http:' && canonicalUrl.protocol !== 'https:') {
          findings.push(
            makeFinding('CANONICAL_INVALID', 'technical', 'high', page.url, {
              canonical: page.canonical,
              reason: 'unsupported protocol',
            }),
          );
          continue;
        }
        try {
          const pageHost = new URL(page.url).hostname.toLowerCase();
          if (canonicalUrl.hostname.toLowerCase() !== pageHost) {
            findings.push(
              makeFinding('CANONICAL_INVALID', 'technical', 'high', page.url, {
                canonical: page.canonical,
                reason: 'canonical points to a different host',
              }),
            );
          }
        } catch {
          // page.url malformed — ignore
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'CANONICAL_CONFLICT',
      category: 'technical',
      severity: 'high',
      description: 'Two pages canonicalize to each other (canonical loop)',
      version: 1,
      active: true,
    },
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const canonicalOf = new Map<string, string | null>();
      for (const page of ctx.pages) {
        canonicalOf.set(
          normalizeUrlForCompare(page.url),
          page.canonical ? normalizeUrlForCompare(page.canonical) : null,
        );
      }
      const seen = new Set<string>();
      for (const [pageKey, targetKey] of canonicalOf) {
        if (!targetKey || targetKey === pageKey) continue;
        if (canonicalOf.get(targetKey) === pageKey && !seen.has(pageKey)) {
          seen.add(pageKey);
          seen.add(targetKey);
          findings.push(
            makeFinding('CANONICAL_CONFLICT', 'technical', 'high', pageKey, {
              canonicalTarget: targetKey,
              canonicalizesBack: true,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'CANONICAL_TO_NON_200',
      category: 'technical',
      severity: 'high',
      description: 'Canonical target returns a non-200 status',
      version: 1,
      active: true,
    },
    pageScope: allPages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const statusOf = new Map(ctx.pages.map((page) => [normalizeUrlForCompare(page.url), page.httpStatus]));
      for (const page of ctx.pages) {
        if (!page.canonical) continue;
        const targetKey = normalizeUrlForCompare(page.canonical);
        const status = statusOf.get(targetKey);
        if (status !== null && status !== undefined && (status < 200 || status >= 400)) {
          findings.push(
            makeFinding('CANONICAL_TO_NON_200', 'technical', 'high', page.url, {
              canonical: page.canonical,
              canonicalStatus: status,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'DUPLICATE_CANONICAL_TARGET',
      category: 'technical',
      severity: 'medium',
      description: 'Multiple pages resolve to the same canonical target',
      version: 1,
      active: true,
    },
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const targets = new Map<string, string[]>();
      for (const page of ctx.pages) {
        if (!page.indexable) continue;
        const target = normalizeUrlForCompare(page.canonical ?? page.url);
        const list = targets.get(target) ?? [];
        list.push(page.url);
        targets.set(target, list);
      }
      for (const [target, urls] of targets) {
        if (urls.length > 1) {
          findings.push(
            makeFinding('DUPLICATE_CANONICAL_TARGET', 'technical', 'medium', urls[0] ?? null, {
              canonicalTarget: target,
              pages: urls.slice(0, 10),
              count: urls.length,
            }),
          );
        }
      }
      return findings;
    },
  },
];

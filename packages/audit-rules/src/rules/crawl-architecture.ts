import type { AuditFinding } from '../contract';
import type { AuditContext } from '../context';
import type { AuditRule } from '../registry';
import { allPages, indexablePages, makeFinding, normalizeUrlForCompare } from '../helpers';

const EXCESSIVE_DEPTH = 4;
const MAX_INTERNAL_OUTLINKS = 100;
const ORPHAN_RATIO_THRESHOLD = 0.5;

export const crawlArchitectureRules: AuditRule[] = [
  {
    definition: {
      key: 'ORPHAN_PAGE',
      category: 'internal-linking',
      severity: 'medium',
      description: 'Indexable page is not linked to by any other internal page',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const inlinks = new Map<string, number>();
      for (const link of ctx.links) {
        if (!link.internal) continue;
        const target = normalizeUrlForCompare(link.targetUrl);
        inlinks.set(target, (inlinks.get(target) ?? 0) + 1);
      }
      const seedKey = normalizeUrlForCompare(ctx.run.seedUrl);
      for (const page of ctx.pages) {
        if (!page.indexable || page.httpStatus === null || page.httpStatus >= 400) continue;
        const key = normalizeUrlForCompare(page.url);
        if (key === seedKey) continue;
        const count = inlinks.get(key) ?? 0;
        if (count === 0) {
          findings.push(
            makeFinding('ORPHAN_PAGE', 'internal-linking', 'medium', page.url, {
              internalInlinks: 0,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'EXCESSIVE_CRAWL_DEPTH',
      category: 'internal-linking',
      severity: 'low',
      description: 'Page is reachable only at an excessive crawl depth (signal)',
      version: 1,
      active: true,
    },
    pageScope: allPages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (page.depth > EXCESSIVE_DEPTH) {
          findings.push(
            makeFinding('EXCESSIVE_CRAWL_DEPTH', 'internal-linking', 'low', page.url, {
              depth: page.depth,
              threshold: EXCESSIVE_DEPTH,
              signal: true,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'NO_INTERNAL_INLINKS',
      category: 'internal-linking',
      severity: 'medium',
      description: 'Most indexable pages receive no internal links at all',
      version: 1,
      active: true,
    },
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const indexable = ctx.pages.filter(
        (page) => page.indexable && page.httpStatus !== null && page.httpStatus < 400,
      );
      if (indexable.length < 2) return findings;
      const inlinks = new Map<string, number>();
      for (const link of ctx.links) {
        if (!link.internal) continue;
        const target = normalizeUrlForCompare(link.targetUrl);
        inlinks.set(target, (inlinks.get(target) ?? 0) + 1);
      }
      const orphanCount = indexable.filter((page) => (inlinks.get(normalizeUrlForCompare(page.url)) ?? 0) === 0)
        .length;
      const ratio = orphanCount / indexable.length;
      if (ratio >= ORPHAN_RATIO_THRESHOLD) {
        findings.push(
          makeFinding('NO_INTERNAL_INLINKS', 'internal-linking', 'medium', ctx.run.seedUrl, {
            orphanCount,
            indexableCount: indexable.length,
            ratio: Number(ratio.toFixed(2)),
          }),
        );
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'TOO_MANY_INTERNAL_OUTLINKS_SIGNAL',
      category: 'internal-linking',
      severity: 'low',
      description: 'Page links out to an excessive number of internal URLs (signal)',
      version: 1,
      active: true,
    },
    pageScope: allPages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const outlinks = new Map<string, number>();
      for (const link of ctx.links) {
        if (!link.internal) continue;
        outlinks.set(normalizeUrlForCompare(link.sourceUrl), (outlinks.get(normalizeUrlForCompare(link.sourceUrl)) ?? 0) + 1);
      }
      for (const page of ctx.pages) {
        const count = outlinks.get(normalizeUrlForCompare(page.url)) ?? 0;
        if (count > MAX_INTERNAL_OUTLINKS) {
          findings.push(
            makeFinding('TOO_MANY_INTERNAL_OUTLINKS_SIGNAL', 'internal-linking', 'low', page.url, {
              internalOutlinks: count,
              threshold: MAX_INTERNAL_OUTLINKS,
              signal: true,
            }),
          );
        }
      }
      return findings;
    },
  },
];

import type { AuditFinding } from '../contract';
import type { AuditContext } from '../context';
import type { AuditRule } from '../registry';
import { baseLanguage, indexablePages, makeFinding, tokens } from '../helpers';

const THIN_CONTENT_WORDS = 150;
const GENERIC_TITLES = new Set([
  'home',
  'home page',
  'homepage',
  'index',
  'default page',
  'untitled',
  'untitled document',
  'new page',
  'website',
  'site',
  'welcome',
]);

function normalizeTextOf(value: string | null): string {
  if (!value) return '';
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export const onPageRules: AuditRule[] = [
  {
    definition: {
      key: 'MISSING_TITLE',
      category: 'on-page',
      severity: 'high',
      description: 'Page has no <title> element',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (!page.indexable || page.httpStatus === null || page.httpStatus >= 400) continue;
        if (page.title === null || page.title.trim() === '') {
          findings.push(
            makeFinding('MISSING_TITLE', 'on-page', 'high', page.url, {
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
      key: 'EMPTY_TITLE',
      category: 'on-page',
      severity: 'high',
      description: 'Page title resolves to an empty string',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (page.title === null) continue;
        if (page.title.trim() === '') {
          findings.push(makeFinding('EMPTY_TITLE', 'on-page', 'high', page.url, {}));
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'DUPLICATE_TITLE',
      category: 'on-page',
      severity: 'medium',
      description: 'Two or more pages share the same <title>',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const byTitle = new Map<string, string[]>();
      for (const page of ctx.pages) {
        if (!page.indexable || !page.title || page.title.trim() === '') continue;
        const key = normalizeTextOf(page.title);
        const list = byTitle.get(key) ?? [];
        list.push(page.url);
        byTitle.set(key, list);
      }
      for (const [title, urls] of byTitle) {
        if (urls.length > 1) {
          findings.push(
            makeFinding('DUPLICATE_TITLE', 'on-page', 'medium', urls[0] ?? null, {
              title,
              pages: urls.slice(0, 10),
              count: urls.length,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'TITLE_TOO_GENERIC',
      category: 'on-page',
      severity: 'low',
      description: 'Page title is generic (recommendation, not a failure)',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (!page.indexable || !page.title || page.title.trim() === '') continue;
        const title = normalizeTextOf(page.title);
        const isGeneric =
          GENERIC_TITLES.has(title) ||
          title.startsWith('welcome to ') ||
          title === normalizeTextOf(ctx.siteDomain);
        if (isGeneric) {
          findings.push(
            makeFinding('TITLE_TOO_GENERIC', 'on-page', 'low', page.url, {
              title: page.title,
              recommendation: true,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'MISSING_META_DESCRIPTION',
      category: 'on-page',
      severity: 'medium',
      description: 'Page has no meta description',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (!page.indexable || page.httpStatus === null || page.httpStatus >= 400) continue;
        if (!page.metaDescription || page.metaDescription.trim() === '') {
          findings.push(
            makeFinding('MISSING_META_DESCRIPTION', 'on-page', 'medium', page.url, {
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
      key: 'DUPLICATE_META_DESCRIPTION',
      category: 'on-page',
      severity: 'medium',
      description: 'Two or more pages share the same meta description',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const byDescription = new Map<string, string[]>();
      for (const page of ctx.pages) {
        if (!page.indexable || !page.metaDescription || page.metaDescription.trim() === '') continue;
        const key = normalizeTextOf(page.metaDescription);
        const list = byDescription.get(key) ?? [];
        list.push(page.url);
        byDescription.set(key, list);
      }
      for (const [description, urls] of byDescription) {
        if (urls.length > 1) {
          findings.push(
            makeFinding('DUPLICATE_META_DESCRIPTION', 'on-page', 'medium', urls[0] ?? null, {
              description,
              pages: urls.slice(0, 10),
              count: urls.length,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'MISSING_H1',
      category: 'on-page',
      severity: 'medium',
      description: 'Page has no H1 heading',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (!page.indexable || page.httpStatus === null || page.httpStatus >= 400) continue;
        if (!page.h1) {
          findings.push(
            makeFinding('MISSING_H1', 'on-page', 'medium', page.url, {
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
      key: 'MULTIPLE_H1',
      category: 'on-page',
      severity: 'low',
      description: 'Page contains more than one H1 heading',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        const h1s = page.headings.filter((heading) => heading.tag === 'h1');
        if (h1s.length > 1) {
          findings.push(
            makeFinding('MULTIPLE_H1', 'on-page', 'low', page.url, {
              count: h1s.length,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'EMPTY_H1',
      category: 'on-page',
      severity: 'medium',
      description: 'Page H1 element is empty',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (page.h1 !== null && page.h1.trim() === '') {
          findings.push(makeFinding('EMPTY_H1', 'on-page', 'medium', page.url, {}));
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'TITLE_H1_MISMATCH_SIGNAL',
      category: 'on-page',
      severity: 'low',
      description: 'Page title and H1 share no significant tokens (signal, not a failure)',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (!page.indexable || !page.title || !page.h1) continue;
        const titleTokens = tokens(page.title);
        const h1Tokens = tokens(page.h1);
        if (titleTokens.size === 0 || h1Tokens.size === 0) continue;
        const overlap = [...titleTokens].filter((token) => h1Tokens.has(token)).length;
        if (overlap === 0) {
          findings.push(
            makeFinding('TITLE_H1_MISMATCH_SIGNAL', 'on-page', 'low', page.url, {
              title: page.title,
              h1: page.h1,
              overlap: 0,
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
      key: 'EMPTY_CONTENT',
      category: 'on-page',
      severity: 'high',
      description: 'Page body contains no extractable text',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (!page.indexable || page.httpStatus === null || page.httpStatus >= 400) continue;
        if (page.wordCount === 0) {
          findings.push(
            makeFinding('EMPTY_CONTENT', 'on-page', 'high', page.url, {
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
      key: 'THIN_CONTENT_SIGNAL',
      category: 'on-page',
      severity: 'low',
      description: 'Page has very little body content (recommendation, not a failure)',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (!page.indexable || page.httpStatus === null || page.httpStatus >= 400) continue;
        if (page.wordCount > 0 && page.wordCount < THIN_CONTENT_WORDS) {
          findings.push(
            makeFinding('THIN_CONTENT_SIGNAL', 'on-page', 'low', page.url, {
              wordCount: page.wordCount,
              threshold: THIN_CONTENT_WORDS,
              recommendation: true,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'IMAGE_MISSING_ALT',
      category: 'on-page',
      severity: 'low',
      description: 'Page contains images without alt text',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        const missing = page.images.filter((image) => !image.alt || image.alt.trim() === '');
        if (missing.length > 0) {
          findings.push(
            makeFinding('IMAGE_MISSING_ALT', 'on-page', 'low', page.url, {
              missingCount: missing.length,
              images: missing.slice(0, 10),
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'INVALID_LANGUAGE_DECLARATION',
      category: 'on-page',
      severity: 'medium',
      description: 'Page declares a language that differs from the site language',
      version: 1,
      active: true,
    },
    pageScope: indexablePages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const siteLang = baseLanguage(ctx.siteLanguage);
      if (!siteLang) return [];
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        const pageLang = baseLanguage(page.language);
        if (pageLang && pageLang !== siteLang) {
          findings.push(
            makeFinding('INVALID_LANGUAGE_DECLARATION', 'on-page', 'medium', page.url, {
              declaredLanguage: page.language,
              siteLanguage: ctx.siteLanguage,
            }),
          );
        }
      }
      return findings;
    },
  },
];

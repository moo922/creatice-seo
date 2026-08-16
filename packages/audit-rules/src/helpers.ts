import type { AuditContext, AuditPageSignal } from './context';
import type { AuditCategory, AuditFinding, AuditSeverity } from './contract';

/** Pages that are indexable and returned a 2xx status. */
export function indexablePages(ctx: AuditContext): AuditPageSignal[] {
  return ctx.pages.filter((page) => page.indexable && page.httpStatus !== null && page.httpStatus < 400);
}

/** All crawled pages. */
export function allPages(ctx: AuditContext): AuditPageSignal[] {
  return ctx.pages;
}

/** Normalizes a URL for comparison (scheme + www + trailing slash removed). */
export function normalizeUrlForCompare(url: string): string {
  try {
    const parsed = new URL(url.toLowerCase().trim());
    const host = parsed.hostname.replace(/^www\./, '');
    let path = parsed.pathname.replace(/\/+$/, '');
    if (path === '') path = '/';
    const query = parsed.search ? parsed.search : '';
    return `${host}${path}${query}`;
  } catch {
    return url.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

const LANGUAGE_NAMES: Record<string, string> = {
  english: 'en',
  arabic: 'ar',
  french: 'fr',
  german: 'de',
  spanish: 'es',
  italian: 'it',
  portuguese: 'pt',
  dutch: 'nl',
  russian: 'ru',
  turkish: 'tr',
  chinese: 'zh',
  japanese: 'ja',
  korean: 'ko',
  hindi: 'hi',
  urdu: 'ur',
  persian: 'fa',
  hebrew: 'he',
  swedish: 'sv',
  danish: 'da',
  norwegian: 'no',
  finnish: 'fi',
  polish: 'pl',
  czech: 'cs',
  greek: 'el',
  ukrainian: 'uk',
  indonesian: 'id',
  malay: 'ms',
  thai: 'th',
  vietnamese: 'vi',
};

/**
 * Normalizes a language declaration to its ISO 639-1 base code. Handles both
 * ISO codes ("en-US") and full names ("English"), returning null when the
 * value cannot be interpreted.
 */
export function baseLanguage(lang: string | null | undefined): string | null {
  if (!lang) return null;
  const value = lang.trim().toLowerCase();
  const firstPart = value.split(/[-_]/)[0] ?? '';
  if (firstPart.length === 2 && /^[a-z]{2}$/.test(firstPart)) return firstPart;
  if (LANGUAGE_NAMES[value]) return LANGUAGE_NAMES[value];
  if (LANGUAGE_NAMES[firstPart]) return LANGUAGE_NAMES[firstPart];
  return null;
}

export function tokens(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ')
      .split(' ')
      .filter((token) => token.length > 1),
  );
}

export function makeFinding(
  ruleKey: string,
  category: AuditCategory,
  severity: AuditSeverity,
  url: string | null,
  evidence: Record<string, unknown>,
): AuditFinding {
  return { ruleKey, category, severity, url, passed: false, evidence };
}

export interface Counted {
  url: string;
  count: number;
  detail: string;
}

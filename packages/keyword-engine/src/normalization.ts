import { isArabic, normalizeArabic } from '@creative-seo/content';

/**
 * Keyword normalization (Sections 3-4).
 *
 * Deterministic normalization happens BEFORE any AI call. It is used only for
 * duplicate detection and matching — the original keyword is always preserved
 * verbatim in `keyword` and never overwritten.
 *
 * Arabic: normalizes common Unicode variants (hamza/alef forms, tatweel,
 * diacritics) for MATCHING purposes only. We never stem destructively and never
 * change search intent. `ي`/`ى` and `ة`/`ه` are normalized for matching but the
 * original spelling remains untouched.
 *
 * English: lowercase, trim, collapse spaces, safe punctuation normalization.
 * Brand spelling, product models, numbers, locations and meaningful symbols are
 * preserved.
 */

const ARABIC_RANGE = /[\u0600-\u06FF\u0750-\u077F]/;

/** Safe punctuation set we collapse to a single space (kept minimal).
 * Meaningful symbols (+ - & # . : @ /) are preserved for brand/product terms. */
const PUNCTUATION = /[!$%^*()_=[\]{};"|,<>?\\`~]/g;
const MULTI_SPACE = /\s+/g;

function isArabicText(value: string): boolean {
  return ARABIC_RANGE.test(value);
}

/**
 * Normalizes Arabic for matching: strips diacritics, removes tatweel,
 * normalizes hamza/alef (أ إ آ -> ا, ؤ -> و, ة -> ه, ى -> ي), collapses
 * punctuation and whitespace. Never stems words.
 */
export function normalizeArabicKeyword(value: string): string {
  const withoutDiacritics = normalizeArabic(value);
  return withoutDiacritics
    .replace(PUNCTUATION, ' ')
    .replace(MULTI_SPACE, ' ')
    .trim();
}

/**
 * Normalizes English for matching: lowercase, trim, collapse spaces and
 * safe punctuation. Numerals, brands and symbols that carry meaning are kept.
 */
export function normalizeEnglishKeyword(value: string): string {
  return value
    .toLowerCase()
    .replace(PUNCTUATION, ' ')
    .replace(MULTI_SPACE, ' ')
    .trim();
}

/**
 * Detects the language and applies the correct normalization. Returns the
 * normalized form used for duplicate detection. Original form is untouched.
 */
export function normalizeKeyword(value: string): string {
  const input = String(value ?? '').trim();
  if (!input) return '';
  return isArabicText(input) ? normalizeArabicKeyword(input) : normalizeEnglishKeyword(input);
}

/** Language detection: returns 'ar' or 'en' (or null for empty). */
export function detectLanguage(value: string): 'ar' | 'en' | null {
  const input = String(value ?? '').trim();
  if (!input) return null;
  return isArabicText(input) ? 'ar' : 'en';
}

/** SHA-256 hex digest of the normalized form for stable unique keys. */
export function keywordHash(value: string): string {
  const normalized = normalizeKeyword(value);
  return sha256Hex(normalized);
}

function sha256Hex(value: string): string {
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(value).digest('hex');
}
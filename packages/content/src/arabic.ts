/**
 * Arabic-aware text utilities for the content pipeline.
 *
 * Requirements addressed here:
 * - prioritize natural Arabic (no forced exact-match repetition);
 * - allow morphological keyword variants;
 * - preserve configured regional terminology;
 * - evaluate semantic coverage instead of raw repetition.
 */

const ARABIC_RANGE = /[\u0600-\u06FF\u0750-\u077F]/;

/** Arabic prefixes that form morphological variants (al-, wa-, fa-, bi-, li-, ka-, etc.). */
const ARABIC_PREFIXES = ['وال', 'فال', 'بال', 'لل', 'للا', 'وال', 'بال', 'ال', 'و', 'ف', 'ب', 'ل', 'ك', 'س', 'ت'];
const ARABIC_SUFFIXES = ['ات', 'ون', 'ين', 'ان', 'ية', 'ي', 'ة', 'ه', 'هم', 'ها', 'كما'];

const DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;
const HAMZA_NORMALIZATION: Record<string, string> = {
  '\u0622': '\u0627',
  '\u0623': '\u0627',
  '\u0625': '\u0627',
  '\u0624': '\u0648',
  '\u0629': '\u0647',
  '\u0649': '\u064a',
};

export function isArabic(text: string): boolean {
  return ARABIC_RANGE.test(text);
}

/** Strips diacritics, normalizes hamza/alef forms and tatweel. */
export function normalizeArabic(text: string): string {
  let out = text.replace(DIACRITICS, '');
  out = Array.from(out)
    .map((char) => HAMZA_NORMALIZATION[char] ?? char)
    .join('');
  return out;
}

export function normalizeText(text: string): string {
  if (isArabic(text)) {
    return normalizeArabic(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Produces the morphological variant set for an Arabic term. Variants are used
 * for coverage checks so natural prose (with prefixes/suffixes) still counts as
 * covering the keyword without requiring awkward exact-match repetition.
 */
export function arabicMorphologicalVariants(term: string): Set<string> {
  const normalized = normalizeArabic(term.trim());
  if (normalized.length === 0) {
    return new Set();
  }
  const variants = new Set<string>([normalized]);
  for (const prefix of ARABIC_PREFIXES) {
    variants.add(`${prefix}${normalized}`);
  }
  for (const suffix of ARABIC_SUFFIXES) {
    variants.add(`${normalized}${suffix}`);
  }
  return variants;
}

export interface CoverageResult {
  /** 0-1 coverage of the keyword by the content, variant-aware for Arabic. */
  coverage: number;
  /** Number of distinct morphological variants matched (Arabic only). */
  variantMatches: number;
  /** Whether an exact occurrence exists (informational only). */
  exactMatch: boolean;
}

/**
 * Semantic keyword coverage. For Arabic, coverage is the ratio of distinct
 * morphological variants found in the text; for other languages it is based on
 * normalized phrase occurrence. Raw repetition is NOT rewarded.
 */
export function semanticKeywordCoverage(content: string, keyword: string, language: 'ar' | 'en'): CoverageResult {
  const normalizedContent = normalizeText(content);
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) {
    return { coverage: 0, variantMatches: 0, exactMatch: false };
  }

  if (language === 'ar') {
    const variants = arabicMorphologicalVariants(normalizedKeyword);
    let matches = 0;
    for (const variant of variants) {
      if (normalizedContent.includes(variant)) {
        matches += 1;
      }
    }
    const exact = normalizedContent.includes(normalizedKeyword);
    return {
      coverage: Math.min(1, matches / Math.min(variants.size, 12)),
      variantMatches: matches,
      exactMatch: exact,
    };
  }

  const exact = normalizedContent.includes(normalizedKeyword);
  const singleWord = normalizedKeyword.split(' ').length === 1;
  const partial = singleWord ? exact : allTermsPresent(normalizedContent, normalizedKeyword);
  return { coverage: exact ? 1 : partial ? 0.6 : 0, variantMatches: 0, exactMatch: exact };
}

/**
 * Detects keyword stuffing. For Arabic, exact-match repetition is not punished
 * when coverage is achieved through variants; only clearly unnatural repetition
 * (many raw repeats of the same keyword) triggers a flag.
 */
export function detectKeywordStuffing(content: string, keywords: string[], language: 'ar' | 'en'): {
  stuffed: boolean;
  occurrences: Array<{ keyword: string; count: number }>;
} {
  const normalizedContent = normalizeText(content);
  const occurrences: Array<{ keyword: string; count: number }> = [];
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) continue;
    let count = 0;
    let index = normalizedContent.indexOf(normalizedKeyword);
    while (index !== -1) {
      count += 1;
      index = normalizedContent.indexOf(normalizedKeyword, index + normalizedKeyword.length);
    }
    if (count > 0) {
      occurrences.push({ keyword, count });
    }
  }
  // Thresholds: English content is flagged sooner than Arabic, where variants
  // are preferred and only very high raw repetition looks unnatural.
  const threshold = language === 'ar' ? 5 : 3;
  const stuffed = occurrences.some((entry) => entry.count > threshold);
  return { stuffed, occurrences };
}

/**
 * Verifies configured regional terminology appears verbatim in the content.
 * Regional terms are preserved exactly (e.g. Arabic spellings specific to a
 * market) and must not be "corrected" to a different dialect.
 */
export function verifyRegionalTerminology(content: string, terms: string[]): {
  missing: string[];
  preserved: string[];
} {
  const normalizedContent = normalizeText(content);
  const missing: string[] = [];
  const preserved: string[] = [];
  for (const term of terms) {
    if (normalizedContent.includes(normalizeText(term))) {
      preserved.push(term);
    } else {
      missing.push(term);
    }
  }
  return { missing, preserved };
}

function allTermsPresent(content: string, phrase: string): boolean {
  const terms = phrase.split(' ').filter(Boolean);
  return terms.every((term) => content.includes(term));
}

/** Counts words (Arabic or Latin) in a text. */
export function countWords(text: string): number {
  const words = text.match(/\p{L}+[\p{L}\p{N}]*/gu);
  return words?.length ?? 0;
}

/** Removes HTML tags for text-level analysis. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

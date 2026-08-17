import { normalizeKeyword, keywordHash } from './normalization';

/**
 * Keyword deduplication and multi-source merging (Sections 2, 5, 94-95).
 *
 * One canonical Keyword may be observed from GSC, Google Ads, manual seeds,
 * site content and AI research. Exact normalized duplicates are merged into the
 * same canonical keyword row; source associations are tracked separately in
 * keyword_sources (one row per keyword+source).
 *
 * We never send trivial duplicate variants repeatedly to AI for clustering.
 */

export type KeywordInput = {
  /** Exact source wording (preserved verbatim). */
  keyword: string;
  /** Source identifier: MANUAL / GSC / GOOGLE_ADS / SITE_CONTENT / AI_RESEARCH / IMPORT. */
  source: string;
  /** Optional per-source exact wording (may differ slightly from canonical). */
  sourceValue?: string;
  language?: string | null;
  locale?: string | null;
  country?: string | null;
};

export type CanonicalKeywordDraft = {
  keyword: string;
  normalized: string;
  normalizedHash: string;
  source: string;
  language: string | null;
  locale: string | null;
  country: string | null;
};

/** Builds the canonical draft for a raw keyword input. */
export function toCanonicalDraft(input: KeywordInput): CanonicalKeywordDraft {
  const normalized = normalizeKeyword(input.keyword);
  return {
    keyword: String(input.keyword).trim(),
    normalized,
    normalizedHash: keywordHash(input.keyword),
    source: input.source,
    language: input.language ?? null,
    locale: input.locale ?? null,
    country: input.country ?? null,
  };
}

/**
 * Groups a batch of raw keyword inputs by normalized hash so duplicates collapse
 * into one canonical keyword. Returns a map of hash -> canonical draft + all
 * source associations that produced it.
 */
export function deduplicateKeywords(inputs: KeywordInput[]): Map<string, { draft: CanonicalKeywordDraft; sources: KeywordInput[] }> {
  const map = new Map<string, { draft: CanonicalKeywordDraft; sources: KeywordInput[] }>();
  for (const input of inputs) {
    const draft = toCanonicalDraft(input);
    if (!draft.normalized) continue;
    const existing = map.get(draft.normalizedHash);
    if (existing) {
      existing.sources.push(input);
    } else {
      map.set(draft.normalizedHash, { draft, sources: [input] });
    }
  }
  return map;
}

/** Source counts for reporting: hash -> number of contributing sources. */
export function sourceCounts(map: Map<string, { draft: CanonicalKeywordDraft; sources: KeywordInput[] }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [hash, entry] of map) {
    counts.set(hash, entry.sources.length);
  }
  return counts;
}
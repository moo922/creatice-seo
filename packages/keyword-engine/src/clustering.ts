import { normalizeKeyword } from './normalization';

/**
 * Semantic clustering pipeline (Sections 22-28).
 *
 * We do NOT send all keywords blindly to one LLM prompt. The pipeline is:
 *   normalize -> dedupe -> filter obvious irrelevant -> create candidate
 *   semantic groups (deterministic signals) -> send candidate groups to AI
 *   for the final semantic intent decision.
 *
 * AI makes the final grouping decision. Embeddings are optional — when not
 * configured we fall back to lexical/entity grouping + AI batching. We never
 * invent volume/clicks/impressions/position and never turn trivial variants
 * into separate pages (Section 28).
 */

export type ClusterCandidate = {
  clusterName: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  supportingQuestions: string[];
  intent: string;
  secondaryIntent: string | null;
  pageType: string;
  businessRelevance: string;
  existingUrlCandidate: string | null;
  recommendedAction: string;
  confidence: number;
  reason: string;
};

export type ClusterGroup = {
  label: string;
  keywords: string[];
};

/**
 * Deterministic candidate grouping. Uses lexical overlap of significant terms,
 * shared words and normalized forms to create coarse buckets that the AI agent
 * then refines. This is intentionally coarse — AI makes the final call.
 */
export function candidateGroups(keywords: string[]): ClusterGroup[] {
  const cleaned = keywords.map((k) => k.trim()).filter(Boolean);
  if (cleaned.length === 0) return [];

  const groups = new Map<string, string[]>();
  for (const keyword of cleaned) {
    const terms = significantTerms(keyword);
    const label = terms[0] ?? keyword;
    const bucket = groups.get(label) ?? [];
    bucket.push(keyword);
    groups.set(label, bucket);
  }
  return [...groups.entries()].map(([label, keywords]) => ({ label, keywords }));
}

/** Extracts significant terms (ignores stop words) for coarse grouping. */
export function significantTerms(keyword: string): string[] {
  const STOP = new Set(['في', 'من', 'على', 'الى', 'التي', 'ما', 'لا', 'هو', 'هي', 'a', 'the', 'of', 'for', 'and', 'in', 'on', 'to', 'with', 'best', 'top']);
  const normalized = normalizeKeyword(keyword);
  return normalized.split(' ').filter((term) => term.length > 2 && !STOP.has(term));
}

/**
 * Coarse similarity for grouping — 1.0 when share >= 50% of significant terms.
 * Used only to build candidate groups; final decisions are AI-driven.
 */
export function lexicalSimilarity(a: string, b: string): number {
  const termsA = significantTerms(a);
  const termsB = significantTerms(b);
  if (termsA.length === 0 || termsB.length === 0) return 0;
  const shared = termsA.filter((term) => termsB.includes(term)).length;
  return shared / Math.min(termsA.length, termsB.length);
}

/**
 * Builds the AI clustering request for a batch of candidate groups. The AI agent
 * receives site knowledge + target market + language + metrics context so it can
 * make an intent-aware grouping decision. It must return structured JSON only.
 */
export function buildClusteringPromptContext(input: {
  siteName: string;
  siteDomain: string;
  language: string;
  market: string;
  country: string;
  groups: ClusterGroup[];
  siteKnowledge: string;
  existingUrls: string[];
}): string {
  return JSON.stringify({
    site: input.siteName,
    domain: input.siteDomain,
    language: input.language,
    market: input.market,
    country: input.country,
    candidate_groups: input.groups,
    site_knowledge: input.siteKnowledge,
    existing_urls: input.existingUrls,
    rules: [
      'Group keywords by SEARCH INTENT, not by string difference.',
      'Trivial variants (word order, Arabic morphology, singular/plural) belong together where intent matches.',
      'Never create a separate page for trivial variants.',
      'Never invent volume, clicks, impressions or position.',
      'Return structured JSON only.',
    ],
  });
}

/**
 * Validates AI clustering output: ensures clusters reference keywords that
 * actually exist in the input set and look structurally sane. Rejects invented
 * keywords and empty clusters.
 */
export function validateClusterOutput(
  clusters: Array<{ name: string; primary_keyword: string; keywords?: string[] }>,
  knownKeywords: Set<string>,
): Array<{ name: string; primary_keyword: string; keywords: string[] }> {
  if (!Array.isArray(clusters)) return [];
  return clusters
    .filter((c) => c && typeof c.name === 'string' && typeof c.primary_keyword === 'string')
    .map((c) => ({
      name: c.name,
      primary_keyword: c.primary_keyword,
      keywords: (c.keywords ?? []).filter((kw) => knownKeywords.has(kw)),
    }))
    .filter((c) => c.keywords.length > 0);
}
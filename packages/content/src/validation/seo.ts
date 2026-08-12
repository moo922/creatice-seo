import type { ValidatorResultDto } from '@creative-seo/types';
import type { KeywordIntent, KeywordPageType } from '@creative-seo/types';
import { countWords, detectKeywordStuffing, semanticKeywordCoverage, stripHtml } from '../arabic';
import { metric, validatorResult, VALIDATOR_PASS_THRESHOLD } from './common';

export interface SeoInput {
  html: string;
  language: 'ar' | 'en';
  seoTitle: string;
  metaDescription: string;
  slug: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  intent: KeywordIntent | null;
  pageType: KeywordPageType | null;
  internalLinksCount: number;
}

const INTENT_MIN_WORDS: Partial<Record<KeywordIntent, number>> = {
  TRANSACTIONAL: 300,
  COMMERCIAL: 600,
  INFORMATIONAL: 900,
  NAVIGATIONAL: 200,
};

const INTENT_LABELS: Record<KeywordIntent, string> = {
  TRANSACTIONAL: 'Transactional',
  COMMERCIAL: 'Commercial',
  INFORMATIONAL: 'Informational',
  NAVIGATIONAL: 'Navigational',
};

/**
 * Deterministic on-page SEO checks. The result is merged with the LLM SEO
 * review. Checks are Rank Math-compatible (focus keyword, title, description,
 * slug) but never chase a perfect score: exact-match repetition is penalized,
 * not rewarded, and semantic coverage is preferred.
 */
export function deterministicSeoCheck(input: SeoInput): ValidatorResultDto {
  const plain = stripHtml(input.html);
  const wordCount = countWords(plain);
  const titleLength = input.seoTitle.length;
  const metaLength = input.metaDescription.length;
  const keywords = [input.primaryKeyword, ...input.secondaryKeywords].filter(Boolean);

  const titleCoverage = semanticKeywordCoverage(input.seoTitle, input.primaryKeyword, input.language);
  const metaCoverage = semanticKeywordCoverage(input.metaDescription, input.primaryKeyword, input.language);
  const bodyCoverage = semanticKeywordCoverage(plain, input.primaryKeyword, input.language);
  const stuffing = detectKeywordStuffing(plain, keywords, input.language);
  const minWords = input.intent ? INTENT_MIN_WORDS[input.intent] ?? 400 : 400;

  const h1Count = countTags(input.html, 'h1');
  const h2Count = countTags(input.html, 'h2');
  const h3Count = countTags(input.html, 'h3');
  const imgCount = countTags(input.html, 'img');
  const imgWithAlt = countTagsWithAlt(input.html);

  const recommendations: string[] = [];
  const metrics = [
    metric('seo.keyword.title', 'Primary keyword in SEO title', Math.round(titleCoverage.coverage * 100), {
      weight: 2,
      details: `coverage ${Math.round(titleCoverage.coverage * 100)}%`,
    }),
    metric('seo.title.length', 'SEO title length (30-65 chars)', scoreRange(titleLength, 30, 65), {
      weight: 1,
      details: `${titleLength} characters`,
    }),
    metric('seo.keyword.meta', 'Primary keyword in meta description', Math.round(metaCoverage.coverage * 100), {
      weight: 2,
      details: `coverage ${Math.round(metaCoverage.coverage * 100)}%`,
    }),
    metric('seo.meta.length', 'Meta description length (50-160 chars)', scoreRange(metaLength, 50, 160), {
      weight: 1,
      details: `${metaLength} characters`,
    }),
    metric('seo.slug', 'Slug relevance', input.slug.length > 0 ? Math.min(100, 100 - Math.max(0, input.slug.length - 70)) : 0, {
      weight: 1,
      details: input.slug,
    }),
    metric('seo.h1', 'Single, present H1', h1Count === 1 ? 100 : h1Count === 0 ? 20 : 60, {
      weight: 2,
      details: `${h1Count} H1 found`,
    }),
    metric('seo.headings', 'Heading hierarchy (h2/h3)', h2Count >= 2 && h3Count >= 0 ? Math.min(100, 40 + h2Count * 10) : 30, {
      weight: 1,
      details: `${h2Count} H2, ${h3Count} H3`,
    }),
    metric('seo.length', `Content length for ${input.intent ? INTENT_LABELS[input.intent] : 'page'} intent`, scoreMin(wordCount, minWords), {
      weight: 2,
      details: `${wordCount} words (min ${minWords})`,
    }),
    metric('seo.coverage', 'Semantic keyword coverage in body', Math.round(bodyCoverage.coverage * 100), {
      weight: 2,
      details:
        input.language === 'ar'
          ? `morphological variants matched: ${bodyCoverage.variantMatches}`
          : `exact match: ${bodyCoverage.exactMatch}`,
    }),
    metric('seo.no.stuffing', 'No keyword stuffing', stuffing.stuffed ? 10 : 100, {
      weight: 2,
      details: stuffing.stuffed ? 'unnatural raw keyword repetition detected' : 'natural usage',
    }),
    metric('seo.internal.links', 'Internal links present', input.internalLinksCount > 0 ? 100 : 30, {
      weight: 1,
      details: `${input.internalLinksCount} internal link(s)`,
    }),
    metric('seo.images.alt', 'Images have alt text', imgCount === 0 ? 100 : Math.round((imgWithAlt / imgCount) * 100), {
      weight: 1,
      details: imgCount === 0 ? 'no images' : `${imgWithAlt}/${imgCount} with alt`,
    }),
  ];

  if (titleLength < 30 || titleLength > 65) recommendations.push(`SEO title is ${titleLength} chars; aim for 30-65.`);
  if (metaLength < 50 || metaLength > 160) recommendations.push(`Meta description is ${metaLength} chars; aim for 50-160.`);
  if (h1Count !== 1) recommendations.push('Use exactly one H1 per page.');
  if (wordCount < minWords) recommendations.push(`Content is ${wordCount} words; ${minWords}+ recommended for this intent.`);
  if (stuffing.stuffed) recommendations.push('Remove unnatural keyword repetition; prefer natural variants and synonyms.');
  if (bodyCoverage.coverage < 0.6) recommendations.push('Improve semantic coverage of the primary keyword.');
  if (input.internalLinksCount === 0) recommendations.push('Add at least one internal link.');
  if (imgCount > 0 && imgWithAlt < imgCount) recommendations.push('Add alt text to all images.');

  return validatorResult('SEO', 'SEO validator', metrics, recommendations);
}

/** True when a deterministic check failed and needs fixing. */
export function seoCheckFailed(input: SeoInput): boolean {
  const plain = stripHtml(input.html);
  const wordCount = countWords(plain);
  const minWords = input.intent ? INTENT_MIN_WORDS[input.intent] ?? 400 : 400;
  return (
    countTags(input.html, 'h1') !== 1 ||
    wordCount < Math.min(minWords, 300) ||
    input.seoTitle.length < 30 ||
    detectKeywordStuffing(plain, [input.primaryKeyword], input.language).stuffed
  );
}

export function seoPassed(overallScore: number): boolean {
  return overallScore >= VALIDATOR_PASS_THRESHOLD;
}

function scoreRange(value: number, min: number, max: number): number {
  if (value >= min && value <= max) return 100;
  const distance = value < min ? min - value : value - max;
  return Math.max(0, 100 - distance * 4);
}

function scoreMin(value: number, min: number): number {
  if (value >= min) return 100;
  return Math.round((value / min) * 100);
}

function countTags(html: string, tag: string): number {
  const matches = html.match(new RegExp(`<${tag}[^>]*>`, 'gi'));
  return matches?.length ?? 0;
}

function countTagsWithAlt(html: string): number {
  const matches = html.match(/<img[^>]*>/gi) ?? [];
  return matches.filter((tag) => /alt\s*=\s*["'][^"']+["']/.test(tag)).length;
}

import type { ValidatorResultDto } from '@creative-seo/types';
import { semanticKeywordCoverage } from '../arabic';
import { metric, validatorResult } from './common';

export interface RankMathInput {
  html: string;
  language: 'ar' | 'en';
  primaryKeyword: string;
  secondaryKeywords: string[];
  seoTitle: string;
  metaDescription: string;
  slug: string;
}

/**
 * Rank Math-compatible field validator. Ensures the plugin-facing fields
 * (focus keyword, SEO title, meta description, slug) are set and aligned.
 * It explicitly does NOT chase a 100/100 score: it reports a sane target and
 * the current estimate, and prefers relevance and readability over gaming.
 */
export function deterministicRankMathCheck(input: RankMathInput): ValidatorResultDto {
  const titleLen = input.seoTitle.length;
  const metaLen = input.metaDescription.length;
  const titleCoverage = semanticKeywordCoverage(input.seoTitle, input.primaryKeyword, input.language);
  const metaCoverage = semanticKeywordCoverage(input.metaDescription, input.primaryKeyword, input.language);

  const recommendations: string[] = [];
  if (titleLen < 30 || titleLen > 65) recommendations.push('Adjust SEO title to 30-65 characters.');
  if (metaLen < 50 || metaLen > 160) recommendations.push('Adjust meta description to 50-160 characters.');
  if (titleCoverage.coverage < 0.5) recommendations.push('Include the focus keyword (or a natural variant) in the SEO title.');
  if (metaCoverage.coverage < 0.3) recommendations.push('Include the focus keyword (or a natural variant) in the meta description.');
  if (!input.slug) recommendations.push('Set a descriptive, keyword-aligned slug.');

  return validatorResult(
    'RANKMATH',
    'Rank Math validator',
    [
      metric('rankmath.focus.set', 'Focus keyword set', input.primaryKeyword ? 100 : 0, { weight: 2 }),
      metric('rankmath.title.length', 'SEO title length', scoreRange(titleLen, 30, 65), { weight: 2, details: `${titleLen} chars` }),
      metric('rankmath.title.keyword', 'Focus keyword in title', Math.round(titleCoverage.coverage * 100), { weight: 2 }),
      metric('rankmath.meta.length', 'Meta description length', scoreRange(metaLen, 50, 160), { weight: 2, details: `${metaLen} chars` }),
      metric('rankmath.meta.keyword', 'Focus keyword in meta', Math.round(metaCoverage.coverage * 100), { weight: 2 }),
      metric('rankmath.slug', 'Slug set & aligned', input.slug ? (input.slug.length <= 70 ? 100 : 60) : 0, { weight: 1 }),
    ],
    recommendations,
    'Rank Math-compatible checks only; the score is internal and should not be chased to 100/100.',
  );
}

function scoreRange(value: number, min: number, max: number): number {
  if (value >= min && value <= max) return 100;
  const distance = value < min ? min - value : value - max;
  return Math.max(0, 100 - distance * 4);
}

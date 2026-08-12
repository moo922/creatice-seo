import type { VisibilityCategory, VisibilityPromptDto } from '@creative-seo/types';

/**
 * Standardized prompt sets per site. The prompts are generic observation
 * questions — the brand/domain is deliberately NOT injected into the prompt so
 * each run measures genuine organic visibility. The same prompts are used
 * across sites (parameterized only by the site's industry/product/location),
 * which keeps observations comparable over time and between sites.
 */

export interface PromptSetContext {
  industry: string;
  product: string;
  location: string;
  problem: string;
}

export const VISIBILITY_CATEGORY_ORDER: readonly VisibilityCategory[] = [
  'BRAND',
  'COMMERCIAL',
  'INFORMATIONAL',
  'COMPARISON',
  'LOCAL',
  'DECISION',
  'PROBLEM_SOLUTION',
];

const DEFAULT_PRODUCT = 'products or services';
const DEFAULT_INDUSTRY = 'companies in this industry';
const DEFAULT_LOCATION = 'this area';
const DEFAULT_PROBLEM = 'a common problem in this space';

/**
 * Builds the standardized prompt set. Prompts are identical for every site
 * except for the site's configured industry, product, location and problem.
 */
export function buildStandardPromptSet(context: PromptSetContext): VisibilityPromptDto[] {
  const product = context.product.trim() || DEFAULT_PRODUCT;
  const industry = context.industry.trim() || DEFAULT_INDUSTRY;
  const location = context.location.trim() || DEFAULT_LOCATION;
  const problem = context.problem.trim() || DEFAULT_PROBLEM;

  const prompts: Array<[VisibilityCategory, string]> = [
    ['BRAND', `Which ${industry} are the most well-known?`],
    ['COMMERCIAL', `What are the best ${product} to buy?`],
    ['INFORMATIONAL', `What should someone know about ${industry}?`],
    ['COMPARISON', `Compare the top ${product} providers.`],
    ['LOCAL', `Who offers the best ${product} near ${location}?`],
    ['DECISION', `Which ${product} should I choose and why?`],
    ['PROBLEM_SOLUTION', `How can someone solve ${problem}?`],
  ];

  return prompts.map(([category, prompt]) => ({ category, prompt }));
}

/** A default context usable before the site's own settings are known. */
export function defaultPromptSetContext(): PromptSetContext {
  return { industry: '', product: '', location: '', problem: '' };
}

export function categoryPrompt(prompts: VisibilityPromptDto[], category: VisibilityCategory): VisibilityPromptDto | null {
  return prompts.find((prompt) => prompt.category === category) ?? null;
}

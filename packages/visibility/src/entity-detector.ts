/**
 * Deterministic entity detection with alias resolution (GC06 Sections 17-20).
 * Classifies entity mentions as MENTION, INCLUDED, RECOMMENDED, or CITED.
 * Stores context (recommended, compared, criticized, etc.) and appearance order.
 */

import type { AiVisibilityCompetitor } from '@creative-seo/database';
import { resolveAllEntities, type EntityAlias } from './alias-normalizer';
import { extractHost, domainsMatch } from './domain-normalizer';

export type MentionContext = 'recommended' | 'compared' | 'criticized' | 'cited_as_source' | 'example' | 'alternative' | 'neutral_mention';

export interface EntityDetectionResult {
  brand: {
    mentioned: boolean;
    included: boolean;
    recommended: boolean;
    cited: boolean;
    appearanceOrder: number | null;
    context: MentionContext;
    matchedAlias: string | null;
    confidence: number;
  };
  competitors: Array<{
    name: string;
    canonicalId: string;
    mentioned: boolean;
    included: boolean;
    appearanceOrder: number | null;
    context: MentionContext;
    matchedAlias: string | null;
  }>;
}

const RECOMMENDATION_PATTERNS = [
  /(?:يُنصح|يُوصى|ننصح|يجب|يمكن|من أفضل|أفضل|meritors?|recommend|suggest|should|best|top)/i,
];

const COMPARISON_PATTERNS = [
  /(?:مقارنة|مقارنةً|بالمقارنة|comparing?|versus|vs\.?|compared to|unlike|على عكس)/i,
];

const CRITICISM_PATTERNS = [
  /(?:سيء|ضعيف|مشكلة| lacks? |poor|weak|problem|deficien)/i,
];

const LIST_PATTERN = /(?:1\.\s|2\.\s|3\.\s|4\.\s|5\.\s|•\s|-\s|أولاً|ثانياً|ثالثاً)/;

function detectContext(text: string, aroundEntity: string): MentionContext {
  const lowerText = text.toLowerCase();
  const entityLower = aroundEntity.toLowerCase();
  const entityIndex = lowerText.indexOf(entityLower);

  const contextWindow = entityIndex >= 0
    ? text.slice(Math.max(0, entityIndex - 100), Math.min(text.length, entityIndex + aroundEntity.length + 100))
    : text.slice(0, 200);

  if (RECOMMENDATION_PATTERNS.some((p) => p.test(contextWindow))) return 'recommended';
  if (COMPARISON_PATTERNS.some((p) => p.test(contextWindow))) return 'compared';
  if (CRITICISM_PATTERNS.some((p) => p.test(contextWindow))) return 'criticized';
  if (/https?:\/\//.test(contextWindow) && contextWindow.includes(aroundEntity)) return 'cited_as_source';
  if (/(?:مثال|example|such as|like)/i.test(contextWindow)) return 'example';
  if (/(?:بديل|alternative|instead of)/i.test(contextWindow)) return 'alternative';
  return 'neutral_mention';
}

function detectAppearanceOrder(text: string, entityName: string): number | null {
  const lines = text.split('\n').filter((l) => l.trim());
  for (const line of lines) {
    const match = line.match(/^(\d+)[.\s]/);
    if (match?.[1] && line.toLowerCase().includes(entityName.toLowerCase())) {
      return parseInt(match[1], 10);
    }
  }
  const listItems = text.split(/(?:\n|\r)/).filter((l) => LIST_PATTERN.test(l));
  for (let i = 0; i < listItems.length; i++) {
    if (listItems[i]?.toLowerCase().includes(entityName.toLowerCase())) {
      return i + 1;
    }
  }
  return null;
}

function isInRecommendationList(text: string, entityName: string): boolean {
  const lowerText = text.toLowerCase();
  const entityLower = entityName.toLowerCase();
  const lines = lowerText.split('\n');
  for (const line of lines) {
    if (LIST_PATTERN.test(line) && line.includes(entityLower)) return true;
  }
  return false;
}

export function detectEntities(
  responseText: string,
  targetBrand: string,
  targetDomain: string,
  competitors: AiVisibilityCompetitor[],
): EntityDetectionResult {
  const allEntities: EntityAlias[] = [
    { canonicalId: 'target', canonicalName: targetBrand, aliases: [], domain: targetDomain },
    ...competitors.map((c) => ({
      canonicalId: c.id,
      canonicalName: c.canonicalName,
      aliases: c.aliases ?? [],
      domain: c.domain,
    })),
  ];

  const matches = resolveAllEntities(responseText, allEntities);

  const targetMatch = matches.find((m) => m.canonicalId === 'target');
  const competitorMatches = matches.filter((m) => m.canonicalId !== 'target');

  const brandMentioned = !!targetMatch;
  const brandIncluded = brandMentioned && (isInRecommendationList(responseText, targetBrand) || targetMatch.confidence >= 0.9);
  const brandRecommended = brandMentioned && detectContext(responseText, targetBrand) === 'recommended';
  const brandCited = !!targetMatch && (() => {
    const urls = responseText.match(/https?:\/\/[^\s<>"]+/g) ?? [];
    return urls.some((url) => {
      const host = extractHost(url);
      return host && domainsMatch(host, targetDomain);
    });
  })();

  return {
    brand: {
      mentioned: brandMentioned,
      included: brandIncluded,
      recommended: brandRecommended,
      cited: brandCited,
      appearanceOrder: detectAppearanceOrder(responseText, targetBrand),
      context: targetMatch ? detectContext(responseText, targetBrand) : 'neutral_mention',
      matchedAlias: targetMatch?.matchedAlias ?? null,
      confidence: targetMatch?.confidence ?? 0,
    },
    competitors: competitorMatches.map((match) => ({
      name: match.canonicalName,
      canonicalId: match.canonicalId,
      mentioned: true,
      included: isInRecommendationList(responseText, match.canonicalName),
      appearanceOrder: detectAppearanceOrder(responseText, match.canonicalName),
      context: detectContext(responseText, match.canonicalName),
      matchedAlias: match.matchedAlias,
    })),
  };
}

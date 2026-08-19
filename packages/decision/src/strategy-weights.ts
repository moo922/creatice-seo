import type { PriorityWeights } from './priority-engine';

/**
 * Site strategy weights allow per-site customization of priority scoring.
 * A lead generation site prioritizes commercial pages and local queries.
 * A content site prioritizes informational traffic and topic coverage.
 * If no override exists, DEFAULT_WEIGHTS from priority-engine.ts are used.
 */

export type SiteStrategyType = 'LEAD_GENERATION' | 'CONTENT_PUBLICATION' | 'LOCAL_SEO' | 'ECOMMERCE' | 'CUSTOM';

export interface SiteStrategyOverride {
  siteId: string;
  strategyType: SiteStrategyType;
  weights: PriorityWeights;
  createdAt: string;
}

export const STRATEGY_PRESETS: Record<Exclude<SiteStrategyType, 'CUSTOM'>, PriorityWeights> = {
  LEAD_GENERATION: {
    business_value: 0.28,
    search_opportunity: 0.15,
    severity: 0.15,
    affected_traffic: 0.10,
    affected_pages: 0.05,
    confidence: 0.10,
    urgency: 0.12,
    effort_inverse: 0.05,
  },
  CONTENT_PUBLICATION: {
    business_value: 0.12,
    search_opportunity: 0.25,
    severity: 0.10,
    affected_traffic: 0.18,
    affected_pages: 0.10,
    confidence: 0.10,
    urgency: 0.07,
    effort_inverse: 0.08,
  },
  LOCAL_SEO: {
    business_value: 0.25,
    search_opportunity: 0.18,
    severity: 0.18,
    affected_traffic: 0.08,
    affected_pages: 0.05,
    confidence: 0.12,
    urgency: 0.10,
    effort_inverse: 0.04,
  },
  ECOMMERCE: {
    business_value: 0.22,
    search_opportunity: 0.22,
    severity: 0.15,
    affected_traffic: 0.12,
    affected_pages: 0.08,
    confidence: 0.10,
    urgency: 0.08,
    effort_inverse: 0.03,
  },
};

export function getStrategyWeights(
  strategyType: SiteStrategyType | null | undefined,
  customWeights?: PriorityWeights,
): PriorityWeights {
  if (strategyType === 'CUSTOM' && customWeights) return customWeights;
  if (strategyType && strategyType in STRATEGY_PRESETS) {
    return STRATEGY_PRESETS[strategyType as Exclude<SiteStrategyType, 'CUSTOM'>];
  }
  return { business_value: 0.20, search_opportunity: 0.18, severity: 0.15, affected_traffic: 0.12, affected_pages: 0.08, confidence: 0.10, urgency: 0.10, effort_inverse: 0.07 };
}

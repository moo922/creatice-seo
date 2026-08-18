/**
 * Page type classifier for AEO/GEO audits. Classifies crawl pages
 * into canonical platform page types using URL patterns, title/H1 signals,
 * and cluster mapping. Returns classification with confidence score.
 */

import type { KeywordPageType } from '@creative-seo/types';

export interface PageClassification {
  pageType: KeywordPageType;
  confidence: number;
  signals: string[];
}

/** URL pattern signals for page type classification. */
const URL_PATTERNS: Record<KeywordPageType, RegExp[]> = {
  HOMEPAGE: [/^\/?$/, /\/(home|index)/i],
  SERVICE: [/\/service/i, /\/solutions/i, /\/what-we-do/i],
  PRODUCT: [/\/product/i, /\/item\//i, /\/p\//i],
  CATEGORY: [/\/category/i, /\/catalog/i, /\/collections/i, /\/shop\//i],
  LANDING_PAGE: [/\/(offer|promo|deal|special|campaign)/i],
  BLOG_ARTICLE: [/\/blog\//i, /\/news\//i, /\/article\//i, /\/post\//i],
  GUIDE: [/\/guide/i, /\/how-to/i, /\/tutorial/i, /\/learn/i, /\/docs/i],
  COMPARISON: [/\/vs\//i, /\/compare/i, /\/versus/i, /\/alternative/i],
  LOCATION_PAGE: [/\/location/i, /\/city\//i, /\/areas?\//i, /\/region/i],
  FAQ_SUPPORT: [/\/faq/i, /\/support/i, /\/help/i, /\/knowledge/i],
  EXISTING_OTHER: [],
  REVIEW_REQUIRED: [],
};

/** Title/H1 keyword signals for page type classification. */
const TITLE_SIGNALS: Record<KeywordPageType, string[]> = {
  HOMEPAGE: ['home', 'welcome', 'official site'],
  SERVICE: ['service', 'solution', 'what we do', 'our services'],
  PRODUCT: ['product', 'item', 'buy', 'purchase', 'shop'],
  CATEGORY: ['category', 'collection', 'browse', 'all products'],
  LANDING_PAGE: ['offer', 'deal', 'promo', 'limited time', 'special'],
  BLOG_ARTICLE: ['blog', 'news', 'article', 'post', 'read more'],
  GUIDE: ['guide', 'how to', 'tutorial', 'learn', 'step by step', 'guide to'],
  COMPARISON: ['vs', 'versus', 'compare', 'comparison', 'alternative to', 'better than'],
  LOCATION_PAGE: ['location', 'address', 'in ', 'near ', 'directions'],
  FAQ_SUPPORT: ['faq', 'frequently asked', 'help center', 'support', 'how do i'],
  EXISTING_OTHER: [],
  REVIEW_REQUIRED: [],
};

/**
 * Classify a page into a canonical page type based on available signals.
 * Returns the classification with confidence score (0-1).
 */
export function classifyPage(input: {
  url: string;
  title: string | null;
  h1: string | null;
  wordCount: number;
  clusterPageType?: KeywordPageType;
}): PageClassification {
  const { url, title, h1, wordCount, clusterPageType } = input;
  const signals: string[] = [];
  const scores: Record<string, number> = {};

  // If cluster already mapped a page type, use it with high confidence
  if (clusterPageType && clusterPageType !== 'EXISTING_OTHER' && clusterPageType !== 'REVIEW_REQUIRED') {
    return {
      pageType: clusterPageType,
      confidence: 0.8,
      signals: ['cluster-mapping'],
    };
  }

  // URL pattern matching
  for (const [type, patterns] of Object.entries(URL_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(url)) {
        scores[type] = (scores[type] ?? 0) + 0.4;
        signals.push(`url:${type}`);
        break;
      }
    }
  }

  // Title/H1 keyword matching
  const combinedText = `${title ?? ''} ${h1 ?? ''}`.toLowerCase();
  for (const [type, keywords] of Object.entries(TITLE_SIGNALS)) {
    for (const keyword of keywords) {
      if (combinedText.includes(keyword)) {
        scores[type] = (scores[type] ?? 0) + 0.3;
        signals.push(`title:${type}`);
        break;
      }
    }
  }

  // Homepage detection (root URL)
  const urlPath = new URL(url.startsWith('http') ? url : `http://${url}`).pathname;
  if (urlPath === '/' || urlPath === '') {
    scores['HOMEPAGE'] = (scores['HOMEPAGE'] ?? 0) + 0.5;
    signals.push('url:root');
  }

  // Word count heuristics
  if (wordCount < 100) {
    // Very thin page - likely system page
    signals.push('thin-content');
  }

  // Find the highest scoring type
  let bestType: KeywordPageType = 'EXISTING_OTHER';
  let bestScore = 0;

  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type as KeywordPageType;
    }
  }

  // Confidence based on score and signal count
  const confidence = Math.min(0.9, 0.2 + bestScore * 0.5 + signals.length * 0.05);

  return {
    pageType: bestType,
    confidence: Math.round(confidence * 100) / 100,
    signals,
  };
}

/**
 * Determine if a page type is eligible for AEO/GEO audit.
 * Eligible: Homepage, Service, Product, Category, Landing, Blog, Guide,
 * Comparison, Location, FAQ/Support.
 * Excluded: system pages, thin pages, login, cart, etc.
 */
export function isEligibleForAudit(pageType: KeywordPageType, wordCount: number): boolean {
  if (wordCount < 50) return false;

  const eligibleTypes: KeywordPageType[] = [
    'HOMEPAGE', 'SERVICE', 'PRODUCT', 'CATEGORY', 'LANDING_PAGE',
    'BLOG_ARTICLE', 'GUIDE', 'COMPARISON', 'LOCATION_PAGE', 'FAQ_SUPPORT',
  ];

  return eligibleTypes.includes(pageType);
}

/** Pages to minimize/exclude from audit. */
export const EXCLUDED_URL_PATTERNS: RegExp[] = [
  /\/(login|signin|signup|register|account|cart|checkout|payment)/i,
  /\/(privacy|terms|legal|cookie|disclaimer|policy)/i,
  /\/(tag|tags|author|category\/page|search)/i,
  /\/(wp-admin|wp-login|xmlrpc)/i,
  /\.(pdf|jpg|jpeg|png|gif|svg|css|js)$/i,
];

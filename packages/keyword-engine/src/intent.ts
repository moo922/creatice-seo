import type { KeywordIntent, KeywordPageType, BusinessRelevance } from '@creative-seo/types';

/**
 * Deterministic intent / page-type / business-relevance signals (Sections 20-21).
 *
 * These are heuristic pre-classifiers used to seed candidate groups before AI
 * makes the final semantic decision. They are NOT the final answer — the AI
 * intent/cluster agents refine them. Confidence from heuristics is low and is
 * never presented as a hardcoded 0.8.
 */

const TRANSACTIONAL_WORDS = ['buy', 'order', 'price', 'cost', 'cheap', 'discount', 'deals', 'سعر', 'شراء', 'بيع', 'خصم', 'طلب'];
const COMMERCIAL_WORDS = ['best', 'top', 'compare', 'vs', 'review', 'service', 'company', 'agency', 'أفضل', 'شركة', 'مقارنة', 'خدمة', 'مكتب'];
const NAVIGATIONAL_WORDS = ['login', 'sign in', 'signin', 'download', 'homepage', 'official', 'تسجيل دخول', 'تحميل', 'الموقع الرسمي'];
const LOCAL_WORDS = ['near me', 'in ', 'nearby', 'قريب مني', 'في ', 'جدة', 'الرياض', 'دبي', 'القاهرة', 'عمّان'];
const COMPARISON_WORDS = ['vs', 'versus', 'or', 'alternative', 'مقارنة', 'بديل', 'أو'];
const QUESTION_WORDS = ['how', 'what', 'why', 'when', 'where', 'which', 'كيف', 'ما ', 'لماذا', 'متى', 'أين', 'هل'];

const LANDING_WORDS = ['buy', 'order', 'signup', 'sign up', 'register', 'book', 'شراء', 'حجز', 'تسجيل'];
const SERVICE_WORDS = ['service', 'services', 'agency', 'cleaning', 'repair', 'plumber', 'lawyer', 'خدمة', 'شركة', 'صيانة', 'تنظيف'];
const PRODUCT_WORDS = ['price', 'model', 'product', 'سعر', 'منتج', 'موديل'];
const GUIDE_WORDS = ['guide', 'how to', 'tutorial', 'tips', 'دليل', 'طريقة', 'نصائح'];
const COMPARISON_PAGE_WORDS = ['vs', 'comparison', 'مقارنة'];
const FAQ_WORDS = ['faq', 'questions', 'answers', 'أسئلة', 'إجابات'];

/** Detects whether a keyword looks like a question. */
export function isQuestionLike(keyword: string): boolean {
  const text = keyword.toLowerCase();
  if (text.includes('?')) return true;
  return QUESTION_WORDS.some((word) => text.startsWith(word) || text.includes(` ${word}`));
}

/** Deterministic intent heuristic (LOW confidence — AI refines). */
export function heuristicIntent(keyword: string): { intent: KeywordIntent; confidence: number; reason: string } {
  const text = keyword.toLowerCase();

  if (isQuestionLike(text)) {
    return { intent: 'INFORMATIONAL', confidence: 0.5, reason: 'Question-like phrasing' };
  }
  if (COMPARISON_WORDS.some((word) => text.includes(word))) {
    return { intent: 'COMPARISON', confidence: 0.5, reason: 'Comparison phrasing' };
  }
  if (TRANSACTIONAL_WORDS.some((word) => text.includes(word))) {
    return { intent: 'TRANSACTIONAL', confidence: 0.5, reason: 'Transactional phrasing' };
  }
  if (COMMERCIAL_WORDS.some((word) => text.includes(word))) {
    return { intent: 'COMMERCIAL', confidence: 0.5, reason: 'Commercial phrasing' };
  }
  if (NAVIGATIONAL_WORDS.some((word) => text.includes(word))) {
    return { intent: 'NAVIGATIONAL', confidence: 0.4, reason: 'Navigational phrasing' };
  }
  if (LOCAL_WORDS.some((word) => text.includes(word))) {
    return { intent: 'LOCAL', confidence: 0.5, reason: 'Local phrasing' };
  }
  return { intent: 'INFORMATIONAL', confidence: 0.3, reason: 'Default informational' };
}

/** Deterministic page type heuristic (LOW confidence — AI refines). */
export function heuristicPageType(keyword: string): { pageType: KeywordPageType; confidence: number; reason: string } {
  const text = keyword.toLowerCase();

  if (COMPARISON_PAGE_WORDS.some((word) => text.includes(word))) {
    return { pageType: 'COMPARISON', confidence: 0.5, reason: 'Comparison keywords' };
  }
  if (GUIDE_WORDS.some((word) => text.includes(word))) {
    return { pageType: 'GUIDE', confidence: 0.5, reason: 'How-to / guide keywords' };
  }
  if (FAQ_WORDS.some((word) => text.includes(word))) {
    return { pageType: 'FAQ_SUPPORT', confidence: 0.5, reason: 'FAQ keywords' };
  }
  if (SERVICE_WORDS.some((word) => text.includes(word))) {
    return { pageType: 'SERVICE', confidence: 0.5, reason: 'Service keywords' };
  }
  if (PRODUCT_WORDS.some((word) => text.includes(word))) {
    return { pageType: 'PRODUCT', confidence: 0.5, reason: 'Product keywords' };
  }
  if (LANDING_WORDS.some((word) => text.includes(word))) {
    return { pageType: 'LANDING_PAGE', confidence: 0.5, reason: 'Conversion keywords' };
  }
  return { pageType: 'BLOG_ARTICLE', confidence: 0.2, reason: 'Default informational article' };
}

/** Business relevance heuristic (LOW confidence — refined with site knowledge). */
export function heuristicBusinessRelevance(keyword: string): { relevance: BusinessRelevance; confidence: number; reason: string } {
  const text = keyword.toLowerCase();
  if (isQuestionLike(text)) {
    return { relevance: 'INFORMATIONAL_SUPPORT', confidence: 0.4, reason: 'Question-like — likely informational support' };
  }
  if (COMMERCIAL_WORDS.some((word) => text.includes(word)) || TRANSACTIONAL_WORDS.some((word) => text.includes(word))) {
    return { relevance: 'CORE', confidence: 0.4, reason: 'Commercial/transactional phrasing suggests core relevance' };
  }
  return { relevance: 'REVIEW', confidence: 0.2, reason: 'Ambiguous — requires business context' };
}

/** Local keyword detection (Section 53). */
export function isLocalKeyword(keyword: string, cities: string[] = []): boolean {
  const text = keyword.toLowerCase();
  if (LOCAL_WORDS.some((word) => text.includes(word))) return true;
  return cities.some((city) => text.includes(city.toLowerCase()));
}

/** Brand vs non-brand (Section 55) — brands come from site knowledge. */
export function classifyBrand(keyword: string, brandNames: string[]): 'BRANDED' | 'NON_BRANDED' {
  const text = keyword.toLowerCase();
  return brandNames.some((brand) => text.includes(brand.toLowerCase())) ? 'BRANDED' : 'NON_BRANDED';
}

/** Competitor classification (Section 56). */
export function classifyCompetitor(keyword: string, competitorNames: string[]): 'COMPETITOR_QUERY' | 'NOT_COMPETITOR' {
  const text = keyword.toLowerCase();
  return competitorNames.some((name) => text.includes(name.toLowerCase())) ? 'COMPETITOR_QUERY' : 'NOT_COMPETITOR';
}
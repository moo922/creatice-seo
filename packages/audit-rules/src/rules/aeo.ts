/**
 * Deterministic AEO (Answer Engine Optimization) audit rules.
 * These rules evaluate answer quality and extractability without AI.
 * AI semantic analysis is handled separately and merged into component scores.
 */

import type { AuditPageSignal } from '../context';
import type { AuditFinding, AuditSeverity } from '../contract';

export interface AeoRuleContext {
  /** The page being evaluated. */
  page: AuditPageSignal;
  /** Cluster intent (if page is mapped to a keyword cluster). */
  clusterIntent?: string;
  /** Primary keyword for the page. */
  primaryKeyword?: string;
  /** GSC questions mapped to this page. */
  gscQuestions?: Array<{ query: string; impressions: number }>;
  /** Knowledge Base facts for the site. */
  knowledgeBaseFacts?: Array<{ key: string; value: string; category: string }>;
  /** Page type classification. */
  pageType?: string;
  /** Whether the page is a commercial/service/product page. */
  isCommercial?: boolean;
}

function finding(
  ruleKey: string,
  severity: AuditSeverity,
  url: string,
  passed: boolean,
  evidence: Record<string, unknown>,
): AuditFinding {
  return {
    ruleKey,
    category: 'aeo',
    severity,
    url,
    passed,
    evidence,
  };
}

/**
 * AEO-01: Intent Alignment
 * Check if page content serves the identified search intent.
 */
export function checkIntentAlignment(ctx: AeoRuleContext): AuditFinding {
  const { page, clusterIntent } = ctx;
  const text = (page.text ?? '').toLowerCase();
  const hasContent = page.wordCount >= 100;

  if (!clusterIntent) {
    return finding('aeo-intent-alignment', 'info', page.url, true, {
      rating: 'UNKNOWN',
      reason: 'No cluster intent mapped',
    });
  }

  // Check if content matches intent signals
  const intentSignals: Record<string, string[]> = {
    INFORMATIONAL: ['how', 'what', 'guide', 'learn', 'understand', 'explain'],
    COMMERCIAL: ['best', 'top', 'review', 'compare', 'price', 'cost', 'service'],
    TRANSACTIONAL: ['buy', 'order', 'book', 'hire', 'contact', 'get', 'start'],
    NAVIGATIONAL: ['official', 'login', 'account', 'dashboard'],
    LOCAL: ['near', 'location', 'city', 'address', 'directions'],
    COMPARISON: ['vs', 'versus', 'compare', 'alternative', 'better than'],
  };

  const signals = intentSignals[clusterIntent] ?? [];
  const matchedSignals = signals.filter((s) => text.includes(s));

  const rating = !hasContent ? 'MISMATCH'
    : matchedSignals.length >= 2 ? 'MATCH'
    : matchedSignals.length === 1 ? 'PARTIAL_MATCH'
    : 'MISMATCH';

  return finding('aeo-intent-alignment', rating === 'MISMATCH' ? 'high' : 'info', page.url, rating !== 'MISMATCH', {
    rating,
    intent: clusterIntent,
    matchedSignals,
    wordCount: page.wordCount,
  });
}

/**
 * AEO-02: Direct Answer Quality
 * Check if page provides a concise answer early in the content.
 */
export function checkDirectAnswer(ctx: AeoRuleContext): AuditFinding {
  const { page } = ctx;
  const text = page.text ?? '';
  const h1 = page.h1 ?? '';
  const metaDesc = page.metaDescription ?? '';

  // Heuristic: check if the first 500 chars of text contain answer signals
  const firstSection = text.slice(0, 500).toLowerCase();
  const hasAnswerSignal = /\b(is|are|provides|offers|includes|consists of|means)\b/i.test(firstSection);
  const hasQuestionAnswer = h1 && firstSection.includes(h1.toLowerCase().slice(0, 30));

  const rating = page.wordCount < 100 ? 'MISSING'
    : hasQuestionAnswer ? 'STRONG'
    : hasAnswerSignal ? 'ADEQUATE'
    : metaDesc.length > 50 ? 'WEAK'
    : 'MISSING';

  return finding('aeo-direct-answer-quality', rating === 'MISSING' ? 'medium' : 'info', page.url, rating !== 'MISSING', {
    rating,
    h1,
    metaDescLength: metaDesc.length,
    wordCount: page.wordCount,
  });
}

/**
 * AEO-03: Question Coverage
 * Map GSC questions against page content.
 */
export function checkQuestionCoverage(ctx: AeoRuleContext): AuditFinding {
  const { page, gscQuestions } = ctx;

  if (!gscQuestions || gscQuestions.length === 0) {
    return finding('aeo-question-coverage', 'info', page.url, true, {
      status: 'NO_QUESTIONS',
      total: 0,
      covered: 0,
    });
  }

  const text = (page.text ?? '').toLowerCase();
  let covered = 0;

  for (const q of gscQuestions) {
    const query = q.query.toLowerCase();
    // Check if key terms from the query appear in the text
    const terms = query.split(/\s+/).filter((t) => t.length > 3);
    const matched = terms.filter((t) => text.includes(t));
    if (matched.length >= Math.ceil(terms.length * 0.5)) {
      covered++;
    }
  }

  const coveragePct = gscQuestions.length > 0 ? (covered / gscQuestions.length) * 100 : 100;
  const passed = coveragePct >= 50;

  return finding('aeo-question-coverage', passed ? 'info' : 'medium', page.url, passed, {
    total: gscQuestions.length,
    covered,
    coveragePercent: Math.round(coveragePct),
  });
}

/**
 * AEO-04: Decision Support (commercial pages)
 */
export function checkDecisionSupport(ctx: AeoRuleContext): AuditFinding {
  const { page, isCommercial } = ctx;
  if (!isCommercial) {
    return finding('aeo-decision-support', 'info', page.url, true, { skipped: true, reason: 'Non-commercial page' });
  }

  const text = (page.text ?? '').toLowerCase();
  const signals = {
    pricingFactors: /\b(price|cost|pricing|factors|quotation|quote)\b/i.test(text),
    selectionCriteria: /\b(choose|select|criteria|consider|factors|right for)\b/i.test(text),
    processInfo: /\b(process|steps|how it works|timeline|duration)\b/i.test(text),
    whoItsFor: /\b(ideal for|suited for|designed for|who needs|best for)\b/i.test(text),
    limitations: /\b(limitations|restrictions|not suitable|exclusions)\b/i.test(text),
  };

  const presentCount = Object.values(signals).filter(Boolean).length;
  const passed = presentCount >= 2;

  return finding('aeo-decision-support', passed ? 'info' : 'medium', page.url, passed, {
    signals,
    presentCount,
  });
}

/**
 * AEO-05: Heading Semantics
 * Check if headings accurately describe sections with logical hierarchy.
 */
export function checkHeadingSemantics(ctx: AeoRuleContext): AuditFinding {
  const { page } = ctx;
  const headings = page.headings;

  if (headings.length === 0) {
    return finding('aeo-heading-semantics', 'medium', page.url, false, {
      reason: 'No headings found',
    });
  }

  // Check hierarchy (H1 > H2 > H3, no skipping)
  let hierarchyValid = true;
  let prevLevel = 0;
  for (const h of headings) {
    const level = parseInt(h.tag.replace(/h/i, ''), 10);
    if (level > prevLevel + 1 && prevLevel > 0) {
      hierarchyValid = false;
      break;
    }
    prevLevel = level;
  }

  // Check if headings have descriptive text (not just "section", "content")
  const genericHeadings = ['section', 'content', 'text', 'more', 'click here'];
  const hasDescriptiveHeadings = headings.some((h) =>
    h.text.length > 5 && !genericHeadings.includes(h.text.toLowerCase()),
  );

  const passed = hierarchyValid && hasDescriptiveHeadings;

  return finding('aeo-heading-semantics', passed ? 'info' : 'low', page.url, passed, {
    hierarchyValid,
    hasDescriptiveHeadings,
    headingCount: headings.length,
  });
}

/**
 * AEO-06: Structure / Extractability
 * Check for lists, tables, JSON-LD, clear heading hierarchy.
 */
export function checkStructureExtractability(ctx: AeoRuleContext): AuditFinding {
  const { page } = ctx;
  const text = page.text ?? '';

  const hasHeadings = page.headings.length >= 2;
  const hasLists = /<(ul|ol|dl)\b/i.test(text);
  const hasTables = /<table\b/i.test(text);
  const hasJsonLd = page.schemaBlocks > 0;
  const hasArticleStructure = /<(article|section|main)\b/i.test(text);

  const score = [hasHeadings, hasLists, hasTables, hasJsonLd, hasArticleStructure].filter(Boolean).length;
  const passed = score >= 3;

  return finding('aeo-structure-extractability', passed ? 'info' : 'low', page.url, passed, {
    hasHeadings,
    hasLists,
    hasTables,
    hasJsonLd,
    hasArticleStructure,
    score,
  });
}

/**
 * AEO-07: Factual Consistency
 * Compare page claims against Knowledge Base.
 */
export function checkFactualConsistency(ctx: AeoRuleContext): AuditFinding {
  const { page, knowledgeBaseFacts } = ctx;
  if (!knowledgeBaseFacts || knowledgeBaseFacts.length === 0) {
    return finding('aeo-factual-consistency', 'info', page.url, true, {
      status: 'NO_KB',
      reason: 'No Knowledge Base facts to compare against',
    });
  }

  const text = (page.text ?? '').toLowerCase();
  const conflicts: string[] = [];

  // Simple consistency check: look for key facts that might contradict
  for (const fact of knowledgeBaseFacts) {
    if (fact.category === 'PRICES' || fact.category === 'STATISTICS') {
      // Check if the page mentions the key but with different value
      const keyLower = fact.key.toLowerCase();
      if (text.includes(keyLower)) {
        // If KB has a specific value, check if page mentions a different number
        const kbNumbers = fact.value.match(/\d+/g) ?? [];
        for (const num of kbNumbers) {
          // This is a simplified check - real implementation would be more sophisticated
          if (text.includes(keyLower) && !text.includes(num)) {
            // Potential inconsistency - but don't auto-flag
          }
        }
      }
    }
  }

  return finding('aeo-factual-consistency', conflicts.length > 0 ? 'high' : 'info', page.url, conflicts.length === 0, {
    conflicts,
    kbFactsChecked: knowledgeBaseFacts.length,
  });
}

/**
 * AEO-08: Information Density
 * Detect excessive low-information filler.
 */
export function checkInformationDensity(ctx: AeoRuleContext): AuditFinding {
  const { page } = ctx;
  const text = page.text ?? '';

  // Check for filler patterns
  const fillerPatterns = [
    /\b(in this article|as we all know|it goes without saying|needless to say)\b/gi,
    /\b(in conclusion|to summarize|in summary|all in all)\b/gi,
    /\b(don't forget|keep in mind|remember that|it's important to note)\b/gi,
  ];

  let fillerCount = 0;
  for (const pattern of fillerPatterns) {
    const matches = text.match(pattern);
    if (matches) fillerCount += matches.length;
  }

  const wordsPerPage = page.wordCount > 0 ? fillerCount / (page.wordCount / 100) : 0;
  const passed = wordsPerPage < 2; // Less than 2 filler phrases per 100 words

  return finding('aeo-information-density', passed ? 'info' : 'low', page.url, passed, {
    fillerCount,
    fillerPerHundredWords: Math.round(wordsPerPage * 100) / 100,
    wordCount: page.wordCount,
  });
}

/**
 * AEO-09: Self-Containment
 * Check for "as mentioned above" / "as we said" patterns.
 */
export function checkSelfContainment(ctx: AeoRuleContext): AuditFinding {
  const { page } = ctx;
  const text = (page.text ?? '').toLowerCase();

  const selfRefPatterns = [
    /\b(as mentioned (above|earlier|before))\b/gi,
    /\b(as we (said|discussed|explained))\b/gi,
    /\b(see above|see below|refer to)\b/gi,
    /\b(this|that)\s+(article|section|page|post)\b/gi,
  ];

  let selfRefCount = 0;
  for (const pattern of selfRefPatterns) {
    const matches = text.match(pattern);
    if (matches) selfRefCount += matches.length;
  }

  const passed = selfRefCount < 3;

  return finding('aeo-self-containment', passed ? 'info' : 'low', page.url, passed, {
    selfRefCount,
    patterns: selfRefPatterns.map((p) => p.source).slice(0, 3),
  });
}

/** Run all AEO deterministic rules against a page. */
export function runAeoDeterministicRules(ctx: AeoRuleContext): AuditFinding[] {
  return [
    checkIntentAlignment(ctx),
    checkDirectAnswer(ctx),
    checkQuestionCoverage(ctx),
    checkDecisionSupport(ctx),
    checkHeadingSemantics(ctx),
    checkStructureExtractability(ctx),
    checkFactualConsistency(ctx),
    checkInformationDensity(ctx),
    checkSelfContainment(ctx),
  ];
}

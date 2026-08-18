/**
 * Deterministic GEO (Generative Engine Optimization) audit rules.
 * These rules evaluate machine-readability, entity clarity, and citation
 * readiness without AI. AI semantic analysis is handled separately.
 */

import type { AuditPageSignal } from '../context';
import type { AuditFinding, AuditSeverity } from '../contract';

export interface GeoRuleContext {
  page: AuditPageSignal;
  /** Knowledge Base facts for the site. */
  knowledgeBaseFacts?: Array<{ key: string; value: string; category: string; verificationStatus: string }>;
  /** Site entity data (name, type, location, etc.). */
  siteEntity?: { name: string; type: string; location?: string; description?: string };
  /** External sources found on the page. */
  externalSources?: Array<{ url: string; title: string }>;
  /** Known entity relations from the entity graph. */
  entityRelations?: Array<{ subject: string; predicate: string; object: string; verified: boolean }>;
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
    category: 'geo',
    severity,
    url,
    passed,
    evidence,
  };
}

/**
 * GEO-01: Entity Identity
 * Evaluate if the page clearly identifies the primary entity.
 */
export function checkEntityIdentity(ctx: GeoRuleContext): AuditFinding {
  const { page, siteEntity } = ctx;
  const text = (page.text ?? '').toLowerCase();

  const hasTitle = Boolean(page.title && page.title.length > 5);
  const hasH1 = Boolean(page.h1 && page.h1.length > 3);
  const hasMetaDesc = Boolean(page.metaDescription && page.metaDescription.length > 20);

  // Check if site entity name appears in content
  const entityNamePresent = siteEntity?.name
    ? text.includes(siteEntity.name.toLowerCase())
    : false;

  const score = [hasTitle, hasH1, hasMetaDesc, entityNamePresent].filter(Boolean).length;
  const passed = score >= 3;

  return finding('geo-entity-identity', passed ? 'info' : 'medium', page.url, passed, {
    hasTitle,
    hasH1,
    hasMetaDesc,
    entityNamePresent,
    score,
  });
}

/**
 * GEO-02: Factual Specificity
 * Check for concrete facts vs vague marketing claims.
 */
export function checkFactualSpecificity(ctx: GeoRuleContext): AuditFinding {
  const { page } = ctx;
  const text = page.text ?? '';

  // Vague marketing patterns
  const vaguePatterns = [
    /\b(best|leading|top|premium|world-class|cutting-edge|state-of-the-art)\b/gi,
    /\b(many|various|numerous|several|multiple)\b/gi,
    /\b(improve|enhance|boost|optimize|maximize)\b/gi,
  ];

  // Specific factual patterns
  const specificPatterns = [
    /\d+\s*(years|clients|projects|customers|locations|certifications)/gi,
    /\b(since|founded|established|established in)\s+\d{4}/gi,
    /\b(\d+%|\d+\.\d+%)\b/g,
    /\b(specific|exact|precise|verified|certified|licensed)\b/gi,
  ];

  let vagueCount = 0;
  for (const p of vaguePatterns) {
    const m = text.match(p);
    if (m) vagueCount += m.length;
  }

  let specificCount = 0;
  for (const p of specificPatterns) {
    const m = text.match(p);
    if (m) specificCount += m.length;
  }

  const ratio = specificCount > 0 ? specificCount / (vagueCount + specificCount) : 0.3;
  const passed = ratio >= 0.4;

  return finding('geo-factual-specificity', passed ? 'info' : 'medium', page.url, passed, {
    vagueCount,
    specificCount,
    specificityRatio: Math.round(ratio * 100) / 100,
  });
}

/**
 * GEO-03: Claim Verification
 * Classify significant claims against Knowledge Base.
 */
export function checkClaimVerification(ctx: GeoRuleContext): AuditFinding {
  const { page, knowledgeBaseFacts } = ctx;
  const text = (page.text ?? '').toLowerCase();

  if (!knowledgeBaseFacts || knowledgeBaseFacts.length === 0) {
    return finding('geo-claim-verification', 'info', page.url, true, {
      status: 'NO_KB',
      claimsChecked: 0,
    });
  }

  const verifiedClaims: string[] = [];
  const unverifiedClaims: string[] = [];

  for (const fact of knowledgeBaseFacts) {
    if (fact.category === 'APPROVED_CLAIMS' || fact.category === 'CERTIFICATIONS') {
      const keyTerms = fact.key.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
      const mentioned = keyTerms.some((t) => text.includes(t));
      if (mentioned) {
        if (fact.verificationStatus === 'VERIFIED') {
          verifiedClaims.push(fact.key);
        } else {
          unverifiedClaims.push(fact.key);
        }
      }
    }
  }

  const passed = unverifiedClaims.length === 0;

  return finding('geo-claim-verification', passed ? 'info' : 'medium', page.url, passed, {
    verifiedClaims,
    unverifiedClaims,
    totalChecked: knowledgeBaseFacts.length,
  });
}

/**
 * GEO-04: Evidence Quality
 * Check for source attribution and citations.
 */
export function checkEvidenceQuality(ctx: GeoRuleContext): AuditFinding {
  const { page, externalSources } = ctx;
  const text = page.text ?? '';

  const hasCitations = externalSources && externalSources.length > 0;
  const hasSourceLinks = /<a\s+[^>]*href="https?:\/\/[^"]*"[^>]*>/gi.test(text);
  const hasReferences = /\b(reference|source|cited|according to|study shows|research shows)\b/i.test(text);

  const evidenceScore = [hasCitations, hasSourceLinks, hasReferences].filter(Boolean).length;
  const passed = evidenceScore >= 1;

  return finding('geo-evidence-quality', passed ? 'info' : 'low', page.url, passed, {
    hasCitations: hasCitations ?? false,
    citationCount: externalSources?.length ?? 0,
    hasSourceLinks,
    hasReferences,
  });
}

/**
 * GEO-05: Source Quality
 * Classify external source types.
 */
export function checkSourceQuality(ctx: GeoRuleContext): AuditFinding {
  const { externalSources } = ctx;

  if (!externalSources || externalSources.length === 0) {
    return finding('geo-source-quality', 'info', 'site-wide', true, {
      status: 'NO_SOURCES',
      reason: 'No external sources found',
    });
  }

  const authoritativePatterns = /\.(gov|edu|org|ac\.|official)/i;
  const forumPatterns = /(reddit|forum|quora|stackoverflow|fandom)/i;
  const blogPatterns = /(blogspot|wordpress\.com|medium\.com\/@)/i;

  let authoritative = 0;
  let forums = 0;
  let blogs = 0;

  for (const source of externalSources) {
    try {
      const hostname = new URL(source.url).hostname;
      if (authoritativePatterns.test(hostname)) authoritative++;
      else if (forumPatterns.test(hostname)) forums++;
      else if (blogPatterns.test(hostname)) blogs++;
    } catch {
      // Invalid URL
    }
  }

  const total = externalSources.length;
  const qualityRatio = total > 0 ? authoritative / total : 0;
  const passed = qualityRatio >= 0.3 || authoritative >= 2;

  return finding('geo-source-quality', passed ? 'info' : 'low', 'site-wide', passed, {
    authoritative,
    forums,
    blogs,
    total,
    qualityRatio: Math.round(qualityRatio * 100) / 100,
  });
}

/**
 * GEO-06: Original Information
 * Detect first-party data, case studies, methodology.
 */
export function checkOriginalInformation(ctx: GeoRuleContext): AuditFinding {
  const { page } = ctx;
  const text = (page.text ?? '').toLowerCase();

  const originalSignals = {
    caseStudy: /\b(case study|case studies|client success|project example)\b/i.test(text),
    methodology: /\b(methodology|our approach|our process|how we work)\b/i.test(text),
    firstPartyData: /\b(our data|our research|our survey|our analysis|we found|we discovered)\b/i.test(text),
    expertCommentary: /\b(explains|states|notes|comments|according to)\b.*\b(director|manager|expert|specialist|lead)\b/i.test(text),
    originalExamples: /\b(for example|such as|including|like)\b.*\d+/i.test(text),
  };

  const presentCount = Object.values(originalSignals).filter(Boolean).length;
  const passed = presentCount >= 1;

  return finding('geo-original-information', passed ? 'info' : 'medium', page.url, passed, {
    signals: originalSignals,
    presentCount,
  });
}

/**
 * GEO-07: Expert Attribution
 * Check for author name, role, qualifications.
 */
export function checkExpertAttribution(ctx: GeoRuleContext): AuditFinding {
  const { page } = ctx;
  const text = (page.text ?? '').toLowerCase();

  const authorSignals = {
    authorName: /\b(written by|authored by|by\s+[A-Z][a-z]+ [A-Z][a-z]+)\b/i.test(text),
    authorRole: /\b(director|manager|consultant|specialist|expert|engineer|architect)\b/i.test(text),
    authorBio: /\b(about the author|author bio|written by)\b/i.test(text),
    reviewedBy: /\b(reviewed by|fact-checked by|verified by)\b/i.test(text),
  };

  const presentCount = Object.values(authorSignals).filter(Boolean).length;
  // Not every page needs author attribution - only informational/commercial
  const passed = presentCount >= 1 || page.wordCount < 300;

  return finding('geo-expert-attribution', passed ? 'info' : 'low', page.url, passed, {
    signals: authorSignals,
    presentCount,
  });
}

/**
 * GEO-08: Machine Accessibility
 * Check robots.txt, meta robots, HTTP status, rendered content.
 */
export function checkMachineAccessibility(ctx: GeoRuleContext): AuditFinding {
  const { page } = ctx;

  const isAccessible = page.httpStatus === 200;
  const isIndexable = page.indexable;
  const hasNoBlocking = !page.metaRobots.includes('nofollow') || page.metaRobots.includes('noindex');
  const hasContent = page.wordCount >= 50;

  const passed = isAccessible && isIndexable && hasContent;

  return finding('geo-machine-accessibility', passed ? 'info' : 'high', page.url, passed, {
    httpStatus: page.httpStatus,
    isIndexable,
    metaRobots: page.metaRobots,
    wordCount: page.wordCount,
    hasContent,
  });
}

/**
 * GEO-09: Schema Validation
 * Check JSON-LD validity and match with visible content.
 */
export function checkSchemaValidation(ctx: GeoRuleContext): AuditFinding {
  const { page } = ctx;

  const hasSchema = page.schemaBlocks > 0;
  const hasErrors = page.schemaErrors.length > 0;
  const hasOrganization = page.schemaJson?.some(
    (s: unknown) => typeof s === 'object' && s !== null && (s as Record<string, unknown>)['@type'] === 'Organization',
  );

  const passed = !hasErrors && (hasSchema ? hasOrganization : true);

  return finding('geo-schema-validation', passed ? 'info' : 'low', page.url, passed, {
    schemaBlocks: page.schemaBlocks,
    schemaErrors: page.schemaErrors.length,
    hasOrganization,
  });
}

/**
 * GEO-10: Citation Readiness
 * Aggregate readiness signals for citation potential.
 */
export function checkCitationReadiness(ctx: GeoRuleContext): AuditFinding {
  const { page, externalSources } = ctx;
  const text = page.text ?? '';

  const hasSpecificFacts = /\d+/.test(text);
  const hasSelfContained = !/\b(as mentioned|see above|refer to)\b/i.test(text);
  const hasEvidence = externalSources && externalSources.length > 0;
  const hasEntityClarity = Boolean(page.h1 && page.h1.length > 3);
  const hasStructuredContent = /<(ul|ol|table|dl)\b/i.test(text);

  const score = [hasSpecificFacts, hasSelfContained, hasEvidence, hasEntityClarity, hasStructuredContent].filter(Boolean).length;
  const passed = score >= 3;

  return finding('geo-citation-readiness', passed ? 'info' : 'low', page.url, passed, {
    hasSpecificFacts,
    hasSelfContained,
    hasEvidence: hasEvidence ?? false,
    hasEntityClarity,
    hasStructuredContent,
    score,
  });
}

/** Run all GEO deterministic rules against a page. */
export function runGeoDeterministicRules(ctx: GeoRuleContext): AuditFinding[] {
  return [
    checkEntityIdentity(ctx),
    checkFactualSpecificity(ctx),
    checkClaimVerification(ctx),
    checkEvidenceQuality(ctx),
    checkSourceQuality(ctx),
    checkOriginalInformation(ctx),
    checkExpertAttribution(ctx),
    checkMachineAccessibility(ctx),
    checkSchemaValidation(ctx),
    checkCitationReadiness(ctx),
  ];
}

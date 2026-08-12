import type { BriefGateResult, ContentBriefDto } from '@creative-seo/types';
import { computeOverall } from './validation/common';

export interface DeterministicBriefCheck {
  approved: boolean;
  score: number;
  reasons: string[];
  blockers: string[];
}

/**
 * Deterministic completeness check for a brief. The brief must be executable
 * before the pipeline authorizes drafting: every field the writer needs must be
 * present and within sane bounds.
 */
export function deterministicBriefCheck(brief: ContentBriefDto): DeterministicBriefCheck {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const checks: Array<{ id: string; label: string; score: number; weight: number }> = [];

  const hasTitle = brief.title.trim().length >= 5;
  reasons.push(hasTitle ? 'title present' : '');
  checks.push({ id: 'gate.title', label: 'Brief title', score: hasTitle ? 100 : 0, weight: 2 });

  const hasPrimary = brief.primaryKeyword.trim().length > 0;
  reasons.push(hasPrimary ? 'primary keyword set' : '');
  checks.push({ id: 'gate.primary', label: 'Primary keyword', score: hasPrimary ? 100 : 0, weight: 2 });
  if (!hasPrimary) blockers.push('Primary keyword is missing.');

  const secondaryOk = Array.isArray(brief.secondaryKeywords) && brief.secondaryKeywords.length > 0;
  checks.push({ id: 'gate.secondary', label: 'Secondary keywords', score: secondaryOk ? 100 : 40, weight: 1 });
  if (!secondaryOk) blockers.push('No secondary keywords provided.');

  const titleLen = brief.seoTitle.length;
  const titleOk = titleLen >= 30 && titleLen <= 65;
  checks.push({ id: 'gate.seo.title', label: 'SEO title length', score: titleOk ? 100 : Math.max(0, 100 - Math.abs(40 - titleLen) * 3), weight: 2 });
  reasons.push(titleOk ? 'SEO title in range' : '');
  if (titleLen > 0 && !titleOk) blockers.push(`SEO title is ${titleLen} chars; target 30-65.`);

  const metaLen = brief.metaDescription.length;
  const metaOk = metaLen >= 50 && metaLen <= 160;
  checks.push({ id: 'gate.meta', label: 'Meta description length', score: metaOk ? 100 : Math.max(0, 100 - Math.abs(105 - metaLen) * 2), weight: 2 });
  if (metaLen > 0 && !metaOk) blockers.push(`Meta description is ${metaLen} chars; target 50-160.`);

  const h1Ok = brief.h1.trim().length > 0;
  checks.push({ id: 'gate.h1', label: 'H1', score: h1Ok ? 100 : 0, weight: 1 });
  if (!h1Ok) blockers.push('H1 is missing.');

  const outlineCount = brief.outline?.length ?? 0;
  const outlineOk = outlineCount >= 3;
  checks.push({ id: 'gate.outline', label: 'Outline depth', score: outlineOk ? 100 : Math.round((outlineCount / 3) * 100), weight: 2 });
  if (!outlineOk) blockers.push(`Outline has only ${outlineCount} section(s); need at least 3.`);

  const urlOk = /^https?:\/\/.+/.test(brief.recommendedUrl);
  checks.push({ id: 'gate.url', label: 'Recommended URL', score: urlOk ? 100 : 30, weight: 1 });
  if (!urlOk) blockers.push('Recommended URL is not a valid absolute URL.');

  const score = computeOverall(checks);

  return {
    approved: blockers.length === 0,
    score,
    reasons: reasons.filter(Boolean),
    blockers,
  };
}

/** Merges the deterministic check with the LLM gate review into one gate result. */
export function mergeGateResults(
  deterministic: DeterministicBriefCheck,
  llm: BriefGateResult | null,
): BriefGateResult {
  if (!llm) {
    return { approved: deterministic.approved, score: deterministic.score, reasons: deterministic.reasons, blockers: deterministic.blockers };
  }
  const score = Math.round((deterministic.score + llm.score) / 2);
  const blockers = [...new Set([...deterministic.blockers, ...llm.blockers])];
  const approved = deterministic.blockers.length === 0 && llm.approved;
  return {
    approved,
    score,
    reasons: [...deterministic.reasons, ...llm.reasons],
    blockers,
  };
}

export function gatePassed(gate: BriefGateResult): boolean {
  return gate.approved && gate.score >= 60;
}

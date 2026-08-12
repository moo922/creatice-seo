import type { FinalQaResultDto, ValidatorResultDto } from '@creative-seo/types';
import { average } from './common';

export interface FinalQaInput {
  validators: ValidatorResultDto[];
  factualBlocked: boolean;
  languageEditorPassed: boolean;
  contradictedCount: number;
  unverifiedCount: number;
  internalLinksCount: number;
  mustFixFromValidators: string[];
}

const MAX_MUST_FIX = 12;
const MAX_SHOULD_FIX = 8;

/**
 * Final QA aggregation. Produces an internal overall readiness score from the
 * validator scores, the language editor result and the factual check, then
 * decides whether the package is approved for publication.
 */
export function buildFinalQa(input: FinalQaInput): FinalQaResultDto {
  const scores = input.validators.map((validator) => validator.overallScore);
  const overallScore = Math.round(average(scores) * 100) / 100;

  const mustFix: string[] = [];
  for (const validator of input.validators) {
    if (!validator.passed && validator.recommendations.length > 0) {
      mustFix.push(...validator.recommendations.slice(0, 3));
    }
  }
  if (input.factualBlocked) mustFix.push('Remove contradicted factual claims before publishing.');
  if (!input.languageEditorPassed) mustFix.push('Apply the language editor corrections before publishing.');
  if (input.internalLinksCount === 0) mustFix.push('Add at least one internal link.');
  mustFix.push(...input.mustFixFromValidators.slice(0, 3));
  mustFix.splice(MAX_MUST_FIX);

  const shouldFix: string[] = [];
  if (input.contradictedCount === 0 && input.unverifiedCount > 0) {
    shouldFix.push(`Verify or cite ${input.unverifiedCount} unverified claim(s).`);
  }
  for (const validator of input.validators) {
    if (validator.passed && validator.recommendations.length > 0) {
      shouldFix.push(...validator.recommendations.slice(0, 2));
    }
  }
  shouldFix.splice(MAX_SHOULD_FIX);

  const approvedForPublication = mustFix.length === 0 && !input.factualBlocked && overallScore >= 70;

  return {
    overallScore,
    passed: approvedForPublication,
    mustFix,
    shouldFix,
    approvedForPublication,
  };
}

export function buildFinalQaValidator(qa: FinalQaResultDto): ValidatorResultDto {
  return {
    validator: 'FINAL_QA',
    label: 'Final QA',
    overallScore: qa.overallScore,
    metrics: [
      {
        id: 'final.qa.overall',
        label: 'Overall internal readiness',
        score: qa.overallScore,
        weight: 1,
        passed: qa.overallScore >= 70,
        details: 'Internal quality score, not an official search-engine score.',
      },
    ],
    passed: qa.approvedForPublication,
    isInternalScore: true,
    recommendations: [...qa.mustFix, ...qa.shouldFix],
    note: 'Aggregated internal QA result.',
  };
}

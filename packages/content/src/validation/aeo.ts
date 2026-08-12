import type { ValidatorResultDto } from '@creative-seo/types';
import { semanticKeywordCoverage, stripHtml } from '../arabic';
import { metric, validatorResult } from './common';

export interface AeoQuestion {
  question: string;
  category: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  answerHint: string;
}

/** Question map produced by the AEO question-map stage. */
export interface AeoQuestionMap {
  directAnswer: string;
  questions: AeoQuestion[];
  definitions: string[];
  comparisons: string[];
  processes: string[];
  decisionCriteria: string[];
  commercialQuestions: string[];
}

export interface AeoInput {
  html: string;
  language: 'ar' | 'en';
  primaryKeyword: string;
  questions: AeoQuestion[];
  directAnswer: string;
  /** Whether the draft stage reported a direct answer was provided. */
  directAnswerProvided: boolean;
}

/**
 * Answer-engine optimization validator. Measures the eight required areas:
 * direct answer, question coverage, definitions, comparisons, process,
 * decision criteria, commercial questions and semantic completeness.
 */
export function deterministicAeoCheck(input: AeoInput): ValidatorResultDto {
  const plain = stripHtml(input.html);
  const normalized = plain.toLocaleLowerCase(input.language === 'ar' ? 'ar' : 'en');

  const directAnswerScore = input.directAnswerProvided && input.directAnswer.length > 0 ? 100 : 40;
  const questionCoverage = coverageOf(input.questions.map((q) => q.question), normalized, input.language);

  const definitions = findAny(normalized, input.language === 'ar' ? ['هو', 'هي', 'يعني', 'تعرّف', 'تعريف'] : ['is a', 'is the', 'means', 'defined as']);
  const comparisons = findAny(normalized, input.language === 'ar' ? ['بالمقارنة', 'مقارنة', 'أفضل من', 'بديل'] : ['vs', 'compared to', 'versus', 'alternative']);
  const processes = findAny(normalized, input.language === 'ar' ? ['خطوات', 'كيفية', 'كيف', 'عملية'] : ['how to', 'steps', 'process', 'step-by-step']);
  const decisionCriteria = findAny(normalized, input.language === 'ar' ? ['عوامل', 'اختيار', 'يعتمد', 'معايير'] : ['choose', 'factors', 'consider', 'criteria']);
  const commercialQuestions = findAny(normalized, input.language === 'ar' ? ['سعر', 'تكلفة', 'شراء', 'حجز'] : ['price', 'cost', 'pricing', 'buy', 'book']);
  const semantic = Math.round(semanticKeywordCoverage(plain, input.primaryKeyword, input.language).coverage * 100);

  const recommendations: string[] = [];
  if (directAnswerScore < 70) recommendations.push('Add a concise, quotable direct answer near the top of the page.');
  if (questionCoverage < 60) recommendations.push(`Only ${Math.round(questionCoverage)}% of mapped questions are directly answered.`);
  if (!definitions) recommendations.push('Add definitions for key terms.');
  if (!comparisons) recommendations.push('Add a comparison section (e.g. vs alternatives).');
  if (!processes) recommendations.push('Add a process/step-by-step section.');
  if (!decisionCriteria) recommendations.push('Add decision criteria guidance (how to choose).');
  if (!commercialQuestions) recommendations.push('Answer commercial questions (price, cost, booking).');
  if (semantic < 60) recommendations.push('Strengthen semantic completeness around the primary keyword.');

  return validatorResult(
    'AEO',
    'AEO validator',
    [
      metric('aeo.direct.answer', 'Direct answer', directAnswerScore, { weight: 2, details: input.directAnswer || 'not provided' }),
      metric('aeo.question.coverage', 'Question coverage', Math.round(questionCoverage), { weight: 2 }),
      metric('aeo.definitions', 'Definitions', definitions ? 100 : 40, { weight: 1 }),
      metric('aeo.comparisons', 'Comparisons', comparisons ? 100 : 40, { weight: 1 }),
      metric('aeo.process', 'Process', processes ? 100 : 40, { weight: 1 }),
      metric('aeo.decision.criteria', 'Decision criteria', decisionCriteria ? 100 : 40, { weight: 1 }),
      metric('aeo.commercial', 'Commercial questions', commercialQuestions ? 100 : 40, { weight: 1 }),
      metric('aeo.semantic.completeness', 'Semantic completeness', semantic, { weight: 2 }),
    ],
    recommendations,
  );
}

function coverageOf(questions: string[], normalizedBody: string, language: 'ar' | 'en'): number {
  if (questions.length === 0) return 100;
  const covered = questions.filter((question) => findPhrase(normalizedBody, question, language)).length;
  return (covered / questions.length) * 100;
}

function findPhrase(body: string, phrase: string, language: 'ar' | 'en'): boolean {
  const needle = phrase.toLocaleLowerCase(language === 'ar' ? 'ar' : 'en').slice(0, 48);
  if (!needle) return false;
  return body.includes(needle);
}

function findAny(body: string, needles: string[]): boolean {
  return needles.some((needle) => body.includes(needle));
}

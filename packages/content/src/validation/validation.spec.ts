import { deterministicSeoCheck } from './seo';
import { deterministicAeoCheck } from './aeo';
import { deterministicGeoCheck } from './geo';
import { deterministicFactualCheck } from './factual';
import { buildFinalQa } from './final-qa';
import { computeOverall, mergeValidatorResults } from './common';
import type { ValidatorResultDto } from '@creative-seo/types';

const HTML = `
<h1>How to Choose an SEO Agency</h1>
<p>Choosing the right SEO agency matters. Consider experience, reporting and culture.</p>
<h2>What to look for</h2>
<p>Compare transparent pricing and case studies.</p>
<h2>Questions to ask</h2>
<p>Ask about timelines and deliverables.</p>
<h2>How to compare agencies</h2>
<p>Look at price vs value.</p>
<h2>Cost of SEO services</h2>
<p>Pricing starts at $500/mo for basic plans.</p>
`;

describe('deterministicSeoCheck', () => {
  const input = {
    html: HTML,
    language: 'en' as const,
    seoTitle: 'How to Choose an SEO Agency (2025 Guide)',
    metaDescription: 'Learn how to choose an SEO agency that fits your goals, budget and timeline. A practical checklist for marketers.',
    slug: 'how-to-choose-seo-agency',
    primaryKeyword: 'seo agency',
    secondaryKeywords: ['seo services', 'best seo agency'],
    intent: 'COMMERCIAL' as const,
    pageType: 'BLOG_ARTICLE' as const,
    internalLinksCount: 2,
  };

  it('passes with a well-structured page', () => {
    const result = deterministicSeoCheck(input);
    expect(result.validator).toBe('SEO');
    expect(result.isInternalScore).toBe(true);
    expect(result.overallScore).toBeGreaterThanOrEqual(70);
  });

  it('flags missing H1', () => {
    const result = deterministicSeoCheck({ ...input, html: '<p>no heading here</p>' });
    expect(result.metrics.find((metric) => metric.id === 'seo.h1')?.score).toBeLessThan(50);
  });

  it('merges deterministic and LLM results preserving ids', () => {
    const deterministic = deterministicSeoCheck(input);
    const llm: ValidatorResultDto = {
      validator: 'SEO',
      label: 'SEO validator',
      metrics: [
        { id: 'seo.llm.relevance', label: 'LLM relevance', score: 85, weight: 1, passed: true, details: 'x' },
      ],
      overallScore: 85,
      passed: true,
      isInternalScore: true,
      recommendations: ['Use more specific examples'],
      note: null,
    };
    const merged = mergeValidatorResults(deterministic, llm);
    expect(merged.metrics.map((m) => m.id)).toEqual(expect.arrayContaining(['seo.h1', 'seo.llm.relevance']));
    expect(merged.recommendations).toContain('Use more specific examples');
  });
});

describe('deterministicAeoCheck', () => {
  const input = {
    html: HTML,
    language: 'en' as const,
    primaryKeyword: 'seo agency',
    questions: [
      { question: 'What to look for', category: 'decision', priority: 'HIGH' as const, answerHint: 'a' },
      { question: 'Cost of SEO services', category: 'commercial', priority: 'HIGH' as const, answerHint: 'b' },
    ],
    directAnswer: 'An SEO agency optimizes your site for search engines.',
    directAnswerProvided: true,
  };

  it('covers the eight AEO measures', () => {
    const result = deterministicAeoCheck(input);
    const ids = result.metrics.map((metric) => metric.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'aeo.direct.answer',
        'aeo.question.coverage',
        'aeo.definitions',
        'aeo.comparisons',
        'aeo.process',
        'aeo.decision.criteria',
        'aeo.commercial',
        'aeo.semantic.completeness',
      ]),
    );
  });
});

describe('deterministicGeoCheck', () => {
  it('labels the result as an internal GEO score', () => {
    const result = deterministicGeoCheck({
      html: HTML,
      language: 'en',
      entities: [{ name: 'SEO agency', type: 'Service', description: 'x' }],
      keyFacts: ['Most agencies report monthly'],
      originalInsights: ['We surveyed 200 marketers'],
      attributionNeeds: ['John Smith, Head of SEO'],
      externalSources: [{ title: 'Source', url: 'https://example.org/report' }],
      verifiedFactsCount: 3,
      hasJsonLd: true,
    });
    expect(result.isInternalScore).toBe(true);
    expect(result.note).toContain('not an official search-engine score');
    expect(result.metrics.map((metric) => metric.id)).toEqual(
      expect.arrayContaining([
        'geo.entity.clarity',
        'geo.fact.consistency',
        'geo.source.quality',
        'geo.citation.ready',
        'geo.original.info',
        'geo.expert.attribution',
        'geo.machine.readable',
      ]),
    );
  });
});

describe('deterministicFactualCheck', () => {
  it('blocks contradicted claims', () => {
    const result = deterministicFactualCheck({
      claims: [
        { claim: 'X is 10%', status: 'CONTRADICTED', sourceUrl: null, evidence: 'says 5%' },
        { claim: 'Y is real', status: 'VERIFIED', sourceUrl: 'https://a.b', evidence: 'ok' },
      ],
      verifiedFactsCount: 2,
      unverifiableCount: 0,
    });
    expect(result.overallScore).toBeLessThan(70);
    expect(result.recommendations.some((item) => item.includes('contradicted'))).toBe(true);
  });
});

describe('computeOverall & buildFinalQa', () => {
  it('computes a weighted average', () => {
    expect(computeOverall([
      { score: 100, weight: 2 },
      { score: 0, weight: 2 },
    ])).toBe(50);
  });

  it('withholds publication approval when factual check is blocked', () => {
    const failed = deterministicFactualCheck({
      claims: [{ claim: 'Z', status: 'CONTRADICTED', sourceUrl: null, evidence: 'nope' }],
      verifiedFactsCount: 0,
      unverifiableCount: 0,
    });
    const qa = buildFinalQa({
      validators: [
        { ...deterministicSeoCheck({
          html: HTML,
          language: 'en',
          seoTitle: 'How to Choose an SEO Agency (2025 Guide)',
          metaDescription: 'a'.repeat(120),
          slug: 'how-to-choose-seo-agency',
          primaryKeyword: 'seo agency',
          secondaryKeywords: [],
          intent: 'COMMERCIAL',
          pageType: 'BLOG_ARTICLE',
          internalLinksCount: 1,
        }), passed: true },
        failed,
      ],
      factualBlocked: true,
      languageEditorPassed: true,
      contradictedCount: 1,
      unverifiedCount: 0,
      internalLinksCount: 2,
      mustFixFromValidators: [],
    });
    expect(qa.approvedForPublication).toBe(false);
    expect(qa.mustFix.length).toBeGreaterThan(0);
  });
});

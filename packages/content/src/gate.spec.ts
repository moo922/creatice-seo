import type { ContentBriefDto } from '@creative-seo/types';
import { deterministicBriefCheck, gatePassed, mergeGateResults } from './gate';

function goodBrief(): ContentBriefDto {
  return {
    title: 'How to choose an SEO agency',
    intent: 'COMMERCIAL',
    pageType: 'BLOG',
    targetAudience: 'Marketing managers',
    primaryKeyword: 'seo agency',
    secondaryKeywords: ['seo services', 'best seo agency'],
    recommendedUrl: 'https://example.com/how-to-choose-seo-agency',
    seoTitle: 'How to Choose an SEO Agency (2025 Guide)',
    metaDescription: 'Learn how to choose an SEO agency that fits your goals, budget and timeline. A practical checklist for marketers.',
    h1: 'How to Choose an SEO Agency',
    outline: [
      { heading: 'What to look for', purpose: 'Criteria', points: ['a'] },
      { heading: 'Questions to ask', purpose: 'Discovery', points: ['b'] },
      { heading: 'Budget considerations', purpose: 'Decision', points: ['c'] },
    ],
    keyQuestions: ['How much does an SEO agency cost?'],
    entities: ['SEO agency'],
    competitorSummary: 'Competitors cover basics',
    existingPageAssessment: 'Thin content',
    searchVolumeContext: null,
    notes: [],
  };
}

describe('deterministicBriefCheck', () => {
  it('approves a complete, executable brief', () => {
    const result = deterministicBriefCheck(goodBrief());
    expect(result.approved).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks a brief with a tiny outline', () => {
    const brief = goodBrief();
    brief.outline = [{ heading: 'Only one', purpose: 'x', points: ['y'] }];
    const result = deterministicBriefCheck(brief);
    expect(result.approved).toBe(false);
    expect(result.blockers.some((blocker) => blocker.includes('Outline'))).toBe(true);
  });

  it('blocks a brief with an invalid URL', () => {
    const brief = goodBrief();
    brief.recommendedUrl = 'example.com/how-to-choose';
    const result = deterministicBriefCheck(brief);
    expect(result.approved).toBe(false);
    expect(result.blockers.some((blocker) => blocker.includes('URL'))).toBe(true);
  });

  it('requires a primary keyword', () => {
    const brief = goodBrief();
    brief.primaryKeyword = '';
    expect(deterministicBriefCheck(brief).approved).toBe(false);
  });
});

describe('mergeGateResults', () => {
  it('blocks when the LLM gate rejects even if deterministic passes', () => {
    const deterministic = deterministicBriefCheck(goodBrief());
    const merged = mergeGateResults(deterministic, {
      approved: false,
      score: 40,
      reasons: ['Awareness gap'],
      blockers: ['Missing comparison section'],
    });
    expect(merged.approved).toBe(false);
    expect(gatePassed(merged)).toBe(false);
  });

  it('falls back to the deterministic result when no LLM review exists', () => {
    const deterministic = deterministicBriefCheck(goodBrief());
    const merged = mergeGateResults(deterministic, null);
    expect(merged.score).toBe(deterministic.score);
    expect(merged.approved).toBe(true);
    expect(gatePassed(merged)).toBe(true);
  });
});

import type { AeoRuleContext } from './aeo';
import { runAeoDeterministicRules } from './aeo';

function makeCtx(overrides: Partial<AeoRuleContext> = {}): AeoRuleContext {
  return {
    page: {
      url: 'https://example.com/services',
      httpStatus: 200,
      depth: 1,
      title: 'Our Services - Creative SEO',
      metaDescription: 'We provide SEO services in Dubai.',
      h1: 'Our Services',
      headings: [
        { tag: 'h1', text: 'Our Services' },
        { tag: 'h2', text: 'Technical SEO' },
        { tag: 'h2', text: 'Content Strategy' },
        { tag: 'h3', text: 'Keyword Research' },
      ],
      canonical: null,
      metaRobots: [],
      indexable: true,
      language: 'en',
      wordCount: 1200,
      schemaJson: [],
      schemaBlocks: 1,
      schemaErrors: [],
      images: [],
      redirectChain: ['https://example.com/services'],
      redirectLoop: false,
      text: 'Creative SEO provides comprehensive SEO services. What is SEO? Search Engine Optimization is the practice of improving your website to rank higher in search results. How much does SEO cost? Our packages start at $500/month. Why choose us? We have 10+ years of experience and have helped 200+ clients.',
    },
    pageType: 'SERVICE',
    ...overrides,
  };
}

describe('runAeoDeterministicRules', () => {
  it('should return an array of findings', () => {
    const findings = runAeoDeterministicRules(makeCtx());
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('should check aeo-intent-alignment rule', () => {
    const findings = runAeoDeterministicRules(makeCtx());
    const intentRule = findings.find((f) => f.ruleKey === 'aeo-intent-alignment');
    expect(intentRule).toBeDefined();
    expect(typeof intentRule!.passed).toBe('boolean');
  });

  it('should check aeo-direct-answer-quality rule', () => {
    const findings = runAeoDeterministicRules(makeCtx({
      page: {
        url: 'https://example.com/faq',
        httpStatus: 200,
        depth: 1,
        title: 'FAQ',
        metaDescription: 'Frequently asked questions.',
        h1: 'FAQ',
        headings: [{ tag: 'h1', text: 'FAQ' }],
        canonical: null,
        metaRobots: [],
        indexable: true,
        language: 'en',
        wordCount: 500,
        schemaJson: [],
        schemaBlocks: 0,
        schemaErrors: [],
        images: [],
        redirectChain: ['https://example.com/faq'],
        redirectLoop: false,
        text: 'What is SEO? SEO stands for Search Engine Optimization. It is the process of improving your website visibility. How long does SEO take? Results typically take 3-6 months to appear. What is the cost? Packages start at $500 per month.',
      },
    }));
    const directRule = findings.find((f) => f.ruleKey === 'aeo-direct-answer-quality');
    expect(directRule).toBeDefined();
    // FAQ page with clear Q&A should pass
    expect(directRule!.passed).toBe(true);
  });

  it('should check aeo-question-coverage rule', () => {
    const findings = runAeoDeterministicRules(makeCtx());
    const questionRule = findings.find((f) => f.ruleKey === 'aeo-question-coverage');
    expect(questionRule).toBeDefined();
    expect(questionRule!.passed).toBe(true); // Text has question patterns
  });

  it('should detect missing questions', () => {
    const findings = runAeoDeterministicRules(makeCtx({
      page: {
        url: 'https://example.com/blank',
        httpStatus: 200,
        depth: 1,
        title: 'Blank',
        metaDescription: 'Empty page.',
        h1: 'Blank',
        headings: [{ tag: 'h1', text: 'Blank' }],
        canonical: null,
        metaRobots: [],
        indexable: true,
        language: 'en',
        wordCount: 100,
        schemaJson: [],
        schemaBlocks: 0,
        schemaErrors: [],
        images: [],
        redirectChain: ['https://example.com/blank'],
        redirectLoop: false,
        text: 'This is a page with no questions or answers. Just plain content without any FAQ structure.',
      },
      gscQuestions: [
        { query: 'what is seo pricing', impressions: 500 },
        { query: 'seo services dubai cost', impressions: 200 },
      ],
    }));
    const questionRule = findings.find((f) => f.ruleKey === 'aeo-question-coverage');
    expect(questionRule).toBeDefined();
    // With GSC questions that don't match the text, this should fail
    expect(questionRule!.passed).toBe(false);
  });

  it('should check aeo-structure-extractability rule', () => {
    const findings = runAeoDeterministicRules(makeCtx({
      page: {
        url: 'https://example.com/services',
        httpStatus: 200,
        depth: 1,
        title: 'Our Services - Creative SEO',
        metaDescription: 'We provide SEO services in Dubai.',
        h1: 'Our Services',
        headings: [
          { tag: 'h1', text: 'Our Services' },
          { tag: 'h2', text: 'Technical SEO' },
          { tag: 'h2', text: 'Content Strategy' },
          { tag: 'h3', text: 'Keyword Research' },
        ],
        canonical: null,
        metaRobots: [],
        indexable: true,
        language: 'en',
        wordCount: 1200,
        schemaJson: [],
        schemaBlocks: 1,
        schemaErrors: [],
        images: [],
        redirectChain: ['https://example.com/services'],
        redirectLoop: false,
        text: '<ul><li>SEO Audit</li><li>Content Strategy</li><li>Link Building</li></ul><table><tr><th>Plan</th><th>Price</th></tr><tr><td>Basic</td><td>$500</td></tr></table><section>We are a full service agency.</section>',
      },
    }));
    const structureRule = findings.find((f) => f.ruleKey === 'aeo-structure-extractability');
    expect(structureRule).toBeDefined();
    expect(structureRule!.passed).toBe(true);
  });

  it('should check aeo-self-containment rule', () => {
    const findings = runAeoDeterministicRules(makeCtx());
    const selfRule = findings.find((f) => f.ruleKey === 'aeo-self-containment');
    expect(selfRule).toBeDefined();
    expect(selfRule!.passed).toBe(true); // Page is self-contained
  });

  it('should check aeo-information-density rule', () => {
    const findings = runAeoDeterministicRules(makeCtx());
    const densityRule = findings.find((f) => f.ruleKey === 'aeo-information-density');
    expect(densityRule).toBeDefined();
    // 1200 words on a service page should have decent density
    expect(densityRule!.passed).toBe(true);
  });

  it('should check aeo-factual-consistency rule', () => {
    const findings = runAeoDeterministicRules(makeCtx());
    const factualRule = findings.find((f) => f.ruleKey === 'aeo-factual-consistency');
    expect(factualRule).toBeDefined();
  });

  it('should check aeo-decision-support rule', () => {
    const findings = runAeoDeterministicRules(makeCtx({
      page: {
        url: 'https://example.com/pricing',
        httpStatus: 200,
        depth: 1,
        title: 'Pricing',
        metaDescription: 'Our pricing.',
        h1: 'Pricing',
        headings: [{ tag: 'h1', text: 'Pricing' }],
        canonical: null,
        metaRobots: [],
        indexable: true,
        language: 'en',
        wordCount: 800,
        schemaJson: [],
        schemaBlocks: 0,
        schemaErrors: [],
        images: [],
        redirectChain: ['https://example.com/pricing'],
        redirectLoop: false,
        text: 'Our pricing plans: Basic ($500/mo) includes technical SEO audit. Pro ($1000/mo) includes content strategy. Enterprise ($2000/mo) includes everything. Compare plans: Basic is best for small sites, Pro for growing businesses, Enterprise for large organizations.',
      },
    }));
    const decisionRule = findings.find((f) => f.ruleKey === 'aeo-decision-support');
    expect(decisionRule).toBeDefined();
    expect(decisionRule!.passed).toBe(true); // Has comparison/comparison content
  });
});

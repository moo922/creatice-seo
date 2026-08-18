import type { GeoRuleContext } from './geo';
import { runGeoDeterministicRules } from './geo';

function makeCtx(overrides: Partial<GeoRuleContext> = {}): GeoRuleContext {
  return {
    page: {
      url: 'https://example.com/services',
      httpStatus: 200,
      depth: 1,
      title: 'Our Services',
      metaDescription: 'We provide SEO services.',
      h1: 'Our Services',
      headings: [
        { tag: 'h1', text: 'Our Services' },
        { tag: 'h2', text: 'SEO Services' },
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
      text: 'Creative SEO is a leading SEO agency based in Dubai. We provide technical SEO, content strategy, and link building services. Our team has 10+ years of experience. Contact us at info@example.com.',
    },
    knowledgeBaseFacts: [
      { key: 'company_name', value: 'Creative SEO', category: 'BUSINESS_DESCRIPTION', verificationStatus: 'VERIFIED' },
      { key: 'location', value: 'Dubai, UAE', category: 'LOCATIONS', verificationStatus: 'VERIFIED' },
    ],
    siteEntity: {
      name: 'Creative SEO',
      type: 'Organization',
      location: 'Dubai, UAE',
      description: 'SEO agency',
    },
    entityRelations: [
      { subject: 'Creative SEO', predicate: 'headquartered_in', object: 'Dubai', verified: true },
    ],
    ...overrides,
  };
}

describe('runGeoDeterministicRules', () => {
  it('should return an array of findings', () => {
    const findings = runGeoDeterministicRules(makeCtx());
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('should check geo-entity-identity rule', () => {
    const findings = runGeoDeterministicRules(makeCtx());
    const entityRule = findings.find((f) => f.ruleKey === 'geo-entity-identity');
    expect(entityRule).toBeDefined();
    expect(entityRule!.passed).toBe(true); // Brand name is in text
  });

  it('should check geo-machine-accessibility rule', () => {
    const findings = runGeoDeterministicRules(makeCtx());
    const machineRule = findings.find((f) => f.ruleKey === 'geo-machine-accessibility');
    expect(machineRule).toBeDefined();
    expect(machineRule!.passed).toBe(true); // Title, h1, meta all present
  });

  it('should detect missing entity identity', () => {
    const findings = runGeoDeterministicRules(makeCtx({
      page: {
        url: 'https://example.com/about',
        httpStatus: 200,
        depth: 1,
        title: 'About Us',
        metaDescription: 'About our company.',
        h1: 'About Us',
        headings: [{ tag: 'h1', text: 'About Us' }],
        canonical: null,
        metaRobots: [],
        indexable: true,
        language: 'en',
        wordCount: 800,
        schemaJson: [],
        schemaBlocks: 0,
        schemaErrors: [],
        images: [],
        redirectChain: ['https://example.com/about'],
        redirectLoop: false,
        text: 'We are a company that does things. Our team is great. We provide many services to clients around the world.',
      },
      siteEntity: { name: 'Acme Corp', type: 'Organization' },
    }));
    const entityRule = findings.find((f) => f.ruleKey === 'geo-entity-identity');
    expect(entityRule).toBeDefined();
    expect(entityRule!.passed).toBe(false); // Brand not in text
  });

  it('should check geo-citation-readiness rule', () => {
    const findings = runGeoDeterministicRules(makeCtx());
    const citationRule = findings.find((f) => f.ruleKey === 'geo-citation-readiness');
    expect(citationRule).toBeDefined();
    // Citation readiness depends on facts with citations
    expect(typeof citationRule!.passed).toBe('boolean');
  });

  it('should check geo-factual-specificity rule', () => {
    const findings = runGeoDeterministicRules(makeCtx({
      page: {
        url: 'https://example.com/services',
        httpStatus: 200,
        depth: 1,
        title: 'Our Services',
        metaDescription: 'We provide SEO services.',
        h1: 'Our Services',
        headings: [{ tag: 'h1', text: 'Our Services' }],
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
        text: 'Creative SEO was founded in 2015 and has served 200 clients across 15 locations. Our 10 years of experience and 98% retention rate speak for themselves.',
      },
      knowledgeBaseFacts: [
        { key: 'employees', value: '25', category: 'BUSINESS_DESCRIPTION', verificationStatus: 'VERIFIED' },
        { key: 'founded', value: '2015', category: 'BUSINESS_DESCRIPTION', verificationStatus: 'VERIFIED' },
      ],
    }));
    const specificityRule = findings.find((f) => f.ruleKey === 'geo-factual-specificity');
    expect(specificityRule).toBeDefined();
    expect(specificityRule!.passed).toBe(true);
  });

  it('should detect missing specific facts', () => {
    const findings = runGeoDeterministicRules(makeCtx({
      knowledgeBaseFacts: [],
    }));
    const specificityRule = findings.find((f) => f.ruleKey === 'geo-factual-specificity');
    expect(specificityRule).toBeDefined();
    expect(specificityRule!.passed).toBe(false);
  });

  it('should check geo-original-information rule', () => {
    const findings = runGeoDeterministicRules(makeCtx({
      knowledgeBaseFacts: [
        { key: 'unique_data', value: 'Our study of 500 websites found 73% had technical SEO issues', category: 'BUSINESS_DESCRIPTION', verificationStatus: 'VERIFIED' },
      ],
    }));
    const originalRule = findings.find((f) => f.ruleKey === 'geo-original-information');
    expect(originalRule).toBeDefined();
  });

  it('should check geo-claim-verification rule', () => {
    const findings = runGeoDeterministicRules(makeCtx({
      knowledgeBaseFacts: [
        { key: 'claim', value: '#1 rated agency', category: 'BUSINESS_DESCRIPTION', verificationStatus: 'VERIFIED' },
      ],
    }));
    const claimRule = findings.find((f) => f.ruleKey === 'geo-claim-verification');
    expect(claimRule).toBeDefined();
  });
});

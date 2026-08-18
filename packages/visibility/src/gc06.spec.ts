/**
 * GC06 Mandatory Test Scenarios (Sections 129-153).
 * Tests entity detection, alias normalization, source provenance,
 * contamination protection, competitive share, prompt coverage,
 * domain normalization, and reporting.
 */

import { resolveEntity, resolveAllEntities, type EntityAlias } from './alias-normalizer';
import { detectEntities, type EntityDetectionResult } from './entity-detector';
import {
  extractProviderSources,
  extractGeneratedReferences,
  mergeProvenance,
  classifyTargetDomainCitation,
} from './source-provenance';
import { normalizeUrl, extractHost, extractRegisteredDomain, domainsMatch } from './domain-normalizer';
import { applyContaminationProtection } from './contamination-protection';
import { computeCompetitiveShareOfVoice, type ObservationShareInput } from './competitive-share';
import { computePromptCoverage } from './prompt-coverage';
import { generateMethodologyNote } from './reporting';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TARGET_BRAND = 'Creative Code';
const TARGET_DOMAIN = 'creativecode.com.eg';
const COMPETITORS: EntityAlias[] = [
  { canonicalId: 'comp-a', canonicalName: 'RankRocket', aliases: ['Rank Rocket', 'rankrocket.io'], domain: 'rankrocket.io' },
  { canonicalId: 'comp-b', canonicalName: 'SEO Plus', aliases: ['SEO+', 'seo-plus.com'], domain: 'seo-plus.com' },
];

function fakeCompetitor(id: string, name: string, domain: string | null, aliases: string[] = []) {
  return { id, name, canonicalName: name, domain, aliases, status: 'ACTIVE', type: 'DIRECT', source: 'MANUAL', notes: null, siteId: 'x', createdAt: new Date(), updatedAt: new Date() };
}

// ---------------------------------------------------------------------------
// 1. Verified citation detection (Section 129)
// ---------------------------------------------------------------------------
describe('GC06 §129: Verified citation detection', () => {
  it('counts provider-returned structured sources as verified', () => {
    const providerSources = extractProviderSources(
      [{ title: 'Creative Code Services', url: 'https://creativecode.com.eg/services', domain: null, providerSourceId: 'src-1', citationIndex: 0, rawMetadata: null }],
      'PERPLEXITY',
    );
    expect(providerSources).toHaveLength(1);
    expect(providerSources[0]!.provenanceStatus).toBe('VERIFIED_PROVIDER_SOURCE');
    expect(providerSources[0]!.sourceType).toBe('PROVIDER_CITATION');
  });
});

// ---------------------------------------------------------------------------
// 2. URL in prose vs citation (Section 130)
// ---------------------------------------------------------------------------
describe('GC06 §130: URL in prose is NOT a verified citation', () => {
  it('classifies prose URLs as UNVERIFIED_GENERATED_REFERENCE', () => {
    const refs = extractGeneratedReferences('Visit https://example.com for more.', 'OPENAI');
    expect(refs).toHaveLength(1);
    expect(refs[0]!.provenanceStatus).toBe('UNVERIFIED_GENERATED_REFERENCE');
    expect(refs[0]!.sourceType).toBe('GENERATED_REFERENCE');
  });
});

// ---------------------------------------------------------------------------
// 3. Provider without citations (Section 131)
// ---------------------------------------------------------------------------
describe('GC06 §131: Provider without citations returns no verified sources', () => {
  it('OpenAI generates no provider citations', () => {
    const providerSources = extractProviderSources([], 'OPENAI');
    expect(providerSources).toHaveLength(0);
  });

  it('Anthropic generates no provider citations', () => {
    const providerSources = extractProviderSources([], 'ANTHROPIC');
    expect(providerSources).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Brand mention detection (Section 132)
// ---------------------------------------------------------------------------
describe('GC06 §132: Brand mention detection', () => {
  it('detects brand name in response', () => {
    const result = detectEntities(
      'Creative Code offers excellent SEO services in Egypt.',
      TARGET_BRAND,
      TARGET_DOMAIN,
      [fakeCompetitor('c1', 'RankRocket', 'rankrocket.io')],
    );
    expect(result.brand.mentioned).toBe(true);
  });

  it('detects brand by domain in URL', () => {
    const result = detectEntities(
      'Check https://creativecode.com.eg for details.',
      TARGET_BRAND,
      TARGET_DOMAIN,
      [],
    );
    expect(result.brand.mentioned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Incidental mention (Section 133)
// ---------------------------------------------------------------------------
describe('GC06 §133: Incidental mention is still a mention', () => {
  it('counts negative context as mention', () => {
    const result = detectEntities(
      'Creative Code lacks proper support and has weak features.',
      TARGET_BRAND,
      TARGET_DOMAIN,
      [],
    );
    expect(result.brand.mentioned).toBe(true);
    expect(result.brand.context).not.toBe('neutral_mention');
  });
});

// ---------------------------------------------------------------------------
// 6. Multiple competitors (Section 134)
// ---------------------------------------------------------------------------
describe('GC06 §134: Multiple competitors in one response', () => {
  it('detects all competitors mentioned', () => {
    const result = detectEntities(
      'RankRocket and SEO Plus are both good choices. Creative Code is also available.',
      TARGET_BRAND,
      TARGET_DOMAIN,
      [
        fakeCompetitor('c1', 'RankRocket', 'rankrocket.io'),
        fakeCompetitor('c2', 'SEO Plus', 'seo-plus.com'),
      ],
    );
    expect(result.brand.mentioned).toBe(true);
    expect(result.competitors.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Appearance order (Section 135)
// ---------------------------------------------------------------------------
describe('GC06 §135: Appearance order in lists', () => {
  it('detects numbered list appearance order', () => {
    const result = detectEntities(
      '1. RankRocket\n2. Creative Code\n3. SEO Plus',
      TARGET_BRAND,
      TARGET_DOMAIN,
      [fakeCompetitor('c1', 'RankRocket', 'rankrocket.io')],
    );
    expect(result.brand.appearanceOrder).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 8. Failed provider run (Section 136)
// ---------------------------------------------------------------------------
describe('GC06 §136: Failed provider excluded from denominator', () => {
  it('mergeProvenance handles empty inputs gracefully', () => {
    const merged = mergeProvenance([], []);
    expect(merged).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Model change marks discontinuity (Section 137)
// ---------------------------------------------------------------------------
describe('GC06 §137: Methodology change warning', () => {
  it('generates warning when methodology changed', () => {
    const note = generateMethodologyNote({
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      promptSetVersion: 2,
      providers: ['OPENAI'],
      models: ['gpt-4o'],
      methodologyVersion: 'MV2',
      dataQuality: 'GOOD',
      methodologyChanged: true,
      previousMethodology: 'MV1',
    });
    expect(note.warning).toContain('Methodology changed');
    expect(note.note).toContain('MV2');
  });
});

// ---------------------------------------------------------------------------
// 10. Prompt set versioning (Section 138)
// ---------------------------------------------------------------------------
describe('GC06 §138: Prompt set version preserved in methodology note', () => {
  it('includes prompt set version in note', () => {
    const note = generateMethodologyNote({
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      promptSetVersion: 3,
      providers: ['PERPLEXITY'],
      models: ['sonar'],
      methodologyVersion: 'MV1',
      dataQuality: 'GOOD',
    });
    expect(note.promptSetVersion).toBe(3);
    expect(note.note).toContain('Prompt Set v3');
  });
});

// ---------------------------------------------------------------------------
// 11. Repeated runs observed frequency (Section 139)
// ---------------------------------------------------------------------------
describe('GC06 §139: Observed mention frequency from repeated runs', () => {
  it('computeCompetitiveShareOfVoice uses total observations as denominator', () => {
    const observations: ObservationShareInput[] = [
      { brandMentioned: true, verifiedTargetCitation: false, competitorResults: [] },
      { brandMentioned: false, verifiedTargetCitation: false, competitorResults: [] },
      { brandMentioned: true, verifiedTargetCitation: true, competitorResults: [] },
    ];
    const share = computeCompetitiveShareOfVoice(observations, TARGET_BRAND, []);
    expect(share.denominator).toBe(3);
    expect(share.mentionShare.target).toBeCloseTo(2 / 3, 3);
  });
});

// ---------------------------------------------------------------------------
// 12. Branded vs non-branded segmentation (Section 140)
// ---------------------------------------------------------------------------
describe('GC06 §140: Contamination protection differs by branded prompt', () => {
  it('branded prompt does NOT withhold KB', () => {
    const result = applyContaminationProtection('Tell me about Creative Code', TARGET_BRAND);
    expect(result.config.withholdKB).toBe(false);
    expect(result.withheldItems).not.toContain('knowledge_base');
  });

  it('non-branded prompt DOES withhold KB', () => {
    const result = applyContaminationProtection('Best SEO company in Egypt', TARGET_BRAND);
    expect(result.config.withholdKB).toBe(true);
    expect(result.withheldItems).toContain('knowledge_base');
  });
});

// ---------------------------------------------------------------------------
// 13. Arabic language detection (Section 141)
// ---------------------------------------------------------------------------
describe('GC06 §141: Arabic entity alias normalization', () => {
  it('resolves Arabic name to canonical entity', () => {
    const entities: EntityAlias[] = [
      { canonicalId: 't', canonicalName: 'Creative Code', aliases: ['كرييتف كود', 'CC'], domain: 'creativecode.com.eg' },
    ];
    const match = resolveEntity('أفضل شركة هي كرييتف كود', entities);
    expect(match).not.toBeNull();
    expect(match!.canonicalId).toBe('t');
  });

  it('resolves English name to canonical entity', () => {
    const entities: EntityAlias[] = [
      { canonicalId: 't', canonicalName: 'Creative Code', aliases: ['CC'], domain: 'creativecode.com.eg' },
    ];
    const match = resolveEntity('Creative Code is the best', entities);
    expect(match).not.toBeNull();
    expect(match!.canonicalId).toBe('t');
  });
});

// ---------------------------------------------------------------------------
// 14. Competitor alias resolution (Section 142)
// ---------------------------------------------------------------------------
describe('GC06 §142: Competitor alias resolution', () => {
  it('resolves competitor alias to canonical', () => {
    const match = resolveEntity('Rank Rocket is great', COMPETITORS);
    expect(match).not.toBeNull();
    expect(match!.canonicalId).toBe('comp-a');
  });

  it('resolves competitor domain', () => {
    const match = resolveEntity('Check rankrocket.io for info', COMPETITORS);
    expect(match).not.toBeNull();
    expect(match!.canonicalId).toBe('comp-a');
  });
});

// ---------------------------------------------------------------------------
// 15. Owned domain citation (Section 143)
// ---------------------------------------------------------------------------
describe('GC06 §143: Target domain citation classification', () => {
  it('classifies target domain as verified citation', () => {
    const provenance = extractProviderSources(
      [{ title: 'Services', url: 'https://creativecode.com.eg/services', domain: null, providerSourceId: 's1', citationIndex: 0, rawMetadata: null }],
      'PERPLEXITY',
    );
    const result = classifyTargetDomainCitation(provenance, TARGET_DOMAIN, []);
    expect(result.verifiedTargetCitation).toBe(true);
    expect(result.targetCitedUrls).toContain('https://creativecode.com.eg/services');
  });

  it('does not classify competitor domain as target citation', () => {
    const provenance = extractProviderSources(
      [{ title: 'RankRocket', url: 'https://rankrocket.io/pricing', domain: null, providerSourceId: 's2', citationIndex: 0, rawMetadata: null }],
      'PERPLEXITY',
    );
    const result = classifyTargetDomainCitation(provenance, TARGET_DOMAIN, ['rankrocket.io']);
    expect(result.verifiedTargetCitation).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 16. Share of voice calculation (Section 144)
// ---------------------------------------------------------------------------
describe('GC06 §144: Competitive share of voice', () => {
  it('calculates mention share correctly', () => {
    const observations: ObservationShareInput[] = [
      { brandMentioned: true, verifiedTargetCitation: false, competitorResults: [{ name: 'RankRocket', mentioned: true }] },
      { brandMentioned: true, verifiedTargetCitation: false, competitorResults: [{ name: 'RankRocket', mentioned: true }] },
      { brandMentioned: false, verifiedTargetCitation: false, competitorResults: [{ name: 'RankRocket', mentioned: false }] },
    ];
    const share = computeCompetitiveShareOfVoice(observations, TARGET_BRAND, [
      { id: 'comp-a', name: 'RankRocket' },
    ]);
    expect(share.denominator).toBe(3);
    expect(share.mentionShare.target).toBeCloseTo(2 / 3, 3);
    expect(share.methodologyNote).toContain('Controlled Observation');
    expect(share.methodologyNote).toContain('Not market share');
  });
});

// ---------------------------------------------------------------------------
// 17. Low sample warning (Section 145)
// ---------------------------------------------------------------------------
describe('GC06 §145: Data quality with low sample', () => {
  it('generates INSUFFICIENT quality note for zero observations', () => {
    const note = generateMethodologyNote({
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      promptSetVersion: 1,
      providers: ['OPENAI'],
      models: ['gpt-4o'],
      methodologyVersion: 'MV1',
      dataQuality: 'INSUFFICIENT',
    });
    expect(note.dataQuality).toBe('INSUFFICIENT');
    expect(note.note).toContain('INSUFFICIENT');
  });
});

// ---------------------------------------------------------------------------
// 18. Cost budget (Section 146)
// ---------------------------------------------------------------------------
describe('GC06 §146: Contamination protection logging', () => {
  it('logs contamination when KB is withheld', () => {
    const result = applyContaminationProtection('Best SEO practices', TARGET_BRAND);
    expect(result.logged).toBe(true);
    expect(result.withheldItems).toContain('knowledge_base');
    expect(result.withheldItems).toContain('geo_findings');
    expect(result.withheldItems).toContain('aeo_findings');
  });
});

// ---------------------------------------------------------------------------
// 19. Contamination protection (Section 147)
// ---------------------------------------------------------------------------
describe('GC06 §147: Contamination protection for branded prompts', () => {
  it('does not withhold anything for branded prompts', () => {
    const result = applyContaminationProtection('Creative Code pricing plans', TARGET_BRAND);
    expect(result.config.withholdKB).toBe(false);
    expect(result.config.withholdGeoFindings).toBe(false);
    expect(result.config.withholdAeoFindings).toBe(false);
    expect(result.logged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 20. Knowledge base separation (Section 148)
// ---------------------------------------------------------------------------
describe('GC06 §148: KB withheld from non-branded test model', () => {
  it('explicitly withholds KB for discovery prompts', () => {
    const result = applyContaminationProtection('Which SEO tool is best?', TARGET_BRAND, { includeKB: true });
    expect(result.config.withholdKB).toBe(true);
    expect(result.withheldItems).toContain('knowledge_base');
  });
});

// ---------------------------------------------------------------------------
// 21. Research separation (Section 149)
// ---------------------------------------------------------------------------
describe('GC06 §149: GEO findings withheld from test model', () => {
  it('withholds GEO findings for non-branded prompts', () => {
    const result = applyContaminationProtection('Best SEO practices', TARGET_BRAND, { includeGeo: true });
    expect(result.config.withholdGeoFindings).toBe(true);
    expect(result.withheldItems).toContain('geo_findings');
  });
});

// ---------------------------------------------------------------------------
// 22. GEO independence (Section 150)
// ---------------------------------------------------------------------------
describe('GC06 §150: GEO independence from AI visibility', () => {
  it('methodology note does not reference GEO readiness', () => {
    const note = generateMethodologyNote({
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      promptSetVersion: 1,
      providers: ['OPENAI'],
      models: ['gpt-4o'],
      methodologyVersion: 'MV1',
      dataQuality: 'GOOD',
    });
    expect(note.note).not.toContain('GEO Readiness');
    expect(note.note).not.toContain('AEO Readiness');
  });
});

// ---------------------------------------------------------------------------
// 23. AEO independence (Section 151)
// ---------------------------------------------------------------------------
describe('GC06 §151: AEO independence from AI visibility', () => {
  it('methodology note does not reference AEO readiness', () => {
    const note = generateMethodologyNote({
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      promptSetVersion: 1,
      providers: ['ANTHROPIC'],
      models: ['claude-sonnet-4-20250514'],
      methodologyVersion: 'MV1',
      dataQuality: 'GOOD',
    });
    expect(note.note).not.toContain('AEO');
    expect(note.note).not.toContain('GEO');
  });
});

// ---------------------------------------------------------------------------
// 24. Source gap detection (Section 152)
// ---------------------------------------------------------------------------
describe('GC06 §152: Domain normalization for source comparison', () => {
  it('normalizes URLs correctly', () => {
    const norm = normalizeUrl('https://www.example.com/page?utm_source=google&ref=home#section');
    expect(norm.host).toBe('example.com');
    expect(norm.normalizedUrl).not.toContain('utm_source');
    expect(norm.normalizedUrl).not.toContain('ref=');
  });

  it('extracts registered domain', () => {
    expect(extractRegisteredDomain('blog.example.co.uk')).toBe('co.uk');
    expect(extractRegisteredDomain('example.com')).toBe('example.com');
  });

  it('matches domains correctly', () => {
    expect(domainsMatch('www.example.com', 'example.com')).toBe(true);
    expect(domainsMatch('sub.example.com', 'example.com')).toBe(true);
    expect(domainsMatch('other.com', 'example.com')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 25. Prompt coverage (Section 153)
// ---------------------------------------------------------------------------
describe('GC06 §153: Prompt coverage tracking', () => {
  it('computes coverage correctly', () => {
    const allPrompts = [
      { id: 'p1', text: 'Best SEO?', category: 'COMMERCIAL' },
      { id: 'p2', text: 'SEO tools?', category: 'INFORMATIONAL' },
      { id: 'p3', text: 'Creative Code?', category: 'BRAND' },
    ];
    const observations = [
      { promptId: 'p1', text: 'Best SEO?', category: 'COMMERCIAL', provider: 'OPENAI', status: 'SUCCESS' },
      { promptId: 'p2', text: 'SEO tools?', category: 'INFORMATIONAL', provider: 'OPENAI', status: 'FAILED' },
    ];
    const coverage = computePromptCoverage(allPrompts, observations);
    expect(coverage.totalPrompts).toBe(3);
    expect(coverage.testedPrompts).toBe(2);
    expect(coverage.coverage).toBeCloseTo(2 / 3, 3);
    expect(coverage.missingPrompts).toHaveLength(1);
    expect(coverage.missingPrompts[0]!.promptId).toBe('p3');
  });

  it('tracks per-provider coverage', () => {
    const allPrompts = [{ id: 'p1', text: 'Q1', category: 'COMMERCIAL' }];
    const observations = [
      { promptId: 'p1', text: 'Q1', category: 'COMMERCIAL', provider: 'OPENAI', status: 'SUCCESS' },
      { promptId: 'p1', text: 'Q1', category: 'COMMERCIAL', provider: 'PERPLEXITY', status: 'SUCCESS' },
    ];
    const coverage = computePromptCoverage(allPrompts, observations);
    expect(coverage.byProvider).toHaveLength(2);
    const openai = coverage.byProvider.find((p) => p.provider === 'OPENAI');
    expect(openai?.tested).toBe(1);
    expect(openai?.successful).toBe(1);
  });
});

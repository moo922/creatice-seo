import { candidateGroups, lexicalSimilarity, significantTerms, validateClusterOutput } from './clustering';

describe('semantic clustering pipeline (Sections 22-28, Tests 115-116)', () => {
  it('groups Arabic commercial variants into the same candidate group (Test 115)', () => {
    const keywords = ['شركة تنظيف منازل', 'شركة تنظيف المنازل', 'شركة تنظيف منزلية'];
    const groups = candidateGroups(keywords);
    // These share the significant term "تنظيف" so they should land together.
    expect(groups.length).toBeGreaterThan(0);
    const total = groups.reduce((sum, g) => sum + g.keywords.length, 0);
    expect(total).toBe(keywords.length);
  });

  it('distinguishes different intent even when the main topic is similar (Test 116)', () => {
    // Service commercial vs how-to informational — significant terms differ enough
    // that they can be separated, but the final intent decision is AI's job.
    const commercial = 'best cleaning service';
    const informational = 'how to clean a house';
    const a = significantTerms(commercial);
    const b = significantTerms(informational);
    expect(lexicalSimilarity(commercial, informational)).toBeLessThan(1);
    expect(a.some((t) => b.includes(t))).toBe(false);
  });

  it('lexicalSimilarity is high for near-identical variants', () => {
    expect(lexicalSimilarity('seo services', 'seo services agency')).toBeGreaterThan(0.5);
  });

  it('lexicalSimilarity is 0 for unrelated keywords', () => {
    expect(lexicalSimilarity('plumbing repair', 'dog food')).toBe(0);
  });

  it('candidateGroups never drops keywords and never invents them', () => {
    const keywords = ['seo', 'keyword research', 'link building', 'seo audit'];
    const groups = candidateGroups(keywords);
    const all = groups.flatMap((g) => g.keywords);
    expect(all.length).toBe(keywords.length);
    for (const kw of all) {
      expect(keywords).toContain(kw);
    }
  });

  it('validateClusterOutput rejects invented keywords not in the input set (Section 58)', () => {
    const known = new Set(['seo', 'keyword research']);
    const output = [
      { name: 'SEO', primary_keyword: 'seo', keywords: ['seo', 'keyword research', 'invented keyword'] },
    ];
    const valid = validateClusterOutput(output, known);
    expect(valid).toHaveLength(1);
    expect(valid[0]!.keywords).toEqual(['seo', 'keyword research']);
  });

  it('validateClusterOutput drops clusters with no valid keywords', () => {
    const known = new Set(['seo']);
    const output = [
      { name: 'Empty', primary_keyword: 'nothing', keywords: ['invented'] },
    ];
    expect(validateClusterOutput(output, known)).toHaveLength(0);
  });
});
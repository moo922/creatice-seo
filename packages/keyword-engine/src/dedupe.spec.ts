import { deduplicateKeywords, toCanonicalDraft, sourceCounts } from './dedupe';

describe('keyword deduplication and multi-source merging (Section 113)', () => {
  it('merges keywords from GSC, Google Ads and Manual into one canonical keyword', () => {
    const map = deduplicateKeywords([
      { keyword: 'SEO services', source: 'GSC' },
      { keyword: 'seo services', source: 'GOOGLE_ADS' },
      { keyword: 'SEO Services', source: 'MANUAL' },
    ]);

    expect(map.size).toBe(1);
    const [hash, entry] = [...map.entries()][0]!;
    expect(hash).toBeTruthy();
    expect(new Set(entry.sources.map((s) => s.source))).toEqual(new Set(['GSC', 'GOOGLE_ADS', 'MANUAL']));
    expect(entry.draft.keyword).toBe('SEO services'); // original preserved
  });

  it('merges Arabic hamza variants from different sources', () => {
    const map = deduplicateKeywords([
      { keyword: 'شركة إعلانات', source: 'GSC' },
      { keyword: 'شركة اعلانات', source: 'MANUAL' },
    ]);
    expect(map.size).toBe(1);
  });

  it('keeps different keywords separate', () => {
    const map = deduplicateKeywords([
      { keyword: 'cleaning', source: 'GSC' },
      { keyword: 'plumbing', source: 'GSC' },
    ]);
    expect(map.size).toBe(2);
  });

  it('tracks source counts', () => {
    const map = deduplicateKeywords([
      { keyword: 'a b', source: 'GSC' },
      { keyword: 'A B', source: 'MANUAL' },
      { keyword: 'c d', source: 'GSC' },
    ]);
    const counts = sourceCounts(map);
    expect([...counts.values()].sort()).toEqual([1, 2]);
  });

  it('skips empty keywords', () => {
    const map = deduplicateKeywords([
      { keyword: '  ', source: 'GSC' },
      { keyword: 'real keyword', source: 'MANUAL' },
    ]);
    expect(map.size).toBe(1);
  });

  it('preserves exact source wording', () => {
    const map = deduplicateKeywords([
      { keyword: 'SEO agency', source: 'GSC', sourceValue: 'SEO agency near me' },
    ]);
    const [_, entry] = [...map.entries()][0]!;
    expect(entry.sources[0]!.sourceValue).toBe('SEO agency near me');
    expect(entry.draft.keyword).toBe('SEO agency');
  });
});

describe('toCanonicalDraft', () => {
  it('builds a canonical draft with normalized + hash', () => {
    const draft = toCanonicalDraft({ keyword: '  SEO   Services ', source: 'GSC' });
    expect(draft.keyword).toBe('SEO   Services');
    expect(draft.normalized).toBe('seo services');
    expect(draft.normalizedHash).toHaveLength(64);
    expect(draft.source).toBe('GSC');
  });
});
import { extractUrls, hostname, parseResponse } from './parse';

describe('extractUrls & hostname', () => {
  it('extracts unique URLs and trims trailing punctuation', () => {
    const urls = extractUrls('See https://example.com/a and https://example.com/a and https://x.io/1).');
    expect(urls).toEqual(['https://example.com/a', 'https://x.io/1']);
  });

  it('normalizes hostnames', () => {
    expect(hostname('https://www.Example.com/path')).toBe('example.com');
    expect(hostname('not a url')).toBeNull();
  });
});

describe('parseResponse', () => {
  const base = {
    brand: 'BrightSEO',
    domain: 'brightseo.com',
    competitors: ['RankRocket', 'competitor.io'],
  };

  it('detects a brand mention and website citation with a URL', () => {
    const parsed = parseResponse({
      ...base,
      response: 'BrightSEO is a top choice. See https://brightseo.com/pricing for details.',
    });
    expect(parsed.brandMentioned).toBe(true);
    expect(parsed.websiteCited).toBe(true);
    expect(parsed.citedUrls).toContain('https://brightseo.com/pricing');
    expect(parsed.confidence).toBeGreaterThan(0.5);
  });

  it('detects brand mention by domain even without the brand name', () => {
    const parsed = parseResponse({ ...base, response: 'I recommend brightseo.com for reporting.' });
    expect(parsed.brandMentioned).toBe(true);
    expect(parsed.websiteCited).toBe(true);
  });

  it('detects competitor mentions', () => {
    const parsed = parseResponse({
      ...base,
      response: 'RankRocket is strong, but competitor.io is cheaper.',
    });
    expect(parsed.competitorsMentioned).toEqual(['rankrocket', 'competitor.io']);
  });

  it('returns false signals when nothing matches', () => {
    const parsed = parseResponse({ ...base, response: 'There are many options available to buyers today.' });
    expect(parsed.brandMentioned).toBe(false);
    expect(parsed.websiteCited).toBe(false);
    expect(parsed.citedUrls).toHaveLength(0);
    expect(parsed.competitorsMentioned).toHaveLength(0);
  });

  it('treats an empty response as a low-confidence empty observation', () => {
    const parsed = parseResponse({ ...base, response: '' });
    expect(parsed.brandMentioned).toBe(false);
    expect(parsed.confidence).toBeLessThanOrEqual(0.1);
  });
});

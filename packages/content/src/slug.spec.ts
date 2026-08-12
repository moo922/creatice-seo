import { buildRecommendedUrl, slugify } from './slug';

describe('slugify', () => {
  it('slugifies Latin text', () => {
    expect(slugify('Best SEO Tools for 2025!', 'en')).toBe('best-seo-tools-for-2025');
  });

  it('keeps Arabic text and joins with hyphens', () => {
    const slug = slugify('أفضل أدوات تحسين محركات البحث', 'ar');
    expect(slug).toBe('أفضل-أدوات-تحسين-محركات-البحث');
  });

  it('removes leading/trailing separators', () => {
    expect(slugify('---hello world---', 'en')).toBe('hello-world');
  });
});

describe('buildRecommendedUrl', () => {
  it('normalizes the domain and appends the slug', () => {
    expect(buildRecommendedUrl('https://example.com/', 'hello-world')).toBe('https://example.com/hello-world');
  });

  it('strips scheme from the domain', () => {
    expect(buildRecommendedUrl('https://example.com', 'a-b')).toBe('https://example.com/a-b');
  });
});

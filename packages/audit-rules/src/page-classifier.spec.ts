import { classifyPage, isEligibleForAudit, EXCLUDED_URL_PATTERNS } from './page-classifier';

describe('classifyPage', () => {
  it('should classify FAQ pages', () => {
    const result = classifyPage({
      url: 'https://example.com/faq',
      title: 'Frequently Asked Questions',
      h1: 'FAQ',
      wordCount: 2000,
    });
    expect(result.pageType).toBe('FAQ_SUPPORT');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should classify service pages', () => {
    const result = classifyPage({
      url: 'https://example.com/services/seo',
      title: 'SEO Services',
      h1: 'SEO Services',
      wordCount: 1500,
    });
    expect(result.pageType).toBe('SERVICE');
  });

  it('should classify blog posts', () => {
    const result = classifyPage({
      url: 'https://example.com/blog/seo-tips',
      title: '10 SEO Tips for 2024',
      h1: '10 SEO Tips for 2024',
      wordCount: 3000,
    });
    expect(result.pageType).toBe('BLOG_ARTICLE');
  });

  it('should classify homepage', () => {
    const result = classifyPage({
      url: 'https://example.com/',
      title: 'Creative SEO - Leading Agency',
      h1: 'Creative SEO',
      wordCount: 800,
    });
    expect(result.pageType).toBe('HOMEPAGE');
  });

  it('should classify about pages as EXISTING_OTHER', () => {
    const result = classifyPage({
      url: 'https://example.com/about',
      title: 'About Us',
      h1: 'About Us',
      wordCount: 600,
    });
    expect(result.pageType).toBe('EXISTING_OTHER');
  });

  it('should classify pricing pages', () => {
    const result = classifyPage({
      url: 'https://example.com/pricing',
      title: 'Pricing Plans',
      h1: 'Pricing',
      wordCount: 500,
    });
    expect(result.pageType).toBe('EXISTING_OTHER');
  });

  it('should classify product pages', () => {
    const result = classifyPage({
      url: 'https://example.com/products/seo-tool',
      title: 'SEO Tool Pro',
      h1: 'SEO Tool Pro',
      wordCount: 400,
    });
    expect(result.pageType).toBe('PRODUCT');
  });

  it('should handle pages with no URL match as EXISTING_OTHER', () => {
    const result = classifyPage({
      url: 'https://example.com/something-random',
      title: 'Random Page',
      h1: 'Random',
      wordCount: 500,
    });
    expect(result.pageType).toBe('EXISTING_OTHER');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });
});

describe('isEligibleForAudit', () => {
  it('should accept FAQ pages', () => {
    expect(isEligibleForAudit('FAQ_SUPPORT', 1000)).toBe(true);
  });

  it('should accept service pages', () => {
    expect(isEligibleForAudit('SERVICE', 1000)).toBe(true);
  });

  it('should accept blog pages', () => {
    expect(isEligibleForAudit('BLOG_ARTICLE', 1000)).toBe(true);
  });

  it('should accept homepage', () => {
    expect(isEligibleForAudit('HOMEPAGE', 1000)).toBe(true);
  });

  it('should accept product pages with enough words', () => {
    expect(isEligibleForAudit('PRODUCT', 300)).toBe(true);
  });

  it('should reject pages with too few words', () => {
    expect(isEligibleForAudit('SERVICE', 30)).toBe(false);
  });

  it('should reject EXISTING_OTHER pages', () => {
    expect(isEligibleForAudit('EXISTING_OTHER', 5000)).toBe(false);
  });

  it('should reject REVIEW_REQUIRED pages', () => {
    expect(isEligibleForAudit('REVIEW_REQUIRED', 5000)).toBe(false);
  });
});

describe('EXCLUDED_URL_PATTERNS', () => {
  it('should exclude login pages', () => {
    expect(EXCLUDED_URL_PATTERNS.some((p) => p.test('https://example.com/login'))).toBe(true);
  });

  it('should exclude admin pages', () => {
    expect(EXCLUDED_URL_PATTERNS.some((p) => p.test('https://example.com/wp-admin'))).toBe(true);
  });

  it('should exclude cart pages', () => {
    expect(EXCLUDED_URL_PATTERNS.some((p) => p.test('https://example.com/cart'))).toBe(true);
  });

  it('should not exclude normal pages', () => {
    expect(EXCLUDED_URL_PATTERNS.some((p) => p.test('https://example.com/services'))).toBe(false);
    expect(EXCLUDED_URL_PATTERNS.some((p) => p.test('https://example.com/blog/post'))).toBe(false);
  });
});

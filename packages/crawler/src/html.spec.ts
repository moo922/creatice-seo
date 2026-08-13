import { extractHtmlMetadata, resolveUrl } from './html';

describe('html extraction', () => {
  const base = 'https://example.com/blog/post';
  const html =
    '<html><head><title>  My &amp; Page </title>' +
    '<meta name="description" content="A short description.">' +
    '<link rel="canonical" href="https://example.com/blog/post">' +
    '</head><body><a href="/about">About</a><a href="#frag">skip</a>' +
    '<a href="https://external.test/x">ext</a><a href="/about">dup</a></body></html>';

  it('extracts title, description and canonical', () => {
    const meta = extractHtmlMetadata(html, base);
    expect(meta.title).toBe('My & Page');
    expect(meta.description).toBe('A short description.');
    expect(meta.canonical).toBe('https://example.com/blog/post');
  });

  it('collects absolute links, dedupes, and drops fragments', () => {
    const meta = extractHtmlMetadata(html, base);
    expect(meta.links).toEqual(['https://example.com/about', 'https://external.test/x']);
  });

  it('resolves relative URLs against the base', () => {
    expect(resolveUrl('/about', base)).toBe('https://example.com/about');
    expect(resolveUrl('https://other.test/x', base)).toBe('https://other.test/x');
    expect(resolveUrl('javascript:alert(1)', base)).toBeNull();
  });
});

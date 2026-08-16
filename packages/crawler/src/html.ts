/**
 * Dependency-free HTML extraction. Collects the deterministic on-page signals
 * a technical/on-page audit engine needs: title, meta description, canonical,
 * meta robots, language, JSON-LD schema, hreflang alternates and structured
 * outbound links (anchor text + rel + nofollow). Page bodies are kept out of
 * the database; only extracted signals are persisted.
 */

export interface ExtractedHeading {
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  text: string;
}

export interface ExtractedLink {
  url: string;
  anchor: string;
  rel: string | null;
  nofollow: boolean;
}

export interface ExtractedHreflang {
  href: string;
  hreflang: string;
}

export interface ExtractedImage {
  src: string;
  alt: string | null;
}

export interface SchemaError {
  message: string;
}

export interface HtmlMetadata {
  title: string | null;
  description: string | null;
  canonical: string | null;
  /** Raw meta robots tokens, e.g. ['noindex', 'nofollow']. */
  metaRobots: string[];
  /** <html lang> value. */
  language: string | null;
  /** Parsed JSON-LD blocks (objects / arrays), as encountered. */
  schemaJson: unknown[];
  /** Total JSON-LD script blocks found (valid + invalid). */
  schemaBlocks: number;
  /** JSON-LD blocks that failed to parse. */
  schemaErrors: SchemaError[];
  /** Alternate-language links as [{ href, hreflang }]. */
  hreflang: ExtractedHreflang[];
  /** All absolute hrefs found on the page (deduped, order preserved). */
  links: ExtractedLink[];
  /** Document headings (h1-h6) in order, capped at 50. */
  headings: ExtractedHeading[];
  /** Images as [{ src, alt }], capped at 500. */
  images: ExtractedImage[];
}

export function extractHtmlMetadata(html: string, baseUrl: string): HtmlMetadata {
  const schema = extractJsonLd(html);
  return {
    title: extractTitle(html),
    description: extractMeta(html, 'description'),
    canonical: extractCanonical(html),
    metaRobots: extractMetaRobots(html),
    language: extractLanguage(html),
    schemaJson: schema.parsed,
    schemaBlocks: schema.blocks,
    schemaErrors: schema.errors,
    hreflang: extractHreflang(html, baseUrl),
    links: extractLinks(html, baseUrl),
    headings: extractHeadings(html),
    images: extractImages(html, baseUrl),
  };
}

function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match?.[1]) return null;
  return decodeEntities(match[1].replace(/\s+/g, ' ').trim()).slice(0, 500) || null;
}

function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i');
  const match = re.exec(html);
  if (!match?.[0]) return null;
  const content = /content\s*=\s*["']([^"']*)["']/i.exec(match[0]);
  if (!content?.[1]) return null;
  return decodeEntities(content[1].replace(/\s+/g, ' ').trim()).slice(0, 1000) || null;
}

function extractCanonical(html: string): string | null {
  const match = /<link[^>]+rel=["']canonical["'][^>]*>/i.exec(html);
  if (!match?.[0]) return null;
  const href = /href\s*=\s*["']([^"']*)["']/i.exec(match[0]);
  return href?.[1] ? href[1] : null;
}

function extractMetaRobots(html: string): string[] {
  const match = /<meta[^>]+name=["']robots["'][^>]*>/i.exec(html);
  if (!match?.[0]) return [];
  const content = /content\s*=\s*["']([^"']*)["']/i.exec(match[0]);
  if (!content?.[1]) return [];
  return content[1]
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function extractLanguage(html: string): string | null {
  const match = /<html[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(html);
  if (!match?.[1]) return null;
  return match[1].slice(0, 20);
}

function extractJsonLd(html: string): { parsed: unknown[]; blocks: number; errors: SchemaError[] } {
  const parsed: unknown[] = [];
  const errors: SchemaError[] = [];
  let blocks = 0;
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    blocks += 1;
    const raw = match[1]?.trim();
    if (!raw) {
      errors.push({ message: 'empty JSON-LD block' });
      continue;
    }
    try {
      const value: unknown = JSON.parse(raw);
      if (Array.isArray(value)) parsed.push(...value);
      else parsed.push(value);
    } catch {
      errors.push({ message: 'JSON-LD block is not valid JSON' });
    }
    if (blocks >= 50) break;
  }
  return { parsed, blocks, errors };
}

function extractImages(html: string, baseUrl: string): ExtractedImage[] {
  const out: ExtractedImage[] = [];
  const re = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const tag = match[0];
    const srcAttr = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (!srcAttr?.[1]) continue;
    const absolute = resolveUrl(srcAttr[1], baseUrl);
    if (!absolute) continue;
    const altAttr = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag);
    const alt = altAttr?.[1] ? altAttr[1].trim().slice(0, 500) : null;
    out.push({ src: absolute, alt: alt || null });
    if (out.length >= 500) break;
  }
  return out;
}

function extractHreflang(html: string, baseUrl: string): ExtractedHreflang[] {
  const out: ExtractedHreflang[] = [];
  const seen = new Set<string>();
  const re = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const tag = match[0];
    if (!/hreflang\s*=/i.test(tag)) continue;
    const hrefAttr = /href\s*=\s*["']([^"']*)["']/i.exec(tag);
    const langAttr = /hreflang\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (!hrefAttr?.[1] || !langAttr?.[1]) continue;
    const absolute = resolveUrl(hrefAttr[1], baseUrl);
    if (!absolute) continue;
    const key = `${langAttr[1]}|${absolute}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ href: absolute, hreflang: langAttr[1].slice(0, 20) });
    if (out.length >= 30) break;
  }
  return out;
}

function extractLinks(html: string, baseUrl: string): ExtractedLink[] {
  const out: ExtractedLink[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const tag = match[0];
    const hrefAttr = /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (!hrefAttr?.[1]) continue;
    const href = hrefAttr[1];
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    const absolute = resolveUrl(href, baseUrl);
    if (!absolute) continue;
    if (seen.has(absolute)) continue;
    seen.add(absolute);

    const relAttr = /\brel\s*=\s*["']([^"']*)["']/i.exec(tag);
    const rel = relAttr?.[1] ? relAttr[1].trim().slice(0, 255) : null;
    const nofollow = /\brel\s*=/i.test(tag) ? /\brel\s*=\s*["'][^"']*\bnofollow\b/i.test(tag) : false;

    const anchor = (match[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
    out.push({ url: absolute, anchor, rel, nofollow });
  }
  return out;
}

function extractHeadings(html: string): ExtractedHeading[] {
  const out: ExtractedHeading[] = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const text = decodeEntities((match[2] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    if (!text) continue;
    out.push({ tag: `h${match[1]}` as ExtractedHeading['tag'], text: text.slice(0, 500) });
    if (out.length >= 50) break;
  }
  return out;
}

export function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    const base = new URL(baseUrl);
    const resolved = new URL(href, base);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    // Drop the hash so crawl targets are stable and cacheable.
    resolved.hash = '';
    return resolved.href;
  } catch {
    return null;
  }
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_m, code: string) => {
      const parsed = Number(code);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : '';
    });
}

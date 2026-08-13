/**
 * Dependency-free HTML extraction: title, meta description, canonical and
 * same-origin links. The platform intentionally keeps page bodies out of the
 * database, so only lightweight metadata is collected during a crawl.
 */

export interface HtmlMetadata {
  title: string | null;
  description: string | null;
  canonical: string | null;
  /** All absolute hrefs found on the page (deduped, order preserved). */
  links: string[];
}

export function extractHtmlMetadata(html: string, baseUrl: string): HtmlMetadata {
  const title = extractTitle(html);
  const description = extractMeta(html, 'description');
  const canonical = extractCanonical(html);
  const links = extractLinks(html, baseUrl);
  return { title, description, canonical, links };
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

function extractLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = match[1];
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    const absolute = resolveUrl(href, baseUrl);
    if (!absolute) continue;
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    out.push(absolute);
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

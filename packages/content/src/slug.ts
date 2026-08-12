import { isArabic } from './arabic';

/**
 * Slugifies a string for use in a URL path. Arabic text is kept (URL-encoded
 * by the transport layer) with whitespace joined by hyphens; Latin text is
 * lowercased and stripped of punctuation.
 */
export function slugify(value: string, _language: 'ar' | 'en'): string {
  const trimmed = value.trim().replace(/^[^#\w\u0600-\u06FF]+|[^#\w\u0600-\u06FF]+$/g, '');
  if (isArabic(trimmed)) {
    return trimmed
      .replace(/\s+/g, '-')
      .replace(/[^\u0600-\u06FF0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  return trimmed
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Builds a recommended URL from a domain and slug. */
export function buildRecommendedUrl(domain: string, slug: string): string {
  const cleanDomain = domain.replace(/\/+$/, '').replace(/^https?:\/\//, '');
  return `https://${cleanDomain}/${slug}`;
}

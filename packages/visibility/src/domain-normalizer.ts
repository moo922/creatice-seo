/**
 * Domain normalization for citation provenance (GC06 Section 22).
 * Handles www, http/https, tracking parameters, fragments.
 */

export interface NormalizedDomain {
  originalUrl: string;
  normalizedUrl: string;
  host: string;
  registeredDomain: string | null;
}

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'source', 'via',
]);

export function normalizeUrl(url: string): NormalizedDomain {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const registeredDomain = extractRegisteredDomain(host);

    const cleanParams = new URLSearchParams();
    parsed.searchParams.forEach((value, key) => {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) {
        cleanParams.append(key, value);
      }
    });

    const queryString = cleanParams.toString();
    const normalizedUrl = `${parsed.protocol}//${host}${parsed.pathname}${queryString ? `?${queryString}` : ''}${parsed.hash ? '' : ''}`.replace(/\/$/, '');

    return { originalUrl: url, normalizedUrl, host, registeredDomain };
  } catch {
    const host = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]?.toLowerCase() ?? '';
    return { originalUrl: url, normalizedUrl: url, host, registeredDomain: extractRegisteredDomain(host) };
  }
}

export function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function extractRegisteredDomain(host: string): string | null {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  if (!tld || !sld) return null;
  return `${sld}.${tld}`;
}

export function domainsMatch(a: string, b: string): boolean {
  const normA = a.replace(/^www\./, '').toLowerCase();
  const normB = b.replace(/^www\./, '').toLowerCase();
  return normA === normB || normA.endsWith(`.${normB}`) || normB.endsWith(`.${normA}`);
}

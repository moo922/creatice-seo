/**
 * Deterministic parsing of an AI response into observation signals. All signals
 * are extracted from the raw response text via exact/normalized matching and
 * URL extraction — no AI is used to interpret the response. `confidence`
 * reflects how reliable the classification is given the available text.
 */

export interface ParseInput {
  response: string;
  brand: string;
  domain: string;
  competitors: string[];
}

export interface ParsedObservation {
  brandMentioned: boolean;
  websiteCited: boolean;
  citedUrls: string[];
  competitorsMentioned: string[];
  context: {
    wordCount: number;
    citedUrlCount: number;
    brandName: string;
    domain: string;
  };
  confidence: number;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'\u2026]+/gi;

export function parseResponse(input: ParseInput): ParsedObservation {
  const response = input.response ?? '';
  const text = normalize(response);
  const domain = normalizeDomain(input.domain);
  const brand = normalize(input.brand);

  const urls = extractUrls(response);
  const citedHosts = urls.map(hostname).filter((host): host is string => host !== null);
  const websiteCited =
    citedHosts.some((host) => domainHostMatches(host, domain)) || (domain.length > 0 && text.includes(domain));

  const brandMentioned =
    (brand.length >= 3 && text.includes(brand)) ||
    (domain.length > 0 && text.includes(domain)) ||
    (brand.length > 0 && text.includes(brand.split(' ')[0]!));

  const competitorRefs = input.competitors
    .map((competitor) => competitor.trim())
    .filter(Boolean)
    .map((competitor) => ({
      name: normalize(competitor),
      domain: normalizeDomain(competitor),
    }));

  const competitorsMentioned: string[] = [];
  for (const ref of competitorRefs) {
    const matched =
      (ref.name.length >= 3 && text.includes(ref.name)) || (ref.domain.length > 0 && text.includes(ref.domain));
    if (matched) {
      competitorsMentioned.push(ref.name || ref.domain);
    }
  }

  const wordCount = countWords(response);
  const confidence = computeConfidence({ response, brand, domain, brandMentioned, websiteCited, urlCount: urls.length });

  return {
    brandMentioned,
    websiteCited,
    citedUrls: urls,
    competitorsMentioned,
    context: {
      wordCount,
      citedUrlCount: urls.length,
      brandName: input.brand,
      domain: input.domain,
    },
    confidence,
  };
}

export function extractUrls(response: string): string[] {
  const matches = response.match(URL_PATTERN) ?? [];
  const cleaned = matches
    .map((url) => url.replace(/[),.;:!?"']+$/, ''))
    .filter((url) => /^https?:\/\//.test(url));
  return [...new Set(cleaned)];
}

export function hostname(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeDomain(value: string): string {
  const candidate = value.toLowerCase().trim();
  try {
    const url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return candidate.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0] ?? '';
  }
}

function domainHostMatches(host: string, domain: string): boolean {
  if (!domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

function countWords(text: string): number {
  const words = text.match(/[\p{L}\p{N}]+/gu);
  return words?.length ?? 0;
}

function computeConfidence(input: {
  response: string;
  brand: string;
  domain: string;
  brandMentioned: boolean;
  websiteCited: boolean;
  urlCount: number;
}): number {
  let confidence = 0.4;
  if (input.response.length >= 20) confidence += 0.2;
  if (input.brand.length >= 4 || input.domain.length > 0) confidence += 0.1;
  if (input.urlCount > 0) confidence += 0.1;
  if (input.brandMentioned || input.websiteCited) confidence += 0.1;
  if (input.response.length < 5) confidence = 0.1;
  return Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100;
}

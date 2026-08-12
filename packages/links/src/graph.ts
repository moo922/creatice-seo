import type { LinkDetection, LinkSuggestionAction } from '@creative-seo/types';

/**
 * Link graph input types and URL helpers. URLs used in suggestions are never
 * invented: sources come from crawled pages, targets come from the approved
 * URL map or the crawled set.
 */

export interface CrawledPageData {
  url: string;
  text: string;
  headings: string[];
  httpStatus: number | null;
  outLinks: Array<{ url: string; anchor: string }>;
}

export interface ApprovedTarget {
  url: string;
  clusterId: string | null;
  clusterName: string | null;
  primaryKeyword: string;
  keywords: string[];
}

export interface LinkGraphInput {
  siteDomain: string;
  crawledPages: CrawledPageData[];
  approvedTargets: ApprovedTarget[];
}

export interface LinkGraphOptions {
  /** Incoming-link count below which a target is "weakly linked" (default 2). */
  weakThreshold?: number;
  /** Distinct sources using the same anchor before it is "overused" (default 3). */
  overusedAnchorThreshold?: number;
  /** Max suggestion sources considered per target (default 5). */
  maxSourcesPerTarget?: number;
}

export interface SuggestionCandidate {
  sourceUrl: string;
  targetUrl: string;
  anchor: string;
  context: string;
  confidence: number;
  reason: string;
  detection: LinkDetection;
  action: LinkSuggestionAction;
}

export interface LinkStats {
  orphanPages: number;
  weakTargets: number;
  brokenLinks: number;
  opportunities: number;
  overusedAnchors: number;
  conflictingLinks: number;
  crawledPages: number;
  approvedTargets: number;
}

export interface AnalysisOutput {
  suggestions: SuggestionCandidate[];
  stats: LinkStats;
}

export function hostname(value: string): string | null {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return value.toLowerCase().replace(/^www\./, '').split(/[/?#]/)[0] || null;
  }
}

export function isInternalLink(url: string, siteDomain: string): boolean {
  const linkHost = hostname(url);
  const domainHost = hostname(siteDomain);
  if (!linkHost || !domainHost) return false;
  return linkHost === domainHost || linkHost.endsWith(`.${domainHost}`);
}

/** Normalizes a URL for comparison (scheme + www + trailing slash removed). */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.toLowerCase().trim());
    const host = parsed.hostname.replace(/^www\./, '');
    let path = parsed.pathname.replace(/\/+$/, '');
    if (path === '') path = '/';
    const query = parsed.search ? parsed.search : '';
    return `${host}${path}${query}`;
  } catch {
    return url.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A context snippet around the first keyword match (deterministic). */
export function extractContext(text: string, keywords: string[]): string {
  const normalized = normalizeText(text);
  for (const keyword of keywords) {
    const term = normalizeText(keyword);
    if (term.length < 2) continue;
    const index = normalized.indexOf(term);
    if (index !== -1) {
      const start = Math.max(0, index - 80);
      const end = Math.min(normalized.length, index + term.length + 120);
      return normalized.slice(start, end).trim();
    }
  }
  return normalized.slice(0, 120).trim();
}

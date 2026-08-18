import type { CrawlErrorType, CrawlRobotsStatus, CrawlSitemapStatus } from '@creative-seo/types';

/** Deterministic per-page signals extracted during a versioned crawl run. */
export interface AuditPageSignal {
  url: string;
  httpStatus: number | null;
  depth: number;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: Array<{ tag: string; text: string }>;
  canonical: string | null;
  metaRobots: string[];
  indexable: boolean;
  language: string | null;
  wordCount: number;
  schemaJson: unknown[];
  schemaBlocks: number;
  schemaErrors: Array<{ message: string }>;
  images: Array<{ src: string; alt: string | null }>;
  redirectChain: string[];
  redirectLoop: boolean;
  /** Page text content (HTML, capped at ~100KB). Used by AEO/GEO audits. */
  text?: string;
}

export interface AuditLinkSignal {
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  rel: string | null;
  internal: boolean;
  nofollow: boolean;
  statusCodeWhenKnown: number | null;
}

export interface AuditErrorSignal {
  url: string;
  errorType: CrawlErrorType;
  message: string;
  statusCode: number | null;
}

export interface AuditRunSignal {
  robotsStatus: CrawlRobotsStatus;
  sitemapStatus: CrawlSitemapStatus;
  seedUrl: string;
  sitemapUrls: string[];
  pagesCrawled: number;
  pagesFailed: number;
  pagesDiscovered: number;
  maxPages: number;
}

export interface AuditContext {
  siteId: string;
  siteDomain: string;
  siteLanguage: string | null;
  run: AuditRunSignal;
  pages: AuditPageSignal[];
  links: AuditLinkSignal[];
  errors: AuditErrorSignal[];
  /** Broken-link results of the existing link-analysis engine (integrated). */
  linkAnalysis?: {
    brokenLinks: Array<{ sourceUrl: string; targetUrl: string }>;
  };
}

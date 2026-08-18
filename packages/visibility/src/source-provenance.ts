/**
 * Source provenance extraction and classification (GC06 Section 21).
 * Distinguishes provider-provenanced citations from hallucinated URLs.
 */

import type { ProviderSource, ProvenanceQuality } from '@creative-seo/ai';
import { normalizeUrl, extractHost, extractRegisteredDomain, domainsMatch } from './domain-normalizer';

export interface SourceProvenanceRecord {
  provider: string;
  sourceType: 'PROVIDER_CITATION' | 'GENERATED_REFERENCE' | 'INFERRED_DOMAIN' | 'UNKNOWN';
  title: string | null;
  url: string | null;
  domain: string | null;
  normalizedUrl: string | null;
  registeredDomain: string | null;
  host: string | null;
  providerSourceId: string | null;
  citationIndex: number | null;
  provenanceStatus: ProvenanceQuality;
  rawMetadata: Record<string, unknown> | null;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'\u2026]+/gi;

export function extractProviderSources(
  providerSources: ProviderSource[],
  provider: string,
): SourceProvenanceRecord[] {
  return providerSources.map((src, idx) => {
    const normalized = src.url ? normalizeUrl(src.url) : null;
    const host = normalized?.host ?? extractHost(src.url ?? '') ?? null;
    const registeredDomain = host ? extractRegisteredDomain(host) : null;

    return {
      provider,
      sourceType: 'PROVIDER_CITATION' as const,
      title: src.title ?? null,
      url: src.url ?? null,
      domain: host,
      normalizedUrl: normalized?.normalizedUrl ?? null,
      registeredDomain,
      host,
      providerSourceId: src.providerSourceId ?? null,
      citationIndex: src.citationIndex ?? idx,
      provenanceStatus: 'VERIFIED_PROVIDER_SOURCE' as const,
      rawMetadata: src.rawMetadata,
    };
  });
}

export function extractGeneratedReferences(
  responseText: string,
  provider: string,
): SourceProvenanceRecord[] {
  const urls = responseText.match(URL_PATTERN) ?? [];
  const cleaned = urls
    .map((url) => url.replace(/[),.;:!?"']+$/, ''))
    .filter((url) => /^https?:\/\//.test(url));

  const unique = [...new Set(cleaned)];

  return unique.map((url) => {
    const normalized = normalizeUrl(url);
    return {
      provider,
      sourceType: 'GENERATED_REFERENCE' as const,
      title: null,
      url,
      domain: normalized.host,
      normalizedUrl: normalized.normalizedUrl,
      registeredDomain: normalized.registeredDomain,
      host: normalized.host,
      providerSourceId: null,
      citationIndex: null,
      provenanceStatus: 'UNVERIFIED_GENERATED_REFERENCE' as const,
      rawMetadata: null,
    };
  });
}

export function mergeProvenance(
  providerSources: SourceProvenanceRecord[],
  generatedRefs: SourceProvenanceRecord[],
): SourceProvenanceRecord[] {
  const merged: SourceProvenanceRecord[] = [];
  const providerUrls = new Set(providerSources.map((s) => s.normalizedUrl).filter(Boolean));

  for (const src of providerSources) {
    merged.push(src);
  }

  for (const ref of generatedRefs) {
    if (ref.normalizedUrl && providerUrls.has(ref.normalizedUrl)) continue;
    merged.push(ref);
  }

  return merged;
}

export function classifyTargetDomainCitation(
  provenance: SourceProvenanceRecord[],
  targetDomain: string,
  competitorDomains: string[],
): {
  verifiedTargetCitation: boolean;
  targetCitedUrls: string[];
  targetSources: SourceProvenanceRecord[];
  competitorCitations: Array<{ domain: string; count: number }>;
} {
  const targetSources: SourceProvenanceRecord[] = [];
  const targetCitedUrls: string[] = [];
  const competitorMap = new Map<string, number>();

  for (const src of provenance) {
    if (!src.host) continue;

    if (domainsMatch(src.host, targetDomain)) {
      if (src.provenanceStatus === 'VERIFIED_PROVIDER_SOURCE') {
        targetSources.push(src);
        if (src.url) targetCitedUrls.push(src.url);
      }
    } else {
      for (const compDomain of competitorDomains) {
        if (domainsMatch(src.host, compDomain)) {
          competitorMap.set(compDomain, (competitorMap.get(compDomain) ?? 0) + 1);
          break;
        }
      }
    }
  }

  return {
    verifiedTargetCitation: targetSources.length > 0,
    targetCitedUrls,
    targetSources,
    competitorCitations: [...competitorMap.entries()].map(([domain, count]) => ({ domain, count })),
  };
}

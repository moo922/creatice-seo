import { createHash } from 'crypto';

/**
 * Dedup Engine — prevents duplicate recommendations from different sources.
 *
 * When the same problem is found by SEO Audit, GSC CTR analysis, and Content
 * Audit, they should produce ONE recommendation with merged evidence — not three
 * separate "Improve meta title" items.
 *
 * Uses deterministic fingerprints based on:
 *   site + action type + target page/cluster + material issue identity.
 */

export interface DedupFingerprintInput {
  siteId: string;
  actionType: string;
  targetUrl: string | null;
  clusterId: string | null;
  issueKind: string;
}

export interface DedupResult {
  fingerprint: string;
  isDuplicate: boolean;
  existingRecommendationId: string | null;
}

/**
 * Generate a deterministic fingerprint for a recommendation.
 * Same site + same action + same target + same issue kind = same fingerprint.
 */
export function computeFingerprint(input: DedupFingerprintInput): string {
  const parts = [
    input.siteId,
    input.actionType,
    input.targetUrl ? normalizeUrl(input.targetUrl) : '',
    input.clusterId ?? '',
    input.issueKind,
  ];
  const content = parts.join('|');
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Merge evidence from multiple sources into a single recommendation.
 * The recommendation keeps all source_ids and a combined evidence object.
 */
export interface EvidenceEntry {
  source: string;
  sourceId: string;
  evidence: Record<string, unknown>;
  detectedAt: string;
}

export interface MergedEvidence {
  sources: EvidenceEntry[];
  sourceCount: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
  mergedFrom: string[];
}

export function mergeEvidence(existing: MergedEvidence | null, newEntry: EvidenceEntry): MergedEvidence {
  if (!existing) {
    return {
      sources: [newEntry],
      sourceCount: 1,
      firstDetectedAt: newEntry.detectedAt,
      lastDetectedAt: newEntry.detectedAt,
      mergedFrom: [newEntry.sourceId],
    };
  }

  // Avoid duplicate source_ids
  if (existing.mergedFrom.includes(newEntry.sourceId)) {
    // Update the evidence for the existing source
    const idx = existing.sources.findIndex((s) => s.sourceId === newEntry.sourceId);
    if (idx >= 0) existing.sources[idx] = newEntry;
    return {
      ...existing,
      lastDetectedAt: newEntry.detectedAt > existing.lastDetectedAt ? newEntry.detectedAt : existing.lastDetectedAt,
    };
  }

  return {
    sources: [...existing.sources, newEntry],
    sourceCount: existing.sourceCount + 1,
    firstDetectedAt: existing.firstDetectedAt < newEntry.detectedAt ? existing.firstDetectedAt : newEntry.detectedAt,
    lastDetectedAt: newEntry.detectedAt > existing.lastDetectedAt ? newEntry.detectedAt : existing.lastDetectedAt,
    mergedFrom: [...existing.mergedFrom, newEntry.sourceId],
  };
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/+$/, '');
  }
}

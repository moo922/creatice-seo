import type { LinkDetection } from '@creative-seo/types';
import type {
  AnalysisOutput,
  ApprovedTarget,
  CrawledPageData,
  LinkGraphInput,
  LinkGraphOptions,
  SuggestionCandidate,
} from './graph';
import { extractContext, isInternalLink, normalizeText, normalizeUrl } from './graph';
import {
  brokenLinkConfidence,
  CONFLICT_CONFIDENCE,
  opportunityConfidence,
  orphanConfidence,
  OVERUSED_ANCHOR_CONFIDENCE,
  weakTargetConfidence,
} from './scoring';

const DEFAULT_OPTIONS: Required<LinkGraphOptions> = {
  weakThreshold: 2,
  overusedAnchorThreshold: 3,
  maxSourcesPerTarget: 5,
};

/**
 * Deterministic internal-link detection over crawled content + the approved
 * URL map. Identifies orphan pages, weakly linked targets, broken links,
 * relevant opportunities, overused anchors and conflicting links. Self-links
 * are always excluded; URLs are only taken from the input (never invented).
 */
export function analyzeLinkGraph(input: LinkGraphInput, options: LinkGraphOptions = {}): AnalysisOutput {
  const opts: Required<LinkGraphOptions> = { ...DEFAULT_OPTIONS, ...options };
  const suggestions: SuggestionCandidate[] = [];
  const stats: AnalysisOutput['stats'] = {
    orphanPages: 0,
    weakTargets: 0,
    brokenLinks: 0,
    opportunities: 0,
    overusedAnchors: 0,
    conflictingLinks: 0,
    crawledPages: input.crawledPages.length,
    approvedTargets: input.approvedTargets.length,
  };

  const crawledByUrl = new Map<string, CrawledPageData>();
  for (const page of input.crawledPages) {
    crawledByUrl.set(normalizeUrl(page.url), page);
  }

  const knownUrls = new Set<string>([...crawledByUrl.keys()]);
  const targetByUrl = new Map<string, ApprovedTarget>();
  for (const target of input.approvedTargets) {
    targetByUrl.set(normalizeUrl(target.url), target);
    knownUrls.add(normalizeUrl(target.url));
  }

  // Incoming internal links: normalized target -> list of { sourceUrl, anchor }.
  const incoming = new Map<string, Array<{ sourceUrl: string; anchor: string }>>();
  for (const page of input.crawledPages) {
    for (const link of page.outLinks ?? []) {
      if (!isInternalLink(link.url, input.siteDomain)) continue;
      const target = normalizeUrl(link.url);
      const bucket = incoming.get(target) ?? [];
      bucket.push({ sourceUrl: page.url, anchor: link.anchor });
      incoming.set(target, bucket);
    }
  }

  // Inbound count per crawled page (for source strength).
  const inboundCount = new Map<string, number>();
  for (const [target, sources] of incoming) {
    inboundCount.set(target, sources.length);
  }

  // -------------------------------------------------------------------------
  // 1. Orphan pages + 2. weakly linked targets (suggest ADD_LINK to the target)
  // -------------------------------------------------------------------------
  for (const target of input.approvedTargets) {
    const normalized = normalizeUrl(target.url);
    const sources = incoming.get(normalized) ?? [];
    if (sources.length === 0) {
      stats.orphanPages += 1;
      const best = bestSource(input, target);
      if (best) {
        const topical = topicalScore(best, target);
        suggestions.push(
          suggestion({
            source: best,
            target,
            anchor: recommendedAnchor(target),
            context: extractContext(best.text, target.keywords),
            confidence: orphanConfidence(topical),
            reason: `Orphan page: ${target.url} has no internal links pointing to it. Link from ${best.url}, which is topically related.`,
            detection: 'ORPHAN',
          }),
        );
      }
      continue;
    }

    if (sources.length < opts.weakThreshold) {
      stats.weakTargets += 1;
      const best = bestSource(input, target);
      if (best) {
        const topical = topicalScore(best, target);
        suggestions.push(
          suggestion({
            source: best,
            target,
            anchor: recommendedAnchor(target),
            context: extractContext(best.text, target.keywords),
            confidence: weakTargetConfidence(topical),
            reason: `Weakly linked target: ${target.url} has only ${sources.length} incoming internal link(s).`,
            detection: 'WEAK_TARGET',
          }),
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Broken links (internal target unknown or 404) -> REMOVE_LINK
  // -------------------------------------------------------------------------
  for (const page of input.crawledPages) {
    for (const link of page.outLinks ?? []) {
      if (!isInternalLink(link.url, input.siteDomain)) continue;
      const normalized = normalizeUrl(link.url);
      const pageStatus = crawledByUrl.get(normalized)?.httpStatus ?? null;
      const brokenByStatus = pageStatus !== null && pageStatus >= 400;
      const isBroken = brokenByStatus || !knownUrls.has(normalized);
      if (!isBroken) continue;
      if (normalizeUrl(link.url) === normalizeUrl(page.url)) continue;
      stats.brokenLinks += 1;
      const reason = brokenByStatus
        ? `Broken link: ${link.url} returned HTTP ${pageStatus} (linked from ${page.url}).`
        : `Broken link candidate: ${link.url} is not a known internal URL (linked from ${page.url}).`;
      suggestions.push(
        suggestion({
          source: page,
          target: { url: link.url, clusterId: null, clusterName: null, primaryKeyword: '', keywords: [] },
          anchor: link.anchor,
          context: extractContext(page.text, [link.anchor]),
          confidence: brokenLinkConfidence(pageStatus),
          reason,
          detection: 'BROKEN',
          action: 'REMOVE_LINK',
        }),
      );
    }
  }

  // -------------------------------------------------------------------------
  // 4. Relevant link opportunities (source -> target, ADD_LINK)
  // -------------------------------------------------------------------------
  for (const target of input.approvedTargets) {
    const normalizedTarget = normalizeUrl(target.url);
    const existingSources = new Set((incoming.get(normalizedTarget) ?? []).map((entry) => normalizeUrl(entry.sourceUrl)));
    const candidates = input.crawledPages
      .filter((page) => normalizeUrl(page.url) !== normalizedTarget)
      .filter((page) => !existingSources.has(normalizeUrl(page.url)))
      .map((page) => ({ page, topical: topicalScore(page, target) }))
      .filter((entry) => entry.topical > 0)
      .sort((a, b) => b.topical - a.topical)
      .slice(0, opts.maxSourcesPerTarget);

    for (const entry of candidates) {
      const sourceInbound = (inboundCount.get(normalizeUrl(entry.page.url)) ?? 0) > 0;
      const targetHasInbound = (incoming.get(normalizedTarget)?.length ?? 0) > 0;
      const confidence = opportunityConfidence({
        topicalScore: entry.topical,
        sourceHasInbound: sourceInbound,
        targetHasInbound,
      });
      suggestions.push(
        suggestion({
          source: entry.page,
          target,
          anchor: recommendedAnchor(target),
          context: extractContext(entry.page.text, target.keywords),
          confidence,
          reason: `Relevant opportunity: ${entry.page.url} covers "${target.primaryKeyword}" but does not link to ${target.url}.`,
          detection: 'OPPORTUNITY',
        }),
      );
      stats.opportunities += 1;
    }
  }

  // -------------------------------------------------------------------------
  // 5. Overused anchors -> CHANGE_ANCHOR on redundant sources
  // -------------------------------------------------------------------------
  for (const target of input.approvedTargets) {
    const sources = incoming.get(normalizeUrl(target.url)) ?? [];
    const byAnchor = new Map<string, Array<{ sourceUrl: string }>>();
    for (const entry of sources) {
      const key = normalizeText(entry.anchor);
      if (key.length === 0) continue;
      const bucket = byAnchor.get(key) ?? [];
      bucket.push({ sourceUrl: entry.sourceUrl });
      byAnchor.set(key, bucket);
    }
    for (const [anchorKey, entries] of byAnchor) {
      if (entries.length < opts.overusedAnchorThreshold) continue;
      const redundant = entries.slice(1);
      for (const entry of redundant) {
        const sourcePage = crawledByUrl.get(normalizeUrl(entry.sourceUrl));
        if (!sourcePage) continue;
        stats.overusedAnchors += 1;
        suggestions.push(
          suggestion({
            source: sourcePage,
            target,
            anchor: variedAnchor(target, anchorKey),
            context: extractContext(sourcePage.text, [anchorKey]),
            confidence: OVERUSED_ANCHOR_CONFIDENCE,
            reason: `Overused anchor "${anchorKey}" is used by ${entries.length} pages linking to ${target.url}. Vary the anchor on ${sourcePage.url}.`,
            detection: 'OVERUSED_ANCHOR',
            action: 'CHANGE_ANCHOR',
          }),
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Conflicting links (same source links to 2+ targets in one cluster)
  // -------------------------------------------------------------------------
  const byCluster = new Map<string, ApprovedTarget[]>();
  for (const target of input.approvedTargets) {
    if (!target.clusterId) continue;
    const bucket = byCluster.get(target.clusterId) ?? [];
    bucket.push(target);
    byCluster.set(target.clusterId, bucket);
  }

  for (const page of input.crawledPages) {
    const linkedTargetsByCluster = new Map<string, Array<{ target: ApprovedTarget; count: number }>>();
    for (const link of page.outLinks ?? []) {
      if (!isInternalLink(link.url, input.siteDomain)) continue;
      const target = targetByUrl.get(normalizeUrl(link.url));
      if (!target?.clusterId) continue;
      const bucket = linkedTargetsByCluster.get(target.clusterId) ?? [];
      const existing = bucket.find((entry) => entry.target.url === target.url);
      if (existing) {
        existing.count += 1;
      } else {
        bucket.push({ target, count: 1 });
      }
      linkedTargetsByCluster.set(target.clusterId, bucket);
    }

    for (const [, entries] of linkedTargetsByCluster) {
      if (entries.length < 2) continue;
      const primary = pickPrimary(entries.map((entry) => entry.target), incoming);
      for (const entry of entries) {
        if (entry.target.url === primary.url) continue;
        stats.conflictingLinks += 1;
        suggestions.push(
          suggestion({
            source: page,
            target: entry.target,
            anchor: recommendedAnchor(entry.target),
            context: extractContext(page.text, entry.target.keywords),
            confidence: CONFLICT_CONFIDENCE,
            reason: `Conflicting links: ${page.url} links to both ${entry.target.url} and ${primary.url} for the same cluster. Consolidate on ${primary.url}.`,
            detection: 'CONFLICT',
            action: 'REMOVE_LINK',
          }),
        );
      }
    }
  }

  // De-duplicate identical (source, target, detection) suggestions.
  const seen = new Set<string>();
  const unique: SuggestionCandidate[] = [];
  for (const item of suggestions) {
    const key = `${normalizeUrl(item.sourceUrl)}|${normalizeUrl(item.targetUrl)}|${item.detection}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return { suggestions: unique, stats };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function suggestion(input: {
  source: CrawledPageData;
  target: ApprovedTarget;
  anchor: string;
  context: string;
  confidence: number;
  reason: string;
  detection: LinkDetection;
  action?: SuggestionCandidate['action'];
}): SuggestionCandidate {
  return {
    sourceUrl: input.source.url,
    targetUrl: input.target.url,
    anchor: input.anchor,
    context: input.context,
    confidence: input.confidence,
    reason: input.reason,
    detection: input.detection,
    action: input.action ?? 'ADD_LINK',
  };
}

function bestSource(input: LinkGraphInput, target: ApprovedTarget): CrawledPageData | null {
  let best: CrawledPageData | null = null;
  let bestScore = 0;
  for (const page of input.crawledPages) {
    if (normalizeUrl(page.url) === normalizeUrl(target.url)) continue;
    const score = topicalScore(page, target);
    if (score > bestScore) {
      bestScore = score;
      best = page;
    }
  }
  return bestScore > 0 ? best : null;
}

/** Ratio of the target's cluster keywords found in the source text (0-1). */
function topicalScore(source: CrawledPageData, target: ApprovedTarget): number {
  const text = normalizeText(source.text);
  const keywords = (target.keywords.length > 0 ? target.keywords : target.primaryKeyword ? [target.primaryKeyword] : []).filter(
    (keyword) => normalizeText(keyword).length >= 2,
  );
  if (keywords.length === 0) return 0;
  const considered = Math.min(keywords.length, 5);
  let matched = 0;
  for (const keyword of keywords.slice(0, considered)) {
    if (text.includes(normalizeText(keyword))) {
      matched += 1;
    }
  }
  return matched / considered;
}

function recommendedAnchor(target: ApprovedTarget): string {
  if (target.primaryKeyword) return target.primaryKeyword;
  if (target.clusterName) return target.clusterName;
  const segment = target.url.split('/').filter(Boolean).pop() ?? '';
  return segment.replace(/[-_]+/g, ' ') || 'this page';
}

function variedAnchor(target: ApprovedTarget, overused: string): string {
  const base = recommendedAnchor(target);
  const candidates = [base, target.primaryKeyword, target.clusterName].filter((value) => value && normalizeText(value) !== overused);
  return candidates[0] ?? `${base} details`;
}

function pickPrimary(
  targets: ApprovedTarget[],
  incoming: Map<string, Array<{ sourceUrl: string; anchor: string }>>,
): ApprovedTarget {
  let primary = targets[0]!;
  for (const target of targets) {
    const current = incoming.get(normalizeUrl(primary.url))?.length ?? 0;
    const candidate = incoming.get(normalizeUrl(target.url))?.length ?? 0;
    if (candidate > current) {
      primary = target;
    }
  }
  return primary;
}

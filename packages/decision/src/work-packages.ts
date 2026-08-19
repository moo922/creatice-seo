/**
 * Work Packages — groups related recommendations into coherent units of work.
 *
 * Example: "Optimize Main Riyadh Service Page" becomes a Work Package containing:
 *   - Title/meta optimization
 *   - AEO question gaps
 *   - GEO entity gap
 *   - Internal links
 *   - Content expansion
 *
 * Instead of five disconnected tasks, the operator sees one coherent project.
 */

export interface WorkPackageItem {
  itemType: 'RECOMMENDATION' | 'ISSUE' | 'OPPORTUNITY' | 'CONTENT_JOB' | 'TASK';
  itemId: string;
  title: string;
  status: string;
}

export interface WorkPackage {
  id: string;
  siteId: string;
  title: string;
  description: string;
  items: WorkPackageItem[];
  estimatedEffort: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  priorityScore: number;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

/**
 * Group recommendations into work packages based on shared targets.
 * Recommendations targeting the same URL or cluster are grouped together.
 */
export interface GroupableRecommendation {
  id: string;
  siteId: string;
  title: string;
  action: string;
  targetUrl: string | null;
  clusterId: string | null;
  impact: number;
  confidence: number;
  effort: number;
  status: string;
  issueId: string;
}

export interface WorkPackageDraft {
  title: string;
  description: string;
  targetUrl: string | null;
  clusterId: string | null;
  recommendationIds: string[];
  estimatedEffort: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  priorityScore: number;
}

/**
 * Group recommendations by target (URL or cluster).
 * Each group becomes a work package draft.
 */
export function groupRecommendationsIntoPackages(
  recommendations: GroupableRecommendation[],
): WorkPackageDraft[] {
  const groups = new Map<string, GroupableRecommendation[]>();

  for (const rec of recommendations) {
    if (rec.status !== 'SUGGESTED' && rec.status !== 'REVIEWED') continue;
    const key = rec.targetUrl
      ? `url:${normalizeUrl(rec.targetUrl)}`
      : rec.clusterId
        ? `cluster:${rec.clusterId}`
        : `misc:${rec.id}`;
    const existing = groups.get(key) ?? [];
    existing.push(rec);
    groups.set(key, existing);
  }

  const packages: WorkPackageDraft[] = [];
  for (const [key, recs] of groups) {
    if (recs.length < 2) continue; // Single items don't need a package

    const first = recs[0]!;
    const totalImpact = recs.reduce((sum, r) => sum + r.impact, 0) / recs.length;
    const totalEffort = recs.reduce((sum, r) => sum + r.effort, 0);
    const target = first.targetUrl ?? first.clusterId ?? 'Unknown';

    packages.push({
      title: `Optimize ${extractPageName(target)}`,
      description: `${recs.length} related recommendations for ${target}`,
      targetUrl: first.targetUrl,
      clusterId: first.clusterId,
      recommendationIds: recs.map((r) => r.id),
      estimatedEffort: estimatePackageEffort(totalEffort),
      priorityScore: Math.round(totalImpact * 100) / 100,
    });
  }

  return packages.sort((a, b) => b.priorityScore - a.priorityScore);
}

function extractPageName(target: string): string {
  if (target.startsWith('http')) {
    try {
      const url = new URL(target);
      const parts = url.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] ?? url.hostname;
    } catch {
      return target;
    }
  }
  return target;
}

function estimatePackageEffort(totalEffort: number): WorkPackageDraft['estimatedEffort'] {
  if (totalEffort < 60) return 'LOW';
  if (totalEffort < 120) return 'MEDIUM';
  if (totalEffort < 200) return 'HIGH';
  return 'VERY_HIGH';
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/+$/, '');
  }
}

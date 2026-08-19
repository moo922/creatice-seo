/**
 * Dependency Graph — prevents impossible task ordering.
 *
 * Some work must complete before other work can start:
 *   - Fix indexability BEFORE content optimization
 *   - Approve URL Mapping BEFORE content creation
 *   - Complete crawl BEFORE audit
 *
 * Dependencies form a directed acyclic graph (DAG).
 * Circular dependencies are rejected.
 */

export interface Dependency {
  dependentId: string;    // This work item depends on...
  dependencyId: string;   // ...this other work item completing first.
  dependencyType: 'BLOCKS' | 'REQUIRES_DATA' | 'SHOULD_COMPLETE_FIRST';
}

export interface DependencyCheckResult {
  canProceed: boolean;
  blockingDependencies: Dependency[];
  blockedBy: string[];
}

/**
 * Check if a work item can proceed given current completion status.
 */
export function canProceed(
  workItemId: string,
  dependencies: Dependency[],
  completedIds: Set<string>,
): DependencyCheckResult {
  const blocking = dependencies.filter(
    (d) => d.dependentId === workItemId && !completedIds.has(d.dependencyId),
  );

  return {
    canProceed: blocking.length === 0,
    blockingDependencies: blocking,
    blockedBy: blocking.map((d) => d.dependencyId),
  };
}

/**
 * Validate that a set of dependencies has no cycles.
 * Uses topological sort — if sort fails, there's a cycle.
 */
export function hasCycle(dependencies: Dependency[]): boolean {
  const graph = new Map<string, Set<string>>();
  for (const dep of dependencies) {
    const existing = graph.get(dep.dependentId) ?? new Set();
    existing.add(dep.dependencyId);
    graph.set(dep.dependentId, existing);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string): boolean {
    if (inStack.has(node)) return true; // cycle
    if (visited.has(node)) return false;
    visited.add(node);
    inStack.add(node);
    for (const neighbor of graph.get(node) ?? []) {
      if (dfs(neighbor)) return true;
    }
    inStack.delete(node);
    return false;
  }

  for (const node of graph.keys()) {
    if (dfs(node)) return true;
  }
  return false;
}

/**
 * Topological sort of work items by dependencies.
 * Items with no dependencies come first.
 * Returns null if there's a cycle.
 */
export function topologicalSort(
  itemIds: string[],
  dependencies: Dependency[],
): string[] | null {
  if (hasCycle(dependencies)) return null;

  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of itemIds) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }

  for (const dep of dependencies) {
    // dependencyId must complete before dependentId
    adj.get(dep.dependencyId)?.push(dep.dependentId);
    inDegree.set(dep.dependentId, (inDegree.get(dep.dependentId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return sorted.length === itemIds.length ? sorted : null;
}

/**
 * Default dependency rules by action type.
 * These are applied automatically when generating recommendations.
 */
export const DEFAULT_DEPENDENCY_RULES: ReadonlyArray<{
  action: string;
  requires: string;
  type: Dependency['dependencyType'];
}> = [
  { action: 'CONTENT_CREATE', requires: 'TECHNICAL_FIX', type: 'BLOCKS' },
  { action: 'CONTENT_CREATE', requires: 'KEYWORD_MAPPING', type: 'REQUIRES_DATA' },
  { action: 'CONTENT_UPDATE', requires: 'TECHNICAL_FIX', type: 'BLOCKS' },
  { action: 'CONTENT_EXPANSION', requires: 'TECHNICAL_FIX', type: 'BLOCKS' },
  { action: 'INTERNAL_LINK', requires: 'CONTENT_CREATE', type: 'SHOULD_COMPLETE_FIRST' },
  { action: 'AEO_ANSWER_GAP', requires: 'CONTENT_UPDATE', type: 'SHOULD_COMPLETE_FIRST' },
  { action: 'GEO_ENTITY_FIX', requires: 'CONTENT_UPDATE', type: 'SHOULD_COMPLETE_FIRST' },
];

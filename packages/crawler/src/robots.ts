/**
 * Minimal robots.txt parser. Supports User-agent groups, Allow and Disallow
 * rules with longest-prefix matching (Google's directive). Rules are prefix
 * matches against the URL path (the fragment and query are ignored).
 */

export interface RobotsRules {
  /** Rules are ordered; earlier rules win on ties via longest-match semantics. */
  groups: RobotsGroup[];
  /** True when the file could be fetched and parsed. */
  parsed: boolean;
}

export interface RobotsGroup {
  userAgents: string[];
  allow: string[];
  disallow: string[];
}

export function parseRobotsTxt(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const colon = line.indexOf(':');
    if (colon === -1) continue;

    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (current && current.userAgents.length > 0) {
        groups.push(current);
      }
      current = { userAgents: [value], allow: [], disallow: [] };
      continue;
    }

    if (!current) continue;

    if (field === 'allow') {
      current.allow.push(normalizePattern(value));
    } else if (field === 'disallow') {
      current.disallow.push(normalizePattern(value));
    }
  }

  if (current && current.userAgents.length > 0) {
    groups.push(current);
  }

  return { groups, parsed: true };
}

/**
 * Extracts the URLs referenced by `Sitemap:` directives in a robots.txt body.
 * These are non-standard per-user-agent fields, so they are collected across
 * the whole file regardless of group.
 */
export function extractSitemapDirectives(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('Sitemap:')) continue;
    const url = line.slice('Sitemap:'.length).trim();
    if (url) out.push(url.slice(0, 2000));
  }
  return out;
}

/** Selects the applicable rules for a user agent (exact match first, then *). */
export function selectGroup(rules: RobotsRules, userAgent: string): RobotsGroup | null {
  const ua = userAgent.toLowerCase();
  const exact = rules.groups.find((group) => group.userAgents.some((token) => token.toLowerCase() === '*'.repeat(0) || token.toLowerCase() === ua));
  if (exact) return exact;
  const wildcard = rules.groups.find((group) => group.userAgents.includes('*'));
  return wildcard ?? null;
}

export function isPathAllowed(rules: RobotsRules, userAgent: string, urlPath: string): boolean {
  if (rules.groups.length === 0) return true;
  const group = selectGroup(rules, userAgent);
  if (!group) return true;
  if (group.allow.length === 0 && group.disallow.length === 0) return true;

  const path = stripQueryAndFragment(urlPath);

  // Longest matching rule wins.
  let match: { type: 'allow' | 'disallow'; length: number } | null = null;
  for (const pattern of group.allow) {
    if (path.startsWith(pattern) && (!match || pattern.length > match.length)) {
      match = { type: 'allow', length: pattern.length };
    }
  }
  for (const pattern of group.disallow) {
    if (path.startsWith(pattern) && (!match || pattern.length > match.length)) {
      match = { type: 'disallow', length: pattern.length };
    }
  }
  if (!match) return true;
  return match.type === 'allow';
}

function normalizePattern(value: string): string {
  let pattern = value.trim();
  if (pattern.includes('*')) {
    // Wildcards are simplified to their longest static prefix to keep the
    // parser dependency-free; `*` at the end matches everything.
    pattern = pattern.split('*')[0] ?? '';
  }
  if (pattern === '') return '';
  if (pattern === '$') return '';
  return pattern;
}

function stripQueryAndFragment(urlPath: string): string {
  let out = urlPath;
  const hash = out.indexOf('#');
  if (hash !== -1) out = out.slice(0, hash);
  const query = out.indexOf('?');
  if (query !== -1) out = out.slice(0, query);
  return out === '' ? '/' : out;
}

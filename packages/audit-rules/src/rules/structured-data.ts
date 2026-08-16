import type { AuditFinding } from '../contract';
import type { AuditContext } from '../context';
import type { AuditRule } from '../registry';
import { allPages, makeFinding, tokens } from '../helpers';

interface SchemaNode {
  url: string;
  value: unknown;
}

function schemaNodes(page: AuditContext['pages'][number]): SchemaNode[] {
  const nodes: SchemaNode[] = [];
  for (const value of page.schemaJson ?? []) {
    if (Array.isArray(value)) {
      for (const item of value) nodes.push({ url: page.url, value: item });
    } else {
      nodes.push({ url: page.url, value });
    }
  }
  return nodes;
}

function typeOf(node: unknown): unknown {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    return (node as Record<string, unknown>)['@type'];
  }
  return undefined;
}

/** Collects @type / name / headline signals from a JSON-LD node. */
function schemaSignals(node: unknown): { type: string | null; name: string | null } {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return { type: null, name: null };
  }
  const record = node as Record<string, unknown>;
  const rawType = record['@type'];
  const type = typeof rawType === 'string' ? rawType : Array.isArray(rawType) ? rawType[0] : null;
  const name =
    typeof record['name'] === 'string'
      ? record['name']
      : typeof record['headline'] === 'string'
        ? record['headline']
        : null;
  return { type: type ? String(type) : null, name };
}

export const structuredDataRules: AuditRule[] = [
  {
    definition: {
      key: 'SCHEMA_PARSE_ERROR',
      category: 'content',
      severity: 'high',
      description: 'A JSON-LD script on the page could not be parsed',
      version: 1,
      active: true,
    },
    pageScope: allPages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        if (page.schemaErrors.length > 0) {
          findings.push(
            makeFinding('SCHEMA_PARSE_ERROR', 'content', 'high', page.url, {
              errors: page.schemaErrors.slice(0, 10),
              count: page.schemaErrors.length,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'INVALID_JSON_LD',
      category: 'content',
      severity: 'medium',
      description: 'JSON-LD block lacks a valid @type (invalid structured data)',
      version: 1,
      active: true,
    },
    pageScope: allPages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        const nodes = schemaNodes(page);
        for (const node of nodes) {
          if (!node.value || typeof node.value !== 'object' || Array.isArray(node.value)) {
            findings.push(
              makeFinding('INVALID_JSON_LD', 'content', 'medium', page.url, {
                reason: 'JSON-LD node is not an object',
              }),
            );
            continue;
          }
          if (!typeOf(node.value)) {
            findings.push(
              makeFinding('INVALID_JSON_LD', 'content', 'medium', page.url, {
                reason: 'JSON-LD node has no @type',
              }),
            );
          }
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'SCHEMA_EMPTY',
      category: 'content',
      severity: 'low',
      description: 'Page declares JSON-LD blocks but they contain no usable data',
      version: 1,
      active: true,
    },
    pageScope: allPages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        const valid = (page.schemaJson ?? []).length;
        if (page.schemaBlocks > 0 && valid === 0 && page.schemaErrors.length === 0) {
          findings.push(
            makeFinding('SCHEMA_EMPTY', 'content', 'low', page.url, {
              blocks: page.schemaBlocks,
            }),
          );
        }
      }
      return findings;
    },
  },
  {
    definition: {
      key: 'SCHEMA_VISIBLE_CONTENT_MISMATCH_CANDIDATE',
      category: 'content',
      severity: 'low',
      description: 'Structured data names are not reflected in the visible page content (review candidate)',
      version: 1,
      active: true,
    },
    pageScope: allPages,
    evaluate: (ctx: AuditContext): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const page of ctx.pages) {
        const nodes = schemaNodes(page);
        const named = nodes.map((node) => schemaSignals(node.value)).filter((signal) => signal.name);
        if (named.length === 0) continue;
        const visibleTokens = tokens(
          [page.title, page.metaDescription, page.h1, ...page.headings.map((heading) => heading.text)]
            .filter((value): value is string => Boolean(value))
            .join(' '),
        );
        for (const signal of named) {
          const nameTokens = tokens(signal.name);
          const overlap = [...nameTokens].filter((token) => visibleTokens.has(token)).length;
          if (nameTokens.size > 0 && overlap === 0) {
            findings.push(
              makeFinding('SCHEMA_VISIBLE_CONTENT_MISMATCH_CANDIDATE', 'content', 'low', page.url, {
                type: signal.type,
                name: signal.name,
                recommendation: true,
                note: 'Review before actioning — this cannot be determined with certainty.',
              }),
            );
          }
        }
      }
      return findings;
    },
  },
];

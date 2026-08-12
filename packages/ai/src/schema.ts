/**
 * JSON Schema handling for structured output. Providers differ in how they
 * enforce schemas; this module maps our schema to each provider's wire format
 * without leaking provider SDKs into callers.
 */

/** Deep-copies the schema and forces strict mode (additionalProperties: false). */
export function toStrictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const strict = structuredClone(schema) as Record<string, unknown>;
  enforceStrict(strict);
  return strict;
}

function enforceStrict(node: unknown): void {
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (record.type === 'object' && record.additionalProperties === undefined) {
    record.additionalProperties = false;
  }
  if (record.properties && typeof record.properties === 'object') {
    for (const value of Object.values(record.properties)) {
      enforceStrict(value);
    }
  }
  for (const key of ['items', 'prefixItems', 'additionalProperties', 'not'] as const) {
    if (record[key] && typeof record[key] === 'object') {
      enforceStrict(record[key]);
    }
  }
}

export interface OpenAiStructuredConfig {
  type: 'json_schema' | 'json_object';
  jsonSchema?: { name: string; strict: boolean; schema: Record<string, unknown> };
}

/** OpenAI-compatible response_format for a schema (or plain JSON mode). */
export function openAiResponseFormat(schema: Record<string, unknown> | null): OpenAiStructuredConfig | null {
  if (schema) {
    return {
      type: 'json_schema',
      jsonSchema: { name: 'structured_output', strict: true, schema: toStrictSchema(schema) },
    };
  }
  return null;
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Anthropic forced-tool descriptor used for structured output. */
export function anthropicTool(schema: Record<string, unknown>): AnthropicTool {
  return {
    name: 'structured_output',
    description: 'Return the requested data exactly matching the JSON schema.',
    input_schema: toStrictSchema(schema),
  };
}

/** Appends a "return JSON matching this schema" instruction for JSON-mode providers. */
export function jsonModeInstruction(schema: Record<string, unknown>): string {
  return `\n\nReturn only valid JSON that conforms to exactly this schema:\n${JSON.stringify(schema)}`;
}

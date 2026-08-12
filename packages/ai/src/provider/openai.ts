import type { AiProviderKind } from '@creative-seo/types';
import type {
  AIProvider,
  GenerateStructuredRequest,
  GenerateStructuredResult,
  GenerateTextRequest,
  GenerateTextResult,
  HealthStatus,
  ProviderOptions,
  UsageEstimate,
} from '../contracts';
import { StructuredOutputError } from '../errors';
import type { OpenAiStructuredConfig } from '../schema';
import { openAiResponseFormat } from '../schema';
import { requestJson } from './http';

/**
 * OpenAI provider via raw fetch (no SDK). Supports text generation, structured
 * output (json_schema / json_object) and a cheap health probe.
 */
export class OpenAiProvider implements AIProvider {
  readonly kind: AiProviderKind = 'OPENAI';

  constructor(private readonly options: ProviderOptions) {}

  async generateText(request: GenerateTextRequest): Promise<GenerateTextResult> {
    const started = Date.now();
    const response = await requestJson(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      provider: this.kind,
      headers: { authorization: `Bearer ${this.options.apiKey}` },
      body: {
        model: request.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
      },
      timeoutMs: this.options.timeoutMs,
      maxRetries: this.options.maxRetries,
      retryBackoffMs: this.options.retryBackoffMs,
      fetchImpl: this.options.fetchImpl,
      redactSecrets: [this.options.apiKey],
    });
    const content = extractContent(response.body);
    return {
      text: content,
      usage: extractUsage(response.body),
      latencyMs: Date.now() - started,
    };
  }

  async generateStructured<T>(request: GenerateStructuredRequest): Promise<GenerateStructuredResult<T>> {
    const started = Date.now();
    const response = await requestJson(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      provider: this.kind,
      headers: { authorization: `Bearer ${this.options.apiKey}` },
      body: {
        model: request.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        response_format: toWireResponseFormat(openAiResponseFormat(request.schema)),
      },
      timeoutMs: this.options.timeoutMs,
      maxRetries: this.options.maxRetries,
      retryBackoffMs: this.options.retryBackoffMs,
      fetchImpl: this.options.fetchImpl,
      redactSecrets: [this.options.apiKey],
    });
    const content = extractContent(response.body);
    const data = parseJsonObject(content, this.kind);
    return {
      data: data as T,
      usage: extractUsage(response.body),
      latencyMs: Date.now() - started,
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    const started = Date.now();
    try {
      const response = await requestJson(`${this.options.baseUrl}/models`, {
        provider: this.kind,
        headers: { authorization: `Bearer ${this.options.apiKey}` },
        timeoutMs: Math.min(this.options.timeoutMs, 10_000),
        maxRetries: 1,
        retryBackoffMs: this.options.retryBackoffMs,
        fetchImpl: this.options.fetchImpl,
      });
      return {
        ok: response.ok,
        latencyMs: Date.now() - started,
        message: response.ok ? undefined : `models endpoint returned HTTP ${response.status}`,
      };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - started, message: errorMessage(error) };
    }
  }
}

/**
 * Maps our internal structured config to the OpenAI wire format. The internal
 * descriptor uses camelCase `jsonSchema`; the wire uses snake_case `json_schema`.
 */
export function toWireResponseFormat(config: OpenAiStructuredConfig | null): Record<string, unknown> {
  if (config?.type === 'json_schema' && config.jsonSchema) {
    return { type: 'json_schema', json_schema: config.jsonSchema };
  }
  return { type: 'json_object' };
}

export function extractContent(body: unknown): string {
  if (body && typeof body === 'object') {
    const record = body as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = record.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      return content;
    }
  }
  throw new StructuredOutputError('OPENAI', 'response contained no message content');
}

export function extractUsage(body: unknown): UsageEstimate {
  if (body && typeof body === 'object') {
    const usage = (body as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
    if (usage) {
      return {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
      };
    }
  }
  return { inputTokens: 0, outputTokens: 0 };
}

function parseJsonObject<T>(content: string, provider: AiProviderKind): T {
  const trimmed = content.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new StructuredOutputError(provider, 'structured output was not valid JSON');
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    throw new StructuredOutputError(provider, 'structured output was not valid JSON');
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'health probe failed';
}

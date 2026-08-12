import type { AiProviderKind } from '@creative-seo/types';
import type {
  AIProvider,
  GenerateStructuredRequest,
  GenerateStructuredResult,
  GenerateTextRequest,
  GenerateTextResult,
  HealthStatus,
  ProviderOptions,
  ResearchProvider,
  ResearchResult,
  ResearchSource,
} from '../contracts';
import { StructuredOutputError } from '../errors';
import { jsonModeInstruction } from '../schema';
import { extractContent, extractUsage } from './openai';
import { requestJson } from './http';

const MAX_SOURCES = 10;

/**
 * Perplexity provider via raw fetch (OpenAI-compatible chat completions).
 * Also implements ResearchProvider: Perplexity returns real citations, which we
 * surface as sources instead of fabricating URLs.
 */
export class PerplexityProvider implements AIProvider, ResearchProvider {
  readonly kind: AiProviderKind = 'PERPLEXITY';

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
      redactSecrets: [this.options.apiKey],
      fetchImpl: this.options.fetchImpl,
    });
    return {
      text: extractContent(response.body),
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
          { role: 'user', content: request.userPrompt + jsonModeInstruction(request.schema) },
        ],
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        response_format: { type: 'json_object' },
      },
      timeoutMs: this.options.timeoutMs,
      maxRetries: this.options.maxRetries,
      retryBackoffMs: this.options.retryBackoffMs,
      redactSecrets: [this.options.apiKey],
      fetchImpl: this.options.fetchImpl,
    });
    const content = extractContent(response.body);
    const data = parseJsonObject(content, this.kind);
    return {
      data: data as T,
      usage: extractUsage(response.body),
      latencyMs: Date.now() - started,
    };
  }

  async research(query: string, options?: { maxSources?: number }): Promise<ResearchResult | null> {
    const started = Date.now();
    const response = await requestJson(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      provider: this.kind,
      headers: { authorization: `Bearer ${this.options.apiKey}` },
      body: {
        model: this.options.defaultModel,
        messages: [
          { role: 'system', content: 'Research the user query using current web sources. Provide a concise factual summary.' },
          { role: 'user', content: query },
        ],
        return_citations: true,
        max_tokens: 1200,
      },
      timeoutMs: this.options.timeoutMs,
      maxRetries: this.options.maxRetries,
      retryBackoffMs: this.options.retryBackoffMs,
      redactSecrets: [this.options.apiKey],
      fetchImpl: this.options.fetchImpl,
    });

    const citations = extractCitations(response.body);
    const summary = extractContent(response.body);
    const sources = citations.slice(0, options?.maxSources ?? MAX_SOURCES).map<ResearchSource>((url) => ({
      title: url,
      url,
      snippet: null,
    }));
    void started;
    return { sources, summary };
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
      redactSecrets: [this.options.apiKey],
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

export function extractCitations(body: unknown): string[] {
  if (body && typeof body === 'object') {
    const citations = (body as { citations?: unknown }).citations;
    if (Array.isArray(citations)) {
      return citations.filter((c): c is string => typeof c === 'string').slice(0, MAX_SOURCES);
    }
  }
  return [];
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

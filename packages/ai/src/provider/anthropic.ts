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
import { anthropicTool } from '../schema';
import { requestJson } from './http';

const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Anthropic provider via raw fetch (no SDK). Structured output is enforced with
 * a single forced tool whose input_schema is the target JSON schema.
 */
export class AnthropicProvider implements AIProvider {
  readonly kind: AiProviderKind = 'ANTHROPIC';

  constructor(private readonly options: ProviderOptions) {}

  async generateText(request: GenerateTextRequest): Promise<GenerateTextResult> {
    const started = Date.now();
    const response = await requestJson(`${this.options.baseUrl}/messages`, {
      method: 'POST',
      provider: this.kind,
      headers: {
        'x-api-key': this.options.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: {
        model: request.model,
        max_tokens: request.maxOutputTokens ?? 4096,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userPrompt }],
        temperature: request.temperature,
      },
      timeoutMs: this.options.timeoutMs,
      maxRetries: this.options.maxRetries,
      retryBackoffMs: this.options.retryBackoffMs,
      redactSecrets: [this.options.apiKey],
      fetchImpl: this.options.fetchImpl,
    });
    return {
      text: extractText(response.body),
      usage: extractUsage(response.body),
      latencyMs: Date.now() - started,
    };
  }

  async generateStructured<T>(request: GenerateStructuredRequest): Promise<GenerateStructuredResult<T>> {
    const started = Date.now();
    const tool = anthropicTool(request.schema);
    const response = await requestJson(`${this.options.baseUrl}/messages`, {
      method: 'POST',
      provider: this.kind,
      headers: {
        'x-api-key': this.options.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: {
        model: request.model,
        max_tokens: request.maxOutputTokens ?? 4096,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userPrompt }],
        temperature: request.temperature,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'structured_output' },
      },
      timeoutMs: this.options.timeoutMs,
      maxRetries: this.options.maxRetries,
      retryBackoffMs: this.options.retryBackoffMs,
      redactSecrets: [this.options.apiKey],
      fetchImpl: this.options.fetchImpl,
    });
    const data = extractToolInput(response.body, this.kind);
    return {
      data: data as T,
      usage: extractUsage(response.body),
      latencyMs: Date.now() - started,
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    const started = Date.now();
    try {
      await requestJson(`${this.options.baseUrl}/models`, {
        provider: this.kind,
        headers: {
          'x-api-key': this.options.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        timeoutMs: Math.min(this.options.timeoutMs, 10_000),
        maxRetries: 1,
        retryBackoffMs: this.options.retryBackoffMs,
        redactSecrets: [this.options.apiKey],
        fetchImpl: this.options.fetchImpl,
      });
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      // Anthropic has no public GET /models endpoint; any HTTP response proves
      // reachability, so only network-level failures count as unhealthy here.
      if (error instanceof StructuredOutputError) {
        throw error;
      }
      const httpStatus = error instanceof Error && 'status' in error ? Number((error as { status: unknown }).status) : null;
      if (httpStatus && httpStatus > 0) {
        return { ok: true, latencyMs: Date.now() - started };
      }
      return { ok: false, latencyMs: Date.now() - started, message: errorMessage(error) };
    }
  }
}

export function extractText(body: unknown): string {
  if (body && typeof body === 'object') {
    const record = body as { content?: Array<{ type?: string; text?: string }> };
    const textBlock = record.content?.find((block) => block.type === 'text');
    if (textBlock && typeof textBlock.text === 'string') {
      return textBlock.text;
    }
  }
  throw new StructuredOutputError('ANTHROPIC', 'response contained no text block');
}

export function extractToolInput(body: unknown, provider: AiProviderKind): Record<string, unknown> {
  if (body && typeof body === 'object') {
    const record = body as { content?: Array<{ type?: string; name?: string; input?: unknown }> };
    const toolBlock = record.content?.find((block) => block.type === 'tool_use' && block.name === 'structured_output');
    if (toolBlock && toolBlock.input && typeof toolBlock.input === 'object') {
      return toolBlock.input as Record<string, unknown>;
    }
  }
  throw new StructuredOutputError(provider, 'response contained no structured output block');
}

export function extractUsage(body: unknown): UsageEstimate {
  if (body && typeof body === 'object') {
    const usage = (body as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    if (usage) {
      return {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
      };
    }
  }
  return { inputTokens: 0, outputTokens: 0 };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'health probe failed';
}

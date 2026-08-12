import type { AiProviderKind } from '@creative-seo/types';
import { ProviderHttpError, ProviderTimeoutError } from '../errors';

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
  fetchImpl?: typeof fetch;
  provider: AiProviderKind;
  /** Secret values (e.g. API keys) to scrub from any error message before it surfaces. */
  redactSecrets?: string[];
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  body: unknown;
}

const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/**
 * Executes a JSON API call with per-attempt timeout and bounded retries.
 * Retries on network failures, aborts, and retryable HTTP statuses with
 * exponential backoff. Error messages are sanitized (never include API keys).
 */
export async function requestJson(url: string, options: HttpRequestOptions): Promise<HttpResponse> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: options.method ?? 'GET',
        headers: { accept: 'application/json', ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}), ...options.headers },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let body: unknown = null;
      if (text.length > 0) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text.slice(0, 500);
        }
      }

      if (response.ok) {
        return { status: response.status, ok: true, body };
      }

      const message = sanitizeProviderMessage(body, response.status, options.redactSecrets);
      lastError = new ProviderHttpError(options.provider, response.status, message);
      if (!isRetryableStatus(response.status) || attempt === options.maxRetries) {
        throw lastError;
      }
    } catch (error) {
      if (error instanceof ProviderHttpError) {
        lastError = error;
        if (!isRetryableStatus(error.status ?? 0) || attempt === options.maxRetries) {
          throw error;
        }
      } else if (isAbortError(error)) {
        lastError = new ProviderTimeoutError(options.provider, options.timeoutMs);
        if (attempt === options.maxRetries) {
          throw lastError;
        }
      } else {
        lastError = new ProviderHttpError(options.provider, 0, 'network request failed');
        if (attempt === options.maxRetries) {
          throw lastError;
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    await sleep(backoffMs(options.retryBackoffMs, attempt));
    void startedAt;
  }

  throw lastError;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function backoffMs(base: number, attempt: number): number {
  return Math.min(base * 2 ** attempt, 30_000) + Math.floor(Math.random() * base);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds a short, sanitized message from an upstream error body. Secrets are
 * redacted, then the text is truncated and stripped of control characters so
 * no sensitive payload ever reaches logs.
 */
function sanitizeProviderMessage(body: unknown, status: number, redactSecrets?: string[]): string {
  let raw = extractErrorText(body);
  for (const secret of redactSecrets ?? []) {
    if (secret) {
      raw = raw.split(secret).join('[redacted]');
    }
  }
  const cleaned = stripControlChars(raw).replace(/\s+/g, ' ').trim().slice(0, 300);
  return cleaned.length > 0 ? cleaned : `provider returned HTTP ${status}`;
}

function stripControlChars(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    out += code < 32 || code === 127 ? ' ' : char;
  }
  return out;
}

function extractErrorText(body: unknown): string {
  if (body === null || body === undefined) return '';
  if (typeof body === 'string') return body;
  if (typeof body !== 'object') return String(body);
  const record = body as Record<string, unknown>;
  if (typeof record.error === 'string') return record.error;
  if (record.error && typeof record.error === 'object') {
    const error = record.error as Record<string, unknown>;
    if (typeof error.message === 'string') return error.message;
  }
  if (typeof record.message === 'string') return record.message;
  return '';
}

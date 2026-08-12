import type { AiProviderKind } from '@creative-seo/types';

/**
 * AI error hierarchy. Error messages are always sanitized: they never contain
 * API keys, Authorization headers, or raw provider request payloads.
 */
export type AiErrorKind = 'config' | 'timeout' | 'http' | 'parse' | 'unavailable' | 'no-provider';

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly provider: AiProviderKind | null;
  readonly status: number | null;

  constructor(message: string, kind: AiErrorKind, provider: AiProviderKind | null = null, status: number | null = null) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
    this.provider = provider;
    this.status = status;
  }
}

export class ProviderConfigError extends AiError {
  constructor(provider: AiProviderKind, message = 'provider is not configured (missing API key)') {
    super(message, 'config', provider);
    this.name = 'ProviderConfigError';
  }
}

export class ProviderTimeoutError extends AiError {
  constructor(provider: AiProviderKind, timeMs: number) {
    super(`request timed out after ${timeMs}ms`, 'timeout', provider);
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderHttpError extends AiError {
  constructor(provider: AiProviderKind, status: number, message: string) {
    super(message, 'http', provider, status);
    this.name = 'ProviderHttpError';
  }
}

export class StructuredOutputError extends AiError {
  constructor(provider: AiProviderKind, message: string) {
    super(message, 'parse', provider);
    this.name = 'StructuredOutputError';
  }
}

export class NoProviderAvailableError extends AiError {
  constructor(message = 'no configured AI provider could serve the request') {
    super(message, 'no-provider', null);
    this.name = 'NoProviderAvailableError';
  }
}

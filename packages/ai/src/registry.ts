import type { AiProviderKind } from '@creative-seo/types';
import { AI_PROVIDER_KINDS } from '@creative-seo/types';
import type { AIProvider, HealthStatus, ProviderOptions } from './contracts';
import { createProvider } from './provider/factory';

export interface ProviderHealthReport {
  provider: AiProviderKind;
  ok: boolean;
  configured: boolean;
  latencyMs: number | null;
  message: string | null;
}

export interface RegistryProviderOptions {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  timeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
  fetchImpl?: typeof fetch;
}

/**
 * Holds the provider instances built from global options. Router builds fresh
 * per-call instances for site key overrides; this registry is for default-key
 * operations such as health checks.
 */
export class AiProviderRegistry {
  private readonly instances = new Map<AiProviderKind, AIProvider>();
  private readonly configured = new Map<AiProviderKind, boolean>();

  static fromOptions(options: Record<AiProviderKind, RegistryProviderOptions>): AiProviderRegistry {
    const registry = new AiProviderRegistry();
    for (const kind of AI_PROVIDER_KINDS) {
      const opts = options[kind];
      if (!opts) continue;
      const { provider } = createProvider(kind, providerOptionsOf(kind, opts));
      registry.register(kind, provider, opts.apiKey.length > 0);
    }
    return registry;
  }

  register(kind: AiProviderKind, provider: AIProvider, configured = true): void {
    this.instances.set(kind, provider);
    this.configured.set(kind, configured);
  }

  isConfigured(kind: AiProviderKind): boolean {
    return this.configured.get(kind) ?? false;
  }

  has(kind: AiProviderKind): boolean {
    return this.instances.has(kind);
  }

  get(kind: AiProviderKind): AIProvider {
    const provider = this.instances.get(kind);
    if (!provider) {
      throw new Error(`AI provider ${kind} is not registered`);
    }
    return provider;
  }

  async health(): Promise<ProviderHealthReport[]> {
    const reports: ProviderHealthReport[] = [];
    for (const kind of AI_PROVIDER_KINDS) {
      const instance = this.instances.get(kind);
      if (!instance) continue;
      const configured = this.isConfigured(kind);
      if (!configured) {
        reports.push({ provider: kind, ok: false, configured: false, latencyMs: null, message: 'not configured (missing API key)' });
        continue;
      }
      const status: HealthStatus = await instance.healthCheck();
      reports.push({
        provider: kind,
        ok: status.ok,
        configured: true,
        latencyMs: status.latencyMs,
        message: status.message ?? null,
      });
    }
    return reports;
  }
}

function providerOptionsOf(kind: AiProviderKind, options: RegistryProviderOptions): ProviderOptions {
  return {
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    defaultModel: options.defaultModel,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
    retryBackoffMs: options.retryBackoffMs,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  };
}

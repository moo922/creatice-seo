import type { AiProviderKind } from '@creative-seo/types';
import { AI_PROVIDER_KINDS } from '@creative-seo/types';
import type { AppEnv } from '@creative-seo/config';
import type { AiGlobalConfig, WorkflowConfig } from './contracts';

const KIND_SET = new Set<string>(AI_PROVIDER_KINDS);

function parseProviderList(value: string): AiProviderKind[] {
  return value
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter((part): part is AiProviderKind => KIND_SET.has(part));
}

/** Parses "workflow=PROVIDER,workflow2=PROVIDER2" into the routing map. */
export function parseWorkflowProviders(value: string): Record<string, WorkflowConfig> {
  const result: Record<string, WorkflowConfig> = {};
  for (const entry of value.split(',')) {
    const [workflow, provider] = entry.split('=').map((part) => part.trim());
    if (!workflow || !provider) continue;
    const normalized = provider.toUpperCase();
    if (!KIND_SET.has(normalized)) continue;
    result[workflow.toLowerCase()] = { provider: normalized as AiProviderKind };
  }
  return result;
}

/** Builds the global AI routing config from validated environment. */
export function globalConfigFromEnv(env: AppEnv, fetchImpl?: typeof fetch): AiGlobalConfig {
  const providers = {
    OPENAI: {
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      defaultModel: env.OPENAI_DEFAULT_MODEL,
    },
    ANTHROPIC: {
      apiKey: env.ANTHROPIC_API_KEY,
      baseUrl: env.ANTHROPIC_BASE_URL,
      defaultModel: env.ANTHROPIC_DEFAULT_MODEL,
    },
    PERPLEXITY: {
      apiKey: env.PERPLEXITY_API_KEY,
      baseUrl: env.PERPLEXITY_BASE_URL,
      defaultModel: env.PERPLEXITY_DEFAULT_MODEL,
    },
  } satisfies Record<AiProviderKind, { apiKey: string; baseUrl: string; defaultModel: string }>;

  return {
    defaultProvider: env.AI_DEFAULT_PROVIDER,
    defaultModel: env.AI_DEFAULT_MODEL,
    fallback: parseProviderList(env.AI_FALLBACK_PROVIDERS),
    workflowConfigs: parseWorkflowProviders(env.AI_WORKFLOW_PROVIDERS),
    providers,
    timeoutMs: env.AI_TIMEOUT_MS,
    maxRetries: env.AI_MAX_RETRIES,
    retryBackoffMs: env.AI_RETRY_BACKOFF_MS,
    ...(fetchImpl ? { fetchImpl } : {}),
  };
}

import type { AiProviderKind } from '@creative-seo/types';
import type { ProviderCapabilities, ProviderOptions, ProviderWithResearch } from '../contracts';
import { AnthropicProvider } from './anthropic';
import { OpenAiProvider } from './openai';
import { PerplexityProvider } from './perplexity';

const OPENAI_CAPABILITIES: ProviderCapabilities = {
  provider: 'OPENAI',
  capabilities: ['TEXT_GENERATION', 'STRUCTURED_OUTPUT', 'REQUEST_SEED', 'TEMPERATURE_CONTROL'],
  defaultModel: 'gpt-4o',
  maxOutputTokens: null,
  supportsTemperature: true,
  supportsSeed: true,
  supportsLocationContext: false,
  supportsSearch: false,
  supportsCitations: false,
  supportsSourceProvenance: false,
  rateLimitRpm: null,
};

const ANTHROPIC_CAPABILITIES: ProviderCapabilities = {
  provider: 'ANTHROPIC',
  capabilities: ['TEXT_GENERATION', 'STRUCTURED_OUTPUT', 'TEMPERATURE_CONTROL'],
  defaultModel: 'claude-sonnet-4-20250514',
  maxOutputTokens: null,
  supportsTemperature: true,
  supportsSeed: false,
  supportsLocationContext: false,
  supportsSearch: false,
  supportsCitations: false,
  supportsSourceProvenance: false,
  rateLimitRpm: null,
};

const PERPLEXITY_CAPABILITIES: ProviderCapabilities = {
  provider: 'PERPLEXITY',
  capabilities: ['TEXT_GENERATION', 'STRUCTURED_OUTPUT', 'WEB_SEARCH', 'SOURCE_PROVENANCE', 'CITATIONS', 'SEARCH_RESULT_METADATA'],
  defaultModel: 'sonar',
  maxOutputTokens: null,
  supportsTemperature: true,
  supportsSeed: false,
  supportsLocationContext: false,
  supportsSearch: true,
  supportsCitations: true,
  supportsSourceProvenance: true,
  rateLimitRpm: null,
};

const CAPABILITY_MAP: Record<AiProviderKind, ProviderCapabilities> = {
  OPENAI: OPENAI_CAPABILITIES,
  ANTHROPIC: ANTHROPIC_CAPABILITIES,
  PERPLEXITY: PERPLEXITY_CAPABILITIES,
};

/**
 * Builds provider instances. SDKs are confined to the provider package — callers
 * only ever see AIProvider/ResearchProvider.
 */
export function createProvider(kind: AiProviderKind, options: ProviderOptions): ProviderWithResearch {
  const capabilities = CAPABILITY_MAP[kind];
  switch (kind) {
    case 'OPENAI':
      return { provider: new OpenAiProvider(options), research: null, capabilities };
    case 'ANTHROPIC':
      return { provider: new AnthropicProvider(options), research: null, capabilities };
    case 'PERPLEXITY': {
      const perplexity = new PerplexityProvider(options);
      return { provider: perplexity, research: perplexity, capabilities };
    }
    default:
      throw new Error(`Unsupported AI provider kind: ${kind}`);
  }
}

export function getProviderCapabilities(kind: AiProviderKind): ProviderCapabilities {
  return CAPABILITY_MAP[kind];
}

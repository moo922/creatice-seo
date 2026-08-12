import type { AiProviderKind } from '@creative-seo/types';
import type { ProviderOptions, ProviderWithResearch } from '../contracts';
import { AnthropicProvider } from './anthropic';
import { OpenAiProvider } from './openai';
import { PerplexityProvider } from './perplexity';

/**
 * Builds provider instances. SDKs are confined to the provider package — callers
 * only ever see AIProvider/ResearchProvider.
 */
export function createProvider(kind: AiProviderKind, options: ProviderOptions): ProviderWithResearch {
  switch (kind) {
    case 'OPENAI':
      return { provider: new OpenAiProvider(options), research: null };
    case 'ANTHROPIC':
      return { provider: new AnthropicProvider(options), research: null };
    case 'PERPLEXITY': {
      const perplexity = new PerplexityProvider(options);
      return { provider: perplexity, research: perplexity };
    }
    default:
      throw new Error(`Unsupported AI provider kind: ${kind}`);
  }
}

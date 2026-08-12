import type { AiProviderKind } from '@creative-seo/types';

/**
 * Per-1M-token USD pricing for known models. Unknown models return null so the
 * platform reports usage without fabricating a cost. Keep in sync with vendor
 * pricing; the table is intentionally small and versioned with releases.
 */
interface ModelPrice {
  input: number;
  output: number;
}

const OPENAI_PRICES: Record<string, ModelPrice> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'o3-mini': { input: 1.1, output: 4.4 },
};

const ANTHROPIC_PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-7-sonnet-20250219': { input: 3, output: 15 },
};

const PERPLEXITY_PRICES: Record<string, ModelPrice> = {
  'sonar-pro': { input: 3, output: 15 },
  'sonar': { input: 1, output: 1 },
  'sonar-reasoning': { input: 3, output: 15 },
  'sonar-reasoning-pro': { input: 3, output: 15 },
};

const PRICE_TABLES: Record<AiProviderKind, Record<string, ModelPrice>> = {
  OPENAI: OPENAI_PRICES,
  ANTHROPIC: ANTHROPIC_PRICES,
  PERPLEXITY: PERPLEXITY_PRICES,
};

/** Looks up a price, tolerating vendor date-suffixed model ids. */
export function modelPrice(provider: AiProviderKind, model: string): ModelPrice | null {
  const table = PRICE_TABLES[provider];
  if (table[model]) return table[model];
  for (const [key, price] of Object.entries(table)) {
    if (model.startsWith(`${key}-`) || model.startsWith(`${key}:`)) {
      return price;
    }
  }
  return null;
}

/** Estimated cost in USD; null when the model has no known price. */
export function estimateCostUsd(
  provider: AiProviderKind,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const price = modelPrice(provider, model);
  if (!price) return null;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

export function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

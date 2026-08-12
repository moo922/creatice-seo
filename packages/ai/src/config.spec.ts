import { loadAppEnv } from '@creative-seo/config';
import { globalConfigFromEnv, parseWorkflowProviders } from './config';

const ENV = {
  NODE_ENV: 'test',
  AI_DEFAULT_PROVIDER: 'OPENAI',
  AI_DEFAULT_MODEL: 'gpt-4o-mini',
  AI_FALLBACK_PROVIDERS: 'ANTHROPIC,PERPLEXITY',
  AI_WORKFLOW_PROVIDERS: 'research=PERPLEXITY,clustering=OPENAI,brief=ANTHROPIC,writer=ANTHROPIC,arabic-qa=OPENAI',
  AI_TIMEOUT_MS: '60000',
  AI_MAX_RETRIES: '2',
  AI_RETRY_BACKOFF_MS: '1000',
  OPENAI_API_KEY: 'sk-openai',
  OPENAI_BASE_URL: 'https://api.openai.com/v1',
  OPENAI_DEFAULT_MODEL: 'gpt-4o-mini',
  ANTHROPIC_API_KEY: 'sk-ant',
  ANTHROPIC_BASE_URL: 'https://api.anthropic.com/v1',
  ANTHROPIC_DEFAULT_MODEL: 'claude-sonnet-4-5',
  PERPLEXITY_API_KEY: 'pplx',
  PERPLEXITY_BASE_URL: 'https://api.perplexity.ai',
  PERPLEXITY_DEFAULT_MODEL: 'sonar-pro',
} as const;

describe('parseWorkflowProviders', () => {
  it('parses the workflow -> provider mapping', () => {
    const parsed = parseWorkflowProviders('research=PERPLEXITY,clustering=OPENAI,brief=ANTHROPIC');
    expect(parsed.research?.provider).toBe('PERPLEXITY');
    expect(parsed.clustering?.provider).toBe('OPENAI');
    expect(parsed.brief?.provider).toBe('ANTHROPIC');
  });

  it('ignores unknown providers and malformed entries', () => {
    const parsed = parseWorkflowProviders('foo=COHERE,bar=,=OPENAI,ok=anthropic');
    expect(parsed.foo).toBeUndefined();
    expect(parsed.bar).toBeUndefined();
    expect(parsed.ok?.provider).toBe('ANTHROPIC');
  });
});

describe('globalConfigFromEnv', () => {
  it('builds the global routing config from environment', () => {
    const env = loadAppEnv({ source: ENV as unknown as NodeJS.ProcessEnv });
    const config = globalConfigFromEnv(env);
    expect(config.defaultProvider).toBe('OPENAI');
    expect(config.fallback).toEqual(['ANTHROPIC', 'PERPLEXITY']);
    expect(config.workflowConfigs.writer?.provider).toBe('ANTHROPIC');
    expect(config.providers.ANTHROPIC.apiKey).toBe('sk-ant');
    expect(config.providers.PERPLEXITY.defaultModel).toBe('sonar-pro');
    expect(config.timeoutMs).toBe(60000);
    expect(config.maxRetries).toBe(2);
  });
});

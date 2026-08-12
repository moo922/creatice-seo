import type { AiGlobalConfig, AiJobRecorder, NewAiJob, AiJobUpdate } from './contracts';
import { AiRouter } from './router';

const GLOBAL: AiGlobalConfig = {
  defaultProvider: 'OPENAI',
  defaultModel: 'gpt-4o-mini',
  fallback: ['ANTHROPIC', 'PERPLEXITY'],
  workflowConfigs: {
    research: { provider: 'PERPLEXITY' },
    brief: { provider: 'ANTHROPIC', model: 'claude-sonnet-4-5' },
  },
  providers: {
    OPENAI: { apiKey: 'sk-openai', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
    ANTHROPIC: { apiKey: 'sk-ant', baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-haiku-4-5' },
    PERPLEXITY: { apiKey: 'pplx', baseUrl: 'https://api.perplexity.ai', defaultModel: 'sonar' },
  },
  timeoutMs: 5_000,
  maxRetries: 0,
  retryBackoffMs: 10,
};

function response(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, headers: {}, text: async () => JSON.stringify(body) } as unknown as Response;
}

function router(fetchImpl: typeof fetch, overrides: Partial<AiGlobalConfig> = {}, recorder?: AiJobRecorder): AiRouter {
  return new AiRouter({ ...GLOBAL, ...overrides, fetchImpl }, recorder ?? null);
}

function openAiResponse() {
  return response(200, {
    choices: [{ message: { content: 'hello from openai' } }],
    usage: { prompt_tokens: 1000, completion_tokens: 500 },
  });
}

function anthropicTextResponse() {
  return response(200, {
    content: [{ type: 'text', text: 'hello from anthropic' }],
    usage: { input_tokens: 100, output_tokens: 50 },
  });
}

function perplexityResearchResponse() {
  return response(200, {
    choices: [{ message: { content: 'summary from perplexity' } }],
    citations: ['https://example.com/a', 'https://example.com/b'],
  });
}

class FakeRecorder implements AiJobRecorder {
  created: NewAiJob[] = [];
  updates: Array<{ id: string; update: AiJobUpdate }> = [];

  async createJob(job: NewAiJob): Promise<string> {
    this.created.push(job);
    return `job-${this.created.length}`;
  }

  async updateJob(jobId: string, update: AiJobUpdate): Promise<void> {
    this.updates.push({ id: jobId, update });
  }
}

describe('AiRouter resolution hierarchy', () => {
  it('uses the global workflow mapping', () => {
    const route = router(async () => response(500, {})).resolve({ siteConfig: null, workflow: 'brief' });
    expect(route.primary.provider).toBe('ANTHROPIC');
    expect(route.primary.model).toBe('claude-sonnet-4-5');
    expect(route.source).toBe('global');
  });

  it('lets a site override win over the global workflow mapping', () => {
    const route = router(async () => response(500, {})).resolve({
      siteConfig: {
        enabled: true,
        workflowOverrides: { brief: { provider: 'OPENAI', model: 'gpt-4o' } },
        apiKeyOverrides: {},
      },
      workflow: 'brief',
    });
    expect(route.primary.provider).toBe('OPENAI');
    expect(route.primary.model).toBe('gpt-4o');
    expect(route.source).toBe('site');
  });

  it('lets a per-call override win over the site override', () => {
    const route = router(async () => response(500, {})).resolve({
      siteConfig: { enabled: true, workflowOverrides: { brief: { provider: 'OPENAI' } }, apiKeyOverrides: {} },
      workflow: 'brief',
      overrides: { provider: 'PERPLEXITY', model: 'sonar-pro' },
    });
    expect(route.primary.provider).toBe('PERPLEXITY');
    expect(route.primary.model).toBe('sonar-pro');
    expect(route.source).toBe('call');
  });

  it('uses the site API key override when present', () => {
    const route = router(async () => response(500, {})).resolve({
      siteConfig: { enabled: true, workflowOverrides: {}, apiKeyOverrides: { OPENAI: 'site-specific-key' } },
      workflow: 'writer',
    });
    expect(route.primary.apiKey).toBe('site-specific-key');
  });

  it('builds a deduplicated fallback chain excluding the primary', () => {
    const route = router(async () => response(500, {})).resolve({ siteConfig: null, workflow: 'writer' });
    expect(route.primary.provider).toBe('OPENAI');
    expect(route.fallback.map((c) => c.provider)).toEqual(['ANTHROPIC', 'PERPLEXITY']);
  });
});

describe('AiRouter execution', () => {
  it('generates text through the resolved provider and tracks usage/cost/job', async () => {
    const recorder = new FakeRecorder();
    const fetchImpl = async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = String(input);
      if (url.startsWith('https://api.openai.com')) return openAiResponse();
      if (url.startsWith('https://api.anthropic.com')) return anthropicTextResponse();
      return response(500, {});
    };

    const result = await router(fetchImpl, {}, recorder).generateText({
      siteConfig: null,
      workflow: 'writer',
      systemPrompt: 'sys',
      userPrompt: 'hi',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe('OPENAI');
    expect(result.text).toBe('hello from openai');
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 500 });
    expect(result.costUsd).toBeCloseTo(0.00045, 6);
    expect(recorder.created).toHaveLength(1);
    expect(recorder.created[0]!.provider).toBe('OPENAI');
    const finalUpdate = recorder.updates.find((u) => u.update.status === 'SUCCEEDED');
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate!.update.costUsd).toBeCloseTo(0.00045, 6);
  });

  it('falls back to the next provider when the primary fails', async () => {
    const recorder = new FakeRecorder();
    const fetchImpl = async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = String(input);
      if (url.startsWith('https://api.openai.com')) return response(500, { error: { message: 'overloaded' } });
      if (url.startsWith('https://api.anthropic.com')) return anthropicTextResponse();
      return response(500, {});
    };

    const result = await router(fetchImpl, {}, recorder).generateText({
      siteConfig: null,
      workflow: 'writer',
      systemPrompt: 'sys',
      userPrompt: 'hi',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe('ANTHROPIC');
    expect(result.text).toBe('hello from anthropic');
    expect(recorder.updates.some((u) => u.update.status === 'RUNNING' && u.update.attempts === 1)).toBe(true);
    const success = recorder.updates.find((u) => u.update.status === 'SUCCEEDED');
    expect(success!.update.attempts).toBe(2);
  });

  it('exhausts all providers and reports a sanitized failure', async () => {
    const recorder = new FakeRecorder();
    const result = await router(async () => response(500, { error: { message: 'down' } }), {}, recorder).generateText({
      siteConfig: null,
      workflow: 'writer',
      systemPrompt: 'sys',
      userPrompt: 'hi',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('exhausted');
    expect(result.error).not.toContain('sk-openai');
    expect(recorder.updates.some((u) => u.update.status === 'FAILED')).toBe(true);
  });

  it('returns no-provider and records the job when nothing is configured', async () => {
    const recorder = new FakeRecorder();
    const emptyKeys: AiGlobalConfig = {
      ...GLOBAL,
      providers: {
        OPENAI: { apiKey: '', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
        ANTHROPIC: { apiKey: '', baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-haiku-4-5' },
        PERPLEXITY: { apiKey: '', baseUrl: 'https://api.perplexity.ai', defaultModel: 'sonar' },
      },
    };

    const result = await router(async () => response(500, {}), emptyKeys, recorder).generateText({
      siteConfig: null,
      workflow: 'writer',
      systemPrompt: 'sys',
      userPrompt: 'hi',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no-provider');
    expect(recorder.created[0]!.workflow).toBe('writer');
    expect(recorder.updates.some((u) => u.update.status === 'NO_PROVIDER')).toBe(true);
  });
});

describe('AiRouter research', () => {
  it('routes research to Perplexity and returns real citations', async () => {
    const recorder = new FakeRecorder();
    const fetchImpl = async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = String(input);
      if (url.startsWith('https://api.perplexity.ai')) return perplexityResearchResponse();
      return response(500, {});
    };

    const result = await router(fetchImpl, {}, recorder).research({
      siteConfig: null,
      workflow: 'research',
      query: 'seo trends',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sources).toHaveLength(2);
    expect(result.sources![0]!.url).toBe('https://example.com/a');
    expect(result.summary).toBe('summary from perplexity');
  });

  it('skips non-research providers in the chain and still reaches Perplexity', async () => {
    const recorder = new FakeRecorder();
    const fetchImpl = async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = String(input);
      if (url.startsWith('https://api.perplexity.ai')) return perplexityResearchResponse();
      return response(500, {});
    };

    const result = await router(fetchImpl, { workflowConfigs: { research: { provider: 'OPENAI' } } }, recorder).research({
      siteConfig: null,
      workflow: 'research',
      query: 'seo trends',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe('PERPLEXITY');
  });
});

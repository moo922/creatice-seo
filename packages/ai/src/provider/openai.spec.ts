import { OpenAiProvider } from './openai';
import type { ProviderOptions } from '../contracts';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, headers: {}, text: async () => JSON.stringify(body) } as unknown as Response;
}

function provider(fetchImpl: typeof fetch): OpenAiProvider {
  const options: ProviderOptions = {
    apiKey: 'sk-secret-test',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    timeoutMs: 1_000,
    maxRetries: 0,
    retryBackoffMs: 1,
    fetchImpl,
  };
  return new OpenAiProvider(options);
}

describe('OpenAiProvider', () => {
  it('generates text and parses usage', async () => {
    const fetchImpl = async () =>
      jsonResponse(200, {
        choices: [{ message: { content: 'the answer' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
    const result = await provider(fetchImpl).generateText({
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      systemPrompt: 'sys',
      userPrompt: 'hi',
    });
    expect(result.text).toBe('the answer');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('enforces structured output with a json_schema response format', async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      calls.push(init ?? {});
      return jsonResponse(200, {
        choices: [{ message: { content: '{"name":"kicker","count":3}' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    };
    const instance = provider(fetchImpl);
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'count'],
      properties: { name: { type: 'string' }, count: { type: 'integer' } },
    };

    const result = await instance.generateStructured<{ name: string; count: number }>({
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      systemPrompt: 'sys',
      userPrompt: 'go',
      schema,
    });

    expect(result.data).toEqual({ name: 'kicker', count: 3 });
    const sent = JSON.parse(String(calls[0]!.body)) as { response_format: { type: string; json_schema: { strict: boolean } } };
    expect(sent.response_format.type).toBe('json_schema');
    expect(sent.response_format.json_schema.strict).toBe(true);
  });

  it('does not leak the API key into request errors', async () => {
    const fetchImpl = async () =>
      jsonResponse(401, { error: { message: 'Incorrect API key provided: sk-secret-test.' } });
    const instance = provider(fetchImpl);
    const error = await instance
      .generateText({ provider: 'OPENAI', model: 'gpt-4o-mini', systemPrompt: 's', userPrompt: 'u' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('sk-secret-test');
  });
});

import { requestJson } from './http';
import { ProviderHttpError, ProviderTimeoutError } from '../errors';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, headers: {}, text: async () => JSON.stringify(body) } as unknown as Response;
}

const BASE = {
  timeoutMs: 1_000,
  maxRetries: 0,
  retryBackoffMs: 1,
  provider: 'OPENAI' as const,
};

describe('requestJson', () => {
  it('returns the parsed body on success', async () => {
    const fetchImpl = async () => jsonResponse(200, { choices: [{ text: 'ok' }] });
    const result = await requestJson('https://api.test/v1', { ...BASE, fetchImpl });
    expect(result.ok).toBe(true);
    expect((result.body as { choices: unknown[] }).choices).toHaveLength(1);
  });

  it('retries retryable statuses and succeeds on a later attempt', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return calls === 1 ? jsonResponse(429, { error: { message: 'rate limited' } }) : jsonResponse(200, { done: true });
    };
    const result = await requestJson('https://api.test/v1', { ...BASE, maxRetries: 1, fetchImpl });
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('does not retry client errors such as 400', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return jsonResponse(400, { error: { message: 'bad request' } });
    };
    await expect(requestJson('https://api.test/v1', { ...BASE, maxRetries: 3, fetchImpl })).rejects.toThrow(
      new ProviderHttpError('OPENAI', 400, 'bad request'),
    );
    expect(calls).toBe(1);
  });

  it('throws a timeout error when the request is aborted', async () => {
    const fetchImpl = (_url: Parameters<typeof fetch>[0], init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('AbortError'), { name: 'AbortError' })));
      });
    await expect(
      requestJson('https://api.test/v1', { ...BASE, timeoutMs: 20, maxRetries: 0, fetchImpl }),
    ).rejects.toThrow(new ProviderTimeoutError('OPENAI', 20));
  });

  it('sanitizes upstream error messages so secrets never leak', async () => {
    const longMessage = `Incorrect API key provided: sk-1234567890abcdef. Review your API key. ${'x'.repeat(500)}`;
    const fetchImpl = async () => jsonResponse(401, { error: { message: longMessage } });
    const error = await requestJson('https://api.test/v1', { ...BASE, fetchImpl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderHttpError);
    const message = (error as Error).message;
    expect(message).toContain('Incorrect API key provided');
    expect(message).toHaveLength(300);
  });

  it('redacts configured secrets from upstream error bodies', async () => {
    const fetchImpl = async () =>
      jsonResponse(401, { error: { message: 'Incorrect API key provided: sk-topsecret.' } });
    const error = await requestJson('https://api.test/v1', { ...BASE, redactSecrets: ['sk-topsecret'], fetchImpl }).catch(
      (e: unknown) => e,
    );
    expect((error as Error).message).toContain('[redacted]');
    expect((error as Error).message).not.toContain('sk-topsecret');
  });
});

import { buildDispatchPayload, isTerminalStatus, issueKindFor, shouldRetry } from './logic';

describe('orchestration logic', () => {
  it('retries until max attempts are exhausted', () => {
    expect(shouldRetry(0, 3)).toBe(true);
    expect(shouldRetry(2, 3)).toBe(true);
    expect(shouldRetry(3, 3)).toBe(false);
  });

  it('identifies terminal statuses (idempotent callbacks)', () => {
    expect(isTerminalStatus('SUCCEEDED')).toBe(true);
    expect(isTerminalStatus('FAILED')).toBe(true);
    expect(isTerminalStatus('TIMEOUT')).toBe(true);
    expect(isTerminalStatus('RUNNING')).toBe(false);
    expect(isTerminalStatus('PENDING')).toBe(false);
  });

  it('maps workflows to failure issue kinds', () => {
    expect(issueKindFor('gsc-sync')).toBe('GSC_FAILURE');
    expect(issueKindFor('wp-draft-publisher')).toBe('WORDPRESS_FAILURE');
    expect(issueKindFor('post-publish-verification')).toBe('WORDPRESS_FAILURE');
    expect(issueKindFor('content-generation')).toBe('ORCHESTRATION');
  });

  it('builds a dispatch payload carrying the idempotency key and callback URL', () => {
    const payload = buildDispatchPayload({
      jobId: 'job-1',
      idempotencyKey: 'key-1',
      workflow: 'gsc-sync',
      siteId: 'site-1',
      organizationId: null,
      payload: { page: 1 },
      callbackUrl: 'https://api.example.com/api/webhooks/n8n/callback',
      timeoutMs: 300000,
    });
    expect(payload.idempotencyKey).toBe('key-1');
    expect(payload.callbackUrl).toContain('/webhooks/n8n/callback');
    expect(payload.payload).toEqual({ page: 1 });
  });
});

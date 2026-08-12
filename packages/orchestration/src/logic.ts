/**
 * Pure orchestration decision logic — no I/O, easily unit tested.
 */

export function shouldRetry(attempts: number, maxAttempts: number): boolean {
  return attempts < maxAttempts;
}

export function isTerminalStatus(status: string): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'TIMEOUT';
}

export function issueKindFor(workflow: string): 'GSC_FAILURE' | 'WORDPRESS_FAILURE' | 'ORCHESTRATION' {
  if (workflow === 'gsc-sync') return 'GSC_FAILURE';
  if (workflow === 'wp-draft-publisher' || workflow === 'post-publish-verification') return 'WORDPRESS_FAILURE';
  return 'ORCHESTRATION';
}

export interface DispatchPayloadInput {
  jobId: string;
  idempotencyKey: string | null;
  workflow: string;
  siteId: string;
  organizationId: string | null;
  payload: Record<string, unknown>;
  callbackUrl: string;
  timeoutMs: number;
}

export function buildDispatchPayload(input: DispatchPayloadInput): Record<string, unknown> {
  return {
    jobId: input.jobId,
    idempotencyKey: input.idempotencyKey,
    workflow: input.workflow,
    siteId: input.siteId,
    organizationId: input.organizationId,
    payload: input.payload,
    callbackUrl: input.callbackUrl,
    timeoutMs: input.timeoutMs,
  };
}

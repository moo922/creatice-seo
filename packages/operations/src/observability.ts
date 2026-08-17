/**
 * Observability helpers (Section 60).
 *
 * Log: GSC sync row counts by grain, duplicate prevention, baseline creation,
 * snapshot calculation, report snapshot creation, data-quality warnings.
 *
 * Do NOT log: OAuth tokens, API keys, sensitive credentials.
 */

export enum ObservabilityEvent {
  GSC_SYNC_COMPLETE = 'GSC_SYNC_COMPLETE',
  METRIC_UPSERT = 'METRIC_UPSERT',
  DUPLICATE_PREVENTED = 'DUPLICATE_PREVENTED',
  BASELINE_CREATED = 'BASELINE_CREATED',
  SNAPSHOT_CALCULATED = 'SNAPSHOT_CALCULATED',
  REPORT_SNAPSHOT_CREATED = 'REPORT_SNAPSHOT_CREATED',
  DATA_QUALITY_WARNING = 'DATA_QUALITY_WARNING',
  BACKFILL_PROGRESS = 'BACKFILL_PROGRESS',
}

export interface ObservabilityLog {
  event: ObservabilityEvent;
  siteId?: string;
  details: Record<string, unknown>;
  timestamp: string;
}

const logBuffer: ObservabilityLog[] = [];
const MAX_BUFFER = 1000;

export function observe(
  event: ObservabilityEvent,
  details: Record<string, unknown>,
  siteId?: string,
): void {
  const entry: ObservabilityLog = {
    event,
    siteId,
    details: sanitize(details),
    timestamp: new Date().toISOString(),
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER) {
    logBuffer.shift();
  }

  console.log(`[OBS] ${entry.event}`, JSON.stringify(entry.details));
}

function sanitize(details: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    const lower = key.toLowerCase();
    if (lower.includes('token') || lower.includes('key') || lower.includes('secret') || lower.includes('password')) {
      clean[key] = '[REDACTED]';
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export function getRecentLogs(count = 50): ObservabilityLog[] {
  return logBuffer.slice(-count);
}

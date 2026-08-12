import type { OrchestrationWorkflow } from '@creative-seo/types';

/**
 * The 15 n8n workflows the backend orchestrates. n8n executes the workflow and
 * reports back via the callback webhook; PostgreSQL remains the source of
 * truth. Webhook paths are overridable via N8N_WEBHOOK_<KEY> environment
 * variables (e.g. N8N_WEBHOOK_GSC_SYNC).
 */
export interface WorkflowDefinition {
  key: OrchestrationWorkflow;
  name: string;
  order: number;
  webhookPath: string;
  timeoutMs: number;
  maxAttempts: number;
}

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_ATTEMPTS = 3;

export const ORCHESTRATION_WORKFLOW_DEFS: readonly WorkflowDefinition[] = [
  { key: 'site-sync', name: '01 Site Sync', order: 1, webhookPath: '/site-sync', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'crawl-audit', name: '02 Crawl & Audit', order: 2, webhookPath: '/crawl-audit', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'gsc-sync', name: '03 GSC Sync', order: 3, webhookPath: '/gsc-sync', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'keyword-discovery', name: '04 Keyword Discovery', order: 4, webhookPath: '/keyword-discovery', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'keyword-clustering', name: '05 Keyword Clustering', order: 5, webhookPath: '/keyword-clustering', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'content-brief', name: '06 Content Brief', order: 6, webhookPath: '/content-brief', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'content-generation', name: '07 Content Generation', order: 7, webhookPath: '/content-generation', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'content-qa', name: '08 Content QA', order: 8, webhookPath: '/content-qa', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'internal-linking', name: '09 Internal Linking', order: 9, webhookPath: '/internal-linking', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'wp-draft-publisher', name: '10 WordPress Draft Publisher', order: 10, webhookPath: '/wp-draft-publisher', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'post-publish-verification', name: '11 Post-Publish Verification', order: 11, webhookPath: '/post-publish-verification', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'monitoring-opportunities', name: '12 Monitoring & Opportunity Detection', order: 12, webhookPath: '/monitoring-opportunities', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'ai-visibility-observation', name: '13 AI Visibility Observation', order: 13, webhookPath: '/ai-visibility-observation', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'monthly-snapshot', name: '14 Monthly Snapshot', order: 14, webhookPath: '/monthly-snapshot', timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { key: 'report-generation', name: '15 Report Generation', order: 15, webhookPath: '/report-generation', timeoutMs: 600_000, maxAttempts: DEFAULT_MAX_ATTEMPTS },
];

const BY_KEY = new Map(ORCHESTRATION_WORKFLOW_DEFS.map((def) => [def.key, def]));

export function workflowDefinition(key: string): WorkflowDefinition {
  const def = BY_KEY.get(key as OrchestrationWorkflow);
  if (!def) {
    throw new Error(`Unknown orchestration workflow "${key}"`);
  }
  return def;
}

export function isKnownWorkflow(key: string): boolean {
  return BY_KEY.has(key as OrchestrationWorkflow);
}

export function allWorkflowKeys(): OrchestrationWorkflow[] {
  return ORCHESTRATION_WORKFLOW_DEFS.map((def) => def.key);
}

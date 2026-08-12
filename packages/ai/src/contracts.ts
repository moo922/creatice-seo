import type { AiProviderKind } from '@creative-seo/types';

/**
 * AI provider adapter contracts. Providers are implemented with the raw fetch
 * API only — provider SDKs are never imported outside the provider package.
 */

export interface GenerateTextRequest {
  provider: AiProviderKind;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateStructuredRequest {
  provider: AiProviderKind;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  /** JSON schema the provider must conform to. */
  schema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateTextResult {
  text: string;
  usage: UsageEstimate;
  latencyMs: number;
}

export interface GenerateStructuredResult<T> {
  data: T;
  usage: UsageEstimate;
  latencyMs: number;
}

export interface UsageEstimate {
  inputTokens: number;
  outputTokens: number;
}

export interface HealthStatus {
  ok: boolean;
  latencyMs: number | null;
  message?: string;
}

export interface AIProvider {
  readonly kind: AiProviderKind;
  generateText(request: GenerateTextRequest): Promise<GenerateTextResult>;
  generateStructured<T>(request: GenerateStructuredRequest): Promise<GenerateStructuredResult<T>>;
  healthCheck(): Promise<HealthStatus>;
}

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string | null;
}

export interface ResearchResult {
  sources: ResearchSource[];
  summary: string;
}

/**
 * Providers that can genuinely return cited sources implement this. Providers
 * without web research are marked unsupported (research returns null) rather
 * than fabricating sources.
 */
export interface ResearchProvider {
  research(query: string, options?: { maxSources?: number }): Promise<ResearchResult | null>;
}

// ---------------------------------------------------------------------------
// Provider construction & routing
// ---------------------------------------------------------------------------

export interface ProviderOptions {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  timeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
  fetchImpl?: typeof fetch;
}

export interface ProviderWithResearch {
  provider: AIProvider;
  research: ResearchProvider | null;
}

/** Global provider runtime config (from environment). */
export interface GlobalProviderConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}

export interface WorkflowConfig {
  provider: AiProviderKind;
  model?: string;
}

export interface AiGlobalConfig {
  defaultProvider: AiProviderKind;
  defaultModel: string;
  fallback: AiProviderKind[];
  /** Workflow key -> preferred provider (global layer of routing). */
  workflowConfigs: Record<string, WorkflowConfig>;
  providers: Record<AiProviderKind, GlobalProviderConfig>;
  timeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
  fetchImpl?: typeof fetch;
}

export interface SiteWorkflowOverride {
  provider?: AiProviderKind;
  model?: string;
  fallback?: AiProviderKind[];
}

/** Site layer of the routing hierarchy (ai_provider_configs, keys decrypted). */
export interface SiteAiConfig {
  enabled: boolean;
  workflowOverrides: Record<string, SiteWorkflowOverride>;
  apiKeyOverrides: Partial<Record<AiProviderKind, string>>;
}

/** Per-call override (highest priority in the routing hierarchy). */
export interface CallOverrides {
  provider?: AiProviderKind;
  model?: string;
  fallback?: AiProviderKind[];
}

export interface RouteCandidate {
  provider: AiProviderKind;
  model: string;
  apiKey: string;
  baseUrl: string;
}

export interface ResolvedRoute {
  primary: RouteCandidate;
  fallback: RouteCandidate[];
  /** How the primary provider was chosen. */
  source: 'global' | 'site' | 'call';
}

// ---------------------------------------------------------------------------
// Job recording (implemented by the persistence layer, e.g. TypeORM)
// ---------------------------------------------------------------------------

export type AiJobKind = 'TEXT' | 'STRUCTURED' | 'RESEARCH';

export interface NewAiJob {
  siteId: string | null;
  organizationId: string | null;
  workflow: string;
  promptName: string | null;
  promptVersion: number | null;
  kind: AiJobKind;
  provider: AiProviderKind;
  model: string;
}

export interface AiJobUpdate {
  status?: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'NO_PROVIDER';
  attempts?: number;
  provider?: AiProviderKind;
  model?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  latencyMs?: number | null;
  error?: string | null;
  completedAt?: Date | null;
}

/** Persistence hook so the router records every AI job and its attempts. */
export interface AiJobRecorder {
  createJob(job: NewAiJob): Promise<string>;
  updateJob(jobId: string, update: AiJobUpdate): Promise<void>;
}

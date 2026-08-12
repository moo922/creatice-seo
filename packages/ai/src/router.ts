import type { AiProviderKind } from '@creative-seo/types';
import type {
  AiGlobalConfig,
  AiJobKind,
  AiJobRecorder,
  CallOverrides,
  ResolvedRoute,
  ResearchSource,
  RouteCandidate,
  SiteAiConfig,
  UsageEstimate,
} from './contracts';
import { AiError, NoProviderAvailableError } from './errors';
import { estimateCostUsd, roundCost } from './pricing';
import { createProvider } from './provider/factory';

export interface RouteInput {
  siteConfig: SiteAiConfig | null;
  siteId?: string | null;
  organizationId?: string | null;
  workflow: string;
  overrides?: CallOverrides;
}

export interface ExecuteTextInput extends RouteInput {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ExecuteStructuredInput extends ExecuteTextInput {
  schema: Record<string, unknown>;
}

export interface ExecuteResearchInput extends RouteInput {
  query: string;
  maxSources?: number;
}

export type AiExecutionResult =
  | {
      ok: true;
      provider: AiProviderKind;
      model: string;
      usage: UsageEstimate;
      costUsd: number | null;
      latencyMs: number;
      jobId: string | null;
      text?: string;
      data?: Record<string, unknown>;
      sources?: ResearchSource[];
      summary?: string;
    }
  | {
      ok: false;
      provider: AiProviderKind;
      model: string;
      reason: 'no-provider' | 'exhausted';
      error: string;
      jobId: string | null;
    };

interface JobMeta {
  promptName: string | null;
  promptVersion: number | null;
}

interface RunnerOutput {
  usage: UsageEstimate;
  latencyMs: number;
  text?: string;
  data?: Record<string, unknown>;
  sources?: ResearchSource[];
  summary?: string;
}

type Runner = (candidate: RouteCandidate) => Promise<RunnerOutput>;

/**
 * Provider-independent router. Resolves the routing hierarchy
 * (global default -> site override -> workflow override) and executes a request
 * across the primary + fallback chain with retries/timeouts handled by the
 * providers. Every job is recorded through the optional AiJobRecorder.
 */
export class AiRouter {
  constructor(
    private readonly global: AiGlobalConfig,
    private readonly recorder: AiJobRecorder | null = null,
  ) {}

  /** Resolves which provider/model/key serves a workflow for a site. */
  resolve(input: RouteInput): ResolvedRoute {
    const globalWorkflow = this.global.workflowConfigs[input.workflow];
    const globalProvider = globalWorkflow?.provider ?? this.global.defaultProvider;
    const siteOverride = input.siteConfig?.workflowOverrides?.[input.workflow];
    const callOverride = input.overrides;

    const provider: AiProviderKind =
      callOverride?.provider ?? siteOverride?.provider ?? globalProvider;
    const source: ResolvedRoute['source'] = callOverride?.provider
      ? 'call'
      : siteOverride?.provider
        ? 'site'
        : 'global';

    const model =
      callOverride?.model ??
      siteOverride?.model ??
      globalWorkflow?.model ??
      this.providerGlobal(provider).defaultModel;

    const fallbackOrder = dedupe(
      (callOverride?.fallback ?? siteOverride?.fallback ?? this.global.fallback).filter(
        (kind) => kind !== provider,
      ),
    );

    const primary = this.buildCandidate(provider, model, input.siteConfig);
    const fallback = fallbackOrder
      .map((kind) =>
        this.buildCandidate(
          kind,
          this.resolveFallbackModel(kind, input.workflow, input.siteConfig),
          input.siteConfig,
        ),
      )
      .filter((candidate) => candidate.apiKey.length > 0);

    return { primary, fallback, source };
  }

  async generateText(input: ExecuteTextInput): Promise<AiExecutionResult> {
    const runner: Runner = async (candidate) => {
      const result = await createProvider(candidate.provider, this.options(candidate)).provider.generateText({
        provider: candidate.provider,
        model: candidate.model,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens,
      });
      return { usage: result.usage, latencyMs: result.latencyMs, text: result.text };
    };
    return this.run(input, 'TEXT', runner);
  }

  async generateStructured(input: ExecuteStructuredInput): Promise<AiExecutionResult> {
    const runner: Runner = async (candidate) => {
      const result = await createProvider(candidate.provider, this.options(candidate)).provider.generateStructured<Record<string, unknown>>({
        provider: candidate.provider,
        model: candidate.model,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        schema: input.schema,
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens,
      });
      return { usage: result.usage, latencyMs: result.latencyMs, data: result.data };
    };
    return this.run(input, 'STRUCTURED', runner);
  }

  async research(input: ExecuteResearchInput): Promise<AiExecutionResult> {
    const runner: Runner = async (candidate) => {
      const { research } = createProvider(candidate.provider, this.options(candidate));
      if (!research) {
        throw new AiError(`${candidate.provider} does not support web research`, 'unavailable', candidate.provider);
      }
      const result = await research.research(input.query, { maxSources: input.maxSources });
      if (!result) {
        throw new AiError(`${candidate.provider} returned no research result`, 'unavailable', candidate.provider);
      }
      return { usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0, sources: result.sources, summary: result.summary };
    };
    return this.runResearch(input, runner);
  }

  // ---- internals ----

  private async run(input: RouteInput, kind: AiJobKind, runner: Runner): Promise<AiExecutionResult> {
    const route = this.resolve(input);
    const chain = [route.primary, ...route.fallback].filter((candidate) => candidate.apiKey.length > 0);

    if (chain.length === 0) {
      const error = 'no AI provider is configured (missing API keys)';
      const jobId = await this.recordNoProvider(input, kind, route, error);
      return { ok: false, provider: route.primary.provider, model: route.primary.model, reason: 'no-provider', error, jobId };
    }

    return this.executeChain(input, kind, chain, runner);
  }

  private async runResearch(input: ExecuteResearchInput, runner: Runner): Promise<AiExecutionResult> {
    const route = this.resolve(input);
    const chain = [route.primary, ...route.fallback].filter((candidate) => candidate.apiKey.length > 0);

    if (chain.length === 0) {
      const error = 'no AI provider is configured (missing API keys)';
      const jobId = await this.recordNoProvider(input, 'RESEARCH', route, error);
      return { ok: false, provider: route.primary.provider, model: route.primary.model, reason: 'no-provider', error, jobId };
    }

    // Research is only served by providers that implement ResearchProvider.
    for (let index = 0; index < chain.length; index += 1) {
      const candidate = chain[index]!;
      const { research } = createProvider(candidate.provider, this.options(candidate));
      if (research) {
        return this.executeChain(input, 'RESEARCH', chain.slice(index), runner);
      }
    }

    const error = 'no research-capable AI provider is configured';
    const jobId = await this.recordNoProvider(input, 'RESEARCH', route, error);
    return { ok: false, provider: route.primary.provider, model: route.primary.model, reason: 'no-provider', error, jobId };
  }

  private async executeChain(
    input: RouteInput,
    kind: AiJobKind,
    chain: RouteCandidate[],
    runner: Runner,
  ): Promise<AiExecutionResult> {
    const meta: JobMeta = { promptName: null, promptVersion: null };
    let jobId: string | undefined;
    if (this.recorder) {
      jobId = await this.recorder.createJob({
        siteId: input.siteId ?? null,
        organizationId: input.organizationId ?? null,
        workflow: input.workflow,
        promptName: meta.promptName,
        promptVersion: meta.promptVersion,
        kind,
        provider: chain[0]!.provider,
        model: chain[0]!.model,
      });
    }

    let lastError = 'all AI providers failed';
    for (let index = 0; index < chain.length; index += 1) {
      const candidate = chain[index]!;
      try {
        const output = await runner(candidate);
        const costUsd = estimateCostUsd(candidate.provider, candidate.model, output.usage.inputTokens, output.usage.outputTokens);
        await this.recorder?.updateJob(jobId!, {
          status: 'SUCCEEDED',
          attempts: index + 1,
          provider: candidate.provider,
          model: candidate.model,
          inputTokens: output.usage.inputTokens,
          outputTokens: output.usage.outputTokens,
          costUsd: costUsd === null ? null : roundCost(costUsd),
          latencyMs: output.latencyMs,
          completedAt: new Date(),
        });
        return {
          ok: true,
          provider: candidate.provider,
          model: candidate.model,
          usage: output.usage,
          costUsd: costUsd === null ? null : roundCost(costUsd),
          latencyMs: output.latencyMs,
          jobId: jobId ?? null,
          text: output.text,
          data: output.data,
          sources: output.sources,
          summary: output.summary,
        };
      } catch (error) {
        lastError = sanitizeError(error).slice(0, 500);
        await this.recorder?.updateJob(jobId!, {
          status: 'RUNNING',
          attempts: index + 1,
          provider: candidate.provider,
          model: candidate.model,
          error: lastError,
        });
      }
    }

    await this.recorder?.updateJob(jobId!, {
      status: 'FAILED',
      error: lastError,
      completedAt: new Date(),
    });
    const lastCandidate = chain[chain.length - 1]!;
    return { ok: false, provider: lastCandidate.provider, model: lastCandidate.model, reason: 'exhausted', error: lastError, jobId: jobId ?? null };
  }

  private async recordNoProvider(input: RouteInput, kind: AiJobKind, route: ResolvedRoute, error: string): Promise<string | null> {
    if (!this.recorder) return null;
    const jobId = await this.recorder.createJob({
      siteId: input.siteId ?? null,
      organizationId: input.organizationId ?? null,
      workflow: input.workflow,
      promptName: null,
      promptVersion: null,
      kind,
      provider: route.primary.provider,
      model: route.primary.model,
    });
    await this.recorder.updateJob(jobId, {
      status: 'NO_PROVIDER',
      attempts: 0,
      error,
      completedAt: new Date(),
    });
    return jobId;
  }

  private buildCandidate(provider: AiProviderKind, model: string, siteConfig: SiteAiConfig | null): RouteCandidate {
    const globalProvider = this.providerGlobal(provider);
    const apiKey = siteConfig?.apiKeyOverrides[provider] ?? globalProvider.apiKey;
    return { provider, model, apiKey, baseUrl: globalProvider.baseUrl };
  }

  private resolveFallbackModel(provider: AiProviderKind, workflow: string, siteConfig: SiteAiConfig | null): string {
    const siteModel = siteConfig?.workflowOverrides?.[workflow]?.model;
    const globalModel = this.global.workflowConfigs[workflow]?.model;
    return siteModel ?? globalModel ?? this.providerGlobal(provider).defaultModel;
  }

  private providerGlobal(provider: AiProviderKind) {
    const config = this.global.providers[provider];
    if (!config) {
      throw new Error(`AI provider ${provider} has no global configuration`);
    }
    return config;
  }

  private options(candidate: RouteCandidate) {
    return {
      apiKey: candidate.apiKey,
      baseUrl: candidate.baseUrl,
      defaultModel: candidate.model,
      timeoutMs: this.global.timeoutMs,
      maxRetries: this.global.maxRetries,
      retryBackoffMs: this.global.retryBackoffMs,
      ...(this.global.fetchImpl ? { fetchImpl: this.global.fetchImpl } : {}),
    };
  }
}

function dedupe(values: AiProviderKind[]): AiProviderKind[] {
  return [...new Set(values)];
}

function sanitizeError(error: unknown): string {
  if (error instanceof NoProviderAvailableError || error instanceof AiError || error instanceof Error) {
    return error.message;
  }
  return 'unknown AI provider failure';
}

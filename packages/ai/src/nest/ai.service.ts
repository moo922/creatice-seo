import { BadGatewayException, ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AiProviderConfig, GlobalAiProviderCredential } from '@creative-seo/database';
import { AI_PROVIDER_KINDS } from '@creative-seo/types';
import type {
  AiGenerationResultDto,
  AiHealthDto,
  AiJobDto,
  AiJobsQuery,
  AiPromptDto,
  AiProviderConfigDto,
  AiProviderConfigRequest,
  AiProviderHealthDto,
  AiProviderKind,
} from '@creative-seo/types';
import { Repository } from 'typeorm';
import type { SiteAiConfig } from '../contracts';
import { AiError, NoProviderAvailableError } from '../errors';
import { AesEncryptor } from '../encryption';
import { AiProviderRegistry } from '../registry';
import { AiRouter, type AiExecutionResult } from '../router';
import { AiJobsService } from './ai-jobs.service';
import { PromptRegistryService } from './prompt-registry.service';

export interface GenerationOptions {
  siteId?: string | null;
  organizationId?: string | null;
  workflow: string;
  provider?: AiProviderKind;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ResearchOptions {
  siteId?: string | null;
  organizationId?: string | null;
  workflow: string;
  maxSources?: number;
}

/**
 * Application-facing AI facade. Resolves the routing hierarchy, renders prompts
 * from the registry, executes generation/research with fallback and records
 * every job. API keys never leave this layer and never reach logs.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(AiProviderConfig)
    private readonly configs: Repository<AiProviderConfig>,
    @InjectRepository(GlobalAiProviderCredential)
    private readonly globalCreds: Repository<GlobalAiProviderCredential>,
    private readonly prompts: PromptRegistryService,
    private readonly router: AiRouter,
    private readonly jobs: AiJobsService,
    private readonly registry: AiProviderRegistry,
    private readonly encryptor: AesEncryptor,
  ) {}

  async generateText(
    promptName: string,
    variables: Record<string, string>,
    options: GenerationOptions,
  ): Promise<AiGenerationResultDto> {
    const rendered = await this.prompts.render(promptName, variables);
    const siteConfig = await this.siteConfigFor(options.siteId ?? null);
    const result = await this.router.generateText({
      siteConfig,
      siteId: options.siteId ?? null,
      organizationId: options.organizationId ?? null,
      workflow: options.workflow,
      overrides: { provider: options.provider, model: options.model },
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
    });
    return this.toResultDto(result);
  }

  async generateStructured<T>(
    promptName: string,
    variables: Record<string, string>,
    options: GenerationOptions,
  ): Promise<{ data: T; result: AiGenerationResultDto }> {
    const rendered = await this.prompts.render(promptName, variables);
    const siteConfig = await this.siteConfigFor(options.siteId ?? null);
    const schema = rendered.schema ?? {};
    const result = await this.router.generateStructured({
      siteConfig,
      siteId: options.siteId ?? null,
      organizationId: options.organizationId ?? null,
      workflow: options.workflow,
      overrides: { provider: options.provider, model: options.model },
      systemPrompt: rendered.systemPrompt,
      userPrompt: rendered.userPrompt,
      schema,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
    });
    if (!result.ok) {
      throw dtoError(result);
    }
    return { data: result.data as T, result: this.toResultDto(result) };
  }

  async research(query: string, options: ResearchOptions): Promise<AiGenerationResultDto> {
    const siteConfig = await this.siteConfigFor(options.siteId ?? null);
    const result = await this.router.research({
      siteConfig,
      siteId: options.siteId ?? null,
      organizationId: options.organizationId ?? null,
      workflow: options.workflow,
      query,
      maxSources: options.maxSources,
    });
    return this.toResultDto(result);
  }

  // ---- site configuration ----

  async getSiteConfig(siteId: string): Promise<AiProviderConfigDto> {
    const row = await this.configs.findOne({ where: { siteId } });
    const effectiveProviders = await this.resolveEffectiveProviders();
    if (!row) {
      return {
        siteId,
        enabled: true,
        inheritsGlobal: true,
        workflowOverrides: {},
        keyOverrides: [],
        effectiveProviders,
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      siteId: row.siteId,
      enabled: row.enabled,
      inheritsGlobal: true,
      workflowOverrides: toSiteOverrides(row.workflowOverrides) as AiProviderConfigDto['workflowOverrides'],
      keyOverrides: Object.keys(row.apiKeyOverrides).filter((kind) =>
        (AI_PROVIDER_KINDS as readonly string[]).includes(kind),
      ) as AiProviderKind[],
      effectiveProviders,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateSiteConfig(siteId: string, input: AiProviderConfigRequest): Promise<AiProviderConfigDto> {
    const row = (await this.configs.findOne({ where: { siteId } })) ?? this.configs.create({ siteId });

    if (input.enabled !== undefined) row.enabled = input.enabled;
    if (input.workflowOverrides !== undefined) {
      row.workflowOverrides = sanitizeWorkflowOverrides(input.workflowOverrides);
    }
    if (input.apiKeys) {
      for (const [kind, key] of Object.entries(input.apiKeys)) {
        if (!(AI_PROVIDER_KINDS as readonly string[]).includes(kind) || !key) continue;
        row.apiKeyOverrides = { ...row.apiKeyOverrides, [kind]: this.encryptor.encrypt(key) };
      }
    }
    if (input.removeApiKeys) {
      for (const kind of input.removeApiKeys) {
        delete row.apiKeyOverrides[kind];
      }
    }
    await this.configs.save(row);
    return (await this.getSiteConfig(siteId))!;
  }

  // ---- health / jobs ----

  async health(): Promise<AiHealthDto> {
    const reports = await this.registry.health();
    return {
      providers: reports.map<AiProviderHealthDto>((report) => ({
        provider: report.provider,
        ok: report.ok,
        configured: report.configured,
        latencyMs: report.latencyMs,
        message: report.message,
      })),
    };
  }

  async testProviderForSite(
    siteId: string,
    providerKind: AiProviderKind,
  ): Promise<{ ok: boolean; latencyMs: number; error?: string; source: string }> {
    const siteConfig = await this.siteConfigFor(siteId);
    const siteKey = siteConfig?.apiKeyOverrides?.[providerKind];

    // Resolve key: site override → global DB → env
    let apiKey = siteKey ?? null;
    let source = 'site';
    if (!apiKey) {
      const gRow = await this.globalCreds.findOne({ where: { provider: providerKind, enabled: true } });
      if (gRow?.credentialSource === 'APPLICATION' && gRow.encryptedApiKey) {
        try {
          apiKey = this.encryptor.decrypt(gRow.encryptedApiKey);
          source = 'global';
        } catch { /* corrupt */ }
      }
    }
    if (!apiKey) {
      apiKey = (providerKind === 'OPENAI' ? process.env.OPENAI_API_KEY
        : providerKind === 'ANTHROPIC' ? process.env.ANTHROPIC_API_KEY
        : process.env.PERPLEXITY_API_KEY) ?? null;
      source = 'environment';
    }
    if (!apiKey) {
      return { ok: false, latencyMs: 0, error: 'No API key configured', source: 'none' };
    }

    const start = Date.now();
    try {
      const url = providerKind === 'OPENAI' ? 'https://api.openai.com/v1/models'
        : providerKind === 'ANTHROPIC' ? 'https://api.anthropic.com/v1/messages'
        : 'https://api.perplexity.ai/chat/completions';
      const headers: Record<string, string> = providerKind === 'ANTHROPIC'
        ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
        : { Authorization: `Bearer ${apiKey}` };
      const body = providerKind === 'ANTHROPIC'
        ? JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
        : undefined;
      const res = await fetch(url, { method: body ? 'POST' : 'GET', headers, body, signal: AbortSignal.timeout(15_000) });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { ok: false, latencyMs, error: `HTTP ${res.status}`, source };
      }
      return { ok: true, latencyMs, source };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      return { ok: false, latencyMs, error: err instanceof Error ? err.message : 'Connection failed', source };
    }
  }

  async listJobs(query: AiJobsQuery): Promise<AiJobDto[]> {
    return this.jobs.list(query);
  }

  async getJob(id: string): Promise<AiJobDto | null> {
    return this.jobs.get(id);
  }

  async listPrompts(): Promise<AiPromptDto[]> {
    return this.prompts.list();
  }

  async registerPrompt(input: {
    promptName: string;
    systemPrompt: string;
    template: string;
    schema?: Record<string, unknown> | null;
    status?: 'ACTIVE' | 'DRAFT' | 'DEPRECATED';
  }): Promise<AiPromptDto> {
    return this.prompts.register(input);
  }

  async activatePrompt(name: string, version: number): Promise<AiPromptDto> {
    return this.prompts.activate(name, version);
  }

  // ---- internals ----

  private async siteConfigFor(siteId: string | null): Promise<SiteAiConfig | null> {
    if (!siteId) return null;
    const row = await this.configs.findOne({ where: { siteId } });
    if (!row) return { enabled: true, workflowOverrides: {}, apiKeyOverrides: {} };
    if (!row.enabled) {
      throw new ForbiddenException('AI generation is disabled for this site');
    }

    // Resolution order: site override → global DB credential → env (fallback in router)
    const apiKeyOverrides: Partial<Record<AiProviderKind, string>> = {};

    // 1. Load global DB credentials first (lower priority than site override)
    const globalCredRows = await this.globalCreds.find({ where: { enabled: true } });
    for (const gRow of globalCredRows) {
      if (!(AI_PROVIDER_KINDS as readonly string[]).includes(gRow.provider)) continue;
      if (gRow.credentialSource === 'APPLICATION' && gRow.encryptedApiKey) {
        try {
          apiKeyOverrides[gRow.provider as AiProviderKind] = this.encryptor.decrypt(gRow.encryptedApiKey);
        } catch {
          this.logger.warn(`Failed to decrypt global credential for ${gRow.provider}`);
        }
      }
    }

    // 2. Site overrides beat global DB credentials
    for (const [kind, encrypted] of Object.entries(row.apiKeyOverrides)) {
      if (!(AI_PROVIDER_KINDS as readonly string[]).includes(kind)) continue;
      try {
        apiKeyOverrides[kind as AiProviderKind] = this.encryptor.decrypt(encrypted);
      } catch {
        // Corrupted override falls back to the global key rather than failing.
      }
    }

    return { enabled: row.enabled, workflowOverrides: toSiteOverrides(row.workflowOverrides), apiKeyOverrides };
  }

  private async resolveEffectiveProviders(): Promise<Array<{ provider: AiProviderKind; configured: boolean; source: string }>> {
    const globalRows = await this.globalCreds.find();
    const globalMap = new Map(globalRows.map((r) => [r.provider, r]));

    return Promise.all(
      (AI_PROVIDER_KINDS as readonly AiProviderKind[]).map(async (provider) => {
        const gRow = globalMap.get(provider);
        const hasAppKey = gRow?.credentialSource === 'APPLICATION' && !!gRow.encryptedApiKey;
        const envKey = provider === 'OPENAI' ? process.env.OPENAI_API_KEY
          : provider === 'ANTHROPIC' ? process.env.ANTHROPIC_API_KEY
          : process.env.PERPLEXITY_API_KEY;

        let configured = false;
        let source = 'NOT_CONFIGURED';
        if (hasAppKey) {
          configured = true;
          source = 'APPLICATION';
        } else if (envKey) {
          configured = true;
          source = 'ENVIRONMENT';
        }
        return { provider, configured, source };
      }),
    );
  }

  private toResultDto(result: AiExecutionResult): AiGenerationResultDto {
    if (!result.ok) {
      throw dtoError(result);
    }
    return {
      text: result.text ?? null,
      data: result.data ?? null,
      sources: result.sources ?? null,
      summary: result.summary ?? null,
      provider: result.provider,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd: result.costUsd,
      latencyMs: result.latencyMs,
      jobId: result.jobId ?? '',
    };
  }
}

function sanitizeWorkflowOverrides(
  input: AiProviderConfigRequest['workflowOverrides'],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!input) return result;
  for (const [workflow, override] of Object.entries(input)) {
    if (!override) continue;
    const cleaned: Record<string, unknown> = {};
    if (override.provider && (AI_PROVIDER_KINDS as readonly string[]).includes(override.provider)) {
      cleaned.provider = override.provider;
    }
    if (override.model && typeof override.model === 'string' && override.model.length <= 160) {
      cleaned.model = override.model;
    }
    if (override.fallback) {
      const fallback = override.fallback.filter((kind) => (AI_PROVIDER_KINDS as readonly string[]).includes(kind));
      if (fallback.length > 0) cleaned.fallback = fallback;
    }
    if (Object.keys(cleaned).length > 0) result[workflow] = cleaned;
  }
  return result;
}

/** Converts a raw workflow_overrides row into the typed site config shape. */
function toSiteOverrides(raw: Record<string, unknown>): Record<string, SiteAiConfig['workflowOverrides'][string]> {
  const result: Record<string, SiteAiConfig['workflowOverrides'][string]> = {};
  for (const [workflow, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue;
    const override = value as Record<string, unknown>;
    const cleaned: SiteAiConfig['workflowOverrides'][string] = {};
    if (typeof override.provider === 'string' && (AI_PROVIDER_KINDS as readonly string[]).includes(override.provider)) {
      cleaned.provider = override.provider as AiProviderKind;
    }
    if (typeof override.model === 'string') cleaned.model = override.model;
    if (Array.isArray(override.fallback)) {
      const fallback = override.fallback.filter((kind): kind is AiProviderKind =>
        (AI_PROVIDER_KINDS as readonly string[]).includes(kind),
      );
      if (fallback.length > 0) cleaned.fallback = fallback;
    }
    if (Object.keys(cleaned).length > 0) result[workflow] = cleaned;
  }
  return result;
}

function dtoError(result: Extract<AiExecutionResult, { ok: false }>): Error {
  if (result.reason === 'no-provider') {
    return new ServiceUnavailableException(result.error);
  }
  return new BadGatewayException(result.error);
}

/** Re-exports for callers that want typed provider errors from the facade. */
export { AiError, NoProviderAvailableError };

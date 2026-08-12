import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AiVisibilityObservation, AiVisibilityPromptSet, AiVisibilityRun } from '@creative-seo/database';
import { AiService } from '@creative-seo/ai';
import type {
  AiProviderKind,
  CreateVisibilityRunRequest,
  UpdatePromptSetRequest,
  VisibilityCategory,
  VisibilityMetricsDto,
  VisibilityObservationDto,
  VisibilityObservationQuery,
  VisibilityPromptDto,
  VisibilityPromptSetDto,
  VisibilityRunDto,
  VisibilityRunStatus,
  VisibilityTrendPointDto,
  VisibilityTrendsDto,
} from '@creative-seo/types';
import { In, Repository } from 'typeorm';
import { buildStandardPromptSet, type PromptSetContext } from './prompts';
import { parseResponse } from './parse';
import { computeMetrics, controlledObservationLabel, trendDeltas } from './metrics';

const VISIBILITY_PROMPT_NAME = 'visibility-observation';
const VISIBILITY_WORKFLOW = 'visibility-observation';

/** Everything the observation needs to know about the site being measured. */
export interface VisibilityTarget {
  brand: string;
  domain: string;
  competitors: string[];
  industry: string;
  product: string;
  location: string;
  problem: string;
}

/**
 * AI visibility observation. Each run executes the site's standardized prompt
 * set against the configured provider/model, stores the raw responses and
 * deterministically parsed signals, then computes metrics. All metrics are
 * labelled as controlled observations — never exact ChatGPT/Claude/Perplexity
 * user rankings. Repeated runs enable trend comparison over time.
 */
@Injectable()
export class VisibilityService {
  constructor(
    @InjectRepository(AiVisibilityPromptSet) private readonly promptSets: Repository<AiVisibilityPromptSet>,
    @InjectRepository(AiVisibilityRun) private readonly runs: Repository<AiVisibilityRun>,
    @InjectRepository(AiVisibilityObservation) private readonly observations: Repository<AiVisibilityObservation>,
    private readonly ai: AiService,
  ) {}

  // -------------------------------------------------------------------------
  // Prompt sets
  // -------------------------------------------------------------------------

  async getPromptSet(siteId: string): Promise<VisibilityPromptSetDto> {
    let row = await this.promptSets.findOne({ where: { siteId, name: 'default' } });
    if (!row) {
      row = await this.ensureDefaultPromptSet(siteId);
    }
    return this.toPromptSetDto(row);
  }

  async savePromptSet(siteId: string, input: UpdatePromptSetRequest): Promise<VisibilityPromptSetDto> {
    let row = await this.promptSets.findOne({ where: { siteId, name: 'default' } });
    if (!row) {
      row = await this.ensureDefaultPromptSet(siteId);
    }
    if (input.name) row.name = input.name;
    if (input.prompts) row.prompts = input.prompts as unknown as Record<string, unknown>[];
    if (input.enabled !== undefined) row.enabled = input.enabled;
    const saved = await this.promptSets.save(row);
    return this.toPromptSetDto(saved);
  }

  async ensureDefaultPromptSet(siteId: string, context?: PromptSetContext): Promise<AiVisibilityPromptSet> {
    const existing = await this.promptSets.findOne({ where: { siteId, name: 'default' } });
    if (existing) {
      return existing;
    }
    const prompts = buildStandardPromptSet(context ?? { industry: '', product: '', location: '', problem: '' });
    return this.promptSets.save(
      this.promptSets.create({
        siteId,
        name: 'default',
        prompts: prompts as unknown as Record<string, unknown>[],
        enabled: true,
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Runs
  // -------------------------------------------------------------------------

  /**
   * Executes the site's standardized prompts against the configured provider/
   * model, stores each observation and returns the run with its metrics.
   */
  async run(
    siteId: string,
    organizationId: string | null,
    target: VisibilityTarget,
    options: CreateVisibilityRunRequest = {},
    createdBy: string | null = null,
  ): Promise<VisibilityRunDto> {
    const promptSet = await this.ensureDefaultPromptSet(
      siteId,
      targetContext(target),
    );
    const prompts = this.activePrompts(promptSet, options.categories);
    const observedAt = options.observedAt ? new Date(options.observedAt).toISOString().slice(0, 10) : today();

    const runRow = this.runs.create({
      siteId,
      organizationId,
      provider: null,
      model: null,
      status: 'RUNNING',
      observedAt,
      startedAt: new Date(),
      completedAt: null,
      observationsCount: 0,
      error: null,
      createdBy,
    });
    const run = await this.runs.save(runRow);

    const stored: Array<Pick<VisibilityObservationDto, 'brandMentioned' | 'websiteCited' | 'citedUrls' | 'competitorsMentioned'>> = [];
    let provider: AiProviderKind | null = null;
    let model: string | null = null;

    for (const prompt of prompts) {
      const result = await this.capture(run.id, siteId, organizationId, observedAt, prompt, target);
      if (result) {
        stored.push(result.observation);
        provider = provider ?? result.provider;
        model = model ?? result.model;
      }
    }

    const completed: VisibilityRunStatus = stored.length > 0 ? 'COMPLETED' : 'FAILED';
    run.status = completed;
    run.provider = provider;
    run.model = model;
    run.observationsCount = stored.length;
    run.completedAt = new Date();
    if (stored.length === 0) {
      run.error = 'No observations could be captured (AI generation failed for every prompt).';
    }
    const savedRun = await this.runs.save(run);

    const metrics =
      stored.length > 0 && provider && model
        ? computeMetrics(stored, provider, model)
        : null;

    return this.toRunDto(savedRun, metrics);
  }

  async getRun(id: string): Promise<VisibilityRunDto> {
    const run = await this.runs.findOne({ where: { id } });
    if (!run) {
      throw new NotFoundException('Visibility run not found');
    }
    const observations = await this.observations.find({ where: { runId: id } });
    const provider = run.provider as AiProviderKind | null;
    const model = run.model;
    const metrics =
      observations.length > 0 && provider && model
        ? computeMetrics(
            observations.map((row) => ({
              brandMentioned: row.brandMentioned,
              websiteCited: row.websiteCited,
              citedUrls: row.citedUrls,
              competitorsMentioned: row.competitorsMentioned,
            })),
            provider,
            model,
          )
        : null;
    return this.toRunDto(run, metrics);
  }

  async listRuns(siteId: string): Promise<VisibilityRunDto[]> {
    const runs = await this.runs.find({ where: { siteId }, order: { observedAt: 'DESC', createdAt: 'DESC' } });
    const runIds = runs.map((run) => run.id);
    const all = runIds.length > 0 ? await this.observations.find({ where: { runId: In(runIds) } }) : [];
    const byRun = groupBy(all, (row) => row.runId);
    return runs.map((run) => {
      const rows = byRun.get(run.id) ?? [];
      const provider = run.provider as AiProviderKind | null;
      const model = run.model;
      const metrics =
        rows.length > 0 && provider && model
          ? computeMetrics(rows, provider, model)
          : null;
      return this.toRunDto(run, metrics);
    });
  }

  async listObservations(siteId: string, query: VisibilityObservationQuery = {}): Promise<VisibilityObservationDto[]> {
    const builder = this.observations
      .createQueryBuilder('obs')
      .where('obs.site_id = :siteId', { siteId })
      .orderBy('obs.observed_at', 'DESC')
      .limit(Math.min(query.limit ?? 50, 200))
      .offset(query.offset ?? 0);
    if (query.runId) builder.andWhere('obs.run_id = :runId', { runId: query.runId });
    if (query.category) builder.andWhere('obs.category = :category', { category: query.category });
    const rows = await builder.getMany();
    return rows.map((row) => this.toObservationDto(row));
  }

  async trends(siteId: string): Promise<VisibilityTrendsDto> {
    const runs = await this.runs.find({
      where: { siteId, status: 'COMPLETED' },
      order: { observedAt: 'ASC', createdAt: 'ASC' },
    });
    const runIds = runs.map((run) => run.id);
    const all = runIds.length > 0 ? await this.observations.find({ where: { runId: In(runIds) } }) : [];
    const byRun = groupBy(all, (row) => row.runId);

    const points: VisibilityTrendPointDto[] = [];
    for (const run of runs) {
      const rows = byRun.get(run.id) ?? [];
      const provider = run.provider as AiProviderKind | null;
      const model = run.model;
      if (!provider || !model || rows.length === 0) continue;
      points.push({
        runId: run.id,
        observedAt: run.observedAt,
        provider,
        model,
        metrics: computeMetrics(rows, provider, model),
      });
    }

    const latest = points[points.length - 1] ?? null;
    const previous = points[points.length - 2] ?? null;
    const provider = latest?.provider ?? 'OPENAI';
    const model = latest?.model ?? '';

    return {
      siteId,
      points,
      latestVsPrevious:
        latest && previous
          ? { latest, previous, deltas: trendDeltas(latest, previous) }
          : null,
      isControlledObservation: true,
      label: controlledObservationLabel(provider, model),
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private activePrompts(set: AiVisibilityPromptSet, categories?: VisibilityCategory[]): VisibilityPromptDto[] {
    let prompts = (set.prompts ?? []) as unknown as VisibilityPromptDto[];
    if (categories && categories.length > 0) {
      prompts = prompts.filter((prompt) => categories.includes(prompt.category));
    }
    return prompts;
  }

  private async capture(
    runId: string,
    siteId: string,
    organizationId: string | null,
    observedAt: string,
    prompt: VisibilityPromptDto,
    target: VisibilityTarget,
  ): Promise<{
    observation: Pick<VisibilityObservationDto, 'brandMentioned' | 'websiteCited' | 'citedUrls' | 'competitorsMentioned'>;
    provider: AiProviderKind;
    model: string;
  } | null> {
    try {
      const result = await this.ai.generateText(
        VISIBILITY_PROMPT_NAME,
        { prompt: prompt.prompt },
        { siteId, organizationId, workflow: VISIBILITY_WORKFLOW },
      );
      const response = result.text ?? '';
      const parsed = parseResponse({
        response,
        brand: target.brand,
        domain: target.domain,
        competitors: target.competitors,
      });
      const provider = result.provider as AiProviderKind;
      const model = result.model;

      await this.observations.save(
        this.observations.create({
          siteId,
          runId,
          category: prompt.category,
          prompt: prompt.prompt,
          provider,
          model,
          observedAt,
          response,
          brandMentioned: parsed.brandMentioned,
          websiteCited: parsed.websiteCited,
          citedUrls: parsed.citedUrls,
          competitorsMentioned: parsed.competitorsMentioned,
          context: parsed.context as unknown as Record<string, unknown>,
          confidence: parsed.confidence,
          error: null,
        }),
      );

      return {
        observation: {
          brandMentioned: parsed.brandMentioned,
          websiteCited: parsed.websiteCited,
          citedUrls: parsed.citedUrls,
          competitorsMentioned: parsed.competitorsMentioned,
        },
        provider,
        model,
      };
    } catch (error) {
      await this.observations.save(
        this.observations.create({
          siteId,
          runId,
          category: prompt.category,
          prompt: prompt.prompt,
          provider: '',
          model: '',
          observedAt,
          response: '',
          brandMentioned: false,
          websiteCited: false,
          citedUrls: [],
          competitorsMentioned: [],
          context: {},
          confidence: 0,
          error: error instanceof Error ? error.message.slice(0, 500) : 'unknown AI failure',
        }),
      );
      return null;
    }
  }

  private toPromptSetDto(row: AiVisibilityPromptSet): VisibilityPromptSetDto {
    return {
      id: row.id,
      siteId: row.siteId,
      name: row.name,
      prompts: (row.prompts ?? []) as unknown as VisibilityPromptDto[],
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toRunDto(run: AiVisibilityRun, metrics: VisibilityMetricsDto | null): VisibilityRunDto {
    return {
      id: run.id,
      siteId: run.siteId,
      organizationId: run.organizationId,
      provider: run.provider as AiProviderKind | null,
      model: run.model,
      status: run.status as VisibilityRunStatus,
      observedAt: run.observedAt,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      observationsCount: run.observationsCount,
      metrics,
      error: run.error,
      createdAt: run.createdAt.toISOString(),
    };
  }

  private toObservationDto(row: AiVisibilityObservation): VisibilityObservationDto {
    return {
      id: row.id,
      siteId: row.siteId,
      runId: row.runId,
      category: row.category as VisibilityCategory,
      prompt: row.prompt,
      provider: row.provider as AiProviderKind,
      model: row.model,
      observedAt: row.observedAt,
      response: row.response,
      brandMentioned: row.brandMentioned,
      websiteCited: row.websiteCited,
      citedUrls: row.citedUrls,
      competitorsMentioned: row.competitorsMentioned,
      context: row.context,
      confidence: row.confidence,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function targetContext(target: VisibilityTarget): PromptSetContext {
  return {
    industry: target.industry,
    product: target.product,
    location: target.location,
    problem: target.problem,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k) ?? [];
    bucket.push(item);
    map.set(k, bucket);
  }
  return map;
}

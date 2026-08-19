import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { AutomationExecutorService } from '@creative-seo/automation';
import { BaselineService, OperationsService } from '@creative-seo/operations';
import { ContentPipelineService, type PipelineInput } from '@creative-seo/content';
import { VisibilityService, type VisibilityTarget } from '@creative-seo/visibility';
import { ReportingService } from '@creative-seo/reporting';
import type { BaselineType, GenerateReportRequest, ReportType } from '@creative-seo/types';
import { Repository } from 'typeorm';
import { Worker } from 'bullmq';
import { QueueManager } from './queue-manager';
import { WorkerConfig } from '../config/worker-config';

const PROCESSED_QUEUES = ['content', 'reports', 'ai-visibility', 'automation'] as const;
type ProcessedQueue = (typeof PROCESSED_QUEUES)[number];

interface JobData {
  siteId?: string;
  organizationId?: string | null;
  kind?: 'snapshot' | 'report' | 'gc06-run' | 'gc06-snapshot' | 'gc06-baseline';
  type?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  createdBy?: string | null;
  runId?: string;
  operation?: string;
  priorityPromptOnly?: boolean;
}

/**
 * BullMQ processors for the queues the platform actually produces work for
 * (content pipeline, reports/snapshots, AI visibility, recurring automation).
 * Each handler executes the package-level service and records a failure alert —
 * scheduled jobs never fail silently. The automation executor records its own
 * run status and failure issue, so automation failures are not double-reported.
 * `crawler` and `gsc-sync` queues remain reserved for n8n / future producers.
 */
@Injectable()
export class QueueProcessor implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(QueueProcessor.name);
  private workers: Worker[] = [];

  constructor(
    private readonly config: WorkerConfig,
    private readonly queues: QueueManager,
    private readonly content: ContentPipelineService,
    private readonly baselines: BaselineService,
    private readonly reporting: ReportingService,
    private readonly visibility: VisibilityService,
    private readonly operations: OperationsService,
    private readonly automation: AutomationExecutorService,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
  ) {}

  onModuleInit(): void {
    const concurrencyMap: Record<ProcessedQueue, number> = {
      content: this.config.concurrency.content,
      reports: this.config.concurrency.reports,
      'ai-visibility': this.config.concurrency.aiVisibility,
      automation: this.config.concurrency.automation,
    };
    for (const name of PROCESSED_QUEUES) {
      const worker = new Worker(name, (job) => this.handle(name, job), {
        connection: this.queues.connection,
        concurrency: concurrencyMap[name] ?? 1,
      });
      worker.on('failed', (job, error) => this.logger.error(`queue=${name} job=${job?.id} failed: ${error.message}`));
      worker.on('error', (error) => this.logger.error(`queue=${name} worker error: ${error.message}`));
      this.workers.push(worker);
    }
    this.logger.log(`Queue processors started: ${PROCESSED_QUEUES.join(', ')} (concurrency: ${JSON.stringify(concurrencyMap)})`);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close().catch(() => undefined)));
  }

  private async handle(queue: ProcessedQueue, job: import('bullmq').Job<JobData>): Promise<unknown> {
    const data = job.data;
    try {
      switch (queue) {
        case 'content':
          return this.runContent(data as unknown as PipelineInput);
        case 'reports':
          return this.runReports(data);
        case 'ai-visibility':
          return this.runVisibility(data);
        case 'automation':
          return this.runAutomation(data);
      }
    } catch (error) {
      if (queue !== 'automation') {
        await this.recordFailure(data, queue, error).catch(() => undefined);
      }
      throw error;
    }
  }

  private async runContent(input: PipelineInput): Promise<{ status: string; packageId: string }> {
    const pkg = await this.content.run(input);
    return { status: 'ok', packageId: pkg.id };
  }

  private async runReports(data: JobData): Promise<{ status: string; id: string }> {
    const siteId = requireSiteId(data);
    if (data.kind === 'snapshot') {
      const dto = await this.baselines.capture(siteId, data.organizationId ?? null, data.type as BaselineType, data.createdBy ?? null);
      return { status: 'ok', id: dto.id };
    }
    const req: GenerateReportRequest = {
      type: (data.type as ReportType) ?? 'MONTHLY',
      periodStart: data.periodStart ?? null,
      periodEnd: data.periodEnd ?? null,
    };
    const report = await this.reporting.generate(siteId, data.organizationId ?? null, req, data.createdBy ?? null);
    return { status: 'ok', id: report.id };
  }

  private async runVisibility(data: JobData): Promise<{ status: string; id: string }> {
    const siteId = requireSiteId(data);
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) throw new Error(`Site ${siteId} not found`);
    const settings = (site.settings ?? {}) as { competitors?: string[]; industry?: string; product?: string; problem?: string };
    const target: VisibilityTarget = {
      brand: site.name,
      domain: site.domain,
      competitors: settings.competitors ?? [],
      industry: settings.industry ?? '',
      product: settings.product ?? '',
      location: site.country ?? '',
      problem: settings.problem ?? '',
    };

    if (data.kind === 'gc06-run') {
      const run = await this.visibility.run(siteId, data.organizationId ?? null, target, {
        categories: data.priorityPromptOnly ? ['BRAND', 'COMMERCIAL', 'DECISION'] : undefined,
      }, null);
      return { status: 'ok', id: run.id };
    }

    const run = await this.visibility.run(siteId, data.organizationId ?? null, target, {}, null);
    return { status: 'ok', id: run.id };
  }

  private async runAutomation(data: JobData): Promise<{ status: string }> {
    if (!data.runId) throw new Error('Automation job payload missing runId');
    const status = await this.automation.executeRun(data.runId);
    return { status };
  }

  private async recordFailure(data: JobData, queue: string, error: unknown): Promise<void> {
    await this.operations.createIssue(
      requireSiteId(data),
      data.organizationId ?? null,
      {
        kind: 'ORCHESTRATION',
        severity: 'HIGH',
        title: `Scheduled job failed (${queue})`,
        description: error instanceof Error ? error.message.slice(0, 2000) : 'unknown scheduled job failure',
        url: null,
        data: { queue },
      },
      { source: 'CRAWLER' },
    );
  }
}

function requireSiteId(data: JobData): string {
  if (!data.siteId) throw new Error('Job payload missing siteId');
  return data.siteId;
}

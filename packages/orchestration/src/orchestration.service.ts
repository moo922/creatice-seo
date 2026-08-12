import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { WorkflowJob } from '@creative-seo/database';
import { loadAppEnv } from '@creative-seo/config';
import { OperationsService } from '@creative-seo/operations';
import type {
  CreateOrchestrationJobRequest,
  N8nCallbackRequest,
  OrchestrationJobDto,
  OrchestrationJobQuery,
} from '@creative-seo/types';
import { Repository } from 'typeorm';
import { isKnownWorkflow, workflowDefinition } from './workflows';
import { buildDispatchPayload, isTerminalStatus, issueKindFor, shouldRetry } from './logic';

const MONITOR_INTERVAL_MS = 15_000;

/**
 * Backend-owned n8n orchestration. Jobs are created in PostgreSQL, dispatched
 * to the matching n8n webhook, and completed via a callback webhook that only
 * the backend can reconcile (idempotency keys make repeats safe). Jobs are
 * retried up to max_attempts and timed out; failures update the job status and
 * create an operational alert. n8n never owns business state.
 */
@Injectable()
export class OrchestrationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrchestrationService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    @InjectRepository(WorkflowJob) private readonly jobs: Repository<WorkflowJob>,
    private readonly operations: OperationsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick().catch((error) => this.logger.warn(`orchestration tick failed: ${String(error)}`)), MONITOR_INTERVAL_MS);
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // -------------------------------------------------------------------------
  // Create + dispatch
  // -------------------------------------------------------------------------

  async createAndDispatch(
    siteId: string,
    organizationId: string | null,
    input: CreateOrchestrationJobRequest,
    createdBy: string | null,
  ): Promise<OrchestrationJobDto> {
    if (!isKnownWorkflow(input.workflow)) {
      throw new BadRequestException(`Unknown orchestration workflow "${input.workflow}"`);
    }
    if (input.idempotencyKey) {
      const existing = await this.jobs.findOne({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) {
        return this.toDto(existing);
      }
    }
    const def = workflowDefinition(input.workflow);
    const job = await this.jobs.save(
      this.jobs.create({
        siteId,
        organizationId,
        workflow: input.workflow,
        status: 'PENDING',
        payload: input.payload ?? {},
        idempotencyKey: input.idempotencyKey ?? null,
        attempts: 0,
        maxAttempts: def.maxAttempts,
        timeoutMs: def.timeoutMs,
        error: null,
        n8nExecutionId: null,
        createdBy,
        startedAt: null,
        completedAt: null,
      }),
    );
    await this.dispatch(job);
    return this.toDto(await this.requireJob(job.id));
  }

  async listJobs(siteId: string, query: OrchestrationJobQuery = {}): Promise<OrchestrationJobDto[]> {
    const builder = this.jobs
      .createQueryBuilder('job')
      .where('job.site_id = :siteId', { siteId })
      .orderBy('job.created_at', 'DESC')
      .limit(Math.min(query.limit ?? 50, 200))
      .offset(query.offset ?? 0);
    if (query.status) builder.andWhere('job.status = :status', { status: query.status });
    if (query.workflow) builder.andWhere('job.workflow = :workflow', { workflow: query.workflow });
    const rows = await builder.getMany();
    return rows.map((row) => this.toDto(row));
  }

  async listAllJobs(query: OrchestrationJobQuery = {}): Promise<OrchestrationJobDto[]> {
    const builder = this.jobs
      .createQueryBuilder('job')
      .orderBy('job.created_at', 'DESC')
      .limit(Math.min(query.limit ?? 100, 200))
      .offset(query.offset ?? 0);
    if (query.status) builder.andWhere('job.status = :status', { status: query.status });
    if (query.workflow) builder.andWhere('job.workflow = :workflow', { workflow: query.workflow });
    const rows = await builder.getMany();
    return rows.map((row) => this.toDto(row));
  }

  async getJob(id: string): Promise<OrchestrationJobDto> {
    return this.toDto(await this.requireJob(id));
  }

  // -------------------------------------------------------------------------
  // Callback (n8n -> backend)
  // -------------------------------------------------------------------------

  /**
   * Applies an n8n callback. Idempotent: once a job is terminal, repeated
   * callbacks for the same idempotency key are ignored.
   */
  async handleCallback(body: N8nCallbackRequest): Promise<{ status: 'ignored' | 'updated' }> {
    const job = body.idempotencyKey
      ? await this.jobs.findOne({ where: { idempotencyKey: body.idempotencyKey } })
      : body.jobId
        ? await this.jobs.findOne({ where: { id: body.jobId } })
        : null;
    if (!job) {
      return { status: 'ignored' };
    }
    if (isTerminalStatus(job.status)) {
      return { status: 'ignored' };
    }

    job.n8nExecutionId = body.executionId ?? null;
    if (body.status === 'SUCCEEDED') {
      job.status = 'SUCCEEDED';
      job.result = body.result ?? null;
      job.completedAt = new Date();
      await this.jobs.save(job);
    } else {
      await this.handleFailure(job, body.error ?? 'n8n workflow reported failure');
    }
    return { status: 'updated' };
  }

  private async dispatch(job: WorkflowJob): Promise<void> {
    const env = loadAppEnv();
    if (!env.N8N_BASE_URL) {
      await this.handleFailure(job, 'n8n is not configured (N8N_BASE_URL is empty)');
      return;
    }

    // Atomic claim: only one worker instance can transition a PENDING job to
    // RUNNING, so two API instances can never dispatch the same job twice.
    const claimed = await this.jobs.update(
      { id: job.id, status: 'PENDING' },
      {
        status: 'RUNNING',
        attempts: () => '"attempts" + 1',
        startedAt: new Date(),
        error: null,
      },
    );
    if ((claimed.affected ?? 0) === 0) {
      return;
    }
    const current = await this.requireJob(job.id);

    const def = workflowDefinition(current.workflow);
    const webhookBase = env.N8N_WEBHOOK_BASE || `${env.N8N_BASE_URL}/webhook`;
    const url = `${webhookBase}${def.webhookPath}`;
    const callbackUrl = `${env.API_PUBLIC_URL}/api/webhooks/n8n/callback`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.N8N_WEBHOOK_TIMEOUT_MS);
    try {
      const payload = buildDispatchPayload({
        jobId: current.id,
        idempotencyKey: current.idempotencyKey,
        workflow: current.workflow,
        siteId: current.siteId,
        organizationId: current.organizationId,
        payload: current.payload,
        callbackUrl,
        timeoutMs: current.timeoutMs,
      });
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        await this.handleFailure(current, `n8n webhook returned HTTP ${response.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown dispatch failure';
      await this.handleFailure(current, `n8n dispatch failed: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async handleFailure(job: WorkflowJob, error: string): Promise<void> {
    const final = !shouldRetry(job.attempts, job.maxAttempts);
    job.error = error.slice(0, 2000);
    if (final) {
      job.status = 'FAILED';
      job.completedAt = new Date();
      await this.jobs.save(job);
      await this.createFailureAlert(job, error);
    } else {
      // Requeue for the monitor to re-dispatch.
      job.status = 'PENDING';
      job.startedAt = null;
      await this.jobs.save(job);
    }
  }

  private async handleTimeout(job: WorkflowJob): Promise<void> {
    const final = !shouldRetry(job.attempts, job.maxAttempts);
    const error = `n8n did not respond within ${job.timeoutMs}ms`;
    job.error = error;
    if (final) {
      job.status = 'TIMEOUT';
      job.completedAt = new Date();
      await this.jobs.save(job);
      await this.createFailureAlert(job, error);
    } else {
      job.status = 'PENDING';
      job.startedAt = null;
      await this.jobs.save(job);
    }
  }

  private async createFailureAlert(job: WorkflowJob, error: string): Promise<void> {
    try {
      const def = workflowDefinition(job.workflow);
      await this.operations.createIssue(
        job.siteId,
        job.organizationId,
        {
          kind: issueKindFor(job.workflow),
          severity: 'HIGH',
          title: `n8n workflow failed: ${def.name}`,
          description: error.slice(0, 2000),
          url: null,
          data: { workflow: job.workflow, jobId: job.id, attempts: job.attempts, error },
        },
        { source: 'N8N' },
      );
    } catch (alertError) {
      this.logger.warn(`Failed to create alert for job ${job.id}: ${String(alertError)}`);
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.dispatchPending();
      await this.failTimedOut();
    } finally {
      this.ticking = false;
    }
  }

  private async dispatchPending(): Promise<void> {
    const pending = await this.jobs.find({ where: { status: 'PENDING' }, order: { createdAt: 'ASC' } });
    for (const job of pending) {
      await this.dispatch(job);
    }
  }

  private async failTimedOut(): Promise<void> {
    const running = await this.jobs.find({ where: { status: 'RUNNING' } });
    const now = Date.now();
    for (const job of running) {
      const started = job.startedAt?.getTime() ?? 0;
      if (now - started > job.timeoutMs) {
        await this.handleTimeout(job);
      }
    }
  }

  private async requireJob(id: string): Promise<WorkflowJob> {
    const row = await this.jobs.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Orchestration job not found');
    }
    return row;
  }

  private toDto(row: WorkflowJob): OrchestrationJobDto {
    return {
      id: row.id,
      siteId: row.siteId,
      organizationId: row.organizationId,
      workflow: row.workflow as OrchestrationJobDto['workflow'],
      status: row.status as OrchestrationJobDto['status'],
      payload: row.payload,
      result: row.result,
      idempotencyKey: row.idempotencyKey,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      timeoutMs: row.timeoutMs,
      error: row.error,
      n8nExecutionId: row.n8nExecutionId,
      createdBy: row.createdBy,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

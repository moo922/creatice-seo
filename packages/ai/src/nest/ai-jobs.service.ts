import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AiJob } from '@creative-seo/database';
import { Repository } from 'typeorm';
import type { AiJobKind, AiJobRecorder, AiJobUpdate, NewAiJob } from '../contracts';
import type { AiJobDto, AiJobsQuery } from '@creative-seo/types';

/**
 * Persists every AI job and its attempt/final state (TypeORM implementation of
 * AiJobRecorder). Error text is sanitized upstream in the provider/router layer,
 * so rows never contain API keys.
 */
@Injectable()
export class AiJobsService implements AiJobRecorder {
  constructor(
    @InjectRepository(AiJob)
    private readonly jobs: Repository<AiJob>,
  ) {}

  async createJob(job: NewAiJob): Promise<string> {
    const row = this.jobs.create({
      siteId: job.siteId,
      organizationId: job.organizationId,
      workflow: job.workflow,
      promptName: job.promptName,
      promptVersion: job.promptVersion,
      kind: job.kind,
      provider: job.provider,
      model: job.model,
      status: 'RUNNING',
      attempts: 0,
    });
    const saved = await this.jobs.save(row);
    return saved.id;
  }

  async updateJob(jobId: string, update: AiJobUpdate): Promise<void> {
    type JobPatch = Parameters<Repository<AiJob>['update']>[1];
    const patch: JobPatch = {};
    if (update.status !== undefined) patch.status = update.status;
    if (update.attempts !== undefined) patch.attempts = update.attempts;
    if (update.provider !== undefined) patch.provider = update.provider;
    if (update.model !== undefined) patch.model = update.model;
    if (update.inputTokens !== undefined) patch.inputTokens = update.inputTokens;
    if (update.outputTokens !== undefined) patch.outputTokens = update.outputTokens;
    if (update.costUsd !== undefined) patch.costUsd = update.costUsd === null ? null : String(update.costUsd);
    if (update.latencyMs !== undefined) patch.latencyMs = update.latencyMs;
    if (update.error !== undefined) patch.error = update.error;
    if (update.completedAt !== undefined) patch.completedAt = update.completedAt;
    await this.jobs.update(jobId, patch);
  }

  async markRunning(id: string): Promise<void> {
    await this.jobs.update(id, { status: 'RUNNING', completedAt: null, error: null });
  }

  async list(query: AiJobsQuery): Promise<AiJobDto[]> {
    const where: Record<string, unknown> = {};
    if (query.siteId) where.siteId = query.siteId;
    if (query.workflow) where.workflow = query.workflow;
    if (query.status) where.status = query.status;
    const rows = await this.jobs.find({
      where,
      order: { createdAt: 'DESC' },
      take: Math.min(query.limit ?? 50, 200),
    });
    return rows.map((row) => this.toDto(row));
  }

  async get(id: string): Promise<AiJobDto | null> {
    const row = await this.jobs.findOne({ where: { id } });
    return row ? this.toDto(row) : null;
  }

  private toDto(row: AiJob): AiJobDto {
    return {
      id: row.id,
      siteId: row.siteId,
      workflow: row.workflow,
      promptName: row.promptName,
      promptVersion: row.promptVersion,
      kind: row.kind as AiJobKind,
      provider: row.provider as AiJobDto['provider'],
      model: row.model,
      status: row.status as AiJobDto['status'],
      attempts: row.attempts,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      costUsd: row.costUsd !== null ? Number(row.costUsd) : null,
      latencyMs: row.latencyMs,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    };
  }
}

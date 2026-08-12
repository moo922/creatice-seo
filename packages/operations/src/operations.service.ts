import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ChangeLog, Issue, OperationsTask, Recommendation } from '@creative-seo/database';
import { AiService } from '@creative-seo/ai';
import type {
  ChangeLogDto,
  CreateChangeLogRequest,
  CreateIssueRequest,
  CreateRecommendationRequest,
  CreateTaskRequest,
  IssueDto,
  IssueSnapshotEntry,
  OperationsQuery,
  RecommendationDto,
  TaskDto,
  UpdateIssueRequest,
  UpdateTaskRequest,
} from '@creative-seo/types';
import { Repository } from 'typeorm';
import { deterministicPriority } from './scoring';

const RESOLVED_STATUS = 'RESOLVED';

/**
 * Core operations service: issues (lifecycle DETECTED -> ... -> RESOLVED),
 * recommendations (deterministic metrics + optional AI explanation), tasks and
 * the change log. AI may explain a recommendation but never invents the
 * underlying metrics.
 */
@Injectable()
export class OperationsService {
  constructor(
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(Recommendation) private readonly recommendations: Repository<Recommendation>,
    @InjectRepository(OperationsTask) private readonly tasks: Repository<OperationsTask>,
    @InjectRepository(ChangeLog) private readonly logs: Repository<ChangeLog>,
    private readonly ai: AiService,
  ) {}

  // -------------------------------------------------------------------------
  // Issues
  // -------------------------------------------------------------------------

  async createIssue(
    siteId: string,
    organizationId: string | null,
    input: CreateIssueRequest,
    options: { source?: IssueDto['source']; alertId?: string | null } = {},
  ): Promise<IssueDto> {
    const row = this.issues.create({
      siteId,
      organizationId,
      kind: input.kind,
      severity: input.severity,
      title: input.title,
      description: input.description ?? '',
      url: input.url ?? null,
      status: 'DETECTED',
      source: options.source ?? input.source ?? 'MANUAL',
      alertId: options.alertId ?? null,
      data: input.data ?? {},
      note: null,
      detectedAt: new Date(),
      resolvedAt: null,
    });
    const saved = await this.issues.save(row);
    return this.toIssueDto(saved);
  }

  async updateIssueStatus(id: string, update: UpdateIssueRequest): Promise<IssueDto> {
    const row = await this.requireIssue(id);
    if (update.status) {
      row.status = update.status;
      if (update.status === RESOLVED_STATUS) {
        row.resolvedAt = new Date();
      } else {
        row.resolvedAt = null;
      }
    }
    if (update.note !== undefined) {
      row.note = update.note;
    }
    await this.issues.save(row);
    return this.toIssueDto(row);
  }

  async listIssues(siteId: string, query: OperationsQuery = {}): Promise<IssueDto[]> {
    return this.queryIssues({ siteId, ...query });
  }

  /** Cross-site issue listing (admin/agency view); optional siteId filter. */
  async listIssuesGlobal(query: OperationsQuery = {}): Promise<IssueDto[]> {
    return this.queryIssues(query);
  }

  private async queryIssues(query: OperationsQuery): Promise<IssueDto[]> {
    const builder = this.issues
      .createQueryBuilder('issue')
      .orderBy('issue.detected_at', 'DESC')
      .limit(Math.min(query.limit ?? 50, 200))
      .offset(query.offset ?? 0);
    if (query.siteId) builder.andWhere('issue.site_id = :siteId', { siteId: query.siteId });
    if (query.status) builder.andWhere('issue.status = :status', { status: query.status });
    if (query.kind) builder.andWhere('issue.kind = :kind', { kind: query.kind });
    if (query.url) builder.andWhere('issue.url = :url', { url: query.url });
    const rows = await builder.getMany();
    return rows.map((row) => this.toIssueDto(row));
  }

  async getIssue(id: string): Promise<IssueDto> {
    return this.toIssueDto(await this.requireIssue(id));
  }

  /** Issues snapshot (id + status) used by immutable baseline snapshots. */
  async getIssueSnapshot(siteId: string): Promise<IssueSnapshotEntry[]> {
    const rows = await this.issues.find({ where: { siteId }, select: ['id', 'status'] });
    return rows.map((row) => ({ id: row.id, status: row.status as IssueSnapshotEntry['status'] }));
  }

  // -------------------------------------------------------------------------
  // Recommendations
  // -------------------------------------------------------------------------

  async createRecommendation(
    siteId: string,
    organizationId: string | null,
    input: CreateRecommendationRequest,
  ): Promise<RecommendationDto> {
    const issue = await this.requireIssue(input.issueId);
    const { priority } = deterministicPriority({
      impact: input.impact,
      confidence: input.confidence,
      effort: input.effort,
    });

    let reason = input.reason ?? '';
    const suggestedAction = input.suggestedAction ?? '';
    let aiExplained = false;
    if (input.aiExplain) {
      const explanation = await this.explain(siteId, issue.title, issue.kind, input, organizationId);
      if (explanation) {
        reason = reason ? `${reason}\n\n${explanation}` : explanation;
        aiExplained = true;
      }
    }

    const row = this.recommendations.create({
      siteId,
      issueId: issue.id,
      title: input.title,
      evidence: input.evidence,
      reason,
      impact: clampMetric(input.impact),
      confidence: clampMetric(input.confidence),
      effort: clampMetric(input.effort),
      priority,
      suggestedAction,
      aiExplained,
    });
    const saved = await this.recommendations.save(row);
    return {
      id: saved.id,
      issueId: saved.issueId,
      siteId: saved.siteId,
      title: saved.title,
      evidence: saved.evidence,
      reason: saved.reason,
      impact: saved.impact,
      confidence: saved.confidence,
      effort: saved.effort,
      priority: saved.priority as RecommendationDto['priority'],
      suggestedAction: saved.suggestedAction,
      aiExplained: saved.aiExplained,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async listRecommendations(siteId: string, issueId?: string): Promise<RecommendationDto[]> {
    const where = { siteId } as Record<string, unknown>;
    if (issueId) where.issueId = issueId;
    const rows = await this.recommendations.find({ where, order: { createdAt: 'DESC' } });
    return rows.map((row) => ({
      id: row.id,
      issueId: row.issueId,
      siteId: row.siteId,
      title: row.title,
      evidence: row.evidence,
      reason: row.reason,
      impact: row.impact,
      confidence: row.confidence,
      effort: row.effort,
      priority: row.priority as RecommendationDto['priority'],
      suggestedAction: row.suggestedAction,
      aiExplained: row.aiExplained,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------

  async createTask(siteId: string, input: CreateTaskRequest, createdBy: string | null): Promise<TaskDto> {
    const row = this.tasks.create({
      siteId,
      issueId: input.issueId ?? null,
      recommendationId: input.recommendationId ?? null,
      title: input.title,
      url: input.url ?? null,
      assigneeId: input.assigneeId ?? null,
      deadline: input.deadline ? new Date(input.deadline) : null,
      status: 'TODO',
      internalNotes: input.internalNotes ?? '',
      clientNotes: input.clientNotes ?? '',
      evidence: input.evidence ?? '',
      createdBy,
    });
    const saved = await this.tasks.save(row);
    return this.toTaskDto(saved);
  }

  async updateTask(id: string, update: UpdateTaskRequest): Promise<TaskDto> {
    const row = await this.requireTask(id);
    if (update.status) row.status = update.status;
    if (update.assigneeId !== undefined) row.assigneeId = update.assigneeId;
    if (update.deadline !== undefined) row.deadline = update.deadline ? new Date(update.deadline) : null;
    if (update.internalNotes !== undefined) row.internalNotes = update.internalNotes;
    if (update.clientNotes !== undefined) row.clientNotes = update.clientNotes;
    await this.tasks.save(row);
    return this.toTaskDto(row);
  }

  async listTasks(siteId: string, query: OperationsQuery = {}): Promise<TaskDto[]> {
    return this.queryTasks({ siteId, ...query });
  }

  /** Cross-site task listing (admin/agency view); optional siteId filter. */
  async listTasksGlobal(query: OperationsQuery = {}): Promise<TaskDto[]> {
    return this.queryTasks(query);
  }

  private async queryTasks(query: OperationsQuery): Promise<TaskDto[]> {
    const builder = this.tasks
      .createQueryBuilder('task')
      .orderBy('task.created_at', 'DESC')
      .limit(Math.min(query.limit ?? 50, 200))
      .offset(query.offset ?? 0);
    if (query.siteId) builder.andWhere('task.site_id = :siteId', { siteId: query.siteId });
    if (query.status) builder.andWhere('task.status = :status', { status: query.status });
    if (query.url) builder.andWhere('task.url = :url', { url: query.url });
    const rows = await builder.getMany();
    return rows.map((row) => this.toTaskDto(row));
  }

  // -------------------------------------------------------------------------
  // Change log
  // -------------------------------------------------------------------------

  async createChangeLog(
    siteId: string,
    organizationId: string | null,
    input: CreateChangeLogRequest,
    changedBy: string | null,
  ): Promise<ChangeLogDto> {
    const row = this.logs.create({
      siteId,
      organizationId,
      pageUrl: input.pageUrl,
      taskId: input.taskId ?? null,
      changeType: input.changeType,
      before: input.before ?? null,
      after: input.after,
      changedBy,
      changedAt: new Date(),
    });
    const saved = await this.logs.save(row);
    return this.toChangeLogDto(saved);
  }

  async listChangeLogs(siteId: string, query: OperationsQuery = {}): Promise<ChangeLogDto[]> {
    const builder = this.logs
      .createQueryBuilder('log')
      .where('log.site_id = :siteId', { siteId })
      .orderBy('log.changed_at', 'DESC')
      .limit(Math.min(query.limit ?? 50, 200))
      .offset(query.offset ?? 0);
    if (query.url) builder.andWhere('log.page_url = :url', { url: query.url });
    const rows = await builder.getMany();
    return rows.map((row) => this.toChangeLogDto(row));
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async explain(
    siteId: string,
    issueTitle: string,
    issueKind: string,
    input: CreateRecommendationRequest,
    organizationId: string | null,
  ): Promise<string> {
    try {
      const result = await this.ai.generateText(
        'recommendation-explainer',
        {
          issue: `${issueTitle} (${issueKind})`,
          evidence: input.evidence,
          impact: String(clampMetric(input.impact)),
          confidence: String(clampMetric(input.confidence)),
          effort: String(clampMetric(input.effort)),
        },
        { siteId, organizationId, workflow: 'operations-recommendation' },
      );
      return result.text ?? '';
    } catch {
      // Explanation is optional; a provider failure must not block the recommendation.
      return '';
    }
  }

  private async requireIssue(id: string): Promise<Issue> {
    const row = await this.issues.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Issue not found');
    }
    return row;
  }

  private async requireTask(id: string): Promise<OperationsTask> {
    const row = await this.tasks.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Task not found');
    }
    return row;
  }

  private toIssueDto(row: Issue): IssueDto {
    return {
      id: row.id,
      siteId: row.siteId,
      organizationId: row.organizationId,
      kind: row.kind as IssueDto['kind'],
      severity: row.severity as IssueDto['severity'],
      title: row.title,
      description: row.description,
      url: row.url,
      status: row.status as IssueDto['status'],
      source: row.source as IssueDto['source'],
      alertId: row.alertId,
      data: row.data,
      note: row.note,
      detectedAt: row.detectedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toTaskDto(row: OperationsTask): TaskDto {
    return {
      id: row.id,
      siteId: row.siteId,
      issueId: row.issueId,
      recommendationId: row.recommendationId,
      title: row.title,
      url: row.url,
      assigneeId: row.assigneeId,
      deadline: row.deadline?.toISOString() ?? null,
      status: row.status as TaskDto['status'],
      internalNotes: row.internalNotes,
      clientNotes: row.clientNotes,
      evidence: row.evidence,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toChangeLogDto(row: ChangeLog): ChangeLogDto {
    return {
      id: row.id,
      siteId: row.siteId,
      organizationId: row.organizationId,
      pageUrl: row.pageUrl,
      taskId: row.taskId,
      changeType: row.changeType as ChangeLogDto['changeType'],
      before: row.before,
      after: row.after,
      changedBy: row.changedBy,
      changedAt: row.changedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function clampMetric(value: number): number {
  return Math.min(100, Math.max(0, value));
}

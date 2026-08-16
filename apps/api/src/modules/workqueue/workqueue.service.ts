import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AiJob,
  AiVisibilityRun,
  AutomationRun,
  BaselineSnapshot,
  Cluster,
  ContentPackage,
  ContentPublication,
  GscProperty,
  GscSiteDailyMetric,
  Issue,
  LinkSuggestion,
  OperationsTask,
  Recommendation,
  Report,
  Site,
  SiteMembership,
  User,
  WordPressIntegration,
  WorkFilter,
  WorkItemState,
  WorkflowJob,
} from '@creative-seo/database';
import type {
  WorkBulkActionDto,
  WorkBulkResultDto,
  WorkFilterCriteriaDto,
  WorkFilterDto,
  WorkItemDto,
  WorkItemPriority,
  WorkItemSiteDto,
  WorkQueueResponseDto,
  WorkQueueSummaryDto,
} from '@creative-seo/types';
import type { AuthPrincipal } from '../../common/auth.types';
import { ActivityLogService } from '../activity-log/activity-log.service';
import type { SaveWorkFilterDto, WorkQueueQueryDto } from './workqueue.dto';

const CLOSED_ISSUE_STATUSES = ['RESOLVED', 'IGNORED'];
const OPEN_ISSUE_STATUSES = ['DETECTED', 'REVIEWED', 'APPROVED', 'IN_PROGRESS', 'FIXED', 'VERIFYING'];
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const RECENT_DAYS = 30;

/** Lazy-seeded standard quick views (one copy per user). */
const BUILTIN_FILTERS: Array<{ name: string; criteria: WorkFilterCriteriaDto }> = [
  { name: 'Critical Today', criteria: { priorities: ['CRITICAL'], statuses: ['PENDING', 'IN_PROGRESS'] } },
  { name: 'Content Waiting Approval', criteria: { types: ['content_approval', 'pending_review'], statuses: ['PENDING'] } },
  { name: 'Client Reports Due', criteria: { types: ['report_due'], statuses: ['PENDING'] } },
  { name: 'Sites Declining', criteria: { types: ['visibility_loss'], statuses: ['PENDING'] } },
  { name: 'Technical Fixes', criteria: { types: ['critical_issue', 'recommendation', 'overdue_task'], statuses: ['PENDING', 'IN_PROGRESS'] } },
  { name: 'Content Opportunities', criteria: { types: ['pending_review'], sources: ['links', 'keywords'], statuses: ['PENDING'] } },
];

/**
 * Unified agency work queue. The queue is an aggregation over the live domain
 * tables (issues, recommendations, tasks, content, links, jobs, reports,
 * integrations) computed on demand — the only persisted data is per-item triage
 * state (`work_item_states`) and saved filters (`work_filters`).
 */
@Injectable()
export class WorkQueueService {
  private readonly logger = new Logger(WorkQueueService.name);

  constructor(
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(SiteMembership) private readonly memberships: Repository<SiteMembership>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(Recommendation) private readonly recommendations: Repository<Recommendation>,
    @InjectRepository(OperationsTask) private readonly tasks: Repository<OperationsTask>,
    @InjectRepository(ContentPackage) private readonly packages: Repository<ContentPackage>,
    @InjectRepository(ContentPublication) private readonly publications: Repository<ContentPublication>,
    @InjectRepository(LinkSuggestion) private readonly linkSuggestions: Repository<LinkSuggestion>,
    @InjectRepository(Cluster) private readonly clusters: Repository<Cluster>,
    @InjectRepository(AutomationRun) private readonly automationRuns: Repository<AutomationRun>,
    @InjectRepository(WorkflowJob) private readonly workflowJobs: Repository<WorkflowJob>,
    @InjectRepository(AiVisibilityRun) private readonly visibilityRuns: Repository<AiVisibilityRun>,
    @InjectRepository(AiJob) private readonly aiJobs: Repository<AiJob>,
    @InjectRepository(Report) private readonly reports: Repository<Report>,
    @InjectRepository(GscProperty) private readonly gscProperties: Repository<GscProperty>,
    @InjectRepository(WordPressIntegration) private readonly wpIntegrations: Repository<WordPressIntegration>,
    @InjectRepository(BaselineSnapshot) private readonly baselines: Repository<BaselineSnapshot>,
    @InjectRepository(GscSiteDailyMetric) private readonly gscMetrics: Repository<GscSiteDailyMetric>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(WorkItemState) private readonly states: Repository<WorkItemState>,
    @InjectRepository(WorkFilter) private readonly filters: Repository<WorkFilter>,
    private readonly activities: ActivityLogService,
  ) {}

  // -------------------------------------------------------------------------
  // Queue
  // -------------------------------------------------------------------------

  async list(user: AuthPrincipal, query: WorkQueueQueryDto, siteScope?: string): Promise<WorkQueueResponseDto> {
    let siteIds = await this.authorizedSiteIds(user);
    if (siteScope) siteIds = siteIds.filter((id) => id === siteScope);
    const requested = splitList(query.sites);
    if (requested.length > 0) siteIds = siteIds.filter((id) => requested.includes(id));
    if (siteIds.length === 0) {
      return { items: [], summary: emptySummary(), pagination: { page: query.page ?? 1, perPage: query.perPage ?? 25, total: 0, totalPages: 1 } };
    }

    const sites = await this.sites.find({ where: { id: In(siteIds) } });
    const siteMap = new Map(sites.map((site) => [site.id, site]));
    const candidates = await this.collectCandidates(siteIds, siteMap);
    const items = await this.applyState(user, candidates);
    const filtered = this.applyFilters(user, items, query);
    filtered.sort(sortItems);

    const page = query.page ?? 1;
    const perPage = query.perPage ?? 25;
    const start = (page - 1) * perPage;
    const slice = filtered.slice(start, start + perPage);

    return {
      items: slice,
      summary: summarize(user, items),
      pagination: { page, perPage, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / perPage)) },
    };
  }

  // -------------------------------------------------------------------------
  // Saved filters
  // -------------------------------------------------------------------------

  async listFilters(user: AuthPrincipal): Promise<WorkFilterDto[]> {
    await this.seedBuiltins(user);
    const rows = await this.filters.find({ where: { userId: user.id }, order: { createdAt: 'ASC' } });
    return rows.map(toFilterDto);
  }

  async createFilter(user: AuthPrincipal, input: SaveWorkFilterDto): Promise<WorkFilterDto> {
    const row = this.filters.create({ userId: user.id, name: input.name, builtin: false, criteria: criteriaOf(input) });
    const saved = await this.filters.save(row);
    await this.activities.record({ action: 'workqueue.filter.save', userId: user.id, organizationId: user.organizationId, entityType: 'work_filter', entityId: saved.id });
    return toFilterDto(saved);
  }

  async updateFilter(user: AuthPrincipal, id: string, input: SaveWorkFilterDto): Promise<WorkFilterDto> {
    const row = await this.filters.findOne({ where: { id, userId: user.id } });
    if (!row) throw new NotFoundException('Filter not found');
    row.name = input.name;
    row.criteria = criteriaOf(input);
    const saved = await this.filters.save(row);
    await this.activities.record({ action: 'workqueue.filter.save', userId: user.id, organizationId: user.organizationId, entityType: 'work_filter', entityId: saved.id });
    return toFilterDto(saved);
  }

  async deleteFilter(user: AuthPrincipal, id: string): Promise<{ success: boolean }> {
    const row = await this.filters.findOne({ where: { id, userId: user.id } });
    if (!row) throw new NotFoundException('Filter not found');
    await this.filters.remove(row);
    await this.activities.record({ action: 'workqueue.filter.delete', userId: user.id, organizationId: user.organizationId, entityType: 'work_filter', entityId: id });
    return { success: true };
  }

  private async seedBuiltins(user: AuthPrincipal): Promise<void> {
    const count = await this.filters.count({ where: { userId: user.id } });
    if (count > 0) return;
    const rows = BUILTIN_FILTERS.map((filter) => this.filters.create({ userId: user.id, name: filter.name, builtin: true, criteria: filter.criteria }));
    await this.filters.save(rows);
  }

  // -------------------------------------------------------------------------
  // Bulk triage
  // -------------------------------------------------------------------------

  async bulk(user: AuthPrincipal, dto: WorkBulkActionDto): Promise<WorkBulkResultDto> {
    const skipped: string[] = [];
    let applied = 0;
    const authorized = new Set(await this.authorizedSiteIds(user));

    for (const itemKey of dto.itemKeys) {
      const context = await this.resolveContext(itemKey);
      if (!context || (context.siteId && !authorized.has(context.siteId))) {
        skipped.push(itemKey);
        continue;
      }
      let state = await this.states.findOne({ where: { itemKey } });
      if (!state) {
        state = this.states.create({ itemKey, siteId: context.siteId, organizationId: user.organizationId, status: 'PENDING' });
      }
      try {
        await this.applyAction(user, dto, context, state);
        await this.states.save(state);
        applied += 1;
      } catch (error) {
        this.logger.warn(`Bulk ${dto.action} failed for ${itemKey}: ${String(error)}`);
        skipped.push(itemKey);
      }
    }
    return { applied, skipped };
  }

  private async applyAction(user: AuthPrincipal, dto: WorkBulkActionDto, context: ResolvedContext, state: WorkItemState): Promise<void> {
    const meta = { itemKey: state.itemKey };
    switch (dto.action) {
      case 'assign': {
        state.assignedToUserId = dto.assignedToUserId ?? null;
        state.assignedAt = new Date();
        if (context.entityType === 'operations-task' && dto.assignedToUserId) {
          const task = context.entity as OperationsTask;
          task.assigneeId = dto.assignedToUserId;
          await this.tasks.save(task);
        }
        await this.activities.record({ action: 'workqueue.assign', userId: user.id, organizationId: user.organizationId, siteId: state.siteId, entityType: 'work_item', entityId: state.itemKey, meta: { ...meta, assignedToUserId: dto.assignedToUserId ?? null } });
        break;
      }
      case 'change_priority': {
        state.priority = dto.priority ?? null;
        await this.activities.record({ action: 'workqueue.priority', userId: user.id, organizationId: user.organizationId, siteId: state.siteId, entityType: 'work_item', entityId: state.itemKey, meta: { ...meta, priority: dto.priority ?? null } });
        break;
      }
      case 'mark_reviewed': {
        state.status = 'REVIEWED';
        state.reviewedBy = user.id;
        state.reviewedAt = new Date();
        await this.activities.record({ action: 'workqueue.reviewed', userId: user.id, organizationId: user.organizationId, siteId: state.siteId, entityType: 'work_item', entityId: state.itemKey, meta });
        break;
      }
      case 'ignore': {
        state.status = 'IGNORED';
        await this.activities.record({ action: 'workqueue.ignore', userId: user.id, organizationId: user.organizationId, siteId: state.siteId, entityType: 'work_item', entityId: state.itemKey, meta });
        break;
      }
      case 'create_tasks': {
        const title = (dto.taskTitle ?? context.reason ?? 'Follow up from work queue').slice(0, 2000);
        const task = this.tasks.create({
          siteId: context.siteId,
          title,
          deadline: dto.taskDeadline ? new Date(dto.taskDeadline) : undefined,
          status: 'TODO',
          createdBy: user.id,
          internalNotes: `Created from work queue item ${state.itemKey}`,
          url: context.pageUrl ?? undefined,
        });
        const saved = await this.tasks.save(task);
        state.taskId = saved.id;
        state.status = 'DONE';
        await this.activities.record({ action: 'workqueue.task', userId: user.id, organizationId: user.organizationId, siteId: state.siteId, entityType: 'work_item', entityId: state.itemKey, meta: { ...meta, taskId: saved.id } });
        break;
      }
    }
  }

  /** Resolve a work item key to its owning site + a fallback task title. */
  private async resolveContext(itemKey: string): Promise<ResolvedContext | null> {
    const colon = itemKey.indexOf(':');
    const prefix = colon === -1 ? itemKey : itemKey.slice(0, colon);
    const id = colon === -1 ? '' : itemKey.slice(colon + 1);

    switch (prefix) {
      case 'visibility':
      case 'report':
        return { siteId: id, reason: null, pageUrl: null, entityType: 'site' };
      case 'issue':
        return this.withSite(await this.issues.findOne({ where: { id } }), 'issue');
      case 'recommendation':
        return this.withSite(await this.recommendations.findOne({ where: { id } }), 'recommendation');
      case 'task':
        return this.withSite(await this.tasks.findOne({ where: { id } }), 'operations-task');
      case 'package':
        return this.withSite(await this.packages.findOne({ where: { id } }), 'content-package');
      case 'publication':
        return this.withSite(await this.publications.findOne({ where: { id } }), 'content-publication');
      case 'link-suggestion':
        return this.withSite(await this.linkSuggestions.findOne({ where: { id } }), 'link-suggestion');
      case 'cluster':
        return this.withSite(await this.clusters.findOne({ where: { id } }), 'cluster');
      case 'automation':
        return this.withSite(await this.automationRuns.findOne({ where: { id } }), 'automation-run');
      case 'workflow':
        return this.withSite(await this.workflowJobs.findOne({ where: { id } }), 'workflow-job');
      case 'visibility-run':
        return this.withSite(await this.visibilityRuns.findOne({ where: { id } }), 'ai-visibility-run');
      case 'ai-job':
        return this.withSite(await this.aiJobs.findOne({ where: { id } }), 'ai-job');
      case 'gsc':
        return this.withSite(await this.gscProperties.findOne({ where: { id } }), 'gsc-property');
      case 'wp':
        return this.withSite(await this.wpIntegrations.findOne({ where: { id } }), 'wordpress-integration');
      default:
        return null;
    }
  }

  private withSite<T extends { siteId: string | null }>(entity: T | null, entityType: string): ResolvedContext | null {
    if (!entity || !entity.siteId) return null;
    const record = entity as unknown as Record<string, unknown>;
    return {
      siteId: entity.siteId,
      reason: typeof record.title === 'string' ? record.title : typeof record.reason === 'string' ? (record.reason as string) : null,
      pageUrl: typeof record.url === 'string' ? (record.url as string) : null,
      entityType,
      entity,
    };
  }

  // -------------------------------------------------------------------------
  // Aggregation
  // -------------------------------------------------------------------------

  private async collectCandidates(ids: string[], siteMap: Map<string, Site>): Promise<Candidate[]> {
    const windows = windows28d();
    const monthStart = firstOfMonth();
    const now = new Date();
    const recentCutoff = daysAgo(RECENT_DAYS);

    const [
      issues,
      openIssueIdRows,
      recommendations,
      overdueTasks,
      packages,
      publications,
      linkSuggestions,
      clusters,
      automationRuns,
      workflowJobs,
      visibilityRuns,
      aiJobs,
      reportRows,
      baselineRows,
      gscProps,
      wpIntegrations,
      gscCurrent,
      gscPrevious,
    ] = await Promise.all([
      this.issues.find({ where: { siteId: In(ids), severity: In(['CRITICAL', 'HIGH']), status: In(OPEN_ISSUE_STATUSES) }, order: { detectedAt: 'DESC' }, take: 100 }),
      this.issues.createQueryBuilder('i').select('i.id', 'id').where('i.site_id IN (:...ids)', { ids }).andWhere('i.status NOT IN (:...closed)', { closed: CLOSED_ISSUE_STATUSES }).getRawMany<{ id: string }>(),
      this.recommendations.find({ where: { siteId: In(ids), priority: In(['CRITICAL', 'HIGH']) }, order: { createdAt: 'DESC' }, take: 100 }),
      this.tasks.createQueryBuilder('t').where('t.site_id IN (:...ids)', { ids }).andWhere('t.deadline IS NOT NULL').andWhere('t.deadline < :now', { now }).andWhere('t.status != :done', { done: 'DONE' }).orderBy('t.deadline', 'ASC').limit(100).getMany(),
      this.packages.find({ where: { siteId: In(ids), status: 'AWAITING_APPROVAL' }, order: { updatedAt: 'DESC' }, take: 100 }),
      this.publications.find({ where: { siteId: In(ids), status: 'DRAFT' }, order: { updatedAt: 'DESC' }, take: 100 }),
      this.linkSuggestions.find({ where: { siteId: In(ids), status: 'SUGGESTED' }, order: { updatedAt: 'DESC' }, take: 100 }),
      this.clusters.find({ where: { siteId: In(ids), status: In(['DRAFT', 'REVIEW']) }, order: { updatedAt: 'DESC' }, take: 50 }),
      this.automationRuns.createQueryBuilder('a').where('a.site_id IN (:...ids)', { ids }).andWhere("a.status = 'FAILED'").andWhere('a.created_at >= :cutoff', { cutoff: recentCutoff }).orderBy('a.created_at', 'DESC').limit(50).getMany(),
      this.workflowJobs.createQueryBuilder('w').where('w.site_id IN (:...ids)', { ids }).andWhere("w.status IN ('FAILED', 'TIMEOUT')").andWhere('w.created_at >= :cutoff', { cutoff: recentCutoff }).orderBy('w.created_at', 'DESC').limit(50).getMany(),
      this.visibilityRuns.createQueryBuilder('v').where('v.site_id IN (:...ids)', { ids }).andWhere("v.status = 'FAILED'").andWhere('v.created_at >= :cutoff', { cutoff: recentCutoff }).orderBy('v.created_at', 'DESC').limit(50).getMany(),
      this.aiJobs.createQueryBuilder('j').where('j.site_id IN (:...ids)', { ids }).andWhere("j.status = 'FAILED'").andWhere('j.created_at >= :cutoff', { cutoff: recentCutoff }).orderBy('j.created_at', 'DESC').limit(50).getMany(),
      this.reports.createQueryBuilder('r').select('r.site_id', 'siteId').addSelect('COUNT(*)', 'count').where('r.site_id IN (:...ids)', { ids }).andWhere('r.created_at >= :month', { month: monthStart }).groupBy('r.site_id').getRawMany<{ siteId: string }>(),
      this.baselines.find({ where: { siteId: In(ids) }, order: { createdAt: 'DESC' } }),
      this.gscProperties.find({ where: { siteId: In(ids) } }),
      this.wpIntegrations.find({ where: { siteId: In(ids) } }),
      this.gscWindow(ids, windows.currentStart, windows.currentEnd),
      this.gscWindow(ids, windows.previousStart, windows.previousEnd),
    ]);

    const openIssueIds = new Set(openIssueIdRows.map((row) => row.id));
    const reportSites = new Set(reportRows.map((row) => row.siteId));
    const baselineSites = new Set(baselineRows.map((row) => row.siteId));
    const currentClicks = new Map(gscCurrent.map((row) => [row.siteId, row]));
    const previousClicks = new Map(gscPrevious.map((row) => [row.siteId, row]));

    const candidates: Candidate[] = [];

    for (const issue of issues) {
      candidates.push({
        itemKey: `issue:${issue.id}`,
        type: 'critical_issue',
        priority: asPriority(issue.severity),
        reason: issue.title,
        detail: `${issue.kind} · ${issue.status}`,
        site: siteOf(siteMap, issue.siteId),
        source: 'issues',
        domainAssigneeId: null,
        dueDate: null,
        createdAt: issue.detectedAt.toISOString(),
        url: link(issue.siteId, 'audit'),
        pageUrl: issue.url ?? null,
        recommendedAction: 'Review and resolve this issue',
        entity: { type: 'issue', id: issue.id },
      });
    }

    for (const recommendation of recommendations) {
      if (!openIssueIds.has(recommendation.issueId)) continue;
      candidates.push({
        itemKey: `recommendation:${recommendation.id}`,
        type: 'recommendation',
        priority: asPriority(recommendation.priority),
        reason: recommendation.title,
        detail: `Impact ${recommendation.impact} · Confidence ${recommendation.confidence} · Effort ${recommendation.effort}`,
        site: siteOf(siteMap, recommendation.siteId),
        source: 'recommendations',
        domainAssigneeId: null,
        dueDate: null,
        createdAt: recommendation.createdAt.toISOString(),
        url: link(recommendation.siteId, 'audit'),
        pageUrl: null,
        recommendedAction: recommendation.suggestedAction || 'Implement the recommended fix',
        entity: { type: 'recommendation', id: recommendation.id },
      });
    }

    for (const task of overdueTasks) {
      candidates.push({
        itemKey: `task:${task.id}`,
        type: 'overdue_task',
        priority: 'HIGH',
        reason: task.title,
        detail: `Overdue by ${daysLate(task.deadline, now)} day(s)`,
        site: siteOf(siteMap, task.siteId),
        source: 'tasks',
        domainAssigneeId: task.assigneeId,
        dueDate: task.deadline?.toISOString() ?? null,
        createdAt: task.createdAt.toISOString(),
        url: '/tasks',
        pageUrl: task.url ?? null,
        recommendedAction: 'Update or close this overdue task',
        entity: { type: 'operations-task', id: task.id },
      });
    }

    for (const pkg of packages) {
      candidates.push({
        itemKey: `package:${pkg.id}`,
        type: 'content_approval',
        priority: 'MEDIUM',
        reason: pkg.targetUrl ?? 'Content brief awaiting approval',
        detail: `Content brief · ${pkg.status}`,
        site: siteOf(siteMap, pkg.siteId),
        source: 'content',
        domainAssigneeId: null,
        dueDate: null,
        createdAt: pkg.createdAt.toISOString(),
        url: link(pkg.siteId, 'content'),
        pageUrl: pkg.targetUrl ?? null,
        recommendedAction: 'Approve or request changes on this brief',
        entity: { type: 'content-package', id: pkg.id },
      });
    }

    for (const publication of publications) {
      candidates.push({
        itemKey: `publication:${publication.id}`,
        type: 'pending_review',
        priority: 'MEDIUM',
        reason: publication.title ?? 'Draft awaiting review',
        detail: `WordPress draft · ${publication.status}`,
        site: siteOf(siteMap, publication.siteId),
        source: 'content',
        domainAssigneeId: null,
        dueDate: null,
        createdAt: publication.createdAt.toISOString(),
        url: link(publication.siteId, 'content'),
        pageUrl: publication.url ?? null,
        recommendedAction: 'Review the draft before publishing',
        entity: { type: 'content-publication', id: publication.id },
      });
    }

    for (const suggestion of linkSuggestions) {
      candidates.push({
        itemKey: `link-suggestion:${suggestion.id}`,
        type: 'pending_review',
        priority: 'LOW',
        reason: `Link suggestion · ${suggestion.sourceUrl ?? 'source'}`,
        detail: `Confidence ${suggestion.confidence} · ${suggestion.status}`,
        site: siteOf(siteMap, suggestion.siteId),
        source: 'links',
        domainAssigneeId: null,
        dueDate: null,
        createdAt: suggestion.createdAt.toISOString(),
        url: link(suggestion.siteId, 'links'),
        pageUrl: suggestion.targetUrl ?? null,
        recommendedAction: 'Approve or reject this link suggestion',
        entity: { type: 'link-suggestion', id: suggestion.id },
      });
    }

    for (const cluster of clusters) {
      candidates.push({
        itemKey: `cluster:${cluster.id}`,
        type: 'pending_review',
        priority: 'LOW',
        reason: `Content cluster · ${cluster.intent ?? cluster.status}`,
        detail: `Cluster status ${cluster.status}`,
        site: siteOf(siteMap, cluster.siteId),
        source: 'keywords',
        domainAssigneeId: null,
        dueDate: null,
        createdAt: cluster.createdAt.toISOString(),
        url: link(cluster.siteId, 'keywords'),
        pageUrl: cluster.targetUrl ?? null,
        recommendedAction: 'Review cluster recommendations',
        entity: { type: 'cluster', id: cluster.id },
      });
    }

    for (const run of automationRuns) {
      candidates.push({
        itemKey: `automation:${run.id}`,
        type: 'failed_job',
        priority: 'MEDIUM',
        reason: 'Automation run failed',
        detail: truncate(run.error ?? 'Unknown error', 200),
        site: siteOf(siteMap, run.siteId),
        source: 'automation',
        domainAssigneeId: null,
        dueDate: null,
        createdAt: run.createdAt.toISOString(),
        url: '/automation',
        pageUrl: null,
        recommendedAction: 'Inspect and rerun the failed automation',
        entity: { type: 'automation-run', id: run.id },
      });
    }

    for (const job of workflowJobs) {
      candidates.push({
        itemKey: `workflow:${job.id}`,
        type: 'failed_job',
        priority: 'MEDIUM',
        reason: `Workflow job failed · ${job.workflow}`,
        detail: truncate(job.error ?? 'Unknown error', 200),
        site: siteOf(siteMap, job.siteId),
        source: 'workflow',
        domainAssigneeId: null,
        dueDate: null,
        createdAt: job.createdAt.toISOString(),
        url: '/automation',
        pageUrl: null,
        recommendedAction: 'Inspect and rerun the failed workflow job',
        entity: { type: 'workflow-job', id: job.id },
      });
    }

    for (const run of visibilityRuns) {
      candidates.push({
        itemKey: `visibility-run:${run.id}`,
        type: 'failed_job',
        priority: 'MEDIUM',
        reason: 'AI visibility run failed',
        detail: truncate(run.error ?? 'Unknown error', 200),
        site: siteOf(siteMap, run.siteId),
        source: 'visibility',
        domainAssigneeId: null,
        dueDate: null,
        createdAt: run.createdAt.toISOString(),
        url: '/visibility',
        pageUrl: null,
        recommendedAction: 'Retry the visibility analysis run',
        entity: { type: 'ai-visibility-run', id: run.id },
      });
    }

    for (const job of aiJobs) {
      if (!job.siteId) continue;
      candidates.push({
        itemKey: `ai-job:${job.id}`,
        type: 'failed_job',
        priority: 'LOW',
        reason: `AI job failed · ${job.promptName ?? job.workflow}`,
        detail: truncate(job.error ?? 'Unknown error', 200),
        site: siteOf(siteMap, job.siteId),
        source: 'automation',
        domainAssigneeId: null,
        dueDate: null,
        createdAt: job.createdAt.toISOString(),
        url: '/automation',
        pageUrl: null,
        recommendedAction: 'Check the AI job logs and retry',
        entity: { type: 'ai-job', id: job.id },
      });
    }

    for (const [siteId, site] of siteMap) {
      const hasBaseline = baselineSites.has(siteId);
      const hasReport = reportSites.has(siteId);
      if (hasBaseline && !hasReport) {
        candidates.push({
          itemKey: `report:${site.id}`,
          type: 'report_due',
          priority: 'LOW',
          reason: 'Monthly report due',
          detail: `No report generated this month for ${site.name}`,
          site: siteOf(siteMap, site.id),
          source: 'reports',
          domainAssigneeId: null,
          dueDate: monthEndIso(),
          createdAt: now.toISOString(),
          url: link(site.id, 'reports'),
          pageUrl: null,
          recommendedAction: 'Generate the monthly client report',
          entity: { type: 'site', id: site.id },
        });
      }

      const current = currentClicks.get(site.id);
      const previous = previousClicks.get(site.id);
      if (current && previous) {
        const prevClicks = Number(previous.clicks);
        const currClicks = Number(current.clicks);
        if (prevClicks > 0 && currClicks <= prevClicks * 0.7) {
          candidates.push({
            itemKey: `visibility:${site.id}`,
            type: 'visibility_loss',
            priority: 'HIGH',
            reason: 'Traffic decline detected',
            detail: `${currClicks} clicks vs ${prevClicks} previously (−${Math.round((1 - currClicks / prevClicks) * 100)}%)`,
            site: siteOf(siteMap, site.id),
            source: 'visibility',
            domainAssigneeId: null,
            dueDate: null,
            createdAt: now.toISOString(),
            url: link(site.id, 'overview'),
            pageUrl: null,
            recommendedAction: 'Investigate the traffic decline',
            entity: { type: 'site', id: site.id },
          });
        } else if (ctrOf(previous) > 0 && ctrOf(current) > 0 && ctrOf(current) <= ctrOf(previous) * 0.8) {
          candidates.push({
            itemKey: `visibility:${site.id}`,
            type: 'visibility_loss',
            priority: 'MEDIUM',
            reason: 'CTR anomaly detected',
            detail: `CTR ${pct(ctrOf(current))} vs ${pct(ctrOf(previous))} previously`,
            site: siteOf(siteMap, site.id),
            source: 'visibility',
            domainAssigneeId: null,
            dueDate: null,
            createdAt: now.toISOString(),
            url: link(site.id, 'overview'),
            pageUrl: null,
            recommendedAction: 'Review titles and meta descriptions',
            entity: { type: 'site', id: site.id },
          });
        }
      }
    }

    for (const prop of gscProps) {
      if (prop.status !== 'EXPIRED' && prop.status !== 'DISCONNECTED') continue;
      candidates.push({
        itemKey: `gsc:${prop.id}`,
        type: 'integration_problem',
        priority: prop.status === 'EXPIRED' ? 'HIGH' : 'MEDIUM',
        reason: `Google Search Console ${prop.status.toLowerCase()}`,
        detail: truncate(prop.lastError ?? `Search Console status ${prop.status}`, 200),
        site: siteOf(siteMap, prop.siteId),
        source: 'gsc',
        domainAssigneeId: null,
        dueDate: null,
        createdAt: now.toISOString(),
        url: link(prop.siteId, 'settings'),
        pageUrl: null,
        recommendedAction: 'Reconnect Google Search Console',
        entity: { type: 'gsc-property', id: prop.id },
      });
    }

    for (const integration of wpIntegrations) {
      if (integration.status !== 'FAILED') continue;
      candidates.push({
        itemKey: `wp:${integration.id}`,
        type: 'integration_problem',
        priority: 'HIGH',
        reason: 'WordPress disconnected',
        detail: truncate(integration.lastError ?? `WordPress status ${integration.status}`, 200),
        site: siteOf(siteMap, integration.siteId),
        source: 'integrations',
        domainAssigneeId: null,
        dueDate: null,
        createdAt: now.toISOString(),
        url: link(integration.siteId, 'settings'),
        pageUrl: null,
        recommendedAction: 'Reconnect WordPress',
        entity: { type: 'wordpress-integration', id: integration.id },
      });
    }

    return candidates;
  }

  private gscWindow(ids: string[], start: string, end: string): Promise<GscAggRow[]> {
    return this.gscMetrics
      .createQueryBuilder('m')
      .select('m.site_id', 'siteId')
      .addSelect('COALESCE(SUM(m.clicks), 0)', 'clicks')
      .addSelect('COALESCE(SUM(m.impressions), 0)', 'impressions')
      .addSelect('AVG(m.average_position) FILTER (WHERE m.average_position > 0)', 'position')
      .where('m.site_id IN (:...ids)', { ids })
      .andWhere('m.date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('m.site_id')
      .getRawMany();
  }

  /** Fold persisted triage state + assignee names over the aggregated candidates. */
  private async applyState(user: AuthPrincipal, candidates: Candidate[]): Promise<WorkItemDto[]> {
    const keys = candidates.map((candidate) => candidate.itemKey);
    const stateRows = keys.length > 0 ? await this.states.find({ where: { itemKey: In(keys) } }) : [];
    const stateMap = new Map(stateRows.map((state) => [state.itemKey, state]));

    const assigneeIds = new Set<string>();
    for (const state of stateRows) if (state.assignedToUserId) assigneeIds.add(state.assignedToUserId);
    for (const candidate of candidates) if (candidate.domainAssigneeId) assigneeIds.add(candidate.domainAssigneeId);
    const assignees = assigneeIds.size > 0 ? await this.users.find({ where: { id: In([...assigneeIds]) }, select: { id: true, fullName: true } }) : [];
    const userNames = new Map(assignees.map((userRow) => [userRow.id, userRow.fullName]));

    return candidates.map((candidate) => {
      const state = stateMap.get(candidate.itemKey);
      const assignedTo = state?.assignedToUserId
        ? { userId: state.assignedToUserId, fullName: userNames.get(state.assignedToUserId) ?? 'Unassigned' }
        : candidate.domainAssigneeId
          ? { userId: candidate.domainAssigneeId, fullName: userNames.get(candidate.domainAssigneeId) ?? 'Unassigned' }
          : null;
      return {
        ...candidate,
        status: state && state.status !== 'PENDING' ? state.status : 'PENDING',
        priority: state?.priority ?? candidate.priority,
        assignedTo,
        stateId: state?.id ?? null,
      };
    });
  }

  private applyFilters(user: AuthPrincipal, items: WorkItemDto[], query: WorkQueueQueryDto): WorkItemDto[] {
    const types = splitList(query.types);
    const statuses = splitList(query.statuses);
    const priorities = splitList(query.priorities);
    const sources = splitList(query.sources);
    const sites = splitList(query.sites);
    const search = query.search?.trim().toLowerCase();
    const now = new Date();

    return items.filter((item) => {
      if (types.length > 0 && !types.includes(item.type)) return false;
      if (statuses.length > 0 && !statuses.includes(item.status)) return false;
      if (priorities.length > 0 && !priorities.includes(item.priority)) return false;
      if (sources.length > 0 && !sources.includes(item.source)) return false;
      if (sites.length > 0 && !(item.site && sites.includes(item.site.siteId))) return false;
      if (query.assignedTo === 'me' && !(item.assignedTo && item.assignedTo.userId === user.id)) return false;
      if (query.assignedTo === 'unassigned' && item.assignedTo) return false;
      if (query.overdue && (!item.dueDate || new Date(item.dueDate) >= now)) return false;
      if (search) {
        const haystack = [item.reason, item.detail, item.site?.name, item.site?.domain].join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async authorizedSiteIds(user: AuthPrincipal): Promise<string[]> {
    if (user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN')) {
      const rows = await this.sites.find({ select: { id: true } });
      return rows.map((row) => row.id);
    }
    const rows = await this.memberships.find({ where: { userId: user.id }, select: { siteId: true } });
    return rows.map((row) => row.siteId);
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

interface Candidate {
  itemKey: string;
  type: WorkItemDto['type'];
  priority: WorkItemPriority;
  reason: string;
  detail: string;
  site: WorkItemSiteDto | null;
  source: WorkItemDto['source'];
  domainAssigneeId: string | null;
  dueDate: string | null;
  createdAt: string;
  url: string;
  pageUrl: string | null;
  recommendedAction: string;
  entity: { type: string; id: string };
}

interface ResolvedContext {
  siteId: string;
  reason: string | null;
  pageUrl: string | null;
  entityType: string;
  entity?: unknown;
}

interface GscAggRow {
  siteId: string;
  clicks: string;
  impressions: string;
  position: string | null;
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

function asPriority(value: string): WorkItemPriority {
  return value === 'CRITICAL' || value === 'HIGH' || value === 'MEDIUM' || value === 'LOW' ? value : 'MEDIUM';
}

function siteOf(siteMap: Map<string, Site>, siteId: string): WorkItemSiteDto | null {
  const site = siteMap.get(siteId);
  return site ? { siteId: site.id, name: site.name, domain: site.domain } : null;
}

function link(siteId: string, tab: string): string {
  return `/sites/${siteId}?tab=${tab}`;
}

function ctrOf(row: GscAggRow): number {
  const impressions = Number(row.impressions);
  return impressions > 0 ? Number(row.clicks) / impressions : 0;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function daysLate(deadline: Date | null, now: Date): number {
  if (!deadline) return 0;
  return Math.max(1, Math.ceil((now.getTime() - deadline.getTime()) / 86_400_000));
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}…`;
}

function sortItems(a: WorkItemDto, b: WorkItemDto): number {
  const rankDiff = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
  if (rankDiff !== 0) return rankDiff;
  if (a.dueDate && b.dueDate) {
    const dueDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (dueDiff !== 0) return dueDiff;
  } else if (a.dueDate) {
    return -1;
  } else if (b.dueDate) {
    return 1;
  }
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function summarize(user: AuthPrincipal, items: WorkItemDto[]): WorkQueueSummaryDto {
  const active = (item: WorkItemDto) => item.status === 'PENDING' || item.status === 'IN_PROGRESS';
  const count = (predicate: (item: WorkItemDto) => boolean) => items.filter(predicate).length;
  return {
    myWork: count((item) => active(item) && item.assignedTo?.userId === user.id),
    critical: count((item) => active(item) && item.type === 'critical_issue' && item.priority === 'CRITICAL'),
    pendingReviews: count((item) => active(item) && item.type === 'pending_review'),
    contentApprovals: count((item) => active(item) && item.type === 'content_approval'),
    openRecommendations: count((item) => active(item) && item.type === 'recommendation'),
    overdueTasks: count((item) => active(item) && item.type === 'overdue_task'),
    failedJobs: count((item) => active(item) && item.type === 'failed_job'),
    reportsDue: count((item) => active(item) && item.type === 'report_due'),
    visibilityLoss: count((item) => active(item) && item.type === 'visibility_loss'),
    integrationProblems: count((item) => active(item) && item.type === 'integration_problem'),
    open: count(active),
    total: items.length,
  };
}

function emptySummary(): WorkQueueSummaryDto {
  return { myWork: 0, critical: 0, pendingReviews: 0, contentApprovals: 0, openRecommendations: 0, overdueTasks: 0, failedJobs: 0, reportsDue: 0, visibilityLoss: 0, integrationProblems: 0, open: 0, total: 0 };
}

function toFilterDto(row: WorkFilter): WorkFilterDto {
  return {
    id: row.id,
    name: row.name,
    builtin: row.builtin,
    criteria: row.criteria,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function criteriaOf(input: SaveWorkFilterDto): WorkFilterCriteriaDto {
  return {
    ...(input.types ? { types: input.types } : {}),
    ...(input.statuses ? { statuses: input.statuses } : {}),
    ...(input.priorities ? { priorities: input.priorities } : {}),
    ...(input.sources ? { sources: input.sources } : {}),
    ...(input.sites ? { sites: input.sites } : {}),
    ...(input.assignedTo ? { assignedTo: input.assignedTo } : {}),
    ...(input.overdue ? { overdue: true } : {}),
    ...(input.search ? { search: input.search } : {}),
  };
}

function windows28d() {
  const now = new Date();
  const currentEnd = now.toISOString().slice(0, 10);
  const currentStart = addDays(now, -27).toISOString().slice(0, 10);
  const previousEnd = addDays(now, -28).toISOString().slice(0, 10);
  const previousStart = addDays(now, -55).toISOString().slice(0, 10);
  return { currentStart, currentEnd, previousStart, previousEnd };
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function daysAgo(days: number): Date {
  return addDays(new Date(), -days);
}

function firstOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function monthEndIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59)).toISOString();
}

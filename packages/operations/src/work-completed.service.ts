import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AuditRun,
  ChangeLog,
  ContentPublication,
  CrawlRun,
  Issue,
  LinkSuggestion,
  OperationsTask,
  Report,
} from '@creative-seo/database';
import type { WorkCompletedMetricsDto } from '@creative-seo/types';
import { Repository } from 'typeorm';

@Injectable()
export class WorkCompletedService {
  constructor(
    @InjectRepository(ChangeLog) private readonly changeLogs: Repository<ChangeLog>,
    @InjectRepository(OperationsTask) private readonly tasks: Repository<OperationsTask>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(ContentPublication) private readonly publications: Repository<ContentPublication>,
    @InjectRepository(AuditRun) private readonly audits: Repository<AuditRun>,
    @InjectRepository(CrawlRun) private readonly crawls: Repository<CrawlRun>,
    @InjectRepository(Report) private readonly reports: Repository<Report>,
    @InjectRepository(LinkSuggestion) private readonly linkSuggestions: Repository<LinkSuggestion>,
  ) {}

  /**
   * Work completed metrics (Section 23). Canonical activity metrics
   * independent from search outcomes. Does NOT infer work from GSC changes.
   */
  async getWorkCompleted(
    siteId: string,
    startDate: string,
    endDate: string,
  ): Promise<WorkCompletedMetricsDto> {
    const periodStart = new Date(startDate);
    const periodEnd = new Date(endDate);

    const [
      pagesOptimized,
      pagesCreated,
      contentPublished,
      metadataUpdates,
      internalLinksAdded,
      issuesResolved,
      tasksCompleted,
      auditsRun,
      crawlsRun,
      reportsGenerated,
    ] = await Promise.all([
      // Pages optimized: change_log entries for title, content, headings, canonical, robots, schema, rank_math
      this.changeLogs
        .createQueryBuilder('log')
        .where('log.site_id = :siteId', { siteId })
        .andWhere('log.changed_at BETWEEN :start AND :end', {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        })
        .andWhere('log.change_type IN (:...types)', {
          types: ['title', 'content', 'headings', 'canonical', 'robots', 'schema', 'rank_math'],
        })
        .getCount(),

      // Pages created: change_log entries with changeType = 'page_created'
      this.changeLogs
        .createQueryBuilder('log')
        .where('log.site_id = :siteId', { siteId })
        .andWhere('log.changed_at BETWEEN :start AND :end', {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        })
        .andWhere('log.change_type = :type', { type: 'page_created' })
        .getCount(),

      // Content published: content_publications with status PUBLISHED during the period
      this.publications
        .createQueryBuilder('pub')
        .where('pub.site_id = :siteId', { siteId })
        .andWhere('pub.published_at BETWEEN :start AND :end', {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        })
        .andWhere('pub.status = :status', { status: 'PUBLISHED' })
        .getCount(),

      // Metadata updates: change_log entries for meta changes
      this.changeLogs
        .createQueryBuilder('log')
        .where('log.site_id = :siteId', { siteId })
        .andWhere('log.changed_at BETWEEN :start AND :end', {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        })
        .andWhere('log.change_type = :type', { type: 'meta' })
        .getCount(),

      // Internal links added: change_log entries for internal_links AND link_suggestions applied
      Promise.all([
        this.changeLogs
          .createQueryBuilder('log')
          .where('log.site_id = :siteId', { siteId })
          .andWhere('log.changed_at BETWEEN :start AND :end', {
            start: periodStart.toISOString(),
            end: periodEnd.toISOString(),
          })
          .andWhere('log.change_type = :type', { type: 'internal_links' })
          .getCount(),
        this.linkSuggestions
          .createQueryBuilder('ls')
          .where('ls.site_id = :siteId', { siteId })
          .andWhere('ls.applied_at BETWEEN :start AND :end', {
            start: periodStart.toISOString(),
            end: periodEnd.toISOString(),
          })
          .getCount(),
      ]).then(([a, b]) => a + b),

      // Issues resolved: issues with resolvedAt in the period
      this.issues
        .createQueryBuilder('issue')
        .where('issue.site_id = :siteId', { siteId })
        .andWhere('issue.resolved_at BETWEEN :start AND :end', {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        })
        .getCount(),

      // Tasks completed: tasks with status DONE during the period
      this.tasks
        .createQueryBuilder('task')
        .where('task.site_id = :siteId', { siteId })
        .andWhere('task.status = :status', { status: 'DONE' })
        .andWhere('task.updated_at BETWEEN :start AND :end', {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        })
        .getCount(),

      // Audits run: audit_runs created during the period
      this.audits
        .createQueryBuilder('audit')
        .where('audit.site_id = :siteId', { siteId })
        .andWhere('audit.created_at BETWEEN :start AND :end', {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        })
        .getCount(),

      // Crawls run: crawl_runs created during the period
      this.crawls
        .createQueryBuilder('crawl')
        .where('crawl.site_id = :siteId', { siteId })
        .andWhere('crawl.created_at BETWEEN :start AND :end', {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        })
        .getCount(),

      // Reports generated: reports created during the period
      this.reports
        .createQueryBuilder('report')
        .where('report.site_id = :siteId', { siteId })
        .andWhere('report.created_at BETWEEN :start AND :end', {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        })
        .getCount(),
    ]);

    return {
      pagesOptimized,
      pagesCreated,
      contentPublished,
      metadataUpdates,
      internalLinksAdded,
      issuesResolved,
      tasksCompleted,
      auditsRun,
      crawlsRun,
      reportsGenerated,
    };
  }
}

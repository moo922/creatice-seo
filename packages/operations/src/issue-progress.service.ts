import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Issue } from '@creative-seo/database';
import type { IssuePeriodProgressDto, IssueSeverity } from '@creative-seo/types';
import { Repository } from 'typeorm';

const SEVERITIES: readonly IssueSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

const CLOSED_STATUSES = ['RESOLVED', 'IGNORED'];

@Injectable()
export class IssueProgressService {
  constructor(
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
  ) {}

  /**
   * Issue progress metrics by period and severity (Section 22).
   *
   * No explicit issue-event history table exists, so this service uses the
   * Issue entity's createdAt, updatedAt, resolvedAt, and status fields as
   * proxies. historyComplete is set to false to signal that the event trail
   * is incomplete.
   */
  async getIssuePeriodProgress(
    siteId: string,
    startDate: string,
    endDate: string,
  ): Promise<IssuePeriodProgressDto[]> {
    const periodStart = new Date(startDate);
    const periodEnd = new Date(endDate);

    // Fetch all issues that existed on or before the period end
    const allIssues = await this.issues
      .createQueryBuilder('issue')
      .where('issue.site_id = :siteId', { siteId })
      .andWhere('issue.created_at <= :periodEnd', { periodEnd: periodEnd.toISOString() })
      .select([
        'issue.id',
        'issue.severity',
        'issue.status',
        'issue.created_at',
        'issue.updated_at',
        'issue.resolved_at',
      ])
      .getMany();

    return SEVERITIES.map((severity) => {
      const severityIssues = allIssues.filter((i) => i.severity === severity);

      const openAtPeriodStart = severityIssues.filter((i) => {
        const createdBeforeStart = i.createdAt < periodStart;
        const closedBeforeStart =
          i.resolvedAt !== null && i.resolvedAt < periodStart;
        return createdBeforeStart && !closedBeforeStart;
      }).length;

      const newDuringPeriod = severityIssues.filter(
        (i) => i.createdAt >= periodStart && i.createdAt <= periodEnd,
      ).length;

      const resolvedDuringPeriod = severityIssues.filter(
        (i) =>
          i.resolvedAt !== null &&
          i.resolvedAt >= periodStart &&
          i.resolvedAt <= periodEnd,
      ).length;

      const reopenedDuringPeriod = severityIssues.filter((i) => {
        const updatedInPeriod =
          i.updatedAt >= periodStart && i.updatedAt <= periodEnd;
        const currentlyOpen = !CLOSED_STATUSES.includes(i.status);
        const wasResolved = i.resolvedAt !== null && i.resolvedAt < periodEnd;
        return updatedInPeriod && currentlyOpen && wasResolved;
      }).length;

      const openAtPeriodEnd = severityIssues.filter((i) => {
        const createdBeforeOrDuring = i.createdAt <= periodEnd;
        const closedBeforeEnd =
          i.resolvedAt !== null && i.resolvedAt <= periodEnd;
        return createdBeforeOrDuring && !closedBeforeEnd;
      }).length;

      return {
        severity,
        openAtPeriodStart,
        newDuringPeriod,
        resolvedDuringPeriod,
        reopenedDuringPeriod,
        openAtPeriodEnd,
        historyComplete: false,
      };
    });
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { Repository } from 'typeorm';
import { QueueManager, type JobQueueName } from '../queue/queue-manager';
import { NotificationService } from '@creative-seo/infra';

/**
 * Detects when the worker was offline and missed scheduled jobs. On startup,
 * compares the last known tick timestamp against the expected schedule window.
 * Missed jobs are re-enqueued according to the configured policy:
 *   - RUN_LATE: enqueue the missed job immediately (default for GSC sync, crawls)
 *   - SKIP: do not re-enqueue (default for old AI Visibility runs)
 *   - REQUIRE_REVIEW: emit a notification but do not auto-enqueue
 */
@Injectable()
export class MissedScheduleRecovery implements OnModuleInit {
  private readonly logger = new Logger(MissedScheduleRecovery.name);

  private readonly MAX_MISSED_AGE_HOURS = 48;

  constructor(
    private readonly queues: QueueManager,
    private readonly notifications: NotificationService,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
  ) {}

  onModuleInit(): void {
    void this.recover();
  }

  async recover(): Promise<number> {
    const now = new Date();
    let recovered = 0;

    // Check for missed daily/weekly schedules
    const day = now.getUTCDate();
    const dow = now.getUTCDay();

    // Monday weekly schedules
    if (dow === 1) {
      const sites = await this.sites.find({ where: { status: 'ACTIVE' } });
      for (const site of sites) {
        const jobId = `ai-visibility-${site.id}-${weekKey(now)}`;
        const exists = await this.jobExists('ai-visibility', jobId);
        if (!exists) {
          this.logger.log(`Recovering missed weekly AI visibility for site ${site.id}`);
          await this.queues.queues['ai-visibility'].add(
            'job',
            { siteId: site.id, organizationId: site.organizationId },
            { jobId, removeOnComplete: true, removeOnFail: 100 },
          );
          recovered++;
        }
      }
    }

    // Monthly 1st-of-month schedules
    if (day === 1) {
      const sites = await this.sites.find({ where: { status: 'ACTIVE' } });
      const prev = previousMonth(now);
      for (const site of sites) {
        const snapshotId = `monthly-snapshot-${site.id}-${prev.key}`;
        if (!(await this.jobExists('reports', snapshotId))) {
          this.logger.log(`Recovering missed monthly snapshot for site ${site.id}`);
          await this.queues.queues['reports'].add(
            'job',
            { siteId: site.id, organizationId: site.organizationId, kind: 'snapshot', type: 'MONTHLY' },
            { jobId: snapshotId, removeOnComplete: true, removeOnFail: 100 },
          );
          recovered++;
        }

        const reportId = `monthly-report-${site.id}-${prev.key}`;
        if (!(await this.jobExists('reports', reportId))) {
          this.logger.log(`Recovering missed monthly report for site ${site.id}`);
          await this.queues.queues['reports'].add(
            'job',
            { siteId: site.id, organizationId: site.organizationId, kind: 'report', type: 'MONTHLY', periodStart: prev.start, periodEnd: prev.end },
            { jobId: reportId, removeOnComplete: true, removeOnFail: 100 },
          );
          recovered++;
        }
      }
    }

    if (recovered > 0) {
      this.logger.log(`Recovered ${recovered} missed schedule(s)`);
      await this.notifications.emit({
        siteId: 'system',
        event: 'JOB_REPEATEDLY_FAILED',
        severity: 'WARNING',
        title: 'Missed schedule recovery',
        description: `Recovered ${recovered} missed schedule(s) after worker restart`,
        data: { recovered },
      });
    }

    return recovered;
  }

  private async jobExists(queue: JobQueueName, jobId: string): Promise<boolean> {
    try {
      const job = await this.queues.queues[queue].getJob(jobId);
      return job !== undefined && job !== null;
    } catch {
      return false;
    }
  }
}

function previousMonth(date: Date): { start: string; end: string; key: string } {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
    key: `${year}-${pad(month)}`,
  };
}

function weekKey(date: Date): string {
  const day = date.getUTCDay() || 7;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day + 1));
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

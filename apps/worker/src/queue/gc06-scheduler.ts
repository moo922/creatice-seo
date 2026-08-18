import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { Repository } from 'typeorm';
import { QueueManager, type JobQueueName } from './queue-manager';

const HOUR_MS = 60 * 60 * 1000;

/**
 * GC06 recurring job scheduler. Runs every hour and enqueues:
 * - Weekly: AI visibility observation runs (priority prompts)
 * - Monthly: AI visibility snapshots
 * - Monthly: Baseline capture
 * Jobs are idempotent via deterministic jobId keys.
 */
@Injectable()
export class Gc06SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Gc06SchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly queues: QueueManager,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), HOUR_MS);
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    const now = new Date();
    const day = now.getUTCDate();
    const dow = now.getUTCDay();

    if (day !== 1 && dow !== 1) return;

    const sites = await this.sites.find({ where: { status: 'ACTIVE' } });
    if (sites.length === 0) return;

    // Weekly: AI visibility runs (priority prompts only)
    if (dow === 1) {
      const week = weekKey(now);
      for (const site of sites) {
        await this.enqueue(site, 'ai-visibility', {
          kind: 'gc06-run',
          priorityPromptOnly: true,
        }, `gc06-weekly-${site.id}-${week}`);
      }
      this.logger.log(`Enqueued weekly GC06 visibility runs for ${sites.length} site(s)`);
    }

    // Monthly: snapshots + baseline
    if (day === 1) {
      const prev = previousMonth(now);
      for (const site of sites) {
        await this.enqueue(site, 'ai-visibility', {
          kind: 'gc06-snapshot',
          periodStart: prev.start,
          periodEnd: prev.end,
        }, `gc06-snapshot-${site.id}-${prev.key}`);

        await this.enqueue(site, 'ai-visibility', {
          kind: 'gc06-baseline',
          periodStart: prev.start,
          periodEnd: prev.end,
        }, `gc06-baseline-${site.id}-${prev.key}`);
      }
      this.logger.log(`Enqueued monthly GC06 snapshots/baselines for ${sites.length} site(s)`);
    }
  }

  private async enqueue(
    site: Site,
    queue: JobQueueName,
    data: Record<string, unknown>,
    jobId: string,
  ): Promise<void> {
    await this.queues.queues[queue].add(
      'job',
      { siteId: site.id, organizationId: site.organizationId, ...data },
      { jobId, removeOnComplete: true, removeOnFail: 100 },
    );
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

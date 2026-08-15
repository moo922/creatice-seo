import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AutomationService } from '@creative-seo/automation';
import { QueueManager } from './queue-manager';

const TICK_MS = 60 * 1000;

/**
 * DB-backed scheduler for the recurring automation. Every minute it asks
 * AutomationService which operations are due right now across active sites; the
 * service claims them in `automation_runs` (INSERT ... ON CONFLICT, unique
 * idempotency key per `operation:siteId:period`) so a period can never be
 * scheduled twice even across workers, restarts or overlapping ticks. Claimed
 * runs are enqueued on the `automation` queue with the idempotency key as the
 * BullMQ jobId, then executed by the QueueProcessor.
 */
@Injectable()
export class AutomationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly automation: AutomationService,
    private readonly queues: QueueManager,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    try {
      const claimed = await this.automation.claimDue();
      for (const run of claimed) {
        await this.queues.queues['automation'].add(
          'job',
          { runId: run.runId, siteId: run.siteId, organizationId: run.organizationId, operation: run.operation },
          { jobId: run.idempotencyKey, removeOnComplete: true, removeOnFail: 100 },
        );
      }
      if (claimed.length > 0) {
        this.logger.log(`Claimed and enqueued ${claimed.length} due automation run(s)`);
      }
    } catch (error) {
      this.logger.error(`automation scheduler tick failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
}

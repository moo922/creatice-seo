import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { WorkerConfig } from '../config/worker-config';

export const JOB_QUEUES = ['crawler', 'gsc-sync', 'content', 'reports', 'ai-visibility', 'automation'] as const;
export type JobQueueName = (typeof JOB_QUEUES)[number];

/**
 * Owns the BullMQ queues and the shared Redis connection. Phase 1 registers
 * the queue names only; processors are added in later phases. The API enqueues
 * jobs; the worker consumes them. All persistent state lives in PostgreSQL.
 */
@Injectable()
export class QueueManager implements OnApplicationShutdown {
  private readonly logger = new Logger(QueueManager.name);
  readonly connection: Redis;
  readonly queues: Record<JobQueueName, Queue>;

  constructor(private readonly config: WorkerConfig) {
    this.connection = new Redis(config.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queues = Object.fromEntries(
      JOB_QUEUES.map((name) => [
        name,
        new Queue(name, { connection: this.connection, defaultJobOptions: { removeOnComplete: 500, removeOnFail: 1000 } }),
      ]),
    ) as Record<JobQueueName, Queue>;
    this.logger.log(`Registered queues: ${JOB_QUEUES.join(', ')}`);
  }

  async ping(): Promise<boolean> {
    const pong = await this.connection.ping();
    return pong === 'PONG';
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(Object.values(this.queues).map((queue) => queue.close()));
    this.connection.disconnect();
    this.logger.log('Queue manager shut down');
  }
}

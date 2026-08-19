import { Injectable, Logger } from '@nestjs/common';
import { QueueManager, type JobQueueName } from '../queue/queue-manager';

export interface QueueMetrics {
  name: string;
  depth: number;
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface ObservabilityReport {
  timestamp: string;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  queues: QueueMetrics[];
  redis: 'up' | 'down';
  totalDepth: number;
  totalFailed: number;
}

export interface FailedJob {
  queue: string;
  id: string;
  name: string;
  data: Record<string, unknown>;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

/**
 * Observability service providing queue depth, processing rate, failure rate,
 * average duration, worker health, and Redis health.
 */
@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);
  private readonly startedAt = Date.now();

  constructor(private readonly queues: QueueManager) {}

  async getReport(): Promise<ObservabilityReport> {
    const queues = await this.getQueueMetrics();
    let redis: 'up' | 'down' = 'down';
    try {
      redis = (await this.queues.ping()) ? 'up' : 'down';
    } catch {
      redis = 'down';
    }

    return {
      timestamp: new Date().toISOString(),
      uptime: (Date.now() - this.startedAt) / 1000,
      memory: process.memoryUsage(),
      queues,
      redis,
      totalDepth: queues.reduce((sum, q) => sum + q.depth, 0),
      totalFailed: queues.reduce((sum, q) => sum + q.failed, 0),
    };
  }

  async getQueueMetrics(): Promise<QueueMetrics[]> {
    const results: QueueMetrics[] = [];
    const entries = Object.entries(this.queues.queues);
    for (const [name, queue] of entries) {
      try {
        const counts = await queue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed');
        results.push({
          name: name as JobQueueName,
          depth: (counts.active ?? 0) + (counts.waiting ?? 0) + (counts.delayed ?? 0),
          active: counts.active ?? 0,
          waiting: counts.waiting ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        });
      } catch {
        results.push({
          name: name as JobQueueName,
          depth: -1,
          active: -1,
          waiting: -1,
          completed: -1,
          failed: -1,
          delayed: -1,
        });
      }
    }
    return results;
  }

  async getFailedJobs(limit = 50): Promise<FailedJob[]> {
    const all: FailedJob[] = [];
    const entries = Object.entries(this.queues.queues);
    for (const [name, queue] of entries) {
      try {
        const failed = await queue.getFailed(0, limit);
        for (const job of failed) {
          all.push({
            queue: name,
            id: job.id ?? 'unknown',
            name: job.name ?? 'unknown',
            data: (job.data as Record<string, unknown>) ?? {},
            failedReason: job.failedReason ?? 'unknown',
            attemptsMade: job.attemptsMade ?? 0,
            timestamp: job.timestamp ?? 0,
            processedOn: job.processedOn ?? undefined,
            finishedOn: job.finishedOn ?? undefined,
          });
        }
      } catch {
        // Queue unavailable
      }
    }
    return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  async retryFailedJob(queue: JobQueueName, jobId: string): Promise<boolean> {
    try {
      const q = this.queues.queues[queue];
      const job = await q.getJob(jobId);
      if (!job) return false;
      await job.retry();
      return true;
    } catch {
      return false;
    }
  }

  async removeFailedJob(queue: JobQueueName, jobId: string): Promise<boolean> {
    try {
      const q = this.queues.queues[queue];
      const job = await q.getJob(jobId);
      if (!job) return false;
      await job.remove();
      return true;
    } catch {
      return false;
    }
  }
}

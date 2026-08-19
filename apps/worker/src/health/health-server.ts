import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { createServer, type Server } from 'http';
import { WorkerConfig } from '../config/worker-config';
import { QueueManager } from '../queue/queue-manager';

/**
 * Worker health server with comprehensive checks:
 *   /health          — liveness (always 200)
 *   /health/ready    — readiness (Redis + DB)
 *   /health/workers  — worker queue status
 *   /health/detail   — full health check (liveness + readiness + workers)
 */
@Injectable()
export class HealthServer implements OnApplicationShutdown {
  private readonly logger = new Logger(HealthServer.name);
  private server: Server | null = null;
  private startedAt = new Date();

  constructor(
    private readonly config: WorkerConfig,
    private readonly queues: QueueManager,
  ) {}

  start(): void {
    this.server = createServer((req, res) => {
      const url = req.url ?? '/';
      if (url === '/health') {
        this.json(res, 200, { status: 'ok', uptime: process.uptime(), startedAt: this.startedAt.toISOString() });
        return;
      }
      if (url === '/health/ready') {
        void this.readiness(res);
        return;
      }
      if (url === '/health/workers') {
        void this.workerStatus(res);
        return;
      }
      if (url === '/health/detail') {
        void this.detail(res);
        return;
      }
      this.json(res, 404, { status: 'not_found' });
    });
    const port = this.config.env.WORKER_PORT;
    this.server.listen(port, '0.0.0.0', () => {
      this.logger.log(`Worker health server listening on :${port}`);
    });
  }

  private async readiness(res: import('http').ServerResponse): Promise<void> {
    const checks: Record<string, 'up' | 'down'> = {};
    try {
      checks.redis = (await this.queues.ping()) ? 'up' : 'down';
    } catch {
      checks.redis = 'down';
    }
    const ready = checks.redis === 'up';
    this.json(res, ready ? 200 : 503, { status: ready ? 'ready' : 'not_ready', checks });
  }

  private async workerStatus(res: import('http').ServerResponse): Promise<void> {
    const queues: Record<string, { depth: number; isPaused: boolean }> = {};
    for (const [name, queue] of Object.entries(this.queues.queues)) {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
        queues[name] = {
          depth: (counts.waiting ?? 0) + (counts.active ?? 0),
          isPaused: false,
        };
      } catch {
        queues[name] = { depth: -1, isPaused: false };
      }
    }
    this.json(res, 200, { queues });
  }

  private async detail(res: import('http').ServerResponse): Promise<void> {
    const checks: Record<string, { status: string; detail?: unknown }> = {};

    // Redis
    try {
      checks.redis = { status: (await this.queues.ping()) ? 'up' : 'down' };
    } catch {
      checks.redis = { status: 'down' };
    }

    // Queue depths
    const queues: Record<string, number> = {};
    for (const [name, queue] of Object.entries(this.queues.queues)) {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'failed');
        queues[name] = (counts.waiting ?? 0) + (counts.active ?? 0);
        if ((counts.failed ?? 0) > 0) {
          checks[`queue:${name}`] = { status: 'warning', detail: { failed: counts.failed } };
        }
      } catch {
        queues[name] = -1;
      }
    }

    this.json(res, 200, {
      status: 'ok',
      uptime: process.uptime(),
      startedAt: this.startedAt.toISOString(),
      checks,
      queues,
      memory: process.memoryUsage(),
    });
  }

  private json(res: import('http').ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    }
  }
}

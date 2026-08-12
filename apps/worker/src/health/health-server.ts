import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { createServer, type Server } from 'http';
import { WorkerConfig } from '../config/worker-config';
import { QueueManager } from '../queue/queue-manager';

/**
 * Minimal liveness/readiness endpoint for the worker. BullMQ and Redis are
 * exercised directly; no HTTP framework dependency.
 */
@Injectable()
export class HealthServer implements OnApplicationShutdown {
  private readonly logger = new Logger(HealthServer.name);
  private server: Server | null = null;

  constructor(
    private readonly config: WorkerConfig,
    private readonly queues: QueueManager,
  ) {}

  start(): void {
    this.server = createServer((req, res) => {
      const url = req.url ?? '/';
      if (url === '/health') {
        this.json(res, 200, { status: 'ok', uptime: process.uptime() });
        return;
      }
      if (url === '/health/ready') {
        void this.readiness(res);
        return;
      }
      this.json(res, 404, { status: 'not_found' });
    });
    const port = this.config.env.PORT;
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

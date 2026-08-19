import { Injectable } from '@nestjs/common';
import { loadAppEnv, type AppEnv } from '@creative-seo/config';

@Injectable()
export class WorkerConfig {
  readonly env: AppEnv;

  /** Per-queue concurrency. Defaults to 1 per queue. */
  readonly concurrency: {
    content: number;
    reports: number;
    aiVisibility: number;
    automation: number;
    crawler: number;
    gscSync: number;
  };

  constructor() {
    this.env = loadAppEnv();
    this.concurrency = {
      content: parseInt(process.env['WORKER_CONCURRENCY_CONTENT'] ?? '1', 10),
      reports: parseInt(process.env['WORKER_CONCURRENCY_REPORTS'] ?? '1', 10),
      aiVisibility: parseInt(process.env['WORKER_CONCURRENCY_AI_VISIBILITY'] ?? '1', 10),
      automation: parseInt(process.env['WORKER_CONCURRENCY_AUTOMATION'] ?? '1', 10),
      crawler: parseInt(process.env['WORKER_CONCURRENCY_CRAWLER'] ?? '1', 10),
      gscSync: parseInt(process.env['WORKER_CONCURRENCY_GSC_SYNC'] ?? '1', 10),
    };
  }
}

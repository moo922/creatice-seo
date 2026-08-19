import { Injectable, Logger } from '@nestjs/common';

export interface JobProgress {
  jobId: string;
  queue: string;
  siteId: string;
  current: number;
  total: number;
  message: string;
  startedAt: string;
  updatedAt: string;
}

/**
 * In-memory job progress tracker. Long-running jobs (crawler, AI visibility,
 * content generation) update progress so the UI can display meaningful
 * progress indicators instead of spinners.
 *
 * Progress is ephemeral (lost on worker restart) — this is intentional since
 * a restarted worker will retry the job anyway.
 */
@Injectable()
export class JobProgressTracker {
  private readonly logger = new Logger(JobProgressTracker.name);
  private readonly progress = new Map<string, JobProgress>();
  private readonly MAX_ENTRIES = 500;

  update(
    jobId: string,
    queue: string,
    siteId: string,
    current: number,
    total: number,
    message?: string,
  ): void {
    const now = new Date().toISOString();
    const existing = this.progress.get(jobId);
    this.progress.set(jobId, {
      jobId,
      queue,
      siteId,
      current,
      total,
      message: message ?? existing?.message ?? '',
      startedAt: existing?.startedAt ?? now,
      updatedAt: now,
    });
  }

  get(jobId: string): JobProgress | undefined {
    return this.progress.get(jobId);
  }

  getBySite(siteId: string): JobProgress[] {
    return Array.from(this.progress.values()).filter((p) => p.siteId === siteId);
  }

  getAll(): JobProgress[] {
    return Array.from(this.progress.values());
  }

  remove(jobId: string): void {
    this.progress.delete(jobId);
  }

  /** Call when a job completes to clean up */
  complete(jobId: string): void {
    this.progress.delete(jobId);
  }

  /** Evict old entries if the map grows too large */
  evict(): void {
    if (this.progress.size > this.MAX_ENTRIES) {
      const entries = Array.from(this.progress.entries())
        .sort((a, b) => new Date(a[1]!.updatedAt).getTime() - new Date(b[1]!.updatedAt).getTime());
      const toRemove = entries.slice(0, entries.length - this.MAX_ENTRIES);
      for (const [key] of toRemove) {
        this.progress.delete(key);
      }
    }
  }
}

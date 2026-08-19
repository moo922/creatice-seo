import { Logger } from '@nestjs/common';

/**
 * Structured Job Logger — records job execution events with consistent metadata.
 * Never logs secrets, passwords, tokens, or API keys.
 */

export type JobLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface JobLogEntry {
  jobId: string;
  siteId: string;
  jobType: string;
  level: JobLogLevel;
  message: string;
  duration?: number;
  status?: string;
  errorCode?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export class JobLogger {
  private readonly logger: Logger;
  private readonly entries: JobLogEntry[] = [];
  private readonly MAX_ENTRIES = 5000;

  constructor(context: string) {
    this.logger = new Logger(context);
  }

  log(entry: Omit<JobLogEntry, 'timestamp'>): void {
    const record: JobLogEntry = { ...entry, timestamp: new Date().toISOString() };
    this.entries.unshift(record);

    // Evict old entries
    if (this.entries.length > this.MAX_ENTRIES) {
      this.entries.splice(this.MAX_ENTRIES);
    }

    // Also log to NestJS logger
    const msg = `[${entry.jobType}:${entry.jobId.slice(0, 8)}] ${entry.message}`;
    switch (entry.level) {
      case 'ERROR': this.logger.error(msg); break;
      case 'WARN': this.logger.warn(msg); break;
      case 'DEBUG': this.logger.debug(msg); break;
      default: this.logger.log(msg);
    }
  }

  info(jobId: string, siteId: string, jobType: string, message: string, meta?: Record<string, unknown>): void {
    this.log({ jobId, siteId, jobType, level: 'INFO', message, metadata: meta });
  }

  warn(jobId: string, siteId: string, jobType: string, message: string, meta?: Record<string, unknown>): void {
    this.log({ jobId, siteId, jobType, level: 'WARN', message, metadata: meta });
  }

  error(jobId: string, siteId: string, jobType: string, message: string, errorCode?: string, meta?: Record<string, unknown>): void {
    this.log({ jobId, siteId, jobType, level: 'ERROR', message, errorCode, metadata: meta });
  }

  getEntries(filters: { siteId?: string; jobType?: string; level?: JobLogLevel; limit?: number } = {}): JobLogEntry[] {
    let results = this.entries;
    if (filters.siteId) results = results.filter((e) => e.siteId === filters.siteId);
    if (filters.jobType) results = results.filter((e) => e.jobType === filters.jobType);
    if (filters.level) results = results.filter((e) => e.level === filters.level);
    return results.slice(0, filters.limit ?? 100);
  }
}

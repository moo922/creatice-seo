import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { CrawlErrorType } from '@creative-seo/types';

/**
 * A failure captured during a versioned crawl run (robots block, HTTP error,
 * timeout, network failure, SSRF guard). Each entry is attributable to a URL
 * so the audit engine can report exactly what failed and why.
 */
@Entity('crawl_errors')
@Index('idx_crawl_errors_run', ['crawlRunId'])
@Index('idx_crawl_errors_site_run', ['siteId', 'crawlRunId'])
export class CrawlError {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'crawl_run_id' })
  crawlRunId: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'varchar', length: 30, name: 'error_type' })
  errorType: CrawlErrorType;

  @Column({ type: 'text', default: '' })
  message: string;

  @Column({ type: 'int', name: 'status_code', nullable: true })
  statusCode: number | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

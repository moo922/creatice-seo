import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { AuditRunStatus } from '@creative-seo/types';

/**
 * A run of the deterministic audit rule registry over a versioned crawl run.
 * Persists the scope, lifecycle and the version of the health-score algorithm
 * so results and scores are reproducible.
 */
@Entity('audit_runs')
@Index('idx_audit_runs_site_created', ['siteId', 'createdAt'])
export class AuditRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'crawl_run_id' })
  crawlRunId: string;

  @Column({ type: 'varchar', length: 30 })
  type: string;

  @Column({ type: 'varchar', length: 20, default: 'RUNNING' })
  status: AuditRunStatus;

  @Column({ type: 'timestamptz', name: 'started_at' })
  startedAt: Date;

  @Column({ type: 'timestamptz', name: 'finished_at', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'int', name: 'score_version', default: 1 })
  scoreVersion: number;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

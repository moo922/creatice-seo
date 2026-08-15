import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { AutomationOperation, AutomationRunStatus } from '@creative-seo/types';

/**
 * Append-only history for recurring automation runs. Rows are claimed by the
 * scheduler with a deterministic idempotency key (`operation:siteId:period`) so
 * duplicate dispatch across worker restarts or overlapping ticks is impossible.
 * The worker executor updates status/duration/records/error in place.
 */
@Entity('automation_runs')
@Index('idx_automation_runs_site_created', ['siteId', 'createdAt'])
@Index('idx_automation_runs_operation_status', ['operation', 'status'])
@Index('idx_automation_runs_idempotency', ['idempotencyKey'], { unique: true, where: '"idempotency_key" IS NOT NULL' })
export class AutomationRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'varchar', length: 40 })
  operation: AutomationOperation;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: AutomationRunStatus;

  @Column({ type: 'timestamptz', name: 'scheduled_for' })
  scheduledFor: Date;

  @Column({ type: 'varchar', length: 200, name: 'idempotency_key', nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'int', name: 'duration_ms', nullable: true })
  durationMs: number | null;

  @Column({ type: 'int', name: 'records_processed', default: 0 })
  recordsProcessed: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

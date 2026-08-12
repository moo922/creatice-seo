import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Backend-owned orchestration job. n8n executes workflows and reports back via
 * a callback webhook; PostgreSQL remains the source of truth for job state,
 * payload and result. Jobs are created with idempotency keys, retried up to
 * max_attempts and marked TIMEOUT when n8n does not respond in time. Failures
 * update the job status and create operational alerts.
 */
@Entity('workflow_jobs')
@Index('idx_workflow_jobs_site_created', ['siteId', 'createdAt'])
@Index('idx_workflow_jobs_status', ['status'])
@Index('idx_workflow_jobs_idempotency', ['idempotencyKey'], { unique: true, where: '"idempotency_key" IS NOT NULL' })
export class WorkflowJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'varchar', length: 60 })
  workflow: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 200, name: 'idempotency_key', nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'int', name: 'max_attempts', default: 3 })
  maxAttempts: number;

  @Column({ type: 'int', name: 'timeout_ms', default: 300_000 })
  timeoutMs: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'varchar', length: 200, name: 'n8n_execution_id', nullable: true })
  n8nExecutionId: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

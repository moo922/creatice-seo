import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Every AI job (generateText / generateStructured / research) is recorded here:
 * routing, attempts, usage and cost. The `error` column is always sanitized and
 * never contains API keys or raw provider payloads.
 */
@Entity('ai_jobs')
@Index('idx_ai_jobs_site_created', ['siteId', 'createdAt'])
@Index('idx_ai_jobs_org_created', ['organizationId', 'createdAt'])
@Index('idx_ai_jobs_status', ['status'])
export class AiJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id', nullable: true })
  siteId: string | null;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  /** Workflow key the call belongs to, e.g. 'research', 'writer'. */
  @Column({ type: 'varchar', length: 100, name: 'workflow' })
  workflow: string;

  @Column({ type: 'varchar', length: 200, name: 'prompt_name', nullable: true })
  promptName: string | null;

  @Column({ type: 'int', name: 'prompt_version', nullable: true })
  promptVersion: number | null;

  @Column({ type: 'varchar', length: 40, name: 'kind' })
  kind: 'TEXT' | 'STRUCTURED' | 'RESEARCH';

  @Column({ type: 'varchar', length: 40, name: 'provider' })
  provider: string;

  @Column({ type: 'varchar', length: 160, name: 'model' })
  model: string;

  @Column({ type: 'varchar', length: 20, name: 'status' })
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'NO_PROVIDER';

  @Column({ type: 'int', name: 'attempts', default: 1 })
  attempts: number;

  @Column({ type: 'int', name: 'input_tokens', nullable: true })
  inputTokens: number | null;

  @Column({ type: 'int', name: 'output_tokens', nullable: true })
  outputTokens: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 6, name: 'cost_usd', nullable: true })
  costUsd: string | null;

  @Column({ type: 'int', name: 'latency_ms', nullable: true })
  latencyMs: number | null;

  /** Sanitized failure message (no API keys, no raw provider payloads). */
  @Column({ type: 'text', name: 'error', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;
}

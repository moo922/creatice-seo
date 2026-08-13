import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Per-step state of the guided site activation wizard. Resumability is keyed
 * on (site_id, step_key): successfully completed expensive/destructive steps
 * (baseline, initial report) are never auto-repeated. FAILED steps persist
 * their actionable diagnostics here until the underlying data changes.
 */
@Entity('site_activation_steps')
@Index('idx_site_activation_site_step', ['siteId', 'stepKey'], { unique: true })
export class SiteActivationStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'varchar', length: 60, name: 'step_key' })
  stepKey: string;

  @Column({ type: 'varchar', length: 20, default: 'NOT_STARTED' })
  status: string;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'jsonb', nullable: true })
  detail: Record<string, unknown> | null;

  @Column({ type: 'int', name: 'attempt_count', default: 0 })
  attemptCount: number;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A single visibility observation run: executes every enabled prompt in a
 * site's standardized prompt set against the configured AI provider/model and
 * stores the raw responses + deterministic metrics. Repeated runs over time
 * power trend comparison.
 */
@Entity('ai_visibility_runs')
@Index('idx_vis_runs_site_created', ['siteId', 'observedAt'])
export class AiVisibilityRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  provider: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 20, default: 'RUNNING' })
  status: string;

  @Column({ type: 'date', name: 'observed_at' })
  observedAt: string;

  @Column({ type: 'timestamptz', name: 'started_at' })
  startedAt: Date;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'int', name: 'observations_count', default: 0 })
  observationsCount: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

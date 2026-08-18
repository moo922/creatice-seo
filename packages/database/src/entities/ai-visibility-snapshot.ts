import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ai_visibility_snapshots')
@Index('idx_vis_snapshot_site_period', ['siteId', 'periodStart'])
export class AiVisibilitySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'date', name: 'period_start' })
  periodStart: string;

  @Column({ type: 'date', name: 'period_end' })
  periodEnd: string;

  @Column({ type: 'int', name: 'prompt_set_version', default: 1 })
  promptSetVersion: number;

  @Column({ type: 'varchar', length: 20, name: 'methodology_version', default: 'MV1' })
  methodologyVersion: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metrics: Record<string, unknown>;

  @Column({ type: 'varchar', length: 30, name: 'data_quality', default: 'GOOD' })
  dataQuality: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

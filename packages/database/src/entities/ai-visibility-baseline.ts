import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ai_visibility_baselines')
@Index('idx_vis_baseline_site_version', ['siteId', 'promptSetVersion'], { unique: true })
export class AiVisibilityBaseline {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'prompt_set_id' })
  promptSetId: string;

  @Column({ type: 'int', name: 'prompt_set_version' })
  promptSetVersion: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  providers: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  models: string[];

  @Column({ type: 'varchar', length: 20, name: 'methodology_version', default: 'MV1' })
  methodologyVersion: string;

  @Column({ type: 'date', name: 'period_start' })
  periodStart: string;

  @Column({ type: 'date', name: 'period_end' })
  periodEnd: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metrics: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

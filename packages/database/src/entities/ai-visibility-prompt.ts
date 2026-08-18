import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_visibility_prompts')
@Index('idx_vis_prompt_set_cat_status', ['promptSetId', 'category', 'status'])
@Index('idx_vis_prompt_site', ['siteId'])
export class AiVisibilityPrompt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'prompt_set_id' })
  promptSetId: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'text', name: 'normalized_text' })
  normalizedText: string;

  @Column({ type: 'varchar', length: 30 })
  category: string;

  @Column({ type: 'varchar', length: 30, default: 'INFORMATIONAL' })
  intent: string;

  @Column({ type: 'uuid', name: 'cluster_id', nullable: true })
  clusterId: string | null;

  @Column({ type: 'text', name: 'target_url', nullable: true })
  targetUrl: string | null;

  @Column({ type: 'int', default: 5 })
  priority: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 1.0 })
  weight: number;

  @Column({ type: 'varchar', length: 30, default: 'global' })
  market: string;

  @Column({ type: 'varchar', length: 10, default: 'ar' })
  language: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 20, default: 'SUGGESTED' })
  status: string;

  @Column({ type: 'varchar', length: 30, default: 'MANUAL' })
  source: string;

  @Column({ type: 'jsonb', name: 'source_ref', nullable: true })
  sourceRef: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

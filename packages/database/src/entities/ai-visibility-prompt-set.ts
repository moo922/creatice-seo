import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Standardized prompt set for a site: one prompt per visibility category
 * (BRAND, COMMERCIAL, INFORMATIONAL, COMPARISON, LOCAL, DECISION,
 * PROBLEM_SOLUTION). Prompts are standardized (identical across sites unless a
 * site overrides) so observations are comparable. A default set is created
 * automatically for each site; additional named sets can be stored per site.
 */
@Entity('ai_visibility_prompt_sets')
@Index('idx_vis_prompt_sets_site_name', ['siteId', 'name'], { unique: true })
export class AiVisibilityPromptSet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'varchar', length: 100, default: 'default' })
  name: string;

  /** Array of { category, prompt } entries (one per category). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  prompts: Record<string, unknown>[];

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

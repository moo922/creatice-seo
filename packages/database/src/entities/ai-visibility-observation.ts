import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One observation: a standardized prompt, the AI provider/model that answered
 * it, the raw response and the deterministically parsed signals (brand mention,
 * website citation, cited URLs, competitors mentioned) plus classification
 * confidence. `context` holds extra parsed metadata.
 */
@Entity('ai_visibility_observations')
@Index('idx_vis_obs_site_created', ['siteId', 'observedAt'])
@Index('idx_vis_obs_run', ['runId'])
export class AiVisibilityObservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'run_id' })
  runId: string;

  @Column({ type: 'varchar', length: 30 })
  category: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'varchar', length: 40 })
  provider: string;

  @Column({ type: 'varchar', length: 160 })
  model: string;

  @Column({ type: 'date', name: 'observed_at' })
  observedAt: string;

  @Column({ type: 'text' })
  response: string;

  @Column({ type: 'boolean', name: 'brand_mentioned', default: false })
  brandMentioned: boolean;

  @Column({ type: 'boolean', name: 'website_cited', default: false })
  websiteCited: boolean;

  @Column({ type: 'jsonb', name: 'cited_urls', default: () => "'[]'" })
  citedUrls: string[];

  @Column({ type: 'jsonb', name: 'competitors_mentioned', default: () => "'[]'" })
  competitorsMentioned: string[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  context: Record<string, unknown>;

  @Column({ type: 'double precision', default: 0 })
  confidence: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

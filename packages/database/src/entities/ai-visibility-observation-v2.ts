import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ai_visibility_observations_v2')
@Index('idx_vis_obs_v2_site_date', ['siteId', 'observedAt'])
@Index('idx_vis_obs_v2_run', ['runId'])
@Index('idx_vis_obs_v2_prompt_provider', ['promptId', 'provider'])
export class AiVisibilityObservationV2 {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'run_id' })
  runId: string;

  @Column({ type: 'uuid', name: 'prompt_id', nullable: true })
  promptId: string | null;

  @Column({ type: 'int', name: 'prompt_set_version', default: 1 })
  promptSetVersion: number;

  @Column({ type: 'varchar', length: 30 })
  category: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'text', name: 'normalized_text' })
  normalizedText: string;

  @Column({ type: 'varchar', length: 40 })
  provider: string;

  @Column({ type: 'varchar', length: 160 })
  model: string;

  @Column({ type: 'varchar', length: 20, name: 'methodology_version', default: 'MV1' })
  methodologyVersion: string;

  @Column({ type: 'varchar', length: 30, name: 'observation_type', default: 'GENERATION_ONLY' })
  observationType: string;

  @Column({ type: 'varchar', length: 20, default: 'QUEUED' })
  status: string;

  @Column({ type: 'date', name: 'observed_at' })
  observedAt: string;

  @Column({ type: 'text', nullable: true })
  response: string | null;

  @Column({ type: 'varchar', length: 64, name: 'response_hash', nullable: true })
  responseHash: string | null;

  @Column({ type: 'boolean', name: 'brand_mentioned', default: false })
  brandMentioned: boolean;

  @Column({ type: 'boolean', name: 'brand_included', default: false })
  brandIncluded: boolean;

  @Column({ type: 'int', name: 'appearance_order', nullable: true })
  appearanceOrder: number | null;

  @Column({ type: 'boolean', name: 'verified_target_citation', default: false })
  verifiedTargetCitation: boolean;

  @Column({ type: 'jsonb', name: 'target_cited_urls', default: () => "'[]'" })
  targetCitedUrls: string[];

  @Column({ type: 'jsonb', name: 'competitor_results', default: () => "'[]'" })
  competitorResults: Array<{ name: string; mentioned: boolean; included: boolean; appearanceOrder: number | null }>;

  @Column({ type: 'varchar', length: 30, name: 'provenance_quality', default: 'UNKNOWN' })
  provenanceQuality: string;

  @Column({ type: 'jsonb', nullable: true })
  usage: Record<string, unknown> | null;

  @Column({ type: 'decimal', precision: 12, scale: 6, name: 'cost_usd', default: 0 })
  costUsd: number;

  @Column({ type: 'int', name: 'latency_ms', default: 0 })
  latencyMs: number;

  @Column({ type: 'varchar', length: 50, name: 'error_code', nullable: true })
  errorCode: string | null;

  @Column({ type: 'boolean', name: 'contamination_logged', default: false })
  contaminationLogged: boolean;

  @Column({ type: 'boolean', name: 'kb_withheld', default: true })
  kbWithheld: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  context: Record<string, unknown>;

  @Column({ type: 'double precision', default: 0 })
  confidence: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

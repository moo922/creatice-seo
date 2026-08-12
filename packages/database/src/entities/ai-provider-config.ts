import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Per-site AI configuration: workflow routing overrides and provider API key
 * overrides. Global defaults come from environment; this table implements the
 * "site override" layer of the resolution hierarchy
 * (global default -> site override -> workflow override).
 *
 * API keys are encrypted at rest and never returned to clients.
 */
@Entity('ai_provider_configs')
@Index('idx_ai_provider_configs_site', ['siteId'], { unique: true })
export class AiProviderConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  /**
   * Workflow -> provider/model/fallback overrides, e.g.
   * { "research": { "provider": "PERPLEXITY", "model": "sonar-pro" } }.
   */
  @Column({ type: 'jsonb', name: 'workflow_overrides' })
  workflowOverrides: Record<string, unknown>;

  /** Provider kind -> encrypted API key, e.g. { "OPENAI": "<enc>" }. */
  @Column({ type: 'jsonb', name: 'api_key_overrides' })
  apiKeyOverrides: Record<string, string>;

  @Column({ type: 'boolean', name: 'enabled', default: true })
  enabled: boolean;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

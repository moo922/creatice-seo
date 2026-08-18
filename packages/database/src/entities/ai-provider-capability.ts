import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_provider_capabilities')
export class AiProviderCapability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  provider: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  capabilities: string[];

  @Column({ type: 'varchar', length: 160, name: 'default_model' })
  defaultModel: string;

  @Column({ type: 'int', name: 'max_output_tokens', nullable: true })
  maxOutputTokens: number | null;

  @Column({ type: 'boolean', name: 'supports_temperature', default: true })
  supportsTemperature: boolean;

  @Column({ type: 'boolean', name: 'supports_seed', default: false })
  supportsSeed: boolean;

  @Column({ type: 'boolean', name: 'supports_location_context', default: false })
  supportsLocationContext: boolean;

  @Column({ type: 'boolean', name: 'supports_search', default: false })
  supportsSearch: boolean;

  @Column({ type: 'boolean', name: 'supports_citations', default: false })
  supportsCitations: boolean;

  @Column({ type: 'boolean', name: 'supports_source_provenance', default: false })
  supportsSourceProvenance: boolean;

  @Column({ type: 'int', name: 'rate_limit_rpm', nullable: true })
  rateLimitRpm: number | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

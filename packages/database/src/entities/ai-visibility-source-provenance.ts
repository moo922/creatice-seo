import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ai_visibility_source_provenance')
@Index('idx_vis_prov_obs', ['observationId'])
@Index('idx_vis_prov_domain_status', ['domain', 'provenanceStatus'])
export class AiVisibilitySourceProvenance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'observation_id' })
  observationId: string;

  @Column({ type: 'varchar', length: 40 })
  provider: string;

  @Column({ type: 'varchar', length: 30, name: 'source_type' })
  sourceType: string;

  @Column({ type: 'text', nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  domain: string | null;

  @Column({ type: 'text', name: 'normalized_url', nullable: true })
  normalizedUrl: string | null;

  @Column({ type: 'varchar', length: 255, name: 'registered_domain', nullable: true })
  registeredDomain: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  host: string | null;

  @Column({ type: 'varchar', length: 200, name: 'provider_source_id', nullable: true })
  providerSourceId: string | null;

  @Column({ type: 'int', name: 'citation_index', nullable: true })
  citationIndex: number | null;

  @Column({ type: 'varchar', length: 30, name: 'provenance_status', default: 'UNKNOWN' })
  provenanceStatus: string;

  @Column({ type: 'jsonb', name: 'raw_metadata', nullable: true })
  rawMetadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

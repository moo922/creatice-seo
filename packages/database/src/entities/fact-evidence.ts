import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Evidence library for GEO audits. Stores supporting sources for significant
 * facts, classified by source type and support strength.
 */
@Entity('fact_evidence')
@Index('idx_fact_evidence_site', ['siteId'])
export class FactEvidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'text' })
  fact: string;

  @Column({ type: 'text', name: 'source_url', nullable: true })
  sourceUrl: string | null;

  @Column({ type: 'varchar', length: 30, name: 'source_type', default: 'UNKNOWN' })
  sourceType: string;

  /** Support strength 0-1. */
  @Column({ type: 'double precision', name: 'support_strength', default: 0.5 })
  supportStrength: number;

  @Column({ type: 'boolean', default: false })
  verified: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

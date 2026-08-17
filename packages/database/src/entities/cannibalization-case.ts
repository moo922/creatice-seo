import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A persisted cannibalization case (Sections 35-40). Detection uses GSC
 * query-page evidence: one query/intent ranking on multiple competing URLs.
 * The broken "cluster id count" logic has been replaced.
 */
@Entity('cannibalization_cases')
@Index('idx_cannib_site_status', ['siteId', 'status'])
@Index('idx_cannib_site_query', ['siteId', 'query'])
export class CannibalizationCase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'cluster_id', nullable: true })
  clusterId: string | null;

  /** The query (or cluster intent label) where cannibalization occurs. */
  @Column({ type: 'text', nullable: true })
  query: string | null;

  /** Competing URLs involved. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  urls: Record<string, unknown>[];

  /** NONE / LOW / MODERATE / HIGH / REVIEW_REQUIRED. */
  @Column({ type: 'varchar', length: 30 })
  classification: string;

  /** Deterministic 0-1 score. */
  @Column({ type: 'double precision' })
  score: number;

  /** Section 39 recommendation. */
  @Column({ type: 'varchar', length: 40, name: 'recommendation', nullable: true })
  recommendation: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /** OPEN / APPROVED / IGNORED / ACTIONED / REVIEW. */
  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string;

  @Column({ type: 'text', name: 'preferred_target', nullable: true })
  preferredTarget: string | null;

  @Column({ type: 'uuid', name: 'decided_by', nullable: true })
  decidedBy: string | null;

  @Column({ type: 'timestamptz', name: 'decided_at', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'detected_at' })
  detectedAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
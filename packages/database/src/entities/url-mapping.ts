import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Canonical relationship: one cluster -> one approved target URL (Section 31).
 *
 * Mapping types: EXISTING, NEW_PLANNED, REDIRECT_TARGET, MERGE_TARGET.
 * Statuses: SUGGESTED, APPROVED, ACTIVE, CONFLICT, REVIEW_REQUIRED, ARCHIVED.
 *
 * AI suggestions must never silently overwrite an approved mapping. `manualLock`
 * + `approvedBy` + `approvedAt` protect operator decisions.
 */
@Entity('url_mappings')
@Index('idx_url_mappings_site_url', ['siteId', 'url'], { unique: true })
@Index('idx_url_mappings_cluster', ['clusterId'])
@Index('idx_url_mappings_site_status', ['siteId', 'status'])
export class UrlMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'cluster_id', nullable: true })
  clusterId: string | null;

  @Column({ type: 'uuid', name: 'keyword_id', nullable: true })
  keywordId: string | null;

  @Column({ type: 'text' })
  url: string;

  /** WordPress post id when the mapping points to a verified published page. */
  @Column({ type: 'bigint', name: 'wp_post_id', nullable: true })
  wpPostId: string | null;

  /** Mapping type (Section 31). */
  @Column({ type: 'varchar', length: 30, name: 'mapping_type', default: 'EXISTING' })
  mappingType: string;

  /** Mapping status (Section 32). */
  @Column({ type: 'varchar', length: 30, default: 'SUGGESTED' })
  status: string;

  /** Source: AUTO / MANUAL / INFERRED / GSC_OBSERVED / pipeline. */
  @Column({ type: 'varchar', length: 30 })
  source: string;

  /** Confidence in the mapping (0-1). null when unknown. */
  @Column({ type: 'double precision', nullable: true })
  confidence: number | null;

  /** Why this URL was chosen as the target. */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /** Operator lock — automated mapping must not silently change this. */
  @Column({ type: 'boolean', name: 'manual_override', default: false })
  manualOverride: boolean;

  @Column({ type: 'uuid', name: 'approved_by', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', name: 'approved_at', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
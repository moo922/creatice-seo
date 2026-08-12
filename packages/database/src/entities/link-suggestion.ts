import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * An internal-link suggestion flowing through
 * SUGGESTED -> APPROVED -> APPLIED -> VERIFIED (or REJECTED).
 *
 * Every suggestion carries the source URL, target URL, recommended anchor,
 * context, confidence and reason. URLs are never invented: sources come from
 * crawled pages and targets come from the approved URL map. Self-links are
 * forbidden, and published content is only modified after explicit approval
 * (the Apply step records the before/after in the change log).
 */
@Entity('link_suggestions')
@Index('idx_link_suggestions_site_status', ['siteId', 'status'])
@Index('idx_link_suggestions_source', ['siteId', 'sourceUrl'])
@Index('idx_link_suggestions_target', ['siteId', 'targetUrl'])
export class LinkSuggestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'analysis_id', nullable: true })
  analysisId: string | null;

  @Column({ type: 'text', name: 'source_url' })
  sourceUrl: string;

  @Column({ type: 'text', name: 'target_url' })
  targetUrl: string;

  @Column({ type: 'text' })
  anchor: string;

  @Column({ type: 'text', default: '' })
  context: string;

  @Column({ type: 'double precision', default: 0 })
  confidence: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', length: 30 })
  detection: string;

  @Column({ type: 'varchar', length: 30 })
  action: string;

  @Column({ type: 'varchar', length: 20, default: 'SUGGESTED' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @Column({ type: 'uuid', name: 'approved_by', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', name: 'approved_at', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'applied_at', nullable: true })
  appliedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'verified_at', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'jsonb', name: 'verify_result', nullable: true })
  verifyResult: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

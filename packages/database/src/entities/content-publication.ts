import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A content package published to WordPress. Lifecycle:
 * DRAFT (created via the connector) -> APPROVED (reviewer) -> PUBLISHED (sent to
 * WordPress with Rank Math SEO metadata) -> VERIFIED (post-publish check confirms
 * all metadata applied). Failures set status FAILED with a sanitized error.
 * ROLLBACK is set when a pre-change snapshot was applied to undo changes.
 */
@Entity('content_publications')
@Index('idx_content_publications_site_created', ['siteId', 'createdAt'])
@Index('idx_content_publications_package', ['contentPackageId'])
@Index('idx_content_publications_status', ['status'])
export class ContentPublication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'uuid', name: 'content_package_id', nullable: true })
  contentPackageId: string | null;

  @Column({ type: 'bigint', name: 'wp_post_id', nullable: true })
  wpPostId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  /** Snapshot of the content + Rank Math fields sent to WordPress. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  meta: Record<string, unknown>;

  /** Post-publish verification details (title match, SEO metadata written, etc.). */
  @Column({ type: 'jsonb', nullable: true, name: 'verification' })
  verification: Record<string, unknown> | null;

  /** Conflict detection result (WordPress was externally modified). */
  @Column({ type: 'jsonb', nullable: true, name: 'conflict' })
  conflict: Record<string, unknown> | null;

  /** Pre-change snapshot for rollback (title, slug, content hash, SEO metadata). */
  @Column({ type: 'jsonb', nullable: true, name: 'pre_change_snapshot' })
  preChangeSnapshot: Record<string, unknown> | null;

  /** Idempotency key for the publication action. */
  @Column({ type: 'text', nullable: true, name: 'idempotency_key' })
  idempotencyKey: string | null;

  /** Connector version at time of publishing. */
  @Column({ type: 'varchar', length: 50, nullable: true, name: 'connector_version' })
  connectorVersion: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @Column({ type: 'uuid', name: 'approved_by', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', name: 'approved_at', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'published_at', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'verified_at', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

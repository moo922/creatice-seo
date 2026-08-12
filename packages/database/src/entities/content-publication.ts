import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A content package published to WordPress. Lifecycle:
 * DRAFT (created via the connector) -> APPROVED (reviewer) -> PUBLISHED (sent to
 * WordPress) -> VERIFIED (post-publish check). Failures set status FAILED with a
 * sanitized error.
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

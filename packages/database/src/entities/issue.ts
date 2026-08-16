import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * An SEO operations issue. Issues follow the lifecycle
 * DETECTED -> REVIEWED -> APPROVED -> IN_PROGRESS -> FIXED -> VERIFYING -> RESOLVED
 * (or IGNORED). Alerts create issues; the platform never modifies a live site
 * directly — human-approved tasks and the change log do.
 */
@Entity('issues')
@Index('idx_issues_site_created', ['siteId', 'createdAt'])
@Index('idx_issues_site_status', ['siteId', 'status'])
export class Issue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'varchar', length: 40 })
  kind: string;

  @Column({ type: 'varchar', length: 20 })
  severity: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  @Column({ type: 'varchar', length: 20, default: 'DETECTED' })
  status: string;

  @Column({ type: 'varchar', length: 20 })
  source: string;

  @Column({ type: 'uuid', name: 'alert_id', nullable: true })
  alertId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  data: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'detected_at' })
  detectedAt: Date;

  /** Last time the underlying problem was observed (re-detection). */
  @Column({ type: 'timestamptz', name: 'last_detected_at', nullable: true })
  lastDetectedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

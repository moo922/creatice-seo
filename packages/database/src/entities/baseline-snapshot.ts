import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Immutable baseline/periodic snapshot of a site's health. Snapshots are never
 * updated once created — the only way to get a new snapshot is to create one.
 * The nine metric areas cover crawl health, technical issues, on-page health,
 * content health, AEO readiness, GEO readiness, GSC metrics, keyword visibility
 * and internal-link health. Issue snapshots enable progression tracking.
 */
@Entity('baseline_snapshots')
@Index('idx_baseline_site_created', ['siteId', 'createdAt'])
@Index('idx_baseline_site_type', ['siteId', 'type'])
export class BaselineSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'varchar', length: 20 })
  type: string;

  @Column({ type: 'boolean', name: 'is_baseline', default: false })
  isBaseline: boolean;

  @Column({ type: 'int', name: 'baseline_version', default: 1 })
  baselineVersion: number;

  @Column({ type: 'date', name: 'period_start', nullable: true })
  periodStart: string | null;

  @Column({ type: 'date', name: 'period_end', nullable: true })
  periodEnd: string | null;

  @Column({ type: 'date', name: 'data_cutoff_date', nullable: true })
  dataCutoffDate: string | null;

  @Column({ type: 'uuid', name: 'reference_crawl_run_id', nullable: true })
  referenceCrawlRunId: string | null;

  @Column({ type: 'uuid', name: 'reference_audit_run_id', nullable: true })
  referenceAuditRunId: string | null;

  @Column({ type: 'jsonb' })
  metrics: Record<string, unknown>;

  /** Per-metric availability state (AVAILABLE / NOT_MEASURED / ... ). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  availability: Record<string, string>;

  /** Issue id+status snapshot used to compute initial/new/resolved/remaining/regressed. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  issues: Record<string, unknown>[];

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

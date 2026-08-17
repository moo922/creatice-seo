import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Site snapshot -- recalculated from source data (never copied from previous).
 * Each snapshot independently resolves current metrics from the latest
 * applicable crawl, audit, GSC period, keyword data, and AI visibility.
 */
@Entity('site_snapshots')
@Index('idx_site_snapshot_site_type', ['siteId', 'snapshotType'])
@Index('idx_site_snapshot_site_captured', ['siteId', 'capturedAt'])
export class SiteSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'varchar', length: 20, name: 'snapshot_type' })
  snapshotType: string;

  @Column({ type: 'timestamptz', name: 'captured_at', default: () => 'now()' })
  capturedAt: Date;

  @Column({ type: 'date', name: 'effective_date' })
  effectiveDate: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'uuid', name: 'reference_crawl_run_id', nullable: true })
  referenceCrawlRunId: string | null;

  @Column({ type: 'uuid', name: 'reference_audit_run_id', nullable: true })
  referenceAuditRunId: string | null;

  @Column({ type: 'date', name: 'gsc_period_start', nullable: true })
  gscPeriodStart: string | null;

  @Column({ type: 'date', name: 'gsc_period_end', nullable: true })
  gscPeriodEnd: string | null;

  @Column({ type: 'jsonb' })
  metrics: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'data_quality' })
  dataQuality: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  availability: Record<string, string>;
}

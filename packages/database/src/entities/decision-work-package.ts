import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Work Package — groups related recommendations into coherent units of work.
 * Example: "Optimize Main Riyadh Service Page" bundles title/meta, AEO gaps,
 * GEO entity gap, internal links, and content expansion.
 */
@Entity('decision_work_packages')
@Index('idx_dwp_site_status', ['siteId', 'status'])
@Index('idx_dwp_site_priority', ['siteId', 'priorityScore'])
export class DecisionWorkPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'text', name: 'target_url', nullable: true })
  targetUrl: string | null;

  @Column({ type: 'uuid', name: 'cluster_id', nullable: true })
  clusterId: string | null;

  /** IDs of recommendations in this package. */
  @Column({ type: 'jsonb', name: 'recommendation_ids', default: () => "'[]'" })
  recommendationIds: string[];

  /** Estimated total effort. */
  @Column({ type: 'varchar', length: 20, name: 'estimated_effort', default: 'MEDIUM' })
  estimatedEffort: string;

  /** Aggregate priority score. */
  @Column({ type: 'double precision', name: 'priority_score', default: 0 })
  priorityScore: number;

  /** DRAFT / ACTIVE / COMPLETED / CANCELLED. */
  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

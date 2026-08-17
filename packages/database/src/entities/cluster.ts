import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A search-intent cluster (Gap Closure 04). One cluster represents one search
 * intent and maps to one canonical target URL (one intent -> one target).
 *
 * Clustering is versioned: `clusterVersion` records the algorithm version + AI
 * model + prompt version so strategic history is never silently rewritten.
 */
@Entity('clusters')
@Index('idx_clusters_site_id', ['siteId'])
@Index('idx_clusters_site_status', ['siteId', 'status'])
export class Cluster {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'varchar', length: 30 })
  intent: string;

  @Column({ type: 'varchar', length: 30, name: 'secondary_intent', nullable: true })
  secondaryIntent: string | null;

  @Column({ type: 'varchar', length: 20, name: 'page_type' })
  pageType: string;

  @Column({ type: 'varchar', length: 30, name: 'business_relevance', nullable: true })
  businessRelevance: string | null;

  @Column({ type: 'uuid', name: 'primary_keyword_id', nullable: true })
  primaryKeywordId: string | null;

  @Column({ type: 'double precision' })
  confidence: number;

  @Column({ type: 'text', name: 'target_url', nullable: true })
  targetUrl: string | null;

  @Column({ type: 'varchar', length: 20, name: 'recommended_action' })
  recommendedAction: string;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @Column({ type: 'boolean', name: 'ai_reviewed', default: false })
  aiReviewed: boolean;

  /** Operator lock — cluster membership/primary/intent/target must not be silently changed. */
  @Column({ type: 'boolean', name: 'manual_lock', default: false })
  manualLock: boolean;

  /** Version of the clustering algorithm + model that produced this cluster. */
  @Column({ type: 'varchar', length: 100, name: 'cluster_version', nullable: true })
  clusterVersion: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A content intelligence pipeline run and its resulting content package.
 *
 * The pipeline executes 17 stages (research -> final QA). The brief must pass
 * the pipeline's internal approval gate before the draft is generated. Stages
 * progress and per-stage AI job references are stored in `stages`; the
 * accumulating package output lives in `package_data`. All scores are internal
 * quality scores, never official search-engine scores.
 */
@Entity('content_packages')
@Index('idx_content_packages_site_created', ['siteId', 'createdAt'])
@Index('idx_content_packages_cluster', ['clusterId'])
@Index('idx_content_packages_status', ['status'])
export class ContentPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'uuid', name: 'cluster_id', nullable: true })
  clusterId: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  /** Coarse pipeline lifecycle: QUEUED / RUNNING / AWAITING_APPROVAL / REJECTED / COMPLETE / FAILED. */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  language: string;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  locale: string;

  @Column({ type: 'text', name: 'target_url', nullable: true })
  targetUrl: string | null;

  @Column({ type: 'text', name: 'existing_page_url', nullable: true })
  existingPageUrl: string | null;

  /** Ordered per-stage records with status, AI job id, timing and errors. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  stages: Record<string, unknown>[];

  /** The approved brief (subject to the pipeline brief gate). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  brief: Record<string, unknown>;

  /** Gate result for the brief (approved / blockers). */
  @Column({ type: 'jsonb', name: 'brief_gate', default: () => "'{}'" })
  briefGate: Record<string, unknown>;

  /** Accumulating package output from the pipeline stages. */
  @Column({ type: 'jsonb', name: 'package_data', default: () => "'{}'" })
  packageData: Record<string, unknown>;

  /** Internal validator scores (SEO/AEO/GEO/RankMath/Factual/Final QA). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  scores: Record<string, unknown>;

  /** Sanitized failure message, never containing API keys. */
  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;
}

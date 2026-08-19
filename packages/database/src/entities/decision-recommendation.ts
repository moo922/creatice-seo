import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Enriched recommendation with decision engine metadata.
 * Extends the base `recommendations` table with:
 *   - Deterministic fingerprint for dedup
 *   - Merged evidence from multiple sources
 *   - Dependency tracking
 *   - Conflict flags
 *   - Staleness detection
 *   - Outcome tracking
 */
@Entity('decision_recommendations')
@Index('idx_drec_site_status', ['siteId', 'status'])
@Index('idx_drec_site_priority', ['siteId', 'priorityScore'])
@Index('idx_drec_fingerprint', ['fingerprint'])
@Index('idx_drec_issue', ['issueId'])
@Index('idx_drec_target', ['targetUrl'])
@Index('idx_drec_cluster', ['clusterId'])
export class DecisionRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'issue_id', nullable: true })
  issueId: string | null;

  @Column({ type: 'uuid', name: 'recommendation_id', nullable: true })
  recommendationId: string | null;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  /** Action type (e.g. CONTENT_CREATE, TECHNICAL_FIX, etc.) */
  @Column({ type: 'varchar', length: 40 })
  actionType: string;

  @Column({ type: 'text', name: 'target_url', nullable: true })
  targetUrl: string | null;

  @Column({ type: 'uuid', name: 'cluster_id', nullable: true })
  clusterId: string | null;

  /** Deterministic fingerprint for deduplication. */
  @Column({ type: 'varchar', length: 64 })
  fingerprint: string;

  /** Merged evidence from multiple sources. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  mergedEvidence: Record<string, unknown>;

  /** Number of source findings merged into this recommendation. */
  @Column({ type: 'int', name: 'source_count', default: 1 })
  sourceCount: number;

  /** Priority score (0-100) from the versioned priority engine. */
  @Column({ type: 'double precision', name: 'priority_score', default: 0 })
  priorityScore: number;

  /** Priority version used to compute the score. */
  @Column({ type: 'varchar', length: 50, name: 'priority_version', default: 'DECISION_PRIORITY_V1' })
  priorityVersion: string;

  /** Deterministic impact (CRITICAL/HIGH/MEDIUM/LOW). */
  @Column({ type: 'varchar', length: 20, default: 'MEDIUM' })
  impact: string;

  /** Confidence level (HIGH/MEDIUM/LOW). */
  @Column({ type: 'varchar', length: 20, default: 'MEDIUM' })
  confidenceLevel: string;

  /** Effort level (VERY_LOW/LOW/MEDIUM/HIGH/VERY_HIGH). */
  @Column({ type: 'varchar', length: 20, default: 'MEDIUM' })
  effortLevel: string;

  /** Action safety classification. */
  @Column({ type: 'varchar', length: 20, default: 'REVIEW_REQUIRED' })
  safetyClassification: string;

  /** Work category for UI grouping. */
  @Column({ type: 'varchar', length: 30, default: 'TECHNICAL' })
  category: string;

  /** Source system that generated this recommendation. */
  @Column({ type: 'varchar', length: 30 })
  source: string;

  /** IDs of source entities this recommendation was merged from. */
  @Column({ type: 'jsonb', name: 'merged_from_ids', default: () => "'[]'" })
  mergedFromIds: string[];

  /** Whether this recommendation is flagged as conflicting with another. */
  @Column({ type: 'boolean', name: 'is_conflicting', default: false })
  isConflicting: boolean;

  /** IDs of conflicting recommendations. */
  @Column({ type: 'jsonb', name: 'conflicting_with', default: () => "'[]'" })
  conflictingWith: string[];

  /** Conflict resolution if resolved. */
  @Column({ type: 'varchar', length: 30, name: 'conflict_resolution', nullable: true })
  conflictResolution: string | null;

  /** Whether this recommendation is stale. */
  @Column({ type: 'boolean', name: 'is_stale', default: false })
  isStale: boolean;

  /** Reason for staleness. */
  @Column({ type: 'varchar', length: 30, name: 'stale_reason', nullable: true })
  staleReason: string | null;

  /** Recommendation this one supersedes. */
  @Column({ type: 'uuid', name: 'supersedes_id', nullable: true })
  supersedesId: string | null;

  /** Recommendation that supersedes this one. */
  @Column({ type: 'uuid', name: 'superseded_by_id', nullable: true })
  supersededById: string | null;

  /** IDs of recommendations this one depends on. */
  @Column({ type: 'jsonb', name: 'depends_on', default: () => "'[]'" })
  dependsOn: string[];

  /** IDs of recommendations that depend on this one. */
  @Column({ type: 'jsonb', name: 'blocks', default: () => "'[]'" })
  blocks: string[];

  /** Work package this recommendation belongs to (if grouped). */
  @Column({ type: 'uuid', name: 'work_package_id', nullable: true })
  workPackageId: string | null;

  /** Recommendation status. */
  @Column({ type: 'varchar', length: 20, default: 'SUGGESTED' })
  status: string;

  /** Suggested action description. */
  @Column({ type: 'text', name: 'suggested_action', default: '' })
  suggestedAction: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

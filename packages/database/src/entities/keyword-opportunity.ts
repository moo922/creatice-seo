import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Keyword opportunity (Sections 42-50). The numeric priority comes from a
 * deterministic, versioned scoring engine — AI only explains, never sets scores.
 * Impact, Confidence and Effort are stored separately (Section 44).
 */
@Entity('keyword_opportunities')
@Index('idx_ko_site_status', ['siteId', 'status'])
@Index('idx_ko_site_priority', ['siteId', 'priorityScore'])
@Index('idx_ko_cluster', ['clusterId'])
export class KeywordOpportunity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'cluster_id', nullable: true })
  clusterId: string | null;

  @Column({ type: 'uuid', name: 'keyword_id', nullable: true })
  keywordId: string | null;

  /** Opportunity type (Section 42). */
  @Column({ type: 'varchar', length: 40 })
  type: string;

  @Column({ type: 'text', name: 'target_url', nullable: true })
  targetUrl: string | null;

  /** Impact: LOW / MEDIUM / HIGH / VERY_HIGH. */
  @Column({ type: 'varchar', length: 20 })
  impact: string;

  @Column({ type: 'double precision' })
  confidence: number;

  /** Effort: LOW / MEDIUM / HIGH. */
  @Column({ type: 'varchar', length: 20 })
  effort: string;

  /** Deterministic 0-100 score. */
  @Column({ type: 'double precision', name: 'priority_score' })
  priorityScore: number;

  /** Version of the scoring algorithm that produced priorityScore. */
  @Column({ type: 'varchar', length: 50, name: 'score_version' })
  scoreVersion: string;

  /** Persisted evidence used by AI explanations (Section 104). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  evidence: Record<string, unknown>;

  /** OPEN / APPROVED / IGNORED / ACTIONED / REVIEW. */
  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'uuid', name: 'decided_by', nullable: true })
  decidedBy: string | null;

  @Column({ type: 'timestamptz', name: 'decided_at', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A recommendation for an issue. Every recommendation carries evidence, reason,
 * impact, confidence, effort and a deterministic priority. The AI may explain a
 * recommendation but never invents the underlying metrics — impact, confidence
 * and effort are supplied deterministically from evidence.
 */
@Entity('recommendations')
@Index('idx_recommendations_issue', ['issueId'])
@Index('idx_recommendations_site', ['siteId'])
export class Recommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'issue_id' })
  issueId: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  evidence: string;

  @Column({ type: 'text', default: '' })
  reason: string;

  /** Deterministic impact estimate (0-100). Never set by the AI. */
  @Column({ type: 'double precision' })
  impact: number;

  /** Deterministic confidence in the evidence (0-100). Never set by the AI. */
  @Column({ type: 'double precision' })
  confidence: number;

  /** Deterministic effort estimate (0-100). Never set by the AI. */
  @Column({ type: 'double precision' })
  effort: number;

  /** Deterministic priority derived from impact/confidence/effort. */
  @Column({ type: 'varchar', length: 20 })
  priority: string;

  @Column({ type: 'text', name: 'suggested_action', default: '' })
  suggestedAction: string;

  @Column({ type: 'boolean', name: 'ai_explained', default: false })
  aiExplained: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Recommendation outcome — tracks the full lifecycle:
 *   Recommendation → Task → Change → Verification → Observed Result.
 *
 * Do not close the recommendation merely because a task became Done.
 * Require verification and observation.
 */
@Entity('decision_recommendation_outcomes')
@Index('idx_dro_recommendation', ['recommendationId'])
@Index('idx_dro_site', ['siteId'])
@Index('idx_dro_outcome', ['outcome'])
export class DecisionRecommendationOutcome {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'recommendation_id' })
  recommendationId: string;

  @Column({ type: 'uuid', name: 'task_id', nullable: true })
  taskId: string | null;

  @Column({ type: 'uuid', name: 'change_log_id', nullable: true })
  changeLogId: string | null;

  @Column({ type: 'timestamptz', name: 'implemented_at', nullable: true })
  implementedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'verified_at', nullable: true })
  verifiedAt: Date | null;

  /** IMPLEMENTED / VERIFIED / POSITIVE_OBSERVATION / NEUTRAL_OBSERVATION / NEGATIVE_OBSERVATION / INSUFFICIENT_DATA. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  outcome: string | null;

  /** IMMEDIATE_RECRAWL / GSC_OBSERVATION / AI_VISIBILITY_RUN / MANUAL_REVIEW / AUTOMATED_CHECK. */
  @Column({ type: 'varchar', length: 30, name: 'verification_type', nullable: true })
  verificationType: string | null;

  @Column({ type: 'timestamptz', name: 'observation_window_end', nullable: true })
  observationWindowEnd: Date | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  evidence: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

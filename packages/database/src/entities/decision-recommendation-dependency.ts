import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Recommendation dependency — directed edge in the dependency graph.
 * dependent_id must complete before dependency_id can proceed.
 */
@Entity('decision_recommendation_dependencies')
@Index('idx_drd_dependent', ['dependentId'])
@Index('idx_drd_dependency', ['dependencyId'])
@Index('idx_drd_site', ['siteId'])
export class DecisionRecommendationDependency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  /** The recommendation that is blocked. */
  @Column({ type: 'uuid', name: 'dependent_id' })
  dependentId: string;

  /** The recommendation that must complete first. */
  @Column({ type: 'uuid', name: 'dependency_id' })
  dependencyId: string;

  /** BLOCKS / REQUIRES_DATA / SHOULD_COMPLETE_FIRST. */
  @Column({ type: 'varchar', length: 30, name: 'dependency_type', default: 'BLOCKS' })
  dependencyType: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

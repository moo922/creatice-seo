import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Cluster membership. Roles: PRIMARY, SECONDARY, SUPPORTING, QUESTION, ENTITY,
 * LOCATION_MODIFIER. Confidence and reason come from the clustering classifier
 * or operator override — never hardcoded.
 */
@Entity('cluster_keywords')
@Index('idx_cluster_keywords_cluster', ['clusterId', 'keywordId'], { unique: true })
@Index('idx_cluster_keywords_keyword', ['keywordId'])
export class ClusterKeyword {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'cluster_id' })
  clusterId: string;

  @Column({ type: 'uuid', name: 'keyword_id' })
  keywordId: string;

  @Column({ type: 'varchar', length: 30 })
  role: string;

  /** Classifier/operator confidence in this membership (0-1). null when unknown. */
  @Column({ type: 'double precision', nullable: true })
  confidence: number | null;

  /** Why this keyword belongs to this cluster. */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /** Source of the membership: clustering / intent / operator / import. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  source: string | null;

  /** Whether an operator has approved this membership. */
  @Column({ type: 'boolean', default: false })
  approved: boolean;
}
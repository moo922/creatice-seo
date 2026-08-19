import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Versioned priority weights per site. If no override exists, the system
 * uses DEFAULT_WEIGHTS from the decision package's priority-engine.
 *
 * Supports DECISION_PRIORITY_V1, DECISION_PRIORITY_V2, etc.
 * Historical recommendations retain their original methodology.
 */
@Entity('decision_priority_weights')
@Index('idx_dpweights_site', ['siteId'], { unique: true })
export class DecisionPriorityWeight {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'varchar', length: 50, name: 'strategy_type', default: 'CUSTOM' })
  strategyType: string;

  @Column({ type: 'double precision', name: 'business_value', default: 0.20 })
  businessValue: number;

  @Column({ type: 'double precision', name: 'search_opportunity', default: 0.18 })
  searchOpportunity: number;

  @Column({ type: 'double precision', name: 'severity', default: 0.15 })
  severity: number;

  @Column({ type: 'double precision', name: 'affected_traffic', default: 0.12 })
  affectedTraffic: number;

  @Column({ type: 'double precision', name: 'affected_pages', default: 0.08 })
  affectedPages: number;

  @Column({ type: 'double precision', name: 'confidence', default: 0.10 })
  confidence: number;

  @Column({ type: 'double precision', name: 'urgency', default: 0.10 })
  urgency: number;

  @Column({ type: 'double precision', name: 'effort_inverse', default: 0.07 })
  effortInverse: number;

  @Column({ type: 'varchar', length: 50, name: 'priority_version', default: 'DECISION_PRIORITY_V1' })
  priorityVersion: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

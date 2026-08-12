import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A detected operations alert. Alerts never modify a live site; handling an
 * alert creates an issue (and usually a recommendation), which then flows
 * through the human-in-the-loop issue lifecycle.
 */
@Entity('operations_alerts')
@Index('idx_ops_alerts_site_created', ['siteId', 'createdAt'])
@Index('idx_ops_alerts_kind_status', ['kind', 'status'])
export class OperationsAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'varchar', length: 40 })
  kind: string;

  @Column({ type: 'varchar', length: 20 })
  severity: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  data: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string;

  @Column({ type: 'uuid', name: 'issue_id', nullable: true })
  issueId: string | null;

  @Column({ type: 'timestamptz', name: 'detected_at' })
  detectedAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

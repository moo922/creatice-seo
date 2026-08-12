import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('activity_logs')
@Index('idx_activity_logs_user', ['userId', 'createdAt'])
@Index('idx_activity_logs_site', ['siteId', 'createdAt'])
@Index('idx_activity_logs_organization', ['organizationId', 'createdAt'])
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'uuid', name: 'site_id', nullable: true })
  siteId: string | null;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'varchar', length: 100, name: 'entity_type', nullable: true })
  entityType: string | null;

  @Column({ type: 'varchar', length: 100, name: 'entity_id', nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  meta: Record<string, unknown>;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 512, name: 'user_agent', nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

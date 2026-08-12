import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * An actionable task derived from an issue/recommendation. Tasks carry an
 * assignee, deadline, site, URL and internal/client-facing notes, plus the
 * evidence that justified them.
 */
@Entity('operations_tasks')
@Index('idx_ops_tasks_site_created', ['siteId', 'createdAt'])
@Index('idx_ops_tasks_issue', ['issueId'])
@Index('idx_ops_tasks_assignee', ['assigneeId'])
@Index('idx_ops_tasks_status', ['status'])
export class OperationsTask {
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

  @Column({ type: 'text', nullable: true })
  url: string | null;

  @Column({ type: 'uuid', name: 'assignee_id', nullable: true })
  assigneeId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  deadline: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'TODO' })
  status: string;

  @Column({ type: 'text', name: 'internal_notes', default: '' })
  internalNotes: string;

  @Column({ type: 'text', name: 'client_notes', default: '' })
  clientNotes: string;

  @Column({ type: 'text', default: '' })
  evidence: string;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

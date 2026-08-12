import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Change log: records what changed on a page and, where possible, captures the
 * before/after values so post-change performance can be compared. Change types
 * cover title, meta, content, headings, canonical, robots, schema, internal
 * links, redirect, page created/removed and Rank Math fields.
 */
@Entity('change_logs')
@Index('idx_change_logs_site_created', ['siteId', 'changedAt'])
@Index('idx_change_logs_page', ['siteId', 'pageUrl'])
@Index('idx_change_logs_task', ['taskId'])
export class ChangeLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'text', name: 'page_url' })
  pageUrl: string;

  @Column({ type: 'uuid', name: 'task_id', nullable: true })
  taskId: string | null;

  @Column({ type: 'varchar', length: 30, name: 'change_type' })
  changeType: string;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb' })
  after: Record<string, unknown>;

  @Column({ type: 'uuid', name: 'changed_by', nullable: true })
  changedBy: string | null;

  @Column({ type: 'timestamptz', name: 'changed_at' })
  changedAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

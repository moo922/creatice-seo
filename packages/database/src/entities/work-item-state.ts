import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { WorkItemPriority, WorkItemStatus } from '@creative-seo/types';

/**
 * Per-item overrides for the agency work queue. The queue itself is an
 * aggregation of live domain tables (issues, tasks, content, links, jobs,
 * reports, integrations); this table stores only the mutable triage state keyed
 * by the item's stable idempotency key (`<source>:<entityId>`), so a work item
 * can be assigned, re-prioritized, marked reviewed/ignored or converted to a
 * task without forking the source data.
 */
@Entity('work_item_states')
@Index('idx_work_item_states_item_key', ['itemKey'], { unique: true })
@Index('idx_work_item_states_site', ['siteId'])
@Index('idx_work_item_states_assignee', ['assignedToUserId'])
@Index('idx_work_item_states_status', ['status'])
export class WorkItemState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200, name: 'item_key' })
  itemKey: string;

  @Column({ type: 'uuid', name: 'site_id', nullable: true })
  siteId: string | null;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: WorkItemStatus;

  /** Priority override (kept here, never written back into the source entity). */
  @Column({ type: 'varchar', length: 20, name: 'priority', nullable: true })
  priority: WorkItemPriority | null;

  @Column({ type: 'uuid', name: 'assigned_to_user_id', nullable: true })
  assignedToUserId: string | null;

  @Column({ type: 'timestamptz', name: 'assigned_at', nullable: true })
  assignedAt: Date | null;

  @Column({ type: 'uuid', name: 'reviewed_by', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewedAt: Date | null;

  /** Task created from this item (create_tasks bulk action). */
  @Column({ type: 'uuid', name: 'task_id', nullable: true })
  taskId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

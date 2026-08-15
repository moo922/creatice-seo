import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { WorkFilterCriteriaDto } from '@creative-seo/types';

/**
 * A saved filter for the agency work queue, owned by one user. `builtin` rows
 * are lazily seeded for each user so the workspace ships with the standard
 * quick views (Critical Today, Content Waiting Approval, …) without forcing
 * users to configure anything.
 */
@Entity('work_filters')
@Index('idx_work_filters_user', ['userId', 'createdAt'])
export class WorkFilter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'boolean', default: false })
  builtin: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  criteria: WorkFilterCriteriaDto;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

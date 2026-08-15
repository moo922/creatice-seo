import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { AutomationOperationSettingsDto } from '@creative-seo/types';

/**
 * Per-site recurring automation configuration. One row per site. The `operations`
 * map holds the schedule + switch for each supported operation and `defaults`
 * holds the platform auto-behaviors (analyze, detect issues, generate
 * recommendations, generate content, publish, apply fixes). Published WordPress
 * content is never modified by the scheduler regardless of these flags.
 */
@Entity('site_automation_settings')
@Index('idx_automation_settings_site', ['siteId'], { unique: true })
export class SiteAutomationSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  operations: Record<string, AutomationOperationSettingsDto>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  defaults: Record<string, boolean>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

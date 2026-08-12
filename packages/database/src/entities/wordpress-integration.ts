import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('wp_integrations')
@Index('idx_wp_integrations_site_id', ['siteId'], { unique: true })
export class WordPressIntegration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id', unique: true })
  siteId: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ type: 'varchar', length: 2048, name: 'wp_url' })
  wpUrl: string;

  @Column({ type: 'varchar', length: 50, name: 'wp_version', nullable: true })
  wpVersion: string | null;

  @Column({ type: 'varchar', length: 50, name: 'php_version', nullable: true })
  phpVersion: string | null;

  @Column({ type: 'boolean', name: 'rank_math_detected', default: false })
  rankMathDetected: boolean;

  @Column({ type: 'varchar', length: 50, name: 'rank_math_version', nullable: true })
  rankMathVersion: string | null;

  @Column({ type: 'jsonb', name: 'active_plugins', default: () => "'[]'" })
  activePlugins: Record<string, unknown>[];

  @Column({ type: 'timestamptz', name: 'last_checked_at', nullable: true })
  lastCheckedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'last_sync_at', nullable: true })
  lastSyncAt: Date | null;

  @Column({ type: 'jsonb', name: 'last_sync_summary', nullable: true })
  lastSyncSummary: Record<string, unknown> | null;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

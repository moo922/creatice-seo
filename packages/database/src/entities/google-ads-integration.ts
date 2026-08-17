import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Google Ads integration state per site. Credentials never reach the frontend —
 * they live in site_secrets (kind GOOGLE_ADS) encrypted. This row tracks status,
 * customer id, targeting and freshness.
 */
@Entity('google_ads_integrations')
@Index('idx_google_ads_integrations_site', ['siteId'], { unique: true })
export class GoogleAdsIntegration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id', unique: true })
  siteId: string;

  /** NOT_CONFIGURED / CONFIGURED / ACCESS_PENDING / CONNECTED / ERROR. */
  @Column({ type: 'varchar', length: 30, default: 'NOT_CONFIGURED' })
  status: string;

  @Column({ type: 'varchar', length: 50, name: 'customer_id', nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar', length: 20, name: 'language_target', nullable: true })
  languageTarget: string | null;

  @Column({ type: 'jsonb', name: 'location_targets', default: () => "'[]'" })
  locationTargets: Record<string, unknown>[];

  @Column({ type: 'timestamptz', name: 'last_keyword_sync_at', nullable: true })
  lastKeywordSyncAt: Date | null;

  @Column({ type: 'jsonb', name: 'last_keyword_sync_summary', nullable: true })
  lastKeywordSyncSummary: Record<string, unknown> | null;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError: string | null;

  /** Stable internal error code (Section 91). */
  @Column({ type: 'varchar', length: 50, name: 'last_error_code', nullable: true })
  lastErrorCode: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
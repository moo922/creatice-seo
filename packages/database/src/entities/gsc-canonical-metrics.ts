import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { MetricGrain } from '@creative-seo/types';

/**
 * Canonical per-day GSC metric row with an EXPLICIT grain. The unique key is
 * (site_id, date, grain, dimension_key) where dimension_key identifies the
 * dimension values within that grain (e.g. the query for QUERY_DAILY, or a
 * stable hash for longer values). Rows of different grains are stored in
 * separate tables so they can never be accidentally summed together.
 */
@Entity('gsc_site_daily_metrics')
@Index('idx_gsc_site_daily_site_date', ['siteId', 'date'])
export class GscSiteDailyMetric {
  @PrimaryColumn({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @PrimaryColumn({ type: 'date' })
  date: string;

  @Column({ type: 'bigint', default: 0 })
  clicks: number;

  @Column({ type: 'bigint', default: 0 })
  impressions: number;

  @Column({ type: 'double precision', default: 0 })
  ctr: number;

  @Column({ type: 'double precision', name: 'average_position', nullable: true })
  averagePosition: number | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

/**
 * Canonical per-day per-query GSC metric row (grain QUERY_DAILY). `query` keeps
 * the original Search Console text; `normalizedQuery` is used only for
 * matching/deduplication and never overwrites the original.
 */
@Entity('gsc_query_daily_metrics')
@Index('idx_gsc_query_daily_site_date', ['siteId', 'date'])
@Index('idx_gsc_query_daily_site_query', ['siteId', 'query'])
export class GscQueryDailyMetric {
  @PrimaryColumn({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @PrimaryColumn({ type: 'date' })
  date: string;

  @PrimaryColumn({ type: 'varchar', length: 255 })
  query: string;

  @Column({ type: 'varchar', length: 255, name: 'normalized_query' })
  normalizedQuery: string;

  @Column({ type: 'bigint', default: 0 })
  clicks: number;

  @Column({ type: 'bigint', default: 0 })
  impressions: number;

  @Column({ type: 'double precision', default: 0 })
  ctr: number;

  @Column({ type: 'double precision', nullable: true })
  position: number | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

/**
 * Canonical per-day per-page GSC metric row (grain PAGE_DAILY). `pageUrl` keeps
 * the original Google-reported URL; `normalizedUrl` is used for comparisons and
 * deduplication under documented normalization rules.
 */
@Entity('gsc_page_daily_metrics')
@Index('idx_gsc_page_daily_site_date', ['siteId', 'date'])
@Index('idx_gsc_page_daily_site_url', ['siteId', 'pageUrl'])
export class GscPageDailyMetric {
  @PrimaryColumn({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @PrimaryColumn({ type: 'date' })
  date: string;

  @PrimaryColumn({ type: 'varchar', length: 1024, name: 'page_url' })
  pageUrl: string;

  @Column({ type: 'varchar', length: 1024, name: 'normalized_url' })
  normalizedUrl: string;

  @Column({ type: 'bigint', default: 0 })
  clicks: number;

  @Column({ type: 'bigint', default: 0 })
  impressions: number;

  @Column({ type: 'double precision', default: 0 })
  ctr: number;

  @Column({ type: 'double precision', nullable: true })
  position: number | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

/**
 * Canonical per-day per-query-per-page GSC metric row (grain QUERY_PAGE_DAILY).
 * This is the only grain from which query<->page analysis (e.g. cannibalization)
 * may be derived.
 */
@Entity('gsc_query_page_daily_metrics')
@Index('idx_gsc_qp_site_date', ['siteId', 'date'])
export class GscQueryPageDailyMetric {
  @PrimaryColumn({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @PrimaryColumn({ type: 'date' })
  date: string;

  @PrimaryColumn({ type: 'varchar', length: 255 })
  query: string;

  @PrimaryColumn({ type: 'varchar', length: 1024, name: 'page_url' })
  pageUrl: string;

  @Column({ type: 'varchar', length: 255, name: 'normalized_query' })
  normalizedQuery: string;

  @Column({ type: 'varchar', length: 1024, name: 'normalized_url' })
  normalizedUrl: string;

  @Column({ type: 'bigint', default: 0 })
  clicks: number;

  @Column({ type: 'bigint', default: 0 })
  impressions: number;

  @Column({ type: 'double precision', default: 0 })
  ctr: number;

  @Column({ type: 'double precision', nullable: true })
  position: number | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

/** Typed bucket for iterating canonical grain tables uniformly. */
export const CANONICAL_METRIC_ENTITIES = {
  SITE_DAILY: GscSiteDailyMetric,
  QUERY_DAILY: GscQueryDailyMetric,
  PAGE_DAILY: GscPageDailyMetric,
  QUERY_PAGE_DAILY: GscQueryPageDailyMetric,
} as const satisfies Partial<Record<MetricGrain, unknown>>;

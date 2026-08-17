import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Google Ads Keyword Planner metrics. Kept strictly separate from GSC
 * performance metrics (Section 12). Values are planning estimates, not real-time
 * search counts, so `retrieved_at` + `source_version` track freshness.
 */
@Entity('keyword_planner_metrics')
@Index('idx_kpm_keyword', ['keywordId'])
@Index('idx_kpm_site', ['siteId'])
export class KeywordPlannerMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'keyword_id' })
  keywordId: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'varchar', length: 30, name: 'location_target', nullable: true })
  locationTarget: string | null;

  @Column({ type: 'varchar', length: 30, name: 'language_target', nullable: true })
  languageTarget: string | null;

  @Column({ type: 'double precision', name: 'avg_monthly_searches', nullable: true })
  avgMonthlySearches: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  competition: string | null;

  @Column({ type: 'double precision', name: 'competition_index', nullable: true })
  competitionIndex: number | null;

  @Column({ type: 'jsonb', name: 'historical_months', nullable: true })
  historicalMonths: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', name: 'retrieved_at' })
  retrievedAt: Date;

  @Column({ type: 'varchar', length: 50, name: 'source_version', nullable: true })
  sourceVersion: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
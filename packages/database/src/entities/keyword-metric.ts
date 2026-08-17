import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Keyword metric per date per source. GSC data (clicks/impressions/ctr/position)
 * and Google Ads search-volume data are NEVER mixed into one row: the `source`
 * column (GSC vs GOOGLE_ADS) separates them. Google Ads search-volume lives in
 * keyword_planner_metrics (Section 12); this table carries GSC performance.
 */
@Entity('keyword_metrics')
@Index('idx_keyword_metrics_keyword_date', ['keywordId', 'metricDate', 'source'], { unique: true })
@Index('idx_keyword_metrics_source', ['source'])
export class KeywordMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'keyword_id' })
  keywordId: string;

  @Column({ type: 'date', name: 'metric_date' })
  metricDate: string;

  /** GSC / GOOGLE_ADS / MANUAL / AI_RESEARCH. */
  @Column({ type: 'varchar', length: 20, default: 'GSC' })
  source: string;

  @Column({ type: 'bigint', default: 0 })
  clicks: number;

  @Column({ type: 'bigint', default: 0 })
  impressions: number;

  @Column({ type: 'double precision', default: 0 })
  ctr: number;

  @Column({ type: 'double precision', default: 0 })
  position: number;

  /** Google Ads average monthly searches (keyword_planner only, Section 11). */
  @Column({ type: 'double precision', name: 'monthly_search_volume', nullable: true })
  monthlySearchVolume: number | null;

  /** Google Ads competition level (keyword_planner only). */
  @Column({ type: 'varchar', length: 50, nullable: true })
  competition: string | null;

  /** Google Ads competition index (keyword_planner only). */
  @Column({ type: 'double precision', name: 'competition_index', nullable: true })
  competitionIndex: number | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
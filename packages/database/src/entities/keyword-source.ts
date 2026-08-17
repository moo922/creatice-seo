import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Keyword source association. A single canonical Keyword may arrive from
 * multiple sources (GSC, Google Ads, manual, site content, AI research, import).
 * This table records every source that contributed the keyword, preserving the
 * exact original wording in `source_value` where available.
 */
@Entity('keyword_sources')
@Index('idx_keyword_sources_keyword_source', ['keywordId', 'source'], { unique: true })
@Index('idx_keyword_sources_site_source', ['siteId', 'source'])
export class KeywordSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'keyword_id' })
  keywordId: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  /** e.g. MANUAL, GSC, GOOGLE_ADS, SITE_CONTENT, AI_RESEARCH, IMPORT. */
  @Column({ type: 'varchar', length: 30 })
  source: string;

  /** Exact wording as it arrived from this source (may differ slightly from the canonical keyword). */
  @Column({ type: 'text', name: 'source_value', nullable: true })
  sourceValue: string | null;

  /** How many times this source contributed the keyword (Section 5). */
  @Column({ type: 'int', default: 1 })
  count: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'first_seen_at' })
  firstSeenAt: Date;

  @Column({ type: 'timestamptz', name: 'last_seen_at', nullable: true })
  lastSeenAt: Date | null;
}
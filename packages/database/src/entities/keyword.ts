import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Canonical Keyword entity (Gap Closure 04).
 *
 * A keyword may originate from multiple sources (GSC, Google Ads, manual, site
 * content, AI research, import). The exact source wording is preserved in
 * `keyword`; a normalized form (Arabic-aware + English) is stored in
 * `normalized` and drives duplicate detection via `normalizedHash`.
 *
 * We never overwrite `keyword` with the normalized form. We never duplicate a
 * row just because the same keyword arrived from a second source — source
 * associations live in `keyword_sources`.
 */
@Entity('keywords')
@Index('idx_keywords_site_hash', ['siteId', 'normalizedHash'], { unique: true })
@Index('idx_keywords_site_status', ['siteId', 'status'])
@Index('idx_keywords_site_language', ['siteId', 'language'])
export class Keyword {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  /** Exact source wording as it arrived (e.g. the GSC query text). */
  @Column({ type: 'text' })
  keyword: string;

  /** Normalized form used for duplicate detection / matching. Never displayed as the canonical keyword. */
  @Column({ type: 'text' })
  normalized: string;

  /** sha256 of the normalized form; unique per site. */
  @Column({ type: 'char', length: 64, name: 'normalized_hash' })
  normalizedHash: string;

  /** Primary source tag. Detailed multi-source associations live in keyword_sources. */
  @Column({ type: 'varchar', length: 30 })
  source: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  language: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  locale: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 30 })
  intent: string;

  /** Business relevance classification (Section 19). */
  @Column({ type: 'varchar', length: 30, name: 'business_relevance', nullable: true })
  businessRelevance: string | null;

  /** Question tag for question-like keywords (Section 52). */
  @Column({ type: 'varchar', length: 30, name: 'question_tag', nullable: true })
  questionTag: string | null;

  /** BRANDED / NON_BRANDED (Section 55). */
  @Column({ type: 'varchar', length: 30, name: 'brand_classification', nullable: true })
  brandClassification: string | null;

  /** COMPETITOR_QUERY / NOT_COMPETITOR (Section 56). */
  @Column({ type: 'varchar', length: 30, name: 'competitor_classification', nullable: true })
  competitorClassification: string | null;

  /** Why this keyword was discovered (Section 16). */
  @Column({ type: 'varchar', length: 30, name: 'discovery_reason', nullable: true })
  discoveryReason: string | null;

  /** Operator lock — automations must not silently change this keyword. */
  @Column({ type: 'boolean', name: 'manual_lock', default: false })
  manualLock: boolean;

  @Column({ type: 'varchar', length: 20, default: 'DISCOVERED' })
  status: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
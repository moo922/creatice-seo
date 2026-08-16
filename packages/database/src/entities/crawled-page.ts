import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * DEPRECATED (compatibility) — the legacy flat "latest page state" model.
 *
 * The versioned crawl architecture (crawl_runs / crawl_pages / crawl_links /
 * crawl_errors) is the source of truth for new crawls. This table is kept for
 * backward compatibility: versioned crawls still upsert here so existing link
 * analysis, activation and automation flows keep working, and
 * `link_analyses` reads it only when no versioned crawl run exists yet.
 * New features must use the crawl-run tables. Do not extend this model.
 */
@Entity('crawled_pages')
@Index('idx_crawled_pages_site_url', ['siteId', 'url'], { unique: true })
export class CrawledPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', nullable: true })
  title: string | null;

  @Column({ type: 'int', name: 'http_status', nullable: true })
  httpStatus: number | null;

  @Column({ type: 'int', name: 'word_count', default: 0 })
  wordCount: number;

  @Column({ type: 'text', default: '' })
  text: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  headings: string[];

  /** Extracted outgoing links: [{ url, anchor }]. */
  @Column({ type: 'jsonb', name: 'out_links', default: () => "'[]'" })
  outLinks: Array<{ url: string; anchor: string }>;

  @Column({ type: 'timestamptz', name: 'crawled_at' })
  crawledAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

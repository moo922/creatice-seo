import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One page captured in a versioned crawl run. Holds every deterministic
 * on-page signal an audit engine needs (title, meta, canonical, robots,
 * headings, schema, hreflang, word count, hash) without storing raw HTML.
 */
@Entity('crawl_pages')
@Index('idx_crawl_pages_run', ['crawlRunId'])
@Index('idx_crawl_pages_site_run', ['siteId', 'crawlRunId'])
@Index('idx_crawl_pages_run_url', ['crawlRunId', 'normalizedUrl'], { unique: true })
export class CrawlPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'crawl_run_id' })
  crawlRunId: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', name: 'normalized_url' })
  normalizedUrl: string;

  @Column({ type: 'text', name: 'final_url', nullable: true })
  finalUrl: string | null;

  @Column({ type: 'int', name: 'http_status', nullable: true })
  httpStatus: number | null;

  @Column({ type: 'varchar', length: 255, name: 'content_type', nullable: true })
  contentType: string | null;

  @Column({ type: 'int', default: 0 })
  depth: number;

  @Column({ type: 'text', nullable: true })
  title: string | null;

  @Column({ type: 'text', name: 'meta_description', nullable: true })
  metaDescription: string | null;

  @Column({ type: 'text', nullable: true })
  h1: string | null;

  /** Headings as [{ tag, text }] in document order. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  headings: Array<{ tag: string; text: string }>;

  @Column({ type: 'text', nullable: true })
  canonical: string | null;

  /** Raw meta robots tokens, e.g. ['noindex', 'nofollow']. */
  @Column({ type: 'jsonb', name: 'meta_robots', default: () => "'[]'" })
  metaRobots: string[];

  @Column({ type: 'boolean', default: true })
  indexable: boolean;

  @Column({ type: 'varchar', length: 20, nullable: true })
  language: string | null;

  @Column({ type: 'int', name: 'word_count', default: 0 })
  wordCount: number;

  @Column({ type: 'varchar', length: 64, name: 'content_hash', nullable: true })
  contentHash: string | null;

  @Column({ type: 'boolean', default: false })
  rendered: boolean;

  /** Parsed JSON-LD scripts (objects and arrays), as encountered. */
  @Column({ type: 'jsonb', name: 'schema_json', nullable: true })
  schemaJson: unknown[] | null;

  /** Total JSON-LD script blocks found (valid + invalid). */
  @Column({ type: 'int', name: 'schema_blocks', default: 0 })
  schemaBlocks: number;

  /** JSON-LD blocks that failed to parse: [{ message }]. */
  @Column({ type: 'jsonb', name: 'schema_errors', default: () => "'[]'" })
  schemaErrors: Array<{ message: string }>;

  /** Alternate-language links as [{ href, hreflang }]. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  hreflang: Array<{ href: string; hreflang: string }>;

  /** Images as [{ src, alt }]. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  images: Array<{ src: string; alt: string | null }>;

  /** Full redirect chain (requested URL first, final URL last). */
  @Column({ type: 'jsonb', name: 'redirect_chain', default: () => "'[]'" })
  redirectChain: string[];

  /** True when a redirect loop was detected while fetching this URL. */
  @Column({ type: 'boolean', name: 'redirect_loop', default: false })
  redirectLoop: boolean;

  /** Page text content (HTML, capped at ~100KB). Used by AEO/GEO audits. */
  @Column({ type: 'text', nullable: true })
  text: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

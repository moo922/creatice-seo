import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A crawled page: content, headings and the extracted outgoing link graph.
 * Internal-link intelligence consumes these (plus the approved URL map and
 * keyword clusters) to detect orphans, weak targets, broken links, overused
 * anchors, conflicts and relevant link opportunities.
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

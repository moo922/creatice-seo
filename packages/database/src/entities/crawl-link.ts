import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * An outbound link observed on a page during a versioned crawl run. Records
 * anchor text, rel/no-follow attributes and whether the target is internal so
 * the link-analysis and audit engines can reason about the graph without
 * re-fetching.
 */
@Entity('crawl_links')
@Index('idx_crawl_links_run', ['crawlRunId'])
@Index('idx_crawl_links_source', ['sourcePageId'])
@Index('idx_crawl_links_site_run', ['siteId', 'crawlRunId'])
export class CrawlLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'crawl_run_id' })
  crawlRunId: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'source_page_id', nullable: true })
  sourcePageId: string | null;

  @Column({ type: 'text', name: 'source_url' })
  sourceUrl: string;

  @Column({ type: 'text', name: 'target_url' })
  targetUrl: string;

  @Column({ type: 'text', name: 'normalized_target_url' })
  normalizedTargetUrl: string;

  @Column({ type: 'text', name: 'anchor_text', default: '' })
  anchorText: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  rel: string | null;

  @Column({ type: 'boolean', default: false })
  internal: boolean;

  @Column({ type: 'boolean', default: false })
  nofollow: boolean;

  /** HTTP status of the target when observed during the same run (null otherwise). */
  @Column({ type: 'int', name: 'status_code_when_known', nullable: true })
  statusCodeWhenKnown: number | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

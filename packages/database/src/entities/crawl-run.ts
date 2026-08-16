import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { CrawlRobotsStatus, CrawlRunStatus, CrawlSitemapStatus } from '@creative-seo/types';

/**
 * A versioned crawl run over a site. Unlike the flat `crawled_pages` table
 * (which holds only the latest page state), a run snapshots every page, link
 * and error discovered during a single crawl so results are reproducible and
 * comparable over time.
 */
@Entity('crawl_runs')
@Index('idx_crawl_runs_site_created', ['siteId', 'createdAt'])
export class CrawlRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'RUNNING' })
  status: CrawlRunStatus;

  @Column({ type: 'timestamptz', name: 'started_at' })
  startedAt: Date;

  @Column({ type: 'timestamptz', name: 'finished_at', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'text', name: 'seed_url' })
  seedUrl: string;

  @Column({ type: 'text', name: 'user_agent' })
  userAgent: string;

  @Column({ type: 'int', name: 'max_pages', default: 50 })
  maxPages: number;

  @Column({ type: 'int', name: 'pages_discovered', default: 0 })
  pagesDiscovered: number;

  @Column({ type: 'int', name: 'pages_crawled', default: 0 })
  pagesCrawled: number;

  @Column({ type: 'int', name: 'pages_failed', default: 0 })
  pagesFailed: number;

  @Column({ type: 'varchar', length: 20, name: 'robots_status', default: 'ERROR' })
  robotsStatus: CrawlRobotsStatus;

  @Column({ type: 'varchar', length: 20, name: 'sitemap_status', default: 'NOT_FOUND' })
  sitemapStatus: CrawlSitemapStatus;

  @Column({ type: 'int', name: 'rendered_pages', default: 0 })
  renderedPages: number;

  /** URLs listed in the discovered sitemap (empty when none was found). */
  @Column({ type: 'jsonb', name: 'sitemap_urls', default: () => "'[]'" })
  sitemapUrls: string[];

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A question mapped to a specific page or cluster. Sources include GSC
 * queries, keyword clusters, AI expansion, and the Knowledge Base.
 * Used by AEO audits to measure question coverage.
 */
@Entity('page_questions')
@Index('idx_page_questions_site_url', ['siteId', 'pageUrl'])
@Index('idx_page_questions_site_crawl', ['siteId', 'crawlPageId'])
export class PageQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'text', name: 'page_url' })
  pageUrl: string;

  @Column({ type: 'uuid', name: 'crawl_page_id', nullable: true })
  crawlPageId: string | null;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'varchar', length: 30 })
  category: string;

  @Column({ type: 'varchar', length: 10, default: 'MEDIUM' })
  priority: string;

  @Column({ type: 'varchar', length: 30 })
  status: string;

  @Column({ type: 'varchar', length: 30 })
  source: string;

  @Column({ type: 'int', nullable: true })
  impressions: number | null;

  @Column({ type: 'text', default: '' })
  evidence: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

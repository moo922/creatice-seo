import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A link analysis run over a site's crawled pages + approved URL map. Stores
 * aggregate stats per detection type and the count of suggestions produced.
 */
@Entity('link_analyses')
@Index('idx_link_analyses_site_created', ['siteId', 'createdAt'])
export class LinkAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'varchar', length: 20, default: 'RUNNING' })
  status: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  stats: Record<string, unknown>;

  @Column({ type: 'int', name: 'suggestions_created', default: 0 })
  suggestionsCreated: number;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  /** The versioned crawl run this analysis consumed (null = legacy crawled_pages). */
  @Column({ type: 'uuid', name: 'crawl_run_id', nullable: true })
  crawlRunId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;
}

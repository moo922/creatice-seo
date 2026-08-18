import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Result of checking a specific AI crawler's access policy via robots.txt.
 */
@Entity('crawler_policy_results')
@Index('idx_crawler_policy_results_site', ['siteId'])
@Index('idx_crawler_policy_results_site_crawler', ['siteId', 'crawlerName'])
export class CrawlerPolicyResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'varchar', length: 100, name: 'crawler_name' })
  crawlerName: string;

  @Column({ type: 'varchar', length: 30, name: 'crawler_purpose' })
  crawlerPurpose: string;

  @Column({ type: 'varchar', length: 20, name: 'access_result' })
  accessResult: string;

  /** Detailed robots.txt analysis (allowed paths, disallowed paths, etc.). */
  @Column({ type: 'jsonb', name: 'robots_txt_analysis', default: () => "'{}'" })
  robotsTxtAnalysis: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'checked_at' })
  checkedAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

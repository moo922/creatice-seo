import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * An entity extracted from or associated with a specific page. Used by GEO
 * audits to measure entity clarity and coverage.
 */
@Entity('page_entities')
@Index('idx_page_entities_site_url', ['siteId', 'pageUrl'])
export class PageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'text', name: 'page_url' })
  pageUrl: string;

  @Column({ type: 'uuid', name: 'crawl_page_id', nullable: true })
  crawlPageId: string | null;

  @Column({ type: 'varchar', length: 200, name: 'entity_name' })
  entityName: string;

  @Column({ type: 'varchar', length: 50, name: 'entity_type' })
  entityType: string;

  /** Clarity score 0-1 (how clearly the entity is presented). */
  @Column({ type: 'double precision', default: 0.5 })
  clarity: number;

  @Column({ type: 'boolean', default: true })
  mentioned: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

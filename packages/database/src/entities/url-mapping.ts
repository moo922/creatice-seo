import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('url_mappings')
@Index('idx_url_mappings_site_url', ['siteId', 'url'], { unique: true })
@Index('idx_url_mappings_cluster', ['clusterId'])
export class UrlMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'cluster_id', nullable: true })
  clusterId: string | null;

  @Column({ type: 'uuid', name: 'keyword_id', nullable: true })
  keywordId: string | null;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'varchar', length: 30 })
  source: string;

  @Column({ type: 'boolean', name: 'manual_override', default: false })
  manualOverride: boolean;

  @Column({ type: 'uuid', name: 'approved_by', nullable: true })
  approvedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

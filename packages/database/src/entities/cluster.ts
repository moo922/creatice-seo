import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('clusters')
@Index('idx_clusters_site_id', ['siteId'])
export class Cluster {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'varchar', length: 30 })
  intent: string;

  @Column({ type: 'varchar', length: 20, name: 'page_type' })
  pageType: string;

  @Column({ type: 'double precision' })
  confidence: number;

  @Column({ type: 'text', name: 'target_url', nullable: true })
  targetUrl: string | null;

  @Column({ type: 'varchar', length: 20, name: 'recommended_action' })
  recommendedAction: string;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @Column({ type: 'boolean', name: 'ai_reviewed', default: false })
  aiReviewed: boolean;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

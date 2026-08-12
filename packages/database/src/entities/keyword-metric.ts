import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('keyword_metrics')
@Index('idx_keyword_metrics_keyword_date', ['keywordId', 'metricDate', 'source'], { unique: true })
export class KeywordMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'keyword_id' })
  keywordId: string;

  @Column({ type: 'date', name: 'metric_date' })
  metricDate: string;

  @Column({ type: 'varchar', length: 20, default: 'gsc' })
  source: string;

  @Column({ type: 'bigint', default: 0 })
  clicks: number;

  @Column({ type: 'bigint', default: 0 })
  impressions: number;

  @Column({ type: 'double precision', default: 0 })
  ctr: number;

  @Column({ type: 'double precision', default: 0 })
  position: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

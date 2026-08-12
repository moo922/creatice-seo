import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * One row per (property, day, dimension split). When a dimension was not
 * requested during a sync its column holds '' (the "all" sentinel). The unique
 * key is (property_id, metric_date, row_key) where row_key = sha1 of the
 * concatenated dimension values, which sidesteps Postgres btree row limits on
 * long query/page values. B-tree indexes live in the migration only.
 */
@Entity('gsc_daily_metrics')
export class GscDailyMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'property_id' })
  propertyId: string;

  @Column({ type: 'date', name: 'metric_date' })
  metricDate: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  query: string;

  @Column({ type: 'varchar', length: 1024, default: '' })
  page: string;

  @Column({ type: 'varchar', length: 10, default: '' })
  country: string;

  @Column({ type: 'varchar', length: 20, default: '' })
  device: string;

  @Column({ type: 'char', length: 40, name: 'row_key' })
  rowKey: string;

  @Column({ type: 'bigint', default: 0 })
  clicks: number;

  @Column({ type: 'bigint', default: 0 })
  impressions: number;

  @Column({ type: 'double precision', default: 0 })
  ctr: number;

  @Column({ type: 'double precision', default: 0 })
  position: number;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('gsc_opportunities')
export class GscOpportunity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'property_id' })
  propertyId: string;

  @Column({ type: 'varchar', length: 40 })
  kind: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  query: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  page: string | null;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string;

  @Column({ type: 'date', name: 'window_start' })
  windowStart: string;

  @Column({ type: 'date', name: 'window_end' })
  windowEnd: string;

  @Column({ type: 'jsonb', name: 'current_value', default: () => "'{}'" })
  currentValue: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'previous_value', default: () => "'{}'" })
  previousValue: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'detected_at' })
  detectedAt: Date;
}

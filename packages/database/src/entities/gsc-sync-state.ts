import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('gsc_sync_states')
export class GscSyncState {
  @PrimaryColumn({ type: 'uuid', name: 'property_id' })
  propertyId: string;

  @PrimaryColumn({ type: 'varchar', length: 100, name: 'dimensions_key' })
  dimensionsKey: string;

  @Column({ type: 'date', name: 'last_sync_date' })
  lastSyncDate: string;

  @Column({ type: 'timestamptz', name: 'last_success_at' })
  lastSuccessAt: Date;
}

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Sync progress for a GSC property + dimension set. Tracks data-freshness and
 * integrity separately: last_requested_date is when the sync asked for data,
 * last_successful_date is the latest date actually written, and
 * latest_available_date is the latest date Search Console had data for
 * (accounting for GSC's 2-3 day finalization lag so recent unavailable days
 * are not misclassified as data loss).
 */
@Entity('gsc_sync_states')
@Index('idx_gsc_sync_state_property', ['propertyId'])
export class GscSyncState {
  @PrimaryColumn({ type: 'uuid', name: 'property_id' })
  propertyId: string;

  @PrimaryColumn({ type: 'varchar', length: 100, name: 'dimensions_key' })
  dimensionsKey: string;

  @Column({ type: 'date', name: 'last_sync_date' })
  lastSyncDate: string;

  @Column({ type: 'timestamptz', name: 'last_success_at' })
  lastSuccessAt: Date;

  /** Latest date the sync attempted to request data for. */
  @Column({ type: 'date', name: 'last_requested_date', nullable: true })
  lastRequestedDate: string | null;

  /** Latest date for which data was actually persisted. */
  @Column({ type: 'date', name: 'last_successful_date', nullable: true })
  lastSuccessfulDate: string | null;

  /** Latest date Search Console reported data for (post-latency). */
  @Column({ type: 'date', name: 'latest_available_date', nullable: true })
  latestAvailableDate: string | null;

  /** Sync status: IDLE / SYNCING / OK / ERROR. */
  @Column({ type: 'varchar', length: 20, default: 'IDLE' })
  syncStatus: string;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

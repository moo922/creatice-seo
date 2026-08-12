import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('gsc_properties')
@Index('idx_gsc_properties_site_id', ['siteId'], { unique: true })
export class GscProperty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id', unique: true })
  siteId: string;

  @Column({ type: 'text', name: 'site_url' })
  siteUrl: string;

  @Column({ type: 'varchar', length: 20 })
  type: string;

  @Column({ type: 'varchar', length: 50, name: 'permission_level' })
  permissionLevel: string;

  @Column({ type: 'boolean', default: false })
  selected: boolean;

  @Column({ type: 'varchar', length: 20, default: 'DISCONNECTED' })
  status: string;

  @Column({ type: 'timestamptz', name: 'last_sync_at', nullable: true })
  lastSyncAt: Date | null;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

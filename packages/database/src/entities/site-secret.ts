import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('site_secrets')
@Index('idx_site_secrets_site_id', ['siteId'])
export class SiteSecret {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'varchar', length: 50 })
  kind: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label: string | null;

  @Column({ type: 'text', name: 'encrypted_payload' })
  encryptedPayload: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  meta: Record<string, unknown>;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @Column({ type: 'timestamptz', name: 'last_validated_at', nullable: true })
  lastValidatedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

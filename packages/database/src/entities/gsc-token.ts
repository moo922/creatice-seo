import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('gsc_tokens')
export class GscToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** OAuth tokens are Google-account scoped, so they attach to the site. */
  @Column({ type: 'uuid', name: 'site_id', unique: true })
  siteId: string;

  @Column({ type: 'text', name: 'access_token_encrypted' })
  accessTokenEncrypted: string;

  @Column({ type: 'text', name: 'refresh_token_encrypted' })
  refreshTokenEncrypted: string;

  @Column({ type: 'timestamptz', name: 'access_token_expires_at' })
  accessTokenExpiresAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

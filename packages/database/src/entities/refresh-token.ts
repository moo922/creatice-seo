import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('refresh_tokens')
@Index('idx_refresh_tokens_user_id', ['userId'])
@Index('idx_refresh_tokens_hash', ['tokenHash'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 64, name: 'token_hash' })
  tokenHash: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', name: 'replaced_by_token_id', nullable: true })
  replacedByTokenId: string | null;

  @Column({ type: 'varchar', length: 512, name: 'user_agent', nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

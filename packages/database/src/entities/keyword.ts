import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('keywords')
@Index('idx_keywords_site_hash', ['siteId', 'normalizedHash'], { unique: true })
export class Keyword {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'varchar', length: 20 })
  source: string;

  @Column({ type: 'text' })
  keyword: string;

  @Column({ type: 'text' })
  normalized: string;

  @Column({ type: 'char', length: 64, name: 'normalized_hash' })
  normalizedHash: string;

  @Column({ type: 'varchar', length: 30 })
  intent: string;

  @Column({ type: 'varchar', length: 20, default: 'CANDIDATE' })
  status: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

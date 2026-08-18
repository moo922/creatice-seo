import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Versioned registry of known AI crawlers with their user-agent patterns
 * and purpose classifications. Used by GEO audits to evaluate crawler access.
 */
@Entity('ai_crawler_registry')
export class AiCrawlerRegistry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 200, name: 'user_agent_pattern' })
  userAgentPattern: string;

  @Column({ type: 'varchar', length: 30 })
  purpose: string;

  @Column({ type: 'varchar', length: 50 })
  category: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

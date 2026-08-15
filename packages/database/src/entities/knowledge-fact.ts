import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { KnowledgeCategory, KnowledgeVerificationStatus } from '@creative-seo/types';

/**
 * A single persistent, verified fact about a client/site. Backs the site
 * knowledge base used by content generation so output stays factual and
 * on-brand. Facts are versioned only implicitly (updatedAt) and are fully
 * managed through the API — never client-facing by default.
 */
@Entity('knowledge_facts')
@Index('idx_knowledge_facts_site_category', ['siteId', 'category'])
@Index('idx_knowledge_facts_site_key', ['siteId', 'key'], { unique: true })
export class KnowledgeFact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'varchar', length: 50 })
  category: KnowledgeCategory;

  @Column({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ type: 'varchar', length: 30, default: 'UNVERIFIED' })
  verificationStatus: KnowledgeVerificationStatus;

  /** Where the fact came from (client intake, crawl inference, etc.). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  source: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

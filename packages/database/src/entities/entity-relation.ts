import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Relationships between entities (e.g., Organization provides Service,
 * Service available in Location). Built from Knowledge Base and page analysis.
 */
@Entity('entity_relations')
@Index('idx_entity_relations_site', ['siteId'])
export class EntityRelation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'varchar', length: 200, name: 'subject_entity' })
  subjectEntity: string;

  @Column({ type: 'varchar', length: 100 })
  predicate: string;

  @Column({ type: 'varchar', length: 200, name: 'object_entity' })
  objectEntity: string;

  @Column({ type: 'boolean', default: false })
  verified: boolean;

  @Column({ type: 'varchar', length: 30 })
  source: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

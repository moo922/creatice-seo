import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { OrganizationStatus } from '@creative-seo/types';
import { Site } from './site';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: OrganizationStatus;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  meta: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  /** Websites owned by this client (loaded via loadRelationCountAndMap). */
  @OneToMany(() => Site, (site) => site.organization)
  sites: Site[];

  /** Populated at runtime via loadRelationCountAndMap — not a stored column. */
  siteCount?: number;
}

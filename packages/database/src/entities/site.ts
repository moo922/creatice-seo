import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { SiteStatus } from '@creative-seo/types';
import { Organization } from './organization';

@Entity('sites')
@Index('idx_sites_organization_id', ['organizationId'])
export class Site {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, (organization) => organization.sites)
  organization: Organization;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  domain: string;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  locale: string;

  @Column({ type: 'varchar', length: 50, default: 'English' })
  language: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'jsonb', name: 'target_cities', default: () => "'[]'" })
  targetCities: string[];

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: SiteStatus;

  /**
   * Per-site configuration: content rules, publishing rules, crawler policy and
   * automation settings. Enforced by the API and refined by later phases.
   */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  settings: Record<string, unknown>;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

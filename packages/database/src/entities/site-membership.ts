import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { SiteRole } from '@creative-seo/types';

@Entity('site_memberships')
@Index('idx_site_memberships_site_id', ['siteId'])
@Index('idx_site_memberships_user_id', ['userId'])
@Index('idx_site_memberships_site_user', ['siteId', 'userId'], { unique: true })
export class SiteMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 20, name: 'site_role', default: 'VIEWER' })
  siteRole: SiteRole;

  @Column({ type: 'uuid', name: 'granted_by', nullable: true })
  grantedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

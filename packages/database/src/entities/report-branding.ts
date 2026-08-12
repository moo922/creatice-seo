import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * White-label report branding for a site: agency identity (name + logo),
 * client identity (name + logo), contact details and the footer text shown on
 * generated reports. Agency defaults come from environment (AGENCY_*); this row
 * holds the per-site/agency overrides applied at generation time.
 */
@Entity('report_branding')
@Index('idx_report_branding_site', ['siteId'], { unique: true })
export class ReportBranding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'varchar', length: 255, name: 'agency_name' })
  agencyName: string;

  @Column({ type: 'text', name: 'agency_logo_url', default: '' })
  agencyLogoUrl: string;

  @Column({ type: 'varchar', length: 255, name: 'client_name' })
  clientName: string;

  @Column({ type: 'text', name: 'client_logo_url', default: '' })
  clientLogoUrl: string;

  /** e.g. { email: 'a@b.co', phone: '+1...', address: '...' }. */
  @Column({ type: 'jsonb', name: 'contact_details', default: () => "'{}'" })
  contactDetails: Record<string, string>;

  @Column({ type: 'text', default: '' })
  footer: string;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

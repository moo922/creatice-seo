import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A permanently saved report version. The full HTML is stored in the database
 * (text column) so every historical version remains retrievable; the optional
 * PDF file is written to the self-hosted REPORTS_DIR (pdf_path is relative).
 * Versions are never overwritten — generating again creates a new row.
 */
@Entity('reports')
@Index('idx_reports_site_created', ['siteId', 'createdAt'])
@Index('idx_reports_site_type', ['siteId', 'type'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId: string | null;

  @Column({ type: 'varchar', length: 30 })
  type: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'date', name: 'period_start', nullable: true })
  periodStart: string | null;

  @Column({ type: 'date', name: 'period_end', nullable: true })
  periodEnd: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'text' })
  html: string;

  @Column({ type: 'text', name: 'pdf_path', nullable: true })
  pdfPath: string | null;

  @Column({ type: 'varchar', length: 20, default: 'GENERATED' })
  status: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  meta: Record<string, unknown>;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

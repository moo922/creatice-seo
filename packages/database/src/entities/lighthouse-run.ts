import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A local Lighthouse audit of a single representative URL. Scores are kept
 * separate from the Internal Platform Health Score — Lighthouse measures
 * browser-rendered page quality, not the platform's deterministic crawl audit.
 */
@Entity('lighthouse_runs')
@Index('idx_lighthouse_site_created', ['siteId', 'createdAt'])
export class LighthouseRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'varchar', length: 20, default: 'RUNNING' })
  status: string;

  /** Performance / Accessibility / Best Practices / SEO scores (0-100). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  scores: Record<string, number | null>;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

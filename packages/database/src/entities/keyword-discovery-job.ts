import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Keyword discovery job history (Section 14). Discovery is explicit and bounded —
 * jobs carry a max idea count and never run uncontrolled expansion.
 */
@Entity('keyword_discovery_jobs')
@Index('idx_kdj_site', ['siteId'])
@Index('idx_kdj_site_status', ['siteId', 'status'])
export class KeywordDiscoveryJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  /** GSC / SITE_CONTENT / GOOGLE_ADS / MANUAL_SEEDS. */
  @Column({ type: 'varchar', length: 30 })
  jobType: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  input: Record<string, unknown>;

  @Column({ type: 'varchar', length: 10, nullable: true })
  language: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'int', name: 'max_ideas', default: 100 })
  maxIdeas: number;

  /** PENDING / RUNNING / SUCCEEDED / FAILED. */
  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ type: 'int', name: 'ideas_received', default: 0 })
  ideasReceived: number;

  @Column({ type: 'int', name: 'keywords_created', default: 0 })
  keywordsCreated: number;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'finished_at', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
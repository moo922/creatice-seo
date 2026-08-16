import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A single rule evaluation result from an audit run. Every row carries
 * machine-readable evidence (e.g. { rule: "MISSING_TITLE", url, evidence:
 * { title: null } }). Passed and failed results are persisted so the health
 * score is reproducible from this table alone.
 */
@Entity('audit_results')
@Index('idx_audit_results_run', ['auditRunId'])
@Index('idx_audit_results_site_run', ['siteId', 'auditRunId'])
@Index('idx_audit_results_rule', ['ruleKey', 'siteId'])
export class AuditResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'audit_run_id' })
  auditRunId: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'crawl_page_id', nullable: true })
  crawlPageId: string | null;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'varchar', length: 80, name: 'rule_key' })
  ruleKey: string;

  @Column({ type: 'int', name: 'rule_version', default: 1 })
  ruleVersion: number;

  @Column({ type: 'varchar', length: 30 })
  category: string;

  @Column({ type: 'varchar', length: 20 })
  severity: string;

  @Column({ type: 'boolean', default: true })
  passed: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  evidence: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

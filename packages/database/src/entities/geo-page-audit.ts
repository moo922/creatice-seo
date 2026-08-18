import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Per-page GEO (Generative Engine Optimization) audit result. Stores both
 * deterministic rule outcomes and AI semantic analysis results. The
 * overallScore is always computed deterministically from component scores.
 */
@Entity('geo_page_audits')
@Index('idx_geo_page_audits_site_run', ['siteId', 'auditRunId'])
@Index('idx_geo_page_audits_site_url', ['siteId', 'url'])
@Index('idx_geo_page_audits_crawl_page', ['crawlPageId'])
export class GeoPageAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'uuid', name: 'audit_run_id' })
  auditRunId: string;

  @Column({ type: 'uuid', name: 'crawl_page_id' })
  crawlPageId: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'varchar', length: 64, name: 'content_hash', nullable: true })
  contentHash: string | null;

  @Column({ type: 'int', name: 'prompt_version', nullable: true })
  promptVersion: number | null;

  @Column({ type: 'varchar', length: 50, name: 'ai_provider', nullable: true })
  aiProvider: string | null;

  @Column({ type: 'varchar', length: 100, name: 'ai_model', nullable: true })
  aiModel: string | null;

  @Column({ type: 'jsonb', name: 'entity_clarity', default: () => "'{}'" })
  entityClarity: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'entity_consistency', default: () => "'{}'" })
  entityConsistency: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'factual_specificity', default: () => "'{}'" })
  factualSpecificity: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'claim_verification', default: () => "'{}'" })
  claimVerification: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'evidence_quality', default: () => "'{}'" })
  evidenceQuality: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'source_quality', default: () => "'{}'" })
  sourceQuality: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'original_information', default: () => "'{}'" })
  originalInformation: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'expert_attribution', default: () => "'{}'" })
  expertAttribution: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'machine_accessibility', default: () => "'{}'" })
  machineAccessibility: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'structured_fact_clarity', default: () => "'{}'" })
  structuredFactClarity: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'citation_readiness', default: () => "'{}'" })
  citationReadiness: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'component_scores', default: () => "'[]'" })
  componentScores: Array<{ id: string; label: string; score: number; weight: number; version: number; evidence: Record<string, unknown> }>;

  @Column({ type: 'int', name: 'overall_score', default: 0 })
  overallScore: number;

  @Column({ type: 'varchar', length: 50, name: 'score_version', default: 'GEO_SCORE_V1' })
  scoreVersion: string;

  @Column({ type: 'varchar', length: 20, name: 'data_quality', default: 'GOOD' })
  dataQuality: string;

  @Column({ type: 'double precision', default: 0.5 })
  confidence: number;

  @Column({ type: 'varchar', length: 20, default: 'RUNNING' })
  status: string;

  @Column({ type: 'uuid', name: 'reused_from_audit_id', nullable: true })
  reusedFromAuditId: string | null;

  @Column({ type: 'timestamptz', name: 'started_at' })
  startedAt: Date;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

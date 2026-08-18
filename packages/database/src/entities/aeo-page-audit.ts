import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Per-page AEO (Answer Engine Optimization) audit result. Stores both
 * deterministic rule outcomes and AI semantic analysis results. The
 * overallScore is always computed deterministically from component scores —
 * AI never directly sets the final score.
 */
@Entity('aeo_page_audits')
@Index('idx_aeo_page_audits_site_run', ['siteId', 'auditRunId'])
@Index('idx_aeo_page_audits_site_url', ['siteId', 'url'])
@Index('idx_aeo_page_audits_crawl_page', ['crawlPageId'])
export class AeoPageAudit {
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

  /** Intent alignment evaluation (rating + reason). */
  @Column({ type: 'jsonb', name: 'intent_alignment', default: () => "'{}'" })
  intentAlignment: { rating: string; reason: string };

  /** Direct answer quality evaluation. */
  @Column({ type: 'jsonb', name: 'direct_answer', default: () => "'{}'" })
  directAnswer: { rating: string; evidence: string };

  /** Decision support evaluation (commercial pages). */
  @Column({ type: 'jsonb', name: 'decision_support', default: () => "'{}'" })
  decisionSupport: Record<string, unknown>;

  /** Semantic completeness evaluation. */
  @Column({ type: 'jsonb', name: 'semantic_completeness', default: () => "'{}'" })
  semanticCompleteness: Record<string, unknown>;

  /** Structure and extractability evaluation. */
  @Column({ type: 'jsonb', name: 'structure_extractability', default: () => "'{}'" })
  structureExtractability: Record<string, unknown>;

  /** Factual grounding evaluation. */
  @Column({ type: 'jsonb', name: 'factual_grounding', default: () => "'{}'" })
  factualGrounding: Record<string, unknown>;

  /** All component scores as [{ id, label, score, weight, version, evidence }]. */
  @Column({ type: 'jsonb', name: 'component_scores', default: () => "'[]'" })
  componentScores: Array<{ id: string; label: string; score: number; weight: number; version: number; evidence: Record<string, unknown> }>;

  /** Deterministic overall score 0-100. */
  @Column({ type: 'int', name: 'overall_score', default: 0 })
  overallScore: number;

  @Column({ type: 'varchar', length: 50, name: 'score_version', default: 'AEO_SCORE_V1' })
  scoreVersion: string;

  @Column({ type: 'varchar', length: 20, name: 'data_quality', default: 'GOOD' })
  dataQuality: string;

  /** Confidence in the audit result (0-1). */
  @Column({ type: 'double precision', default: 0.5 })
  confidence: number;

  @Column({ type: 'varchar', length: 20, default: 'RUNNING' })
  status: string;

  /** If this audit reused a previous semantic analysis, link to it. */
  @Column({ type: 'uuid', name: 'reused_from_audit_id', nullable: true })
  reusedFromAuditId: string | null;

  @Column({ type: 'timestamptz', name: 'started_at' })
  startedAt: Date;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

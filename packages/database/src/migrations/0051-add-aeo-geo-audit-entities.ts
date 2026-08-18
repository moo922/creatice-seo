import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddAeoGoreuditEntities00511720000000051 implements MigrationInterface {
  name = 'AddAeoGoreuditEntities00511720000000051';

  public async up(qr: QueryRunner): Promise<void> {
    // Audit run provenance fields
    await qr.query(`ALTER TABLE "audit_runs" ADD COLUMN "prompt_version" int`);
    await qr.query(`ALTER TABLE "audit_runs" ADD COLUMN "ai_provider" varchar(50)`);
    await qr.query(`ALTER TABLE "audit_runs" ADD COLUMN "ai_model" varchar(100)`);
    await qr.query(`ALTER TABLE "audit_runs" ADD COLUMN "data_quality" jsonb NOT NULL DEFAULT '{}'`);

    // Audit result component fields
    await qr.query(`ALTER TABLE "audit_results" ADD COLUMN "component_id" varchar(100)`);
    await qr.query(`ALTER TABLE "audit_results" ADD COLUMN "component_label" varchar(200)`);

    // AEO page audits
    await qr.query(`
      CREATE TABLE "aeo_page_audits" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "audit_run_id" uuid NOT NULL,
        "crawl_page_id" uuid NOT NULL,
        "url" text NOT NULL,
        "content_hash" varchar(64),
        "prompt_version" int,
        "ai_provider" varchar(50),
        "ai_model" varchar(100),
        "intent_alignment" jsonb NOT NULL DEFAULT '{}',
        "direct_answer" jsonb NOT NULL DEFAULT '{}',
        "decision_support" jsonb NOT NULL DEFAULT '{}',
        "semantic_completeness" jsonb NOT NULL DEFAULT '{}',
        "structure_extractability" jsonb NOT NULL DEFAULT '{}',
        "factual_grounding" jsonb NOT NULL DEFAULT '{}',
        "component_scores" jsonb NOT NULL DEFAULT '[]',
        "overall_score" int NOT NULL DEFAULT 0,
        "score_version" varchar(50) NOT NULL DEFAULT 'AEO_SCORE_V1',
        "data_quality" varchar(20) NOT NULL DEFAULT 'GOOD',
        "confidence" double precision NOT NULL DEFAULT 0.5,
        "status" varchar(20) NOT NULL DEFAULT 'RUNNING',
        "reused_from_audit_id" uuid,
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_aeo_page_audits_site_run" ON "aeo_page_audits" ("site_id", "audit_run_id")`);
    await qr.query(`CREATE INDEX "idx_aeo_page_audits_site_url" ON "aeo_page_audits" ("site_id", "url")`);
    await qr.query(`CREATE INDEX "idx_aeo_page_audits_crawl_page" ON "aeo_page_audits" ("crawl_page_id")`);

    // GEO page audits
    await qr.query(`
      CREATE TABLE "geo_page_audits" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "audit_run_id" uuid NOT NULL,
        "crawl_page_id" uuid NOT NULL,
        "url" text NOT NULL,
        "content_hash" varchar(64),
        "prompt_version" int,
        "ai_provider" varchar(50),
        "ai_model" varchar(100),
        "entity_clarity" jsonb NOT NULL DEFAULT '{}',
        "entity_consistency" jsonb NOT NULL DEFAULT '{}',
        "factual_specificity" jsonb NOT NULL DEFAULT '{}',
        "claim_verification" jsonb NOT NULL DEFAULT '{}',
        "evidence_quality" jsonb NOT NULL DEFAULT '{}',
        "source_quality" jsonb NOT NULL DEFAULT '{}',
        "original_information" jsonb NOT NULL DEFAULT '{}',
        "expert_attribution" jsonb NOT NULL DEFAULT '{}',
        "machine_accessibility" jsonb NOT NULL DEFAULT '{}',
        "structured_fact_clarity" jsonb NOT NULL DEFAULT '{}',
        "citation_readiness" jsonb NOT NULL DEFAULT '{}',
        "component_scores" jsonb NOT NULL DEFAULT '[]',
        "overall_score" int NOT NULL DEFAULT 0,
        "score_version" varchar(50) NOT NULL DEFAULT 'GEO_SCORE_V1',
        "data_quality" varchar(20) NOT NULL DEFAULT 'GOOD',
        "confidence" double precision NOT NULL DEFAULT 0.5,
        "status" varchar(20) NOT NULL DEFAULT 'RUNNING',
        "reused_from_audit_id" uuid,
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_geo_page_audits_site_run" ON "geo_page_audits" ("site_id", "audit_run_id")`);
    await qr.query(`CREATE INDEX "idx_geo_page_audits_site_url" ON "geo_page_audits" ("site_id", "url")`);
    await qr.query(`CREATE INDEX "idx_geo_page_audits_crawl_page" ON "geo_page_audits" ("crawl_page_id")`);

    // Page questions
    await qr.query(`
      CREATE TABLE "page_questions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "page_url" text NOT NULL,
        "crawl_page_id" uuid,
        "question" text NOT NULL,
        "category" varchar(30) NOT NULL,
        "priority" varchar(10) NOT NULL DEFAULT 'MEDIUM',
        "status" varchar(30) NOT NULL,
        "source" varchar(30) NOT NULL,
        "impressions" int,
        "evidence" text NOT NULL DEFAULT '',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_page_questions_site_url" ON "page_questions" ("site_id", "page_url")`);
    await qr.query(`CREATE INDEX "idx_page_questions_site_crawl" ON "page_questions" ("site_id", "crawl_page_id")`);

    // Page entities
    await qr.query(`
      CREATE TABLE "page_entities" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "page_url" text NOT NULL,
        "crawl_page_id" uuid,
        "entity_name" varchar(200) NOT NULL,
        "entity_type" varchar(50) NOT NULL,
        "clarity" double precision NOT NULL DEFAULT 0.5,
        "mentioned" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_page_entities_site_url" ON "page_entities" ("site_id", "page_url")`);

    // Entity relations
    await qr.query(`
      CREATE TABLE "entity_relations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "subject_entity" varchar(200) NOT NULL,
        "predicate" varchar(100) NOT NULL,
        "object_entity" varchar(200) NOT NULL,
        "verified" boolean NOT NULL DEFAULT false,
        "source" varchar(30) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_entity_relations_site" ON "entity_relations" ("site_id")`);

    // Fact evidence
    await qr.query(`
      CREATE TABLE "fact_evidence" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "fact" text NOT NULL,
        "source_url" text,
        "source_type" varchar(30) NOT NULL DEFAULT 'UNKNOWN',
        "support_strength" double precision NOT NULL DEFAULT 0.5,
        "verified" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_fact_evidence_site" ON "fact_evidence" ("site_id")`);

    // Crawler policy results
    await qr.query(`
      CREATE TABLE "crawler_policy_results" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "crawler_name" varchar(100) NOT NULL,
        "crawler_purpose" varchar(30) NOT NULL,
        "access_result" varchar(20) NOT NULL,
        "robots_txt_analysis" jsonb NOT NULL DEFAULT '{}',
        "checked_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_crawler_policy_results_site" ON "crawler_policy_results" ("site_id")`);
    await qr.query(`CREATE INDEX "idx_crawler_policy_results_site_crawler" ON "crawler_policy_results" ("site_id", "crawler_name")`);

    // AI crawler registry
    await qr.query(`
      CREATE TABLE "ai_crawler_registry" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(100) NOT NULL,
        "user_agent_pattern" varchar(200) NOT NULL,
        "purpose" varchar(30) NOT NULL,
        "category" varchar(50) NOT NULL,
        "version" int NOT NULL DEFAULT 1,
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Seed default AI crawlers
    await qr.query(`
      INSERT INTO "ai_crawler_registry" ("name", "user_agent_pattern", "purpose", "category", "enabled") VALUES
        ('Googlebot', 'Googlebot', 'SEARCH_DISCOVERY', 'search', true),
        ('Bingbot', 'Bingbot', 'SEARCH_DISCOVERY', 'search', true),
        ('ChatGPT-User', 'ChatGPT-User', 'USER_FETCH', 'ai-fetch', true),
        ('GPTBot', 'GPTBot', 'TRAINING', 'ai-training', true),
        ('ClaudeBot', 'ClaudeBot', 'TRAINING', 'ai-training', true),
        ('Claude-Web', 'Claude-Web', 'USER_FETCH', 'ai-fetch', true),
        ('PerplexityBot', 'PerplexityBot', 'SEARCH_DISCOVERY', 'ai-search', true),
        ('Amazonbot', 'Amazonbot', 'TRAINING', 'ai-training', true),
        ('anthropic-ai', 'anthropic-ai', 'TRAINING', 'ai-training', true),
        ('Bytespider', 'Bytespider', 'TRAINING', 'ai-training', true),
        ('Applebot-Extended', 'Applebot-Extended', 'TRAINING', 'ai-training', true),
        ('Yandex', 'Yandex', 'SEARCH_DISCOVERY', 'search', true)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE "ai_crawler_registry"`);
    await qr.query(`DROP TABLE "crawler_policy_results"`);
    await qr.query(`DROP TABLE "fact_evidence"`);
    await qr.query(`DROP TABLE "entity_relations"`);
    await qr.query(`DROP TABLE "page_entities"`);
    await qr.query(`DROP TABLE "page_questions"`);
    await qr.query(`DROP TABLE "geo_page_audits"`);
    await qr.query(`DROP TABLE "aeo_page_audits"`);
    await qr.query(`ALTER TABLE "audit_results" DROP COLUMN "component_label"`);
    await qr.query(`ALTER TABLE "audit_results" DROP COLUMN "component_id"`);
    await qr.query(`ALTER TABLE "audit_runs" DROP COLUMN "data_quality"`);
    await qr.query(`ALTER TABLE "audit_runs" DROP COLUMN "ai_model"`);
    await qr.query(`ALTER TABLE "audit_runs" DROP COLUMN "ai_provider"`);
    await qr.query(`ALTER TABLE "audit_runs" DROP COLUMN "prompt_version"`);
  }
}

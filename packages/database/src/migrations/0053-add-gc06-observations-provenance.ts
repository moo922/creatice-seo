import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddGc06ObservationsProvenance00531720000000053 implements MigrationInterface {
  name = 'AddGc06ObservationsProvenance00531720000000053';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "ai_visibility_observations_v2" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "run_id" uuid NOT NULL,
        "prompt_id" uuid,
        "prompt_set_version" int,
        "category" varchar(30) NOT NULL,
        "text" text NOT NULL,
        "normalized_text" text,
        "provider" varchar(40) NOT NULL,
        "model" varchar(160) NOT NULL,
        "methodology_version" varchar(20) NOT NULL DEFAULT 'MV1',
        "observation_type" varchar(30) NOT NULL DEFAULT 'GENERATION_ONLY',
        "status" varchar(20) NOT NULL DEFAULT 'QUEUED',
        "observed_at" date,
        "response" text,
        "response_hash" varchar(64),
        "brand_mentioned" boolean NOT NULL DEFAULT false,
        "brand_included" boolean NOT NULL DEFAULT false,
        "appearance_order" int,
        "verified_target_citation" boolean NOT NULL DEFAULT false,
        "target_cited_urls" jsonb NOT NULL DEFAULT '[]',
        "competitor_results" jsonb NOT NULL DEFAULT '[]',
        "provenance_quality" varchar(30) NOT NULL DEFAULT 'UNKNOWN',
        "usage" jsonb,
        "cost_usd" decimal(12,6) NOT NULL DEFAULT 0,
        "latency_ms" int NOT NULL DEFAULT 0,
        "error_code" varchar(50),
        "contamination_logged" boolean NOT NULL DEFAULT false,
        "kb_withheld" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_obs_v2_site_observed_category" ON "ai_visibility_observations_v2" ("site_id", "observed_at", "category")`);
    await qr.query(`CREATE INDEX "idx_obs_v2_run" ON "ai_visibility_observations_v2" ("run_id")`);
    await qr.query(`CREATE INDEX "idx_obs_v2_prompt_provider" ON "ai_visibility_observations_v2" ("prompt_id", "provider")`);

    await qr.query(`
      CREATE TABLE "ai_visibility_source_provenance" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "observation_id" uuid NOT NULL,
        "provider" varchar(40) NOT NULL,
        "source_type" varchar(30) NOT NULL,
        "title" text,
        "url" text,
        "domain" varchar(255),
        "normalized_url" text,
        "registered_domain" varchar(255),
        "host" varchar(255),
        "provider_source_id" varchar(200),
        "citation_index" int,
        "provenance_status" varchar(30) NOT NULL DEFAULT 'UNKNOWN',
        "raw_metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_source_provenance_obs" ON "ai_visibility_source_provenance" ("observation_id")`);
    await qr.query(`CREATE INDEX "idx_source_provenance_domain_status" ON "ai_visibility_source_provenance" ("domain", "provenance_status")`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE "ai_visibility_source_provenance"`);
    await qr.query(`DROP TABLE "ai_visibility_observations_v2"`);
  }
}

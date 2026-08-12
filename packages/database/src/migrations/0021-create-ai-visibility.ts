import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AI visibility observation schema: per-site standardized prompt sets, repeated
 * observation runs (provider + model + date) and individual observations with
 * deterministically parsed signals. Metrics derived from observations are
 * always labelled as controlled observations — never exact ChatGPT/Claude/
 * Perplexity user rankings.
 */
export class CreateAiVisibility00211720000000021 implements MigrationInterface {
  name = 'CreateAiVisibility00211720000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_visibility_prompt_sets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "name" varchar(100) NOT NULL DEFAULT 'default',
        "prompts" jsonb NOT NULL DEFAULT '[]',
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "idx_vis_prompt_sets_site_name" ON "ai_visibility_prompt_sets" ("site_id", "name");

      CREATE TABLE "ai_visibility_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
        "provider" varchar(40),
        "model" varchar(160),
        "status" varchar(20) NOT NULL DEFAULT 'RUNNING',
        "observed_at" date NOT NULL,
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        "observations_count" int NOT NULL DEFAULT 0,
        "error" text,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_vis_runs_site_created" ON "ai_visibility_runs" ("site_id", "observed_at" DESC);

      CREATE TABLE "ai_visibility_observations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "run_id" uuid NOT NULL REFERENCES "ai_visibility_runs"("id") ON DELETE CASCADE,
        "category" varchar(30) NOT NULL,
        "prompt" text NOT NULL,
        "provider" varchar(40) NOT NULL,
        "model" varchar(160) NOT NULL,
        "observed_at" date NOT NULL,
        "response" text NOT NULL,
        "brand_mentioned" boolean NOT NULL DEFAULT false,
        "website_cited" boolean NOT NULL DEFAULT false,
        "cited_urls" jsonb NOT NULL DEFAULT '[]',
        "competitors_mentioned" jsonb NOT NULL DEFAULT '[]',
        "context" jsonb NOT NULL DEFAULT '{}',
        "confidence" double precision NOT NULL DEFAULT 0,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_vis_obs_site_created" ON "ai_visibility_observations" ("site_id", "observed_at" DESC);
      CREATE INDEX "idx_vis_obs_run" ON "ai_visibility_observations" ("run_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_visibility_observations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_visibility_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_visibility_prompt_sets"`);
  }
}

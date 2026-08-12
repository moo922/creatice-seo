import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AI infrastructure: per-site provider config (site layer of the
 * global -> site -> workflow resolution hierarchy), a durable record of every
 * AI job, and the versioned prompt registry.
 *
 * Provider API key overrides are stored encrypted (site config row) or only in
 * environment for global keys; the app never writes plaintext keys to logs.
 */
export class CreateAiInfra00121720000000012 implements MigrationInterface {
  name = 'CreateAiInfra00121720000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_provider_configs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL UNIQUE REFERENCES "sites"("id") ON DELETE CASCADE,
        "workflow_overrides" jsonb NOT NULL DEFAULT '{}',
        "api_key_overrides" jsonb NOT NULL DEFAULT '{}',
        "enabled" boolean NOT NULL DEFAULT true,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE "ai_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid REFERENCES "sites"("id") ON DELETE SET NULL,
        "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
        "workflow" varchar(100) NOT NULL,
        "prompt_name" varchar(200),
        "prompt_version" int,
        "kind" varchar(40) NOT NULL,
        "provider" varchar(40) NOT NULL,
        "model" varchar(160) NOT NULL,
        "status" varchar(20) NOT NULL,
        "attempts" int NOT NULL DEFAULT 1,
        "input_tokens" int,
        "output_tokens" int,
        "cost_usd" numeric(12, 6),
        "latency_ms" int,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz
      );
      CREATE INDEX "idx_ai_jobs_site_created" ON "ai_jobs" ("site_id", "created_at" DESC);
      CREATE INDEX "idx_ai_jobs_org_created" ON "ai_jobs" ("organization_id", "created_at" DESC);
      CREATE INDEX "idx_ai_jobs_status" ON "ai_jobs" ("status");

      CREATE TABLE "ai_prompts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "prompt_name" varchar(200) NOT NULL,
        "version" int NOT NULL,
        "system_prompt" text NOT NULL,
        "template" text NOT NULL,
        "schema" jsonb,
        "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "idx_ai_prompts_name_version" ON "ai_prompts" ("prompt_name", "version");
      CREATE UNIQUE INDEX "idx_ai_prompts_active" ON "ai_prompts" ("prompt_name")
        WHERE "status" = 'ACTIVE';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_prompts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_provider_configs"`);
  }
}

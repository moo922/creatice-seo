import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddGc06ProviderBudget00541720000000054 implements MigrationInterface {
  name = 'AddGc06ProviderBudget00541720000000054';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "ai_provider_capabilities" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider" varchar(50) NOT NULL,
        "capabilities" jsonb NOT NULL DEFAULT '[]',
        "default_model" varchar(100),
        "supports_temperature" boolean NOT NULL DEFAULT false,
        "supports_seed" boolean NOT NULL DEFAULT false,
        "supports_search" boolean NOT NULL DEFAULT false,
        "supports_citations" boolean NOT NULL DEFAULT false,
        "supports_source_provenance" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE UNIQUE INDEX "idx_ai_provider_capabilities_provider" ON "ai_provider_capabilities" ("provider")`);

    await qr.query(`
      CREATE TABLE "ai_visibility_budgets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "provider" varchar(50) NOT NULL,
        "monthly_query_limit" int NOT NULL DEFAULT 100,
        "monthly_queries_used" int NOT NULL DEFAULT 0,
        "monthly_cost_cents" int NOT NULL DEFAULT 0,
        "cost_limit_cents" int,
        "period_start" timestamptz NOT NULL DEFAULT now(),
        "period_end" timestamptz,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_ai_visibility_budgets_site" ON "ai_visibility_budgets" ("site_id")`);
    await qr.query(`CREATE UNIQUE INDEX "idx_ai_visibility_budgets_site_provider" ON "ai_visibility_budgets" ("site_id", "provider")`);

    await qr.query(`
      INSERT INTO "ai_provider_capabilities" ("provider", "capabilities", "default_model", "supports_temperature", "supports_seed", "supports_search", "supports_citations", "supports_source_provenance") VALUES
        ('OPENAI', '["TEXT_GENERATION","STRUCTURED_OUTPUT","REQUEST_SEED","TEMPERATURE_CONTROL"]', 'gpt-4o', true, true, false, false, false),
        ('ANTHROPIC', '["TEXT_GENERATION","STRUCTURED_OUTPUT","TEMPERATURE_CONTROL"]', 'claude-sonnet-4-20250514', true, false, false, false, false),
        ('PERPLEXITY', '["TEXT_GENERATION","STRUCTURED_OUTPUT","WEB_SEARCH","SOURCE_PROVENANCE","CITATIONS","SEARCH_RESULT_METADATA"]', 'sonar', true, false, true, true, true)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE "ai_visibility_budgets"`);
    await qr.query(`DROP TABLE "ai_provider_capabilities"`);
  }
}

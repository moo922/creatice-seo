import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGlobalAiProviderCredentials00571720000000057 implements MigrationInterface {
  name = 'AddGlobalAiProviderCredentials00571720000000057';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "global_ai_provider_credentials" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider" VARCHAR(50) NOT NULL UNIQUE,
        "encrypted_api_key" TEXT NOT NULL DEFAULT '',
        "default_model" VARCHAR(255),
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "credential_source" VARCHAR(50) NOT NULL DEFAULT 'ENVIRONMENT',
        "last_health_check_at" TIMESTAMPTZ,
        "last_health_status" VARCHAR(50),
        "last_error" TEXT,
        "latency_ms" INT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      INSERT INTO "global_ai_provider_credentials" ("provider", "encrypted_api_key", "credential_source", "enabled")
      VALUES
        ('OPENAI',      '', 'NOT_CONFIGURED', true),
        ('ANTHROPIC',   '', 'NOT_CONFIGURED', true),
        ('PERPLEXITY',  '', 'NOT_CONFIGURED', true);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "global_ai_provider_credentials"`);
  }
}

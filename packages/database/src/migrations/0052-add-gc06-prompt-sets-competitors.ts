import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddGc06PromptSetsCompetitors00521720000000052 implements MigrationInterface {
  name = 'AddGc06PromptSetsCompetitors00521720000000052';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "ai_visibility_prompt_sets_v2" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "name" varchar(100) NOT NULL,
        "description" text,
        "language" varchar(10) NOT NULL DEFAULT 'ar',
        "country" varchar(10),
        "target_city" varchar(100),
        "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
        "version" int NOT NULL DEFAULT 1,
        "methodology_version" varchar(20) NOT NULL DEFAULT 'MV1',
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE UNIQUE INDEX "idx_vis_ps_v2_site_name" ON "ai_visibility_prompt_sets_v2" ("site_id", "name")`);

    await qr.query(`
      CREATE TABLE "ai_visibility_prompts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "prompt_set_id" uuid NOT NULL,
        "site_id" uuid NOT NULL,
        "text" text NOT NULL,
        "normalized_text" text NOT NULL,
        "category" varchar(30) NOT NULL,
        "intent" varchar(30) NOT NULL DEFAULT 'INFORMATIONAL',
        "cluster_id" uuid,
        "target_url" text,
        "priority" int NOT NULL DEFAULT 5,
        "weight" decimal(5,2) NOT NULL DEFAULT 1.0,
        "market" varchar(30) NOT NULL DEFAULT 'global',
        "language" varchar(10) NOT NULL DEFAULT 'ar',
        "city" varchar(100),
        "status" varchar(20) NOT NULL DEFAULT 'SUGGESTED',
        "source" varchar(30) NOT NULL DEFAULT 'MANUAL',
        "source_ref" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_vis_prompt_set_cat_status" ON "ai_visibility_prompts" ("prompt_set_id", "category", "status")`);
    await qr.query(`CREATE INDEX "idx_vis_prompt_site" ON "ai_visibility_prompts" ("site_id")`);

    await qr.query(`
      CREATE TABLE "ai_visibility_competitors" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "name" varchar(200) NOT NULL,
        "canonical_name" varchar(200) NOT NULL,
        "domain" varchar(255),
        "aliases" jsonb NOT NULL DEFAULT '[]',
        "type" varchar(30) NOT NULL DEFAULT 'DIRECT',
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "source" varchar(30) NOT NULL DEFAULT 'MANUAL',
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_vis_comp_site_status" ON "ai_visibility_competitors" ("site_id", "status")`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE "ai_visibility_competitors"`);
    await qr.query(`DROP TABLE "ai_visibility_prompts"`);
    await qr.query(`DROP TABLE "ai_visibility_prompt_sets_v2"`);
  }
}

import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddGc06BaselinesSnapshots00551720000000055 implements MigrationInterface {
  name = 'AddGc06BaselinesSnapshots00551720000000055';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "ai_visibility_baselines" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "provider" varchar(50) NOT NULL,
        "prompt_version" int NOT NULL DEFAULT 1,
        "baseline_score" double precision NOT NULL DEFAULT 0,
        "baseline_data" jsonb NOT NULL DEFAULT '{}',
        "sample_size" int NOT NULL DEFAULT 0,
        "computed_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_ai_visibility_baselines_site" ON "ai_visibility_baselines" ("site_id")`);
    await qr.query(`CREATE UNIQUE INDEX "idx_ai_visibility_baselines_site_provider_prompt" ON "ai_visibility_baselines" ("site_id", "provider", "prompt_version")`);

    await qr.query(`
      CREATE TABLE "ai_visibility_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "provider" varchar(50) NOT NULL,
        "model" varchar(100),
        "prompt_version" int NOT NULL DEFAULT 1,
        "baseline_id" uuid,
        "visibility_score" double precision NOT NULL DEFAULT 0,
        "prompt_text" text NOT NULL,
        "response_text" text,
        "response_metadata" jsonb NOT NULL DEFAULT '{}',
        "citations_found" jsonb NOT NULL DEFAULT '[]',
        "score_delta" double precision,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "error_message" text,
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX "idx_ai_visibility_snapshots_site" ON "ai_visibility_snapshots" ("site_id")`);
    await qr.query(`CREATE INDEX "idx_ai_visibility_snapshots_site_provider" ON "ai_visibility_snapshots" ("site_id", "provider")`);
    await qr.query(`CREATE INDEX "idx_ai_visibility_snapshots_baseline" ON "ai_visibility_snapshots" ("baseline_id")`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE "ai_visibility_snapshots"`);
    await qr.query(`DROP TABLE "ai_visibility_baselines"`);
  }
}

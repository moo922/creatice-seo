import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guided first-site activation wizard state. One row per (site, step) so the
 * operator can resume an interrupted activation without repeating completed
 * expensive/destructive operations (baseline, initial report).
 */
export class CreateSiteActivation00301720000000030 implements MigrationInterface {
  name = 'CreateSiteActivation00301720000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "site_activation_steps" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "step_key" varchar(60) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'NOT_STARTED',
        "message" text,
        "detail" jsonb,
        "attempt_count" int NOT NULL DEFAULT 0,
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "idx_site_activation_site_step" ON "site_activation_steps" ("site_id", "step_key");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "site_activation_steps"`);
  }
}

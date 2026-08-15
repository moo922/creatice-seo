import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recurring platform automation: per-site automation settings (one row per site)
 * plus append-only automation run history. Run rows are claimed by the scheduler
 * through a unique partial index on idempotency_key, which is the distributed
 * lock preventing duplicate scheduled executions.
 */
export class CreateAutomation00311720000000031 implements MigrationInterface {
  name = 'CreateAutomation00311720000000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "site_automation_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL UNIQUE REFERENCES "sites"("id") ON DELETE CASCADE,
        "enabled" boolean NOT NULL DEFAULT true,
        "timezone" varchar(64) NOT NULL DEFAULT 'UTC',
        "operations" jsonb NOT NULL DEFAULT '{}',
        "defaults" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_automation_settings_site" ON "site_automation_settings" ("site_id");
    `);

    await queryRunner.query(`
      CREATE TABLE "automation_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "organization_id" uuid,
        "operation" varchar(40) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "scheduled_for" timestamptz NOT NULL,
        "idempotency_key" varchar(200),
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "duration_ms" int,
        "records_processed" int NOT NULL DEFAULT 0,
        "error" text,
        "message" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_automation_runs_site_created" ON "automation_runs" ("site_id", "created_at");
      CREATE INDEX "idx_automation_runs_operation_status" ON "automation_runs" ("operation", "status");
      CREATE UNIQUE INDEX "idx_automation_runs_idempotency" ON "automation_runs" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "automation_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "site_automation_settings"`);
  }
}

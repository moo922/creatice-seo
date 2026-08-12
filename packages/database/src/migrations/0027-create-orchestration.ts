import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * n8n orchestration jobs. n8n never owns business state — every job lives here
 * in PostgreSQL (payload, status, attempts, timeout, result). Idempotency keys
 * are unique (when set) so repeated submissions are safe; failures update the
 * job status and surface as operational alerts.
 */
export class CreateOrchestration00271720000000027 implements MigrationInterface {
  name = 'CreateOrchestration00271720000000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workflow_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
        "workflow" varchar(60) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "payload" jsonb NOT NULL DEFAULT '{}',
        "result" jsonb,
        "idempotency_key" varchar(200),
        "attempts" int NOT NULL DEFAULT 0,
        "max_attempts" int NOT NULL DEFAULT 3,
        "timeout_ms" int NOT NULL DEFAULT 300000,
        "error" text,
        "n8n_execution_id" varchar(200),
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_workflow_jobs_site_created" ON "workflow_jobs" ("site_id", "created_at" DESC);
      CREATE INDEX "idx_workflow_jobs_status" ON "workflow_jobs" ("status");
      CREATE UNIQUE INDEX "idx_workflow_jobs_idempotency" ON "workflow_jobs" ("idempotency_key")
        WHERE "idempotency_key" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_jobs"`);
  }
}

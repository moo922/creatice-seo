import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Audit runs and results. Persists every deterministic rule evaluation (passed
 * and failed) with machine-readable evidence so the health score is fully
 * reproducible from this schema. Also adds last_detected_at to issues so
 * audit-driven deduplication can maintain first/last detection semantics.
 */
export class CreateAuditRuns00391720000000039 implements MigrationInterface {
  name = 'CreateAuditRuns00391720000000039';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "crawl_run_id" uuid NOT NULL REFERENCES "crawl_runs"("id") ON DELETE CASCADE,
        "type" varchar(30) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'RUNNING',
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "finished_at" timestamptz,
        "score_version" int NOT NULL DEFAULT 1,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_audit_runs_site_created" ON "audit_runs" ("site_id", "created_at" DESC);

      CREATE TABLE "audit_results" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "audit_run_id" uuid NOT NULL REFERENCES "audit_runs"("id") ON DELETE CASCADE,
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "crawl_page_id" uuid REFERENCES "crawl_pages"("id") ON DELETE SET NULL,
        "url" text NOT NULL,
        "rule_key" varchar(80) NOT NULL,
        "rule_version" int NOT NULL DEFAULT 1,
        "category" varchar(30) NOT NULL,
        "severity" varchar(20) NOT NULL,
        "passed" boolean NOT NULL DEFAULT true,
        "evidence" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_audit_results_run" ON "audit_results" ("audit_run_id");
      CREATE INDEX "idx_audit_results_site_run" ON "audit_results" ("site_id", "audit_run_id");
      CREATE INDEX "idx_audit_results_rule" ON "audit_results" ("rule_key", "site_id");

      ALTER TABLE "issues"
        ADD COLUMN "last_detected_at" timestamptz;
      UPDATE "issues" SET "last_detected_at" = "detected_at" WHERE "last_detected_at" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issues" DROP COLUMN IF EXISTS "last_detected_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_results"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_runs"`);
  }
}

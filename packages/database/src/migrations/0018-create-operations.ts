import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Operations management schema: issues (with the DETECTED..RESOLVED lifecycle),
 * recommendations (deterministic metrics + optional AI explanation), tasks,
 * the change log (before/after), immutable baseline snapshots and alerts.
 */
export class CreateOperations00181720000000018 implements MigrationInterface {
  name = 'CreateOperations00181720000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "issues" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
        "kind" varchar(40) NOT NULL,
        "severity" varchar(20) NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "url" text,
        "status" varchar(20) NOT NULL DEFAULT 'DETECTED',
        "source" varchar(20) NOT NULL DEFAULT 'MANUAL',
        "alert_id" uuid,
        "data" jsonb NOT NULL DEFAULT '{}',
        "note" text,
        "detected_at" timestamptz NOT NULL DEFAULT now(),
        "resolved_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_issues_site_created" ON "issues" ("site_id", "created_at" DESC);
      CREATE INDEX "idx_issues_site_status" ON "issues" ("site_id", "status");

      CREATE TABLE "recommendations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "issue_id" uuid NOT NULL REFERENCES "issues"("id") ON DELETE CASCADE,
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "title" text NOT NULL,
        "evidence" text NOT NULL,
        "reason" text NOT NULL DEFAULT '',
        "impact" double precision NOT NULL,
        "confidence" double precision NOT NULL,
        "effort" double precision NOT NULL,
        "priority" varchar(20) NOT NULL,
        "suggested_action" text NOT NULL DEFAULT '',
        "ai_explained" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_recommendations_issue" ON "recommendations" ("issue_id");
      CREATE INDEX "idx_recommendations_site" ON "recommendations" ("site_id");

      CREATE TABLE "operations_tasks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "issue_id" uuid REFERENCES "issues"("id") ON DELETE SET NULL,
        "recommendation_id" uuid REFERENCES "recommendations"("id") ON DELETE SET NULL,
        "title" text NOT NULL,
        "url" text,
        "assignee_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "deadline" timestamptz,
        "status" varchar(20) NOT NULL DEFAULT 'TODO',
        "internal_notes" text NOT NULL DEFAULT '',
        "client_notes" text NOT NULL DEFAULT '',
        "evidence" text NOT NULL DEFAULT '',
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_ops_tasks_site_created" ON "operations_tasks" ("site_id", "created_at" DESC);
      CREATE INDEX "idx_ops_tasks_issue" ON "operations_tasks" ("issue_id");
      CREATE INDEX "idx_ops_tasks_assignee" ON "operations_tasks" ("assignee_id");
      CREATE INDEX "idx_ops_tasks_status" ON "operations_tasks" ("status");

      CREATE TABLE "change_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
        "page_url" text NOT NULL,
        "task_id" uuid REFERENCES "operations_tasks"("id") ON DELETE SET NULL,
        "change_type" varchar(30) NOT NULL,
        "before" jsonb,
        "after" jsonb NOT NULL,
        "changed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "changed_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_change_logs_site_created" ON "change_logs" ("site_id", "changed_at" DESC);
      CREATE INDEX "idx_change_logs_page" ON "change_logs" ("site_id", "page_url");
      CREATE INDEX "idx_change_logs_task" ON "change_logs" ("task_id");

      CREATE TABLE "baseline_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
        "type" varchar(20) NOT NULL,
        "is_baseline" boolean NOT NULL DEFAULT false,
        "period_start" date,
        "period_end" date,
        "metrics" jsonb NOT NULL,
        "issues" jsonb NOT NULL DEFAULT '[]',
        "note" text,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_baseline_site_created" ON "baseline_snapshots" ("site_id", "created_at" DESC);
      CREATE INDEX "idx_baseline_site_type" ON "baseline_snapshots" ("site_id", "type");

      CREATE TABLE "operations_alerts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
        "kind" varchar(40) NOT NULL,
        "severity" varchar(20) NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "data" jsonb NOT NULL DEFAULT '{}',
        "status" varchar(20) NOT NULL DEFAULT 'OPEN',
        "issue_id" uuid REFERENCES "issues"("id") ON DELETE SET NULL,
        "detected_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_ops_alerts_site_created" ON "operations_alerts" ("site_id", "created_at" DESC);
      CREATE INDEX "idx_ops_alerts_kind_status" ON "operations_alerts" ("kind", "status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "operations_alerts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "baseline_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "change_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "operations_tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recommendations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "issues"`);
  }
}

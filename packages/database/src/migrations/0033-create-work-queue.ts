import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agency work queue: per-item triage state (assignments, priority overrides,
 * review/ignore status, generated tasks) and per-user saved filters. The queue
 * items themselves are aggregated live from the existing domain tables; this
 * migration only adds the mutable state + filter storage.
 */
export class CreateWorkQueue00331720000000033 implements MigrationInterface {
  name = 'CreateWorkQueue00331720000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "work_item_states" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "item_key" varchar(200) NOT NULL,
        "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
        "organization_id" uuid,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "priority" varchar(20),
        "assigned_to_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "assigned_at" timestamptz,
        "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "reviewed_at" timestamptz,
        "task_id" uuid REFERENCES "operations_tasks"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "idx_work_item_states_item_key" ON "work_item_states" ("item_key");
      CREATE INDEX "idx_work_item_states_site" ON "work_item_states" ("site_id");
      CREATE INDEX "idx_work_item_states_assignee" ON "work_item_states" ("assigned_to_user_id");
      CREATE INDEX "idx_work_item_states_status" ON "work_item_states" ("status");
    `);

    await queryRunner.query(`
      CREATE TABLE "work_filters" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "builtin" boolean NOT NULL DEFAULT false,
        "criteria" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_work_filters_user" ON "work_filters" ("user_id", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "work_filters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "work_item_states"`);
  }
}

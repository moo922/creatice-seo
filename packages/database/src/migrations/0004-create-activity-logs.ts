import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateActivityLogs00041720000000004 implements MigrationInterface {
  name = 'CreateActivityLogs00041720000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "activity_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
        "site_id" uuid REFERENCES "sites"("id") ON DELETE SET NULL,
        "action" varchar(100) NOT NULL,
        "entity_type" varchar(100),
        "entity_id" varchar(100),
        "meta" jsonb NOT NULL DEFAULT '{}',
        "ip" varchar(45),
        "user_agent" varchar(512),
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_activity_logs_user" ON "activity_logs" ("user_id", "created_at");
      CREATE INDEX "idx_activity_logs_site" ON "activity_logs" ("site_id", "created_at");
      CREATE INDEX "idx_activity_logs_organization" ON "activity_logs" ("organization_id", "created_at");
      CREATE INDEX "idx_activity_logs_action" ON "activity_logs" ("action");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "activity_logs"`);
  }
}

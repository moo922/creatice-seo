import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Content intelligence pipeline: durable record of pipeline runs and their
 * content packages. Stage progress, the gated brief, accumulating package
 * output and internal validator scores are stored as JSONB; `html_content` is
 * persisted inside `package_data`. Scores are internal quality scores only.
 */
export class CreateContentPipeline00151720000000015 implements MigrationInterface {
  name = 'CreateContentPipeline00151720000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "content_packages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
        "cluster_id" uuid,
        "created_by" uuid,
        "status" varchar(20) NOT NULL DEFAULT 'QUEUED',
        "language" varchar(10) NOT NULL DEFAULT 'en',
        "locale" varchar(10) NOT NULL DEFAULT 'en',
        "target_url" text,
        "existing_page_url" text,
        "stages" jsonb NOT NULL DEFAULT '[]',
        "brief" jsonb NOT NULL DEFAULT '{}',
        "brief_gate" jsonb NOT NULL DEFAULT '{}',
        "package_data" jsonb NOT NULL DEFAULT '{}',
        "scores" jsonb NOT NULL DEFAULT '{}',
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz
      );
      CREATE INDEX "idx_content_packages_site_created" ON "content_packages" ("site_id", "created_at" DESC);
      CREATE INDEX "idx_content_packages_cluster" ON "content_packages" ("cluster_id");
      CREATE INDEX "idx_content_packages_status" ON "content_packages" ("status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "content_packages"`);
  }
}

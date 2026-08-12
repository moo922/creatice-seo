import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Content publishing to WordPress: content_publications tracks the
 * DRAFT -> APPROVED -> PUBLISHED -> VERIFIED lifecycle (with FAILED on
 * connector errors). Content and Rank Math fields sent to WordPress are snapshotted in `meta`.
 */
export class CreateContentPublications00291720000000029 implements MigrationInterface {
  name = 'CreateContentPublications00291720000000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "content_publications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
        "content_package_id" uuid REFERENCES "content_packages"("id") ON DELETE SET NULL,
        "wp_post_id" bigint,
        "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
        "title" text NOT NULL,
        "url" text,
        "meta" jsonb NOT NULL DEFAULT '{}',
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "approved_at" timestamptz,
        "published_at" timestamptz,
        "verified_at" timestamptz,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_content_publications_site_created" ON "content_publications" ("site_id", "created_at" DESC);
      CREATE INDEX "idx_content_publications_package" ON "content_publications" ("content_package_id");
      CREATE INDEX "idx_content_publications_status" ON "content_publications" ("status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "content_publications"`);
  }
}

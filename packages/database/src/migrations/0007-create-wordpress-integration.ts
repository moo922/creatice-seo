import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * WordPress integration state and imported post snapshots. Content bodies are
 * intentionally NOT stored: only a content hash and Rank Math metadata, so an
 * initial import never copies content out of WordPress.
 */
export class CreateWordPressIntegration00071720000000007 implements MigrationInterface {
  name = 'CreateWordPressIntegration00071720000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wp_integrations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL UNIQUE REFERENCES "sites"("id") ON DELETE CASCADE,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "wp_url" varchar(2048) NOT NULL,
        "wp_version" varchar(50),
        "php_version" varchar(50),
        "rank_math_detected" boolean NOT NULL DEFAULT false,
        "rank_math_version" varchar(50),
        "active_plugins" jsonb NOT NULL DEFAULT '[]',
        "last_checked_at" timestamptz,
        "last_sync_at" timestamptz,
        "last_sync_summary" jsonb,
        "last_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "idx_wp_integrations_site_id" ON "wp_integrations" ("site_id");

      CREATE TABLE "wp_posts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "wp_post_id" bigint NOT NULL,
        "post_type" varchar(50) NOT NULL,
        "url" text NOT NULL,
        "slug" varchar(255) NOT NULL,
        "status" varchar(50) NOT NULL,
        "title" text NOT NULL,
        "content_hash" char(40) NOT NULL,
        "rank_math" jsonb NOT NULL DEFAULT '{}',
        "meta" jsonb NOT NULL DEFAULT '{}',
        "modified_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_wp_posts_site_id" ON "wp_posts" ("site_id");
      CREATE UNIQUE INDEX "idx_wp_posts_site_wp_post" ON "wp_posts" ("site_id", "wp_post_id");
      CREATE INDEX "idx_wp_posts_site_modified" ON "wp_posts" ("site_id", "modified_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "wp_posts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wp_integrations"`);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Internal-link intelligence schema: crawled pages (content + extracted link
 * graph), link analyses (detection stats) and link suggestions flowing through
 * SUGGESTED -> APPROVED -> APPLIED -> VERIFIED. URLs are never invented, self
 * links are forbidden, and published content is only modified after approval.
 */
export class CreateLinkIntelligence00231720000000023 implements MigrationInterface {
  name = 'CreateLinkIntelligence00231720000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "crawled_pages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "url" text NOT NULL,
        "title" text,
        "http_status" int,
        "word_count" int NOT NULL DEFAULT 0,
        "text" text NOT NULL DEFAULT '',
        "headings" jsonb NOT NULL DEFAULT '[]',
        "out_links" jsonb NOT NULL DEFAULT '[]',
        "crawled_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "idx_crawled_pages_site_url" ON "crawled_pages" ("site_id", "url");

      CREATE TABLE "link_analyses" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "status" varchar(20) NOT NULL DEFAULT 'RUNNING',
        "stats" jsonb NOT NULL DEFAULT '{}',
        "suggestions_created" int NOT NULL DEFAULT 0,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz
      );
      CREATE INDEX "idx_link_analyses_site_created" ON "link_analyses" ("site_id", "created_at" DESC);

      CREATE TABLE "link_suggestions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "analysis_id" uuid REFERENCES "link_analyses"("id") ON DELETE SET NULL,
        "source_url" text NOT NULL,
        "target_url" text NOT NULL,
        "anchor" text NOT NULL,
        "context" text NOT NULL DEFAULT '',
        "confidence" double precision NOT NULL DEFAULT 0,
        "reason" text NOT NULL,
        "detection" varchar(30) NOT NULL,
        "action" varchar(30) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'SUGGESTED',
        "notes" text,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "approved_at" timestamptz,
        "applied_at" timestamptz,
        "verified_at" timestamptz,
        "verify_result" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_link_suggestions_site_status" ON "link_suggestions" ("site_id", "status");
      CREATE INDEX "idx_link_suggestions_source" ON "link_suggestions" ("site_id", "source_url");
      CREATE INDEX "idx_link_suggestions_target" ON "link_suggestions" ("site_id", "target_url");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "link_suggestions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "link_analyses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crawled_pages"`);
  }
}

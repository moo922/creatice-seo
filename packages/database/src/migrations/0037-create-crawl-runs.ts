import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Versioned crawl-run persistence. The existing `crawled_pages` table holds
 * only the latest page state (unique site_id + url) and re-crawls overwrite it,
 * destroying history. These four tables snapshot every page, outbound link and
 * error per crawl run so audits are reproducible and comparable over time. The
 * flat `crawled_pages` table is kept for link-analysis compatibility — new
 * crawls continue to maintain it alongside the versioned tables.
 */
export class CreateCrawlRuns00371720000000037 implements MigrationInterface {
  name = 'CreateCrawlRuns00371720000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "crawl_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
        "status" varchar(20) NOT NULL DEFAULT 'RUNNING',
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "finished_at" timestamptz,
        "seed_url" text NOT NULL,
        "user_agent" text NOT NULL,
        "max_pages" int NOT NULL DEFAULT 50,
        "pages_discovered" int NOT NULL DEFAULT 0,
        "pages_crawled" int NOT NULL DEFAULT 0,
        "pages_failed" int NOT NULL DEFAULT 0,
        "robots_status" varchar(20) NOT NULL DEFAULT 'ERROR',
        "sitemap_status" varchar(20) NOT NULL DEFAULT 'NOT_FOUND',
        "rendered_pages" int NOT NULL DEFAULT 0,
        "error" text,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_crawl_runs_site_created" ON "crawl_runs" ("site_id", "created_at" DESC);

      CREATE TABLE "crawl_pages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "crawl_run_id" uuid NOT NULL REFERENCES "crawl_runs"("id") ON DELETE CASCADE,
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "url" text NOT NULL,
        "normalized_url" text NOT NULL,
        "final_url" text,
        "http_status" int,
        "content_type" varchar(255),
        "depth" int NOT NULL DEFAULT 0,
        "title" text,
        "meta_description" text,
        "h1" text,
        "headings" jsonb NOT NULL DEFAULT '[]',
        "canonical" text,
        "meta_robots" jsonb NOT NULL DEFAULT '[]',
        "indexable" boolean NOT NULL DEFAULT true,
        "language" varchar(20),
        "word_count" int NOT NULL DEFAULT 0,
        "content_hash" varchar(64),
        "rendered" boolean NOT NULL DEFAULT false,
        "schema_json" jsonb,
        "hreflang" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_crawl_pages_run" ON "crawl_pages" ("crawl_run_id");
      CREATE INDEX "idx_crawl_pages_site_run" ON "crawl_pages" ("site_id", "crawl_run_id");
      CREATE UNIQUE INDEX "idx_crawl_pages_run_url" ON "crawl_pages" ("crawl_run_id", "normalized_url");

      CREATE TABLE "crawl_links" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "crawl_run_id" uuid NOT NULL REFERENCES "crawl_runs"("id") ON DELETE CASCADE,
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "source_page_id" uuid REFERENCES "crawl_pages"("id") ON DELETE CASCADE,
        "source_url" text NOT NULL,
        "target_url" text NOT NULL,
        "normalized_target_url" text NOT NULL,
        "anchor_text" text NOT NULL DEFAULT '',
        "rel" varchar(255),
        "internal" boolean NOT NULL DEFAULT false,
        "nofollow" boolean NOT NULL DEFAULT false,
        "status_code_when_known" int,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_crawl_links_run" ON "crawl_links" ("crawl_run_id");
      CREATE INDEX "idx_crawl_links_source" ON "crawl_links" ("source_page_id");
      CREATE INDEX "idx_crawl_links_site_run" ON "crawl_links" ("site_id", "crawl_run_id");

      CREATE TABLE "crawl_errors" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "crawl_run_id" uuid NOT NULL REFERENCES "crawl_runs"("id") ON DELETE CASCADE,
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "url" text NOT NULL,
        "error_type" varchar(30) NOT NULL,
        "message" text NOT NULL DEFAULT '',
        "status_code" int,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_crawl_errors_run" ON "crawl_errors" ("crawl_run_id");
      CREATE INDEX "idx_crawl_errors_site_run" ON "crawl_errors" ("site_id", "crawl_run_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "crawl_errors"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crawl_links"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crawl_pages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crawl_runs"`);
  }
}

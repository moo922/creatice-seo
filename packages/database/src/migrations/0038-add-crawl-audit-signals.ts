import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extends versioned crawl runs with the deterministic signals the audit rule
 * registry consumes: sitemap URL list on the run, and per-page redirect chain,
 * redirect-loop flag, image alt inventory and structured-data parse results.
 */
export class AddCrawlAuditSignals00381720000000038 implements MigrationInterface {
  name = 'AddCrawlAuditSignals00381720000000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "crawl_runs"
        ADD COLUMN "sitemap_urls" jsonb NOT NULL DEFAULT '[]';

      ALTER TABLE "crawl_pages"
        ADD COLUMN "schema_blocks" int NOT NULL DEFAULT 0,
        ADD COLUMN "schema_errors" jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN "images" jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN "redirect_chain" jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN "redirect_loop" boolean NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "crawl_pages"
        DROP COLUMN IF EXISTS "redirect_loop",
        DROP COLUMN IF EXISTS "redirect_chain",
        DROP COLUMN IF EXISTS "images",
        DROP COLUMN IF EXISTS "schema_errors",
        DROP COLUMN IF EXISTS "schema_blocks";
      ALTER TABLE "crawl_runs"
        DROP COLUMN IF EXISTS "sitemap_urls";
    `);
  }
}

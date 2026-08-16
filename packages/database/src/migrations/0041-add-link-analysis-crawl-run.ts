import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration-compatibility: link analyses can now reference the versioned crawl
 * run they consumed. New analyses read from crawl_runs/crawl_pages/crawl_links
 * when available, falling back to the legacy `crawled_pages` table for
 * installations that still write pages the old way. The legacy tables
 * (crawled_pages, link_analyses, link_suggestions) remain intact and working.
 */
export class AddLinkAnalysisCrawlRun00411720000000041 implements MigrationInterface {
  name = 'AddLinkAnalysisCrawlRun00411720000000041';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "link_analyses" ADD COLUMN "crawl_run_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "idx_link_analyses_crawl_run" ON "link_analyses" ("crawl_run_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_link_analyses_crawl_run"`);
    await queryRunner.query(`ALTER TABLE "link_analyses" DROP COLUMN IF EXISTS "crawl_run_id"`);
  }
}

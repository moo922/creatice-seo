import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keyword metrics: add monthly_search_volume, competition, competition_index
 * columns for future Google Ads keyword-planning integration. The `source`
 * column already exists from migration 0010 (default 'gsc'); no change needed.
 */
export class AddKeywordMetricColumns00451720000000045 implements MigrationInterface {
  name = 'AddKeywordMetricColumns00451720000000045';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE keyword_metrics
      ADD COLUMN monthly_search_volume double precision,
      ADD COLUMN competition varchar(50),
      ADD COLUMN competition_index double precision
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE keyword_metrics
      DROP COLUMN IF EXISTS monthly_search_volume,
      DROP COLUMN IF EXISTS competition,
      DROP COLUMN IF EXISTS competition_index
    `);
  }
}

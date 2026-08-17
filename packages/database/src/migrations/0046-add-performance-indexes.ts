import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add performance indexes that do NOT already exist from prior migrations.
 *
 * Existing indexes (from earlier migrations):
 *   gsc_site_daily_metrics   – PK(site_id, date), idx(site_id, date DESC)  [0042]
 *   gsc_query_daily_metrics  – PK(site_id, date, query), idx(site_id, date DESC), idx(site_id, query) [0042]
 *   gsc_page_daily_metrics   – PK(site_id, date, page_url), idx(site_id, date DESC), idx(site_id, page_url) [0042]
 *   gsc_query_page_daily_metrics – PK(site_id, date, query, page_url), idx(site_id, date DESC) [0042]
 *   baseline_snapshots       – idx(site_id, created_at), idx(site_id, type) [0042]
 *   site_snapshots           – idx(site_id, snapshot_type), idx(site_id, captured_at) [0043]
 *   issues                   – idx(site_id, created_at DESC), idx(site_id, status) [0018]
 *
 * Added here:
 *   keyword_metrics          – idx on (source) for source-filtered queries
 *   issues                   – idx(detected_at DESC) for period-range detection queries
 */
export class AddPerformanceIndexes00461720000000046 implements MigrationInterface {
  name = 'AddPerformanceIndexes00461720000000046';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE INDEX idx_keyword_metrics_source
        ON keyword_metrics (source);

      CREATE INDEX idx_issues_detected_at
        ON issues (detected_at DESC)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      DROP INDEX IF EXISTS idx_keyword_metrics_source;
      DROP INDEX IF EXISTS idx_issues_detected_at
    `);
  }
}

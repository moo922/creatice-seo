import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Canonical metric grains (DATA TRUTH).
 *
 * The legacy `gsc_daily_metrics` table stores all grains in one table with the
 * grain only implied by which dimension columns are non-empty, which makes
 * site-level aggregates unsafe (a default (query,page) sync inflates site
 * clicks by the number of query/page pairs per day). These new per-grain
 * tables make it impossible for SITE_DAILY + QUERY_DAILY + PAGE_DAILY rows to
 * be summed together accidentally.
 *
 * Also adds baseline version/cutoff/reference columns (immutable baseline
 * architecture) and GSC sync-state data-freshness columns.
 */
export class CanonicalMetricGrains00421720000000042 implements MigrationInterface {
  name = 'CanonicalMetricGrains00421720000000042';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gsc_site_daily_metrics" (
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "date" date NOT NULL,
        "clicks" bigint NOT NULL DEFAULT 0,
        "impressions" bigint NOT NULL DEFAULT 0,
        "ctr" double precision NOT NULL DEFAULT 0,
        "average_position" double precision,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("site_id", "date")
      );
      CREATE INDEX "idx_gsc_site_daily_site_date" ON "gsc_site_daily_metrics" ("site_id", "date" DESC);

      CREATE TABLE "gsc_query_daily_metrics" (
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "date" date NOT NULL,
        "query" varchar(255) NOT NULL,
        "normalized_query" varchar(255) NOT NULL,
        "clicks" bigint NOT NULL DEFAULT 0,
        "impressions" bigint NOT NULL DEFAULT 0,
        "ctr" double precision NOT NULL DEFAULT 0,
        "position" double precision,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("site_id", "date", "query")
      );
      CREATE INDEX "idx_gsc_query_daily_site_date" ON "gsc_query_daily_metrics" ("site_id", "date" DESC);
      CREATE INDEX "idx_gsc_query_daily_site_query" ON "gsc_query_daily_metrics" ("site_id", "query");

      CREATE TABLE "gsc_page_daily_metrics" (
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "date" date NOT NULL,
        "page_url" varchar(1024) NOT NULL,
        "normalized_url" varchar(1024) NOT NULL,
        "clicks" bigint NOT NULL DEFAULT 0,
        "impressions" bigint NOT NULL DEFAULT 0,
        "ctr" double precision NOT NULL DEFAULT 0,
        "position" double precision,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("site_id", "date", "page_url")
      );
      CREATE INDEX "idx_gsc_page_daily_site_date" ON "gsc_page_daily_metrics" ("site_id", "date" DESC);
      CREATE INDEX "idx_gsc_page_daily_site_url" ON "gsc_page_daily_metrics" ("site_id", "page_url");

      CREATE TABLE "gsc_query_page_daily_metrics" (
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "date" date NOT NULL,
        "query" varchar(255) NOT NULL,
        "page_url" varchar(1024) NOT NULL,
        "normalized_query" varchar(255) NOT NULL,
        "normalized_url" varchar(1024) NOT NULL,
        "clicks" bigint NOT NULL DEFAULT 0,
        "impressions" bigint NOT NULL DEFAULT 0,
        "ctr" double precision NOT NULL DEFAULT 0,
        "position" double precision,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("site_id", "date", "query", "page_url")
      );
      CREATE INDEX "idx_gsc_qp_site_date" ON "gsc_query_page_daily_metrics" ("site_id", "date" DESC);

      ALTER TABLE "baseline_snapshots"
        ADD COLUMN "baseline_version" int NOT NULL DEFAULT 1,
        ADD COLUMN "data_cutoff_date" date,
        ADD COLUMN "reference_crawl_run_id" uuid,
        ADD COLUMN "reference_audit_run_id" uuid,
        ADD COLUMN "availability" jsonb NOT NULL DEFAULT '{}';

      ALTER TABLE "gsc_sync_states"
        ADD COLUMN "last_requested_date" date,
        ADD COLUMN "last_successful_date" date,
        ADD COLUMN "latest_available_date" date,
        ADD COLUMN "sync_status" varchar(20) NOT NULL DEFAULT 'IDLE',
        ADD COLUMN "last_error" text,
        ADD COLUMN "updated_at" timestamptz NOT NULL DEFAULT now();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gsc_sync_states"
        DROP COLUMN IF EXISTS "updated_at",
        DROP COLUMN IF EXISTS "last_error",
        DROP COLUMN IF EXISTS "sync_status",
        DROP COLUMN IF EXISTS "latest_available_date",
        DROP COLUMN IF EXISTS "last_successful_date",
        DROP COLUMN IF EXISTS "last_requested_date";

      ALTER TABLE "baseline_snapshots"
        DROP COLUMN IF EXISTS "availability",
        DROP COLUMN IF EXISTS "reference_audit_run_id",
        DROP COLUMN IF EXISTS "reference_crawl_run_id",
        DROP COLUMN IF EXISTS "data_cutoff_date",
        DROP COLUMN IF EXISTS "baseline_version";

      DROP TABLE IF EXISTS "gsc_query_page_daily_metrics";
      DROP TABLE IF EXISTS "gsc_page_daily_metrics";
      DROP TABLE IF EXISTS "gsc_query_daily_metrics";
      DROP TABLE IF EXISTS "gsc_site_daily_metrics";
    `);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Google Search Console: properties, encrypted OAuth tokens, daily search
 * analytics facts, incremental sync state and detected opportunities.
 *
 * Tokens live only in encrypted backend storage (never in the browser). The
 * metrics table is append/upsert only; synchronization never deletes rows.
 */
export class CreateGsc00091720000000009 implements MigrationInterface {
  name = 'CreateGsc00091720000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gsc_properties" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL UNIQUE REFERENCES "sites"("id") ON DELETE CASCADE,
        "site_url" text NOT NULL,
        "type" varchar(20) NOT NULL,
        "permission_level" varchar(50) NOT NULL,
        "selected" boolean NOT NULL DEFAULT false,
        "status" varchar(20) NOT NULL DEFAULT 'DISCONNECTED',
        "last_sync_at" timestamptz,
        "last_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE "gsc_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL UNIQUE REFERENCES "sites"("id") ON DELETE CASCADE,
        "access_token_encrypted" text NOT NULL,
        "refresh_token_encrypted" text NOT NULL,
        "access_token_expires_at" timestamptz NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE "gsc_daily_metrics" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "property_id" uuid NOT NULL REFERENCES "gsc_properties"("id") ON DELETE CASCADE,
        "metric_date" date NOT NULL,
        "query" varchar(255) NOT NULL DEFAULT '',
        "page" varchar(1024) NOT NULL DEFAULT '',
        "country" varchar(10) NOT NULL DEFAULT '',
        "device" varchar(20) NOT NULL DEFAULT '',
        "row_key" char(40) NOT NULL,
        "clicks" bigint NOT NULL DEFAULT 0,
        "impressions" bigint NOT NULL DEFAULT 0,
        "ctr" double precision NOT NULL DEFAULT 0,
        "position" double precision NOT NULL DEFAULT 0,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "idx_gsc_daily_metrics_key" ON "gsc_daily_metrics" ("property_id", "metric_date", "row_key");
      CREATE INDEX "idx_gsc_daily_metrics_window" ON "gsc_daily_metrics" ("property_id", "metric_date");
      CREATE INDEX "idx_gsc_daily_metrics_page" ON "gsc_daily_metrics" ("property_id", md5("page"));
      CREATE INDEX "idx_gsc_daily_metrics_query" ON "gsc_daily_metrics" ("property_id", md5("query"));

      CREATE TABLE "gsc_sync_states" (
        "property_id" uuid NOT NULL REFERENCES "gsc_properties"("id") ON DELETE CASCADE,
        "dimensions_key" varchar(100) NOT NULL,
        "last_sync_date" date NOT NULL,
        "last_success_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("property_id", "dimensions_key")
      );

      CREATE TABLE "gsc_opportunities" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "property_id" uuid NOT NULL REFERENCES "gsc_properties"("id") ON DELETE CASCADE,
        "kind" varchar(40) NOT NULL,
        "query" varchar(255),
        "page" varchar(500),
        "status" varchar(20) NOT NULL DEFAULT 'OPEN',
        "window_start" date NOT NULL,
        "window_end" date NOT NULL,
        "current_value" jsonb NOT NULL DEFAULT '{}',
        "previous_value" jsonb NOT NULL DEFAULT '{}',
        "detected_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "idx_gsc_opportunities_key" ON "gsc_opportunities"
        ("property_id", "kind", COALESCE("query", ''), COALESCE("page", ''), "window_start", "window_end");
      CREATE INDEX "idx_gsc_opportunities_window" ON "gsc_opportunities" ("property_id", "window_start", "window_end");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "gsc_opportunities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gsc_sync_states"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gsc_daily_metrics"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gsc_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gsc_properties"`);
  }
}

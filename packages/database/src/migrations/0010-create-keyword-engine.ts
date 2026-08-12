import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keyword engine: keywords, daily keyword metrics, semantic clusters,
 * cluster-keyword membership and canonical URL mappings.
 *
 * URL mappings carry a manual_override flag; engine/AI runs must never
 * overwrite manually approved mappings.
 */
export class CreateKeywordEngine00101720000000010 implements MigrationInterface {
  name = 'CreateKeywordEngine00101720000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "keywords" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "source" varchar(20) NOT NULL,
        "keyword" text NOT NULL,
        "normalized" text NOT NULL,
        "normalized_hash" char(64) NOT NULL,
        "intent" varchar(30) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'CANDIDATE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "idx_keywords_site_hash" ON "keywords" ("site_id", "normalized_hash");

      CREATE TABLE "keyword_metrics" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "keyword_id" uuid NOT NULL REFERENCES "keywords"("id") ON DELETE CASCADE,
        "metric_date" date NOT NULL,
        "source" varchar(20) NOT NULL DEFAULT 'gsc',
        "clicks" bigint NOT NULL DEFAULT 0,
        "impressions" bigint NOT NULL DEFAULT 0,
        "ctr" double precision NOT NULL DEFAULT 0,
        "position" double precision NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "idx_keyword_metrics_keyword_date" ON "keyword_metrics" ("keyword_id", "metric_date", "source");
      CREATE INDEX "idx_keyword_metrics_keyword" ON "keyword_metrics" ("keyword_id");

      CREATE TABLE "clusters" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "intent" varchar(30) NOT NULL,
        "page_type" varchar(20) NOT NULL,
        "confidence" double precision NOT NULL DEFAULT 0,
        "target_url" text,
        "recommended_action" varchar(20) NOT NULL DEFAULT 'REVIEW',
        "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
        "ai_reviewed" boolean NOT NULL DEFAULT false,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_clusters_site_id" ON "clusters" ("site_id");

      CREATE TABLE "cluster_keywords" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cluster_id" uuid NOT NULL REFERENCES "clusters"("id") ON DELETE CASCADE,
        "keyword_id" uuid NOT NULL REFERENCES "keywords"("id") ON DELETE CASCADE,
        "role" varchar(10) NOT NULL
      );
      CREATE UNIQUE INDEX "idx_cluster_keywords_cluster" ON "cluster_keywords" ("cluster_id", "keyword_id");

      CREATE TABLE "url_mappings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "cluster_id" uuid REFERENCES "clusters"("id") ON DELETE SET NULL,
        "keyword_id" uuid REFERENCES "keywords"("id") ON DELETE SET NULL,
        "url" text NOT NULL,
        "source" varchar(30) NOT NULL,
        "manual_override" boolean NOT NULL DEFAULT false,
        "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "idx_url_mappings_site_url" ON "url_mappings" ("site_id", "url");
      CREATE INDEX "idx_url_mappings_cluster" ON "url_mappings" ("cluster_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "url_mappings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cluster_keywords"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "clusters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "keyword_metrics"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "keywords"`);
  }
}

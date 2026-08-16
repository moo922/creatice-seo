import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Local Lighthouse audit runs. Kept entirely separate from the deterministic
 * audit engine: Lighthouse measures browser-rendered page quality on
 * representative URLs only and its scores never mix into Internal Platform
 * Health without an explicit documented weighting.
 */
export class CreateLighthouseRuns00401720000000040 implements MigrationInterface {
  name = 'CreateLighthouseRuns00401720000000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lighthouse_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "url" text NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'RUNNING',
        "scores" jsonb NOT NULL DEFAULT '{}',
        "error" text,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_lighthouse_site_created" ON "lighthouse_runs" ("site_id", "created_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "lighthouse_runs"`);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Self-hosted reporting schema: white-label branding (agency + client identity,
 * contact details, footer) and permanently saved report versions (full HTML in
 * the database, optional local PDF file path). No third-party reporting SaaS.
 */
export class CreateReporting00251720000000025 implements MigrationInterface {
  name = 'CreateReporting00251720000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "report_branding" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "agency_name" varchar(255) NOT NULL,
        "agency_logo_url" text NOT NULL DEFAULT '',
        "client_name" varchar(255) NOT NULL,
        "client_logo_url" text NOT NULL DEFAULT '',
        "contact_details" jsonb NOT NULL DEFAULT '{}',
        "footer" text NOT NULL DEFAULT '',
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "idx_report_branding_site" ON "report_branding" ("site_id");

      CREATE TABLE "reports" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
        "type" varchar(30) NOT NULL,
        "title" text NOT NULL,
        "period_start" date,
        "period_end" date,
        "version" int NOT NULL DEFAULT 1,
        "html" text NOT NULL,
        "pdf_path" text,
        "status" varchar(20) NOT NULL DEFAULT 'GENERATED',
        "meta" jsonb NOT NULL DEFAULT '{}',
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_reports_site_created" ON "reports" ("site_id", "created_at" DESC);
      CREATE INDEX "idx_reports_site_type" ON "reports" ("site_id", "type");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "report_branding"`);
  }
}

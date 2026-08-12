import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenants00021720000000002 implements MigrationInterface {
  name = 'CreateTenants00021720000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "slug" varchar(100) NOT NULL UNIQUE,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "meta" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_organizations_status" CHECK ("status" IN ('ACTIVE','SUSPENDED','ARCHIVED'))
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "sites" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "name" varchar(255) NOT NULL,
        "domain" varchar(255) NOT NULL UNIQUE,
        "locale" varchar(10) NOT NULL DEFAULT 'en',
        "language" varchar(50) NOT NULL DEFAULT 'English',
        "country" varchar(100),
        "target_cities" jsonb NOT NULL DEFAULT '[]',
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "settings" jsonb NOT NULL DEFAULT '{}',
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_sites_status" CHECK ("status" IN ('ACTIVE','PAUSED','ARCHIVED'))
      );
      CREATE INDEX "idx_sites_organization_id" ON "sites" ("organization_id");
      CREATE INDEX "idx_sites_domain" ON "sites" ("domain");
    `);

    await queryRunner.query(`
      CREATE TABLE "site_memberships" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "site_role" varchar(20) NOT NULL DEFAULT 'VIEWER',
        "granted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_site_memberships_site_user" UNIQUE ("site_id", "user_id"),
        CONSTRAINT "chk_site_memberships_role" CHECK ("site_role" IN ('OWNER','MANAGER','VIEWER'))
      );
      CREATE INDEX "idx_site_memberships_site_id" ON "site_memberships" ("site_id");
      CREATE INDEX "idx_site_memberships_user_id" ON "site_memberships" ("user_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "site_memberships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);
  }
}

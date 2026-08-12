import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdentity00011720000000001 implements MigrationInterface {
  name = 'CreateIdentity00011720000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(255) NOT NULL UNIQUE,
        "password_hash" varchar(255) NOT NULL,
        "full_name" varchar(255) NOT NULL,
        "type" varchar(20) NOT NULL DEFAULT 'AGENCY',
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "token_version" integer NOT NULL DEFAULT 0,
        "organization_id" uuid,
        "last_login_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_users_type" CHECK ("type" IN ('AGENCY','CLIENT')),
        CONSTRAINT "chk_users_status" CHECK ("status" IN ('ACTIVE','SUSPENDED'))
      );
      CREATE INDEX "idx_users_email" ON "users" ("email");
    `);

    await queryRunner.query(`
      CREATE TABLE "roles" (
        "key" varchar(50) PRIMARY KEY,
        "name" varchar(100) NOT NULL,
        "description" text,
        "is_system" boolean NOT NULL DEFAULT true
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "key" varchar(100) PRIMARY KEY,
        "module" varchar(50) NOT NULL,
        "description" text
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "role_key" varchar(50) NOT NULL REFERENCES "roles"("key") ON DELETE CASCADE,
        "permission_key" varchar(100) NOT NULL REFERENCES "permissions"("key") ON DELETE CASCADE,
        PRIMARY KEY ("role_key", "permission_key")
      );
      CREATE INDEX "idx_role_permissions_permission" ON "role_permissions" ("permission_key");
    `);

    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role_key" varchar(50) NOT NULL REFERENCES "roles"("key") ON DELETE CASCADE,
        PRIMARY KEY ("user_id", "role_key")
      );
      CREATE INDEX "idx_user_roles_role" ON "user_roles" ("role_key");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}

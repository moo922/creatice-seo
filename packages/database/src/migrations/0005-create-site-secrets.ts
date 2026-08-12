import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSiteSecrets00051720000000005 implements MigrationInterface {
  name = 'CreateSiteSecrets00051720000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "site_secrets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "kind" varchar(50) NOT NULL,
        "label" varchar(255),
        "encrypted_payload" text NOT NULL,
        "meta" jsonb NOT NULL DEFAULT '{}',
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "last_validated_at" timestamptz,
        "expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_site_secrets_site_id" ON "site_secrets" ("site_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "site_secrets"`);
  }
}

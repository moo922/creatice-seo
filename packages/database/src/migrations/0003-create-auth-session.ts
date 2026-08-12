import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthSession00031720000000003 implements MigrationInterface {
  name = 'CreateAuthSession00031720000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" varchar(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "replaced_by_token_id" uuid,
        "user_agent" varchar(512),
        "ip" varchar(45),
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id");
      CREATE INDEX "idx_refresh_tokens_hash" ON "refresh_tokens" ("token_hash");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
  }
}

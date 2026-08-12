import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Seeds the internal-link intelligence permissions. */
export class SeedLinkPermissions00241720000000024 implements MigrationInterface {
  name = 'SeedLinkPermissions00241720000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('links:read', 'links', 'View link analyses and link suggestions'),
        ('links:manage', 'links', 'Run link analysis and approve, apply and verify link suggestions')
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
        ('SUPER_ADMIN', 'links:read'),
        ('SUPER_ADMIN', 'links:manage'),
        ('ADMIN', 'links:read'),
        ('ADMIN', 'links:manage'),
        ('SEO_MANAGER', 'links:read'),
        ('SEO_MANAGER', 'links:manage'),
        ('CONTENT_MANAGER', 'links:read'),
        ('CONTENT_MANAGER', 'links:manage'),
        ('EDITOR', 'links:read'),
        ('VIEWER', 'links:read')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_key" IN ('links:read', 'links:manage')`,
    );
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" IN ('links:read', 'links:manage')`);
  }
}

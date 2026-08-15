import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the recurring-automation permissions. CLIENT intentionally receives
 * none of them (it must not see or change automation). SUPER_ADMIN/ADMIN and
 * SEO_MANAGER can read and manage; CONTENT_MANAGER can read.
 */
export class SeedAutomationPermissions00321720000000032 implements MigrationInterface {
  name = 'SeedAutomationPermissions00321720000000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('automation:read', 'automation', 'View per-site automation settings and job history'),
        ('automation:manage', 'automation', 'Configure recurring automation and run history')
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
        ('SUPER_ADMIN', 'automation:read'),
        ('SUPER_ADMIN', 'automation:manage'),
        ('ADMIN', 'automation:read'),
        ('ADMIN', 'automation:manage'),
        ('SEO_MANAGER', 'automation:read'),
        ('SEO_MANAGER', 'automation:manage'),
        ('CONTENT_MANAGER', 'automation:read')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_key" IN ('automation:read', 'automation:manage')`);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" IN ('automation:read', 'automation:manage')`);
  }
}

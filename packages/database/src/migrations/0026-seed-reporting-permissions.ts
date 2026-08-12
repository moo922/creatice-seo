import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Seeds the reporting permissions. */
export class SeedReportingPermissions00261720000000026 implements MigrationInterface {
  name = 'SeedReportingPermissions00261720000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('reports:read', 'reports', 'View generated reports and branding settings'),
        ('reports:manage', 'reports', 'Generate reports and manage white-label branding')
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
        ('SUPER_ADMIN', 'reports:read'),
        ('SUPER_ADMIN', 'reports:manage'),
        ('ADMIN', 'reports:read'),
        ('ADMIN', 'reports:manage'),
        ('SEO_MANAGER', 'reports:read'),
        ('SEO_MANAGER', 'reports:manage'),
        ('CONTENT_MANAGER', 'reports:read'),
        ('CONTENT_MANAGER', 'reports:manage'),
        ('EDITOR', 'reports:read'),
        ('VIEWER', 'reports:read')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_key" IN ('reports:read', 'reports:manage')`,
    );
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" IN ('reports:read', 'reports:manage')`);
  }
}

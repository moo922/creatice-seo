import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed the WordPress integration permissions and grant them to the roles that
 * can manage/observe site content. Mirrors @creative-seo/types.
 */
export class SeedWordpressPermissions00081720000000008 implements MigrationInterface {
  name = 'SeedWordpressPermissions00081720000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('wordpress:read', 'wordpress', 'View WordPress integration health and imported posts'),
        ('wordpress:manage', 'wordpress', 'Run WordPress connection checks and content sync')
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
        ('SUPER_ADMIN', 'wordpress:read'),
        ('SUPER_ADMIN', 'wordpress:manage'),
        ('ADMIN', 'wordpress:read'),
        ('ADMIN', 'wordpress:manage'),
        ('SEO_MANAGER', 'wordpress:read'),
        ('SEO_MANAGER', 'wordpress:manage'),
        ('CONTENT_MANAGER', 'wordpress:read'),
        ('EDITOR', 'wordpress:read'),
        ('VIEWER', 'wordpress:read')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_key" IN ('wordpress:read', 'wordpress:manage');
    `);
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "module" = 'wordpress';
    `);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the content pipeline permissions (content:read / content:manage) and
 * grants them to the roles that manage content in the platform.
 */
export class SeedContentPermissions00171720000000017 implements MigrationInterface {
  name = 'SeedContentPermissions00171720000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('content:read', 'content', 'View content packages and pipeline runs'),
        ('content:manage', 'content', 'Run the content intelligence pipeline and approve briefs')
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
        ('SUPER_ADMIN', 'content:read'),
        ('SUPER_ADMIN', 'content:manage'),
        ('ADMIN', 'content:read'),
        ('ADMIN', 'content:manage'),
        ('SEO_MANAGER', 'content:read'),
        ('SEO_MANAGER', 'content:manage'),
        ('CONTENT_MANAGER', 'content:read'),
        ('CONTENT_MANAGER', 'content:manage'),
        ('EDITOR', 'content:read'),
        ('VIEWER', 'content:read')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_key" IN ('content:read', 'content:manage')`,
    );
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" IN ('content:read', 'content:manage')`);
  }
}

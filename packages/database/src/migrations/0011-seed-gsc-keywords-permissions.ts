import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed Search Console + Keyword engine permissions and role grants.
 * Mirrors @creative-seo/types.
 */
export class SeedGscKeywordsPermissions00111720000000011 implements MigrationInterface {
  name = 'SeedGscKeywordsPermissions00111720000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('gsc:read', 'gsc', 'View Search Console performance and opportunities'),
        ('gsc:manage', 'gsc', 'Connect Search Console, run syncs and select properties'),
        ('keywords:read', 'keywords', 'View keywords, clusters and URL mappings'),
        ('keywords:manage', 'keywords', 'Run the keyword pipeline and approve mappings')
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
        ('SUPER_ADMIN', 'gsc:read'),
        ('SUPER_ADMIN', 'gsc:manage'),
        ('SUPER_ADMIN', 'keywords:read'),
        ('SUPER_ADMIN', 'keywords:manage'),
        ('ADMIN', 'gsc:read'),
        ('ADMIN', 'gsc:manage'),
        ('ADMIN', 'keywords:read'),
        ('ADMIN', 'keywords:manage'),
        ('SEO_MANAGER', 'gsc:read'),
        ('SEO_MANAGER', 'gsc:manage'),
        ('SEO_MANAGER', 'keywords:read'),
        ('SEO_MANAGER', 'keywords:manage'),
        ('CONTENT_MANAGER', 'gsc:read'),
        ('CONTENT_MANAGER', 'keywords:read'),
        ('EDITOR', 'gsc:read'),
        ('EDITOR', 'keywords:read'),
        ('VIEWER', 'gsc:read'),
        ('VIEWER', 'keywords:read')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_key" IN ('gsc:read', 'gsc:manage', 'keywords:read', 'keywords:manage');
    `);
    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "module" IN ('gsc', 'keywords');
    `);
  }
}

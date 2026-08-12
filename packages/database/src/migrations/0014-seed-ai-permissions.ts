import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed AI permissions and role grants. Mirrors @creative-seo/types.
 */
export class SeedAiPermissions00141720000000014 implements MigrationInterface {
  name = 'SeedAiPermissions00141720000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('ai:read', 'ai', 'View AI jobs, provider health and prompt registry'),
        ('ai:manage', 'ai', 'Configure AI providers, run generations and manage prompts')
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
        ('SUPER_ADMIN', 'ai:read'),
        ('SUPER_ADMIN', 'ai:manage'),
        ('ADMIN', 'ai:read'),
        ('ADMIN', 'ai:manage'),
        ('SEO_MANAGER', 'ai:read'),
        ('SEO_MANAGER', 'ai:manage'),
        ('CONTENT_MANAGER', 'ai:read'),
        ('CONTENT_MANAGER', 'ai:manage'),
        ('EDITOR', 'ai:read'),
        ('VIEWER', 'ai:read')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions" WHERE "permission_key" IN ('ai:read', 'ai:manage');
    `);
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "module" = 'ai';
    `);
  }
}

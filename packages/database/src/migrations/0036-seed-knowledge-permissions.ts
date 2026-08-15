import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the knowledge-base permissions. Facts feed content generation, so
 * agency roles that produce content get access: SUPER_ADMIN/ADMIN (full
 * catalog), SEO_MANAGER and CONTENT_MANAGER (read + manage). Editors can view.
 * CLIENT/VIEWER are excluded — the knowledge base is internal.
 */
export class SeedKnowledgePermissions00361720000000036 implements MigrationInterface {
  name = 'SeedKnowledgePermissions00361720000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('knowledge:read', 'knowledge', 'View the site knowledge base and its facts'),
        ('knowledge:manage', 'knowledge', 'Add, edit and verify knowledge base facts')
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
        ('SUPER_ADMIN', 'knowledge:read'),
        ('SUPER_ADMIN', 'knowledge:manage'),
        ('ADMIN', 'knowledge:read'),
        ('ADMIN', 'knowledge:manage'),
        ('SEO_MANAGER', 'knowledge:read'),
        ('SEO_MANAGER', 'knowledge:manage'),
        ('CONTENT_MANAGER', 'knowledge:read'),
        ('CONTENT_MANAGER', 'knowledge:manage'),
        ('EDITOR', 'knowledge:read')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_key" IN ('knowledge:read', 'knowledge:manage')`);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" IN ('knowledge:read', 'knowledge:manage')`);
  }
}

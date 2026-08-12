import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Seeds the operations management permissions. */
export class SeedOperationsPermissions00191720000000019 implements MigrationInterface {
  name = 'SeedOperationsPermissions00191720000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('operations:read', 'operations', 'View issues, recommendations, tasks, change log, baselines and alerts'),
        ('operations:manage', 'operations', 'Manage issues, tasks, change log, snapshots and alerts')
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
        ('SUPER_ADMIN', 'operations:read'),
        ('SUPER_ADMIN', 'operations:manage'),
        ('ADMIN', 'operations:read'),
        ('ADMIN', 'operations:manage'),
        ('SEO_MANAGER', 'operations:read'),
        ('SEO_MANAGER', 'operations:manage'),
        ('CONTENT_MANAGER', 'operations:read'),
        ('CONTENT_MANAGER', 'operations:manage'),
        ('EDITOR', 'operations:read'),
        ('VIEWER', 'operations:read')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_key" IN ('operations:read', 'operations:manage')`,
    );
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" IN ('operations:read', 'operations:manage')`);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the work-queue permissions. Only agency roles that can already read the
 * underlying domains get access: SUPER_ADMIN/ADMIN (via the full catalog) and
 * SEO_MANAGER (read + manage). Content/editor/viewer and CLIENT roles are
 * intentionally excluded — the queue aggregates cross-site operational data.
 */
export class SeedWorkqueuePermissions00341720000000034 implements MigrationInterface {
  name = 'SeedWorkqueuePermissions00341720000000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('workqueue:read', 'workqueue', 'View the agency work queue and saved filters'),
        ('workqueue:manage', 'workqueue', 'Triage work items: assign, prioritize, review, ignore and create tasks')
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
        ('SUPER_ADMIN', 'workqueue:read'),
        ('SUPER_ADMIN', 'workqueue:manage'),
        ('ADMIN', 'workqueue:read'),
        ('ADMIN', 'workqueue:manage'),
        ('SEO_MANAGER', 'workqueue:read'),
        ('SEO_MANAGER', 'workqueue:manage')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_key" IN ('workqueue:read', 'workqueue:manage')`);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" IN ('workqueue:read', 'workqueue:manage')`);
  }
}

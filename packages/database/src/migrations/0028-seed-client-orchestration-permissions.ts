import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the restricted client-access permission and the orchestration
 * permissions. CLIENT is granted client:access only — it intentionally cannot
 * see credentials, AI settings/prompts, costs, internal notes, n8n, or system
 * logs, because those require other permissions it does not have.
 */
export class SeedClientOrchestrationPermissions00281720000000028 implements MigrationInterface {
  name = 'SeedClientOrchestrationPermissions00281720000000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('client:access', 'client', 'Access the restricted client portal for authorized websites'),
        ('orchestration:read', 'orchestration', 'View orchestration jobs and their status'),
        ('orchestration:manage', 'orchestration', 'Create and dispatch n8n orchestration jobs')
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
        ('CLIENT', 'client:access'),
        ('SUPER_ADMIN', 'client:access'),
        ('SUPER_ADMIN', 'orchestration:read'),
        ('SUPER_ADMIN', 'orchestration:manage'),
        ('ADMIN', 'client:access'),
        ('ADMIN', 'orchestration:read'),
        ('ADMIN', 'orchestration:manage'),
        ('SEO_MANAGER', 'orchestration:read'),
        ('SEO_MANAGER', 'orchestration:manage'),
        ('CONTENT_MANAGER', 'orchestration:read'),
        ('EDITOR', 'orchestration:read')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_key" IN ('client:access', 'orchestration:read', 'orchestration:manage')`,
    );
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" IN ('client:access', 'orchestration:read', 'orchestration:manage')`);
  }
}

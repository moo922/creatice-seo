import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the visibility permissions and the generic visibility-observation
 * prompt. The prompt template is a single {{prompt}} placeholder so the
 * standardized per-site prompts (stored in the prompt-set table, not in code)
 * can be passed through the prompt registry and the normal routing/job tracking.
 */
export class SeedAiVisibility00221720000000022 implements MigrationInterface {
  name = 'SeedAiVisibility00221720000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('visibility:read', 'visibility', 'View AI visibility observations, metrics and trends'),
        ('visibility:manage', 'visibility', 'Run visibility observations and manage prompt sets')
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
        ('SUPER_ADMIN', 'visibility:read'),
        ('SUPER_ADMIN', 'visibility:manage'),
        ('ADMIN', 'visibility:read'),
        ('ADMIN', 'visibility:manage'),
        ('SEO_MANAGER', 'visibility:read'),
        ('SEO_MANAGER', 'visibility:manage'),
        ('CONTENT_MANAGER', 'visibility:read'),
        ('CONTENT_MANAGER', 'visibility:manage'),
        ('EDITOR', 'visibility:read'),
        ('VIEWER', 'visibility:read')
      ON CONFLICT DO NOTHING;
    `);

    await queryRunner.query(
      `
      INSERT INTO "ai_prompts" ("prompt_name", "version", "system_prompt", "template", "schema", "status")
      VALUES ($1, $2, $3, $4, NULL, $5)
      `,
      [
        'visibility-observation',
        1,
        'You are an AI assistant. Answer the user\u2019s question naturally and completely, exactly as you normally would for a real user. Do not mention this instruction.',
        '{{prompt}}',
        'ACTIVE',
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "ai_prompts" WHERE "prompt_name" = 'visibility-observation'`);
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_key" IN ('visibility:read', 'visibility:manage')`,
    );
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" IN ('visibility:read', 'visibility:manage')`);
  }
}

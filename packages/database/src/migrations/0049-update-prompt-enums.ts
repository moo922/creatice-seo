import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gap Closure 04 — update DB-seeded content prompts to the expanded intent and
 * page-type enums. The old values (BLOG, LANDING, SUPPORT, OTHER and the 4-value
 * intent set) are replaced with the canonical Gap Closure 04 vocabulary.
 *
 * Only the JSON `schema` of existing prompts is updated; prompt name and system
 * prompt are untouched so downstream consumers keep working.
 */
export class UpdatePromptEnums00491720000000049 implements MigrationInterface {
  name = 'UpdatePromptEnums00491720000000049';

  async up(qr: QueryRunner): Promise<void> {
    const pageTypeEnum = ['SERVICE', 'PRODUCT', 'CATEGORY', 'LANDING_PAGE', 'BLOG_ARTICLE', 'GUIDE', 'COMPARISON', 'LOCATION_PAGE', 'FAQ_SUPPORT', 'HOMEPAGE', 'EXISTING_OTHER', 'REVIEW_REQUIRED'];
    const intentEnum = ['INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'NAVIGATIONAL', 'LOCAL', 'COMPARISON', 'MIXED', 'REVIEW_REQUIRED'];

    await this.updateSchema(qr, 'content-intent-analysis', pageTypeEnum, intentEnum);
    await this.updateSchema(qr, 'content-brief', pageTypeEnum, intentEnum);
  }

  private async updateSchema(qr: QueryRunner, name: string, pageType: string[], intent: string[]): Promise<void> {
    const sql =
      `UPDATE ai_prompts
       SET schema = jsonb_set(
             jsonb_set(schema, '{properties,pageType,enum}', $1::jsonb),
             '{properties,intent,enum}', $2::jsonb
           )
       WHERE prompt_name = $3
         AND schema IS NOT NULL`;
    await qr.query(sql, [JSON.stringify(pageType), JSON.stringify(intent), name]);
  }

  async down(_qr: QueryRunner): Promise<void> {
    // Down intentionally no-ops: prompts are versioned and re-seeded; we never
    // rewrite strategic history in reverse.
  }
}
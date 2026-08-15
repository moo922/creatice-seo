import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Site knowledge base: persistent, verified facts about a client/site
 * (company info, services, claims, brand voice, content rules). These facts
 * are managed by agency staff and consumed by content generation so output
 * stays factual and on-brand.
 */
export class CreateKnowledgeBase00351720000000035 implements MigrationInterface {
  name = 'CreateKnowledgeBase00351720000000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "knowledge_facts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "category" varchar(50) NOT NULL,
        "key" varchar(100) NOT NULL,
        "value" text NOT NULL,
        "verification_status" varchar(30) NOT NULL DEFAULT 'UNVERIFIED',
        "source" varchar(100),
        "notes" text,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_knowledge_facts_site_category" ON "knowledge_facts" ("site_id", "category");
      CREATE UNIQUE INDEX "idx_knowledge_facts_site_key" ON "knowledge_facts" ("site_id", "key");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_facts"`);
  }
}

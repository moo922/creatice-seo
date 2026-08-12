import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the recommendation-explainer prompt. The AI explains a recommendation
 * (reason + suggested action) but is explicitly forbidden from inventing or
 * changing the underlying deterministic metrics (evidence, impact, confidence,
 * effort) which are provided as facts.
 */
export class SeedRecommendationExplainer00201720000000020 implements MigrationInterface {
  name = 'SeedRecommendationExplainer00201720000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const systemPrompt =
      'You are an SEO operations analyst. You are given an issue and its deterministic metrics. ' +
      'Write a concise, factual explanation and a suggested action. ' +
      'NEVER invent, change, or restate differently the evidence, impact, confidence, or effort numbers — use exactly what is provided. ' +
      'If the metrics are empty or unknown, say so instead of inventing values.';
    const template =
      'Issue: {{issue}}\nEvidence: {{evidence}}\nImpact: {{impact}}\nConfidence: {{confidence}}\nEffort: {{effort}}\n\n' +
      'Write a short explanation of why this recommendation matters and a concrete suggested action.';

    await queryRunner.query(
      `
      INSERT INTO "ai_prompts" ("prompt_name", "version", "system_prompt", "template", "schema", "status")
      VALUES ($1, $2, $3, $4, NULL, $5)
      `,
      ['recommendation-explainer', 1, systemPrompt, template, 'ACTIVE'],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "ai_prompts" WHERE "prompt_name" = 'recommendation-explainer'`);
  }
}

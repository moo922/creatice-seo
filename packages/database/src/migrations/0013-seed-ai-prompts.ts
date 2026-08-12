import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the versioned prompt registry with the initial prompt set (version 1,
 * ACTIVE). Prompts live in the database so business services never hard-code
 * long prompts. Edit prompts through the registry, not in service code.
 */
export class SeedAiPrompts00131720000000013 implements MigrationInterface {
  name = 'SeedAiPrompts00131720000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const prompts: Array<[string, string, string, Record<string, unknown> | null]> = [
      [
        'research',
        'You are a meticulous web research analyst. Gather real, current sources and summarize findings with citations. Never fabricate URLs. If no sources can be found, return an empty sources array.',
        'Research this topic: {{topic}}\n\nContext:\n{{context}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['topic', 'summary', 'sources'],
          properties: {
            topic: { type: 'string' },
            summary: { type: 'string' },
            sources: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'url', 'snippet'],
                properties: {
                  title: { type: 'string' },
                  url: { type: 'string' },
                  snippet: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      ],
      [
        'clustering',
        'You are an SEO taxonomy expert. Group keywords into non-overlapping topical clusters. Clusters must have a descriptive name, a one-sentence definition, and coherent keyword membership.',
        'Cluster these keywords into topics.\n\nSite:\n{{site}}\n\nKeywords:\n{{keywords}}\n\nCluster rules:\n{{rules}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['clusters'],
          properties: {
            clusters: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'description', 'keywords'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  keywords: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      ],
      [
        'brief',
        'You are a senior SEO content strategist. Produce a precise, actionable content brief that a writer can execute without further clarification. Use search intent to justify the outline.',
        'Write a content brief for this target:\n\nTarget keyword: {{keyword}}\nIntent: {{intent}}\nCompetitors: {{competitors}}\nAdditional instructions: {{instructions}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'intent', 'targetAudience', 'primaryKeywords', 'secondaryKeywords', 'outline', 'faq'],
          properties: {
            title: { type: 'string' },
            intent: { type: 'string', enum: ['TRANSACTIONAL', 'COMMERCIAL', 'INFORMATIONAL', 'NAVIGATIONAL'] },
            targetAudience: { type: 'string' },
            primaryKeywords: { type: 'array', items: { type: 'string' } },
            secondaryKeywords: { type: 'array', items: { type: 'string' } },
            outline: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['heading', 'purpose', 'points'],
                properties: {
                  heading: { type: 'string' },
                  purpose: { type: 'string' },
                  points: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            faq: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['question', 'answer'],
                properties: { question: { type: 'string' }, answer: { type: 'string' } },
              },
            },
          },
        },
      ],
      [
        'writer',
        'You are an expert long-form SEO writer. Write in clear, natural prose that satisfies the brief. Match the requested tone and language. Use the outline headings as section headers (H2). Do not invent statistics; attribute claims.',
        'Write the article.\n\nTitle: {{title}}\nLanguage: {{language}}\nTone: {{tone}}\nOutline:\n{{outline}}\n\nSources to reference (optional):\n{{sources}}\n\nBrand/voice notes:\n{{voice}}',
        null,
      ],
      [
        'arabic-qa',
        'أنت خبير محتوى عربي. أجب بالعربية الفصحى الواضحة. أعد الإجابات بصيغة JSON وفق المخطط المطلوب. استخدم نبرة مهنية ودقيقة، ولا تخترع إحصاءات.',
        'السؤال: {{question}}\n\nالسياق:\n{{context}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['answers'],
          properties: {
            answers: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['question', 'answer', 'confidence'],
                properties: {
                  question: { type: 'string' },
                  answer: { type: 'string' },
                  confidence: { type: 'number' },
                },
              },
            },
          },
        },
      ],
    ];

    const values: unknown[] = [];
    for (const [name, systemPrompt, template, schema] of prompts) {
      values.push(name, 1, systemPrompt, template, schema, 'ACTIVE');
    }
    const placeholders = values
      .map((_, index) => {
        const col = (index % 6) + 1;
        return `$${index + 1}::${promptColumnType(col)}`;
      });
    const rows = prompts
      .map((_, index) => `(${placeholders.slice(index * 6, index * 6 + 6).join(', ')})`)
      .join(', ');

    await queryRunner.query(
      `
      INSERT INTO "ai_prompts"
        ("prompt_name", "version", "system_prompt", "template", "schema", "status")
      VALUES ${rows}
      `,
      values,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "ai_prompts" WHERE "prompt_name" IN
       ('research', 'clustering', 'brief', 'writer', 'arabic-qa')`,
    );
  }
}

function promptColumnType(column: number): string {
  switch (column) {
    case 1:
      return 'varchar';
    case 2:
      return 'int';
    case 5:
      return 'jsonb';
    case 6:
      return 'varchar';
    default:
      return 'text';
  }
}

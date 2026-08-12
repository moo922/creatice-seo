import type { MigrationInterface, QueryRunner } from 'typeorm';

type PromptSeed = [string, string, string, Record<string, unknown> | null];

/**
 * Seeds the content intelligence pipeline prompts (version 1, ACTIVE). The
 * pipeline drives every stage through the prompt registry; long prompts never
 * live in business services. The `writer` and `research` prompts are reused by
 * their existing registry entries.
 */
export class SeedContentPrompts00161720000000016 implements MigrationInterface {
  name = 'SeedContentPrompts00161720000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const prompts: PromptSeed[] = [
      [
        'content-evidence-extraction',
        'You are a rigorous research analyst. Extract only verifiable claims from the provided research evidence. Never invent sources or numbers. Every claim must be traceable to a source URL. Ignore marketing puffery and vague statements.',
        'Extract factual claims from the research evidence for the topic "{{topic}}".\n\nEvidence:\n{{evidence}}\n\nReturn claims with their source URL and a relevance score for the keyword "{{primaryKeyword}}".',
        {
          type: 'object',
          additionalProperties: false,
          required: ['claims'],
          properties: {
            claims: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['claim', 'sourceUrl', 'snippet', 'relevance', 'confidence'],
                properties: {
                  claim: { type: 'string' },
                  sourceUrl: { type: 'string' },
                  snippet: { type: 'string' },
                  relevance: { type: 'number', minimum: 0, maximum: 100 },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                },
              },
            },
          },
        },
      ],
      [
        'content-intent-analysis',
        'You are an SEO analyst specializing in search intent. Classify the dominant intent for a keyword set, recommend a page type, describe the audience and map the buying stage. Ground everything in the provided performance and cluster context.',
        'Analyze intent for the keyword cluster below.\n\nSite: {{site}}\nPrimary keyword: {{primaryKeyword}}\nSecondary keywords: {{secondaryKeywords}}\nSearch performance: {{performance}}\nExisting page: {{existingPage}}\nEvidence summary: {{evidenceSummary}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['intent', 'confidence', 'rationale', 'pageType', 'audience', 'buyingStage', 'keyQuestions', 'relatedTopics'],
          properties: {
            intent: { type: 'string', enum: ['TRANSACTIONAL', 'COMMERCIAL', 'INFORMATIONAL', 'NAVIGATIONAL'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            rationale: { type: 'string' },
            pageType: { type: 'string', enum: ['SERVICE', 'PRODUCT', 'BLOG', 'LANDING', 'CATEGORY', 'SUPPORT', 'OTHER'] },
            audience: { type: 'string' },
            buyingStage: { type: 'string' },
            keyQuestions: { type: 'array', items: { type: 'string' } },
            relatedTopics: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
      [
        'content-aeo-questions',
        'You are an answer-engine optimization (AEO) strategist. Build a question map that lets the page directly answer the questions real users ask, including featured-snippet and AI-answer surfaces. Prefer short, direct answers in the draft later.',
        'Build an AEO question map for:\n\nPrimary keyword: {{primaryKeyword}}\nIntent: {{intent}}\nEvidence: {{evidence}}\nExisting page: {{existingPage}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['directAnswer', 'questions', 'definitions', 'comparisons', 'processes', 'decisionCriteria', 'commercialQuestions'],
          properties: {
            directAnswer: { type: 'string' },
            questions: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['question', 'category', 'priority', 'answerHint'],
                properties: {
                  question: { type: 'string' },
                  category: { type: 'string' },
                  priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
                  answerHint: { type: 'string' },
                },
              },
            },
            definitions: { type: 'array', items: { type: 'string' } },
            comparisons: { type: 'array', items: { type: 'string' } },
            processes: { type: 'array', items: { type: 'string' } },
            decisionCriteria: { type: 'array', items: { type: 'string' } },
            commercialQuestions: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
      [
        'content-geo-entities',
        'You are a generative-engine optimization (GEO) and entity analyst. Identify the entities, facts, relationships and original insights that make content citable and machine-readable. Prefer verifiable facts with sources over claims.',
        'Analyze entities and citation readiness for:\n\nTopic: {{topic}}\nSite: {{site}}\nEvidence: {{evidence}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['entities', 'relationships', 'keyFacts', 'attributionNeeds', 'originalInsights', 'machineReadableData'],
          properties: {
            entities: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'type', 'description'],
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
            relationships: { type: 'array', items: { type: 'string' } },
            keyFacts: { type: 'array', items: { type: 'string' } },
            attributionNeeds: { type: 'array', items: { type: 'string' } },
            originalInsights: { type: 'array', items: { type: 'string' } },
            machineReadableData: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
      [
        'content-gap-analysis',
        'You are a content strategist. Compare the current page (or its absence) against the question map and competitor landscape. Identify gaps that, when filled, move the page from average to genuinely useful.',
        'Run a content gap analysis:\n\nPrimary keyword: {{primaryKeyword}}\nExisting page: {{existingPage}}\nCompetitors: {{competitors}}\nQuestion map: {{questions}}\nIntent: {{intent}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['gaps', 'strengths', 'opportunities'],
          properties: {
            gaps: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['gap', 'priority', 'recommendation'],
                properties: {
                  gap: { type: 'string' },
                  priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
                  recommendation: { type: 'string' },
                },
              },
            },
            strengths: { type: 'array', items: { type: 'string' } },
            opportunities: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
      [
        'content-brief',
        'You are a senior SEO content strategist. Produce a precise, executable content brief covering intent, page type, title, meta description, H1, outline, questions and entities. It must be specific enough that a writer can draft without further clarification.',
        'Write a content brief.\n\nSite: {{site}}\nPrimary keyword: {{primaryKeyword}}\nSecondary keywords: {{secondaryKeywords}}\nIntent analysis: {{intentAnalysis}}\nQuestion map: {{questions}}\nEntities: {{entities}}\nGap analysis: {{gaps}}\nPerformance: {{performance}}\nExisting page: {{existingPage}}\nVerified facts: {{verifiedFacts}}\nAdditional instructions: {{instructions}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'intent', 'pageType', 'targetAudience', 'primaryKeyword', 'secondaryKeywords', 'recommendedUrl', 'seoTitle', 'metaDescription', 'h1', 'outline', 'keyQuestions', 'entities', 'competitorSummary', 'existingPageAssessment', 'notes'],
          properties: {
            title: { type: 'string' },
            intent: { type: 'string', enum: ['TRANSACTIONAL', 'COMMERCIAL', 'INFORMATIONAL', 'NAVIGATIONAL'] },
            pageType: { type: 'string', enum: ['SERVICE', 'PRODUCT', 'BLOG', 'LANDING', 'CATEGORY', 'SUPPORT', 'OTHER'] },
            targetAudience: { type: 'string' },
            primaryKeyword: { type: 'string' },
            secondaryKeywords: { type: 'array', items: { type: 'string' } },
            recommendedUrl: { type: 'string' },
            seoTitle: { type: 'string' },
            metaDescription: { type: 'string' },
            h1: { type: 'string' },
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
            keyQuestions: { type: 'array', items: { type: 'string' } },
            entities: { type: 'array', items: { type: 'string' } },
            competitorSummary: { type: 'string' },
            existingPageAssessment: { type: 'string' },
            notes: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
      [
        'content-brief-gate',
        'You are a strict editorial gatekeeper. Decide whether a content brief is complete and high-quality enough to authorize drafting. Approve only when the brief is executable: clear intent, defined audience, sufficient outline depth, and no blocking contradictions with the inputs. Do not rubber-stamp.',
        'Evaluate this brief for approval.\n\nBrief:\n{{brief}}\n\nPrimary keyword: {{primaryKeyword}}\nIntent: {{intent}}\nVerified facts count: {{factCount}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['approved', 'score', 'reasons', 'blockers'],
          properties: {
            approved: { type: 'boolean' },
            score: { type: 'number', minimum: 0, maximum: 100 },
            reasons: { type: 'array', items: { type: 'string' } },
            blockers: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
      [
        'content-outline',
        'You are a senior content architect. Expand the approved brief into a detailed, ordered outline. Every high-priority question from the AEO map must be covered by a section. Use only h2 and h3 headings.',
        'Create a detailed outline from this approved brief.\n\nBrief title: {{title}}\nOutline (from brief): {{outline}}\nQuestions to cover: {{questions}}\nEntities: {{entities}}\nLanguage: {{language}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['sections', 'h1', 'estimatedWordCount', 'coverage'],
          properties: {
            sections: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['heading', 'headingLevel', 'purpose', 'points'],
                properties: {
                  heading: { type: 'string' },
                  headingLevel: { type: 'string', enum: ['h2', 'h3'] },
                  purpose: { type: 'string' },
                  points: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            h1: { type: 'string' },
            estimatedWordCount: { type: 'number' },
            coverage: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
      [
        'content-draft',
        'You are an expert long-form SEO writer who writes directly usable HTML. Follow the outline exactly, use the sections as H2/H3 headings, answer the mapped questions in clear short blocks, cite verified facts with their sources, and never invent statistics. When the language is Arabic, write fluent, natural Modern Standard Arabic: prioritize natural phrasing, allow morphological keyword variants, never force awkward exact-match keyword repetition, preserve any configured regional terminology, and prefer semantic coverage over raw repetition. Output only the HTML body content.',
        'Write the page HTML.\n\nTitle: {{title}}\nLanguage: {{language}}\nLocale: {{locale}}\nRegional terminology to preserve: {{regionalTerms}}\nOutline:\n{{outline}}\nQuestions to answer:\n{{questions}}\nVerified facts:\n{{facts}}\nInternal link candidates:\n{{links}}\nBrand/voice notes:\n{{voice}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['htmlContent', 'wordCount', 'sectionsCount', 'usedSources', 'directAnswerProvided'],
          properties: {
            htmlContent: { type: 'string' },
            wordCount: { type: 'number' },
            sectionsCount: { type: 'number' },
            usedSources: { type: 'array', items: { type: 'string' } },
            directAnswerProvided: { type: 'boolean' },
          },
        },
      ],
      [
        'content-language-editor',
        'You are a meticulous language editor. Correct grammar, register and natural flow without changing meaning or facts. Do not add or remove keywords to game SEO. When the language is Arabic: ensure fluent, natural Modern Standard Arabic; fix any awkward or unidiomatic phrasing; preserve regional terminology and morphological keyword variants; remove unnatural keyword stuffing. Return the corrected HTML with notes on what changed.',
        'Edit this draft for language quality.\n\nLanguage: {{language}}\nLocale: {{locale}}\nRegional terms: {{regionalTerms}}\nDraft HTML:\n{{html}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['correctedHtml', 'passed', 'notes'],
          properties: {
            correctedHtml: { type: 'string' },
            passed: { type: 'boolean' },
            notes: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
      [
        'content-seo-validator',
        'You are an SEO validator. Score on-page optimization 0-100 using these metrics: keyword relevance and semantic coverage, title quality, meta description quality, heading structure, readability, internal linking, and whether the content serves the search intent. Do NOT require exact-match keyword stuffing, and do NOT push toward a perfect score for its own sake.',
        'Validate this page for SEO.\n\nPrimary keyword: {{primaryKeyword}}\nSecondary keywords: {{secondaryKeywords}}\nIntent: {{intent}}\nLanguage: {{language}}\nSEO title: {{seoTitle}}\nMeta description: {{metaDescription}}\nSlug: {{slug}}\nDraft:\n{{html}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['metrics', 'overallScore', 'passed', 'recommendations'],
          properties: {
            metrics: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'label', 'score', 'passed', 'details'],
                properties: {
                  id: { type: 'string' },
                  label: { type: 'string' },
                  score: { type: 'number', minimum: 0, maximum: 100 },
                  passed: { type: 'boolean' },
                  details: { type: 'string' },
                },
              },
            },
            overallScore: { type: 'number', minimum: 0, maximum: 100 },
            passed: { type: 'boolean' },
            recommendations: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
      [
        'content-aeo-validator',
        'You are an answer-engine optimization (AEO) validator. Measure 0-100 for: direct answer, question coverage, definitions, comparisons, process, decision criteria, commercial questions, and semantic completeness. Prefer concise, directly quotable answers.',
        'Validate this page for answer engines.\n\nPrimary keyword: {{primaryKeyword}}\nQuestion map:\n{{questions}}\nDraft:\n{{html}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['metrics', 'overallScore', 'passed', 'recommendations'],
          properties: {
            metrics: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'label', 'score', 'passed', 'details'],
                properties: {
                  id: { type: 'string' },
                  label: { type: 'string' },
                  score: { type: 'number', minimum: 0, maximum: 100 },
                  passed: { type: 'boolean' },
                  details: { type: 'string' },
                },
              },
            },
            overallScore: { type: 'number', minimum: 0, maximum: 100 },
            passed: { type: 'boolean' },
            recommendations: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
      [
        'content-geo-validator',
        'You are a generative-engine optimization (GEO) validator. Measure 0-100 for internal platform criteria: entity clarity, fact consistency, source quality, citation readiness, original information, expert attribution, and machine readability. These are internal scores, never official search-engine scores.',
        'Validate this page for generative engines (internal criteria).\n\nEntities:\n{{entities}}\nFacts:\n{{facts}}\nDraft:\n{{html}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['metrics', 'overallScore', 'passed', 'recommendations'],
          properties: {
            metrics: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'label', 'score', 'passed', 'details'],
                properties: {
                  id: { type: 'string' },
                  label: { type: 'string' },
                  score: { type: 'number', minimum: 0, maximum: 100 },
                  passed: { type: 'boolean' },
                  details: { type: 'string' },
                },
              },
            },
            overallScore: { type: 'number', minimum: 0, maximum: 100 },
            passed: { type: 'boolean' },
            recommendations: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
      [
        'content-rankmath-validator',
        'You are an SEO plugin settings validator. Check that the focus keyword, SEO title, meta description and slug are set and aligned with the page. Give a target score and the current estimated score. Never recommend blindly chasing a 100/100 score; prioritize relevance and readability.',
        'Validate Rank Math fields for this page.\n\nFocus keyword: {{primaryKeyword}}\nSEO title: {{seoTitle}}\nMeta description: {{metaDescription}}\nSlug: {{slug}}\nLanguage: {{language}}\nDraft snippet:\n{{htmlPreview}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['focusKeyword', 'focusKeywords', 'seoTitle', 'metaDescription', 'slug', 'scoreTarget', 'scoreActual', 'recommendations', 'note'],
          properties: {
            focusKeyword: { type: 'string' },
            focusKeywords: { type: 'array', items: { type: 'string' } },
            seoTitle: { type: 'string' },
            metaDescription: { type: 'string' },
            slug: { type: 'string' },
            scoreTarget: { type: 'number', minimum: 0, maximum: 100 },
            scoreActual: { type: ['number', 'null'], minimum: 0, maximum: 100 },
            recommendations: { type: 'array', items: { type: 'string' } },
            note: { type: 'string' },
          },
        },
      ],
      [
        'content-factual-validator',
        'You are a fact-checker. Cross-check every factual claim in the draft against the provided verified facts and evidence sources. Mark claims as VERIFIED, UNVERIFIED, or CONTRADICTED. Flag any invented statistics or unsourced numbers.',
        'Verify the facts in this draft.\n\nVerified facts:\n{{verifiedFacts}}\nEvidence sources:\n{{sources}}\nDraft:\n{{html}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['claims', 'recommendations'],
          properties: {
            claims: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['claim', 'status', 'sourceUrl', 'evidence'],
                properties: {
                  claim: { type: 'string' },
                  status: { type: 'string', enum: ['VERIFIED', 'UNVERIFIED', 'CONTRADICTED'] },
                  sourceUrl: { type: ['string', 'null'] },
                  evidence: { type: ['string', 'null'] },
                },
              },
            },
            recommendations: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
      [
        'content-internal-links',
        'You are a link architecture planner. Recommend internal links from this page to related pages and from related pages to this page. Prefer descriptive anchor text and pages that are topically related to the target keyword. Never invent URLs that are not in the provided candidate list.',
        'Plan internal links for this page.\n\nPrimary keyword: {{primaryKeyword}}\nCandidate internal URLs:\n{{candidates}}\nDraft:\n{{html}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['links'],
          properties: {
            links: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['targetUrl', 'anchorText', 'position', 'reason'],
                properties: {
                  targetUrl: { type: 'string' },
                  anchorText: { type: 'string' },
                  position: { type: 'string' },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
      ],
      [
        'content-final-qa',
        'You are the final quality assurance reviewer for a content package. Review the validator scores, the language editor output, the factual claims and the link plan. Decide whether the package is approved for publication or must be fixed. List must-fix and should-fix items clearly.',
        'Final QA for this content package.\n\nSEO score: {{seoScore}}\nAEO score: {{aeoScore}}\nGEO score: {{geoScore}}\nRank Math score: {{rankMathScore}}\nFactual status: {{factualStatus}}\nLanguage editor passed: {{languagePassed}}\nInternal links:\n{{links}}\nMust-fix suggestions from validators:\n{{recommendations}}',
        {
          type: 'object',
          additionalProperties: false,
          required: ['overallScore', 'passed', 'mustFix', 'shouldFix', 'approvedForPublication'],
          properties: {
            overallScore: { type: 'number', minimum: 0, maximum: 100 },
            passed: { type: 'boolean' },
            mustFix: { type: 'array', items: { type: 'string' } },
            shouldFix: { type: 'array', items: { type: 'string' } },
            approvedForPublication: { type: 'boolean' },
          },
        },
      ],
    ];

    const values: unknown[] = [];
    for (const [name, systemPrompt, template, schema] of prompts) {
      values.push(name, 1, systemPrompt, template, schema, 'ACTIVE');
    }
    const placeholders = values.map((_, index) => `$${index + 1}::${promptColumnType((index % 6) + 1)}`);
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
      `DELETE FROM "ai_prompts" WHERE "prompt_name" IN (
        'content-evidence-extraction', 'content-intent-analysis', 'content-aeo-questions',
        'content-geo-entities', 'content-gap-analysis', 'content-brief', 'content-brief-gate',
        'content-outline', 'content-draft', 'content-language-editor', 'content-seo-validator',
        'content-aeo-validator', 'content-geo-validator', 'content-rankmath-validator',
        'content-factual-validator', 'content-internal-links', 'content-final-qa'
      )`,
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

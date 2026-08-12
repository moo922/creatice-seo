import type { PipelineStageId } from '@creative-seo/types';

export interface StageDefinition {
  id: PipelineStageId;
  name: string;
  /** AI routing workflow key for this stage. */
  workflow: string;
  /** Prompt registry name used by this stage (null for pure-deterministic stages). */
  promptName: string | null;
}

/**
 * Ordered content intelligence pipeline. Stages 1-7 produce the brief; the
 * brief gate must approve it before the draft stages run (no draft before an
 * approved brief). Validator stages produce internal scores only.
 */
export const PIPELINE_STAGE_DEFS: readonly StageDefinition[] = [
  { id: 'research', name: 'Research', workflow: 'research', promptName: 'research' },
  { id: 'evidence-extraction', name: 'Evidence extraction', workflow: 'content-evidence', promptName: 'content-evidence-extraction' },
  { id: 'intent-analysis', name: 'Intent analysis', workflow: 'content-intent', promptName: 'content-intent-analysis' },
  { id: 'aeo-question-map', name: 'AEO question map', workflow: 'content-aeo', promptName: 'content-aeo-questions' },
  { id: 'geo-entity-analysis', name: 'GEO/entity analysis', workflow: 'content-geo', promptName: 'content-geo-entities' },
  { id: 'content-gap-analysis', name: 'Content gap analysis', workflow: 'content-gap', promptName: 'content-gap-analysis' },
  { id: 'content-brief', name: 'Content brief', workflow: 'content-brief', promptName: 'content-brief' },
  { id: 'brief-gate', name: 'Brief approval gate', workflow: 'content-brief-gate', promptName: 'content-brief-gate' },
  { id: 'outline', name: 'Outline', workflow: 'content-outline', promptName: 'content-outline' },
  { id: 'draft', name: 'Draft', workflow: 'content-draft', promptName: 'content-draft' },
  { id: 'language-editor', name: 'Language editor', workflow: 'content-language', promptName: 'content-language-editor' },
  { id: 'seo-validator', name: 'SEO validator', workflow: 'content-seo-validator', promptName: 'content-seo-validator' },
  { id: 'aeo-validator', name: 'AEO validator', workflow: 'content-aeo-validator', promptName: 'content-aeo-validator' },
  { id: 'geo-validator', name: 'GEO validator', workflow: 'content-geo-validator', promptName: 'content-geo-validator' },
  { id: 'rankmath-validator', name: 'Rank Math validator', workflow: 'content-rankmath-validator', promptName: 'content-rankmath-validator' },
  { id: 'factual-validator', name: 'Factual validator', workflow: 'content-factual', promptName: 'content-factual-validator' },
  { id: 'internal-link-planning', name: 'Internal link planning', workflow: 'content-links', promptName: 'content-internal-links' },
  { id: 'final-qa', name: 'Final QA', workflow: 'content-qa', promptName: 'content-final-qa' },
];

export function stageDefinition(id: PipelineStageId): StageDefinition {
  const def = PIPELINE_STAGE_DEFS.find((stage) => stage.id === id);
  if (!def) {
    throw new Error(`Unknown pipeline stage "${id}"`);
  }
  return def;
}

export function stageOrder(id: PipelineStageId): number {
  return PIPELINE_STAGE_DEFS.findIndex((stage) => stage.id === id);
}

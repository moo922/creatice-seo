import type {
  ContentInternalLink,
  ContentOutlineSection,
  ContentSchemaRecommendation,
  FinalQaResultDto,
  KeywordIntent,
  KeywordPageType,
  ValidatorResultDto,
} from '@creative-seo/types';
import type { ResearchSource } from '@creative-seo/ai';
import type { AeoQuestionMap } from './validation/aeo';
import type { GeoEntity } from './validation/geo';
import type { FactClaim } from './validation/factual';

export type PipelineLanguage = 'ar' | 'en';

export interface SiteKnowledge {
  siteId: string;
  organizationId: string | null;
  domain: string;
  name: string;
  language: PipelineLanguage;
  locale: string;
  /** Regional terminology to preserve verbatim (e.g. Arabic market spellings). */
  regionalTerms: string[];
  voice: string;
  competitorUrls: string[];
}

export interface ClusterKnowledge {
  clusterId: string | null;
  name: string | null;
  primaryKeyword: string;
  secondaryKeywords: string[];
  intent: KeywordIntent | null;
  pageType: KeywordPageType | null;
}

export interface ExistingPage {
  url: string | null;
  content: string | null;
}

export interface PerformanceKnowledge {
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number | null;
}

export interface InternalLinkCandidate {
  url: string;
  anchorText: string;
}

/** Everything the pipeline knows about the site, keyword and context. */
export interface PipelineInput {
  site: SiteKnowledge;
  cluster: ClusterKnowledge;
  targetUrl: string | null;
  existingPage: ExistingPage;
  performance: PerformanceKnowledge;
  internalLinkCandidates: InternalLinkCandidate[];
  verifiedFacts: string[];
  /** Optional pre-gathered research; when absent the pipeline runs the research stage. */
  researchEvidence: string | null;
  additionalInstructions: string;
  createdBy: string | null;
}

// ---------------------------------------------------------------------------
// Stage outputs
// ---------------------------------------------------------------------------

export interface ResearchOutput {
  topic: string;
  summary: string;
  sources: ResearchSource[];
}

export interface EvidenceClaim {
  claim: string;
  sourceUrl: string;
  snippet: string;
  relevance: number;
  confidence: number;
}

export interface EvidenceOutput {
  claims: EvidenceClaim[];
}

export interface IntentOutput {
  intent: KeywordIntent;
  confidence: number;
  rationale: string;
  pageType: KeywordPageType;
  audience: string;
  buyingStage: string;
  keyQuestions: string[];
  relatedTopics: string[];
}

export interface GapOutput {
  gaps: Array<{ gap: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; recommendation: string }>;
  strengths: string[];
  opportunities: string[];
}

export interface OutlineOutput {
  sections: ContentOutlineSection[];
  h1: string;
  estimatedWordCount: number;
  coverage: string[];
}

export interface DraftOutput {
  htmlContent: string;
  wordCount: number;
  sectionsCount: number;
  usedSources: string[];
  directAnswerProvided: boolean;
}

export interface LanguageEditorOutput {
  correctedHtml: string;
  passed: boolean;
  notes: string[];
}

export interface InternalLinkOutput {
  links: ContentInternalLink[];
}

/** Accumulated package data produced across the pipeline stages. */
export interface PackageData {
  research?: ResearchOutput;
  evidence?: EvidenceOutput;
  intentAnalysis?: IntentOutput;
  aeoQuestionMap?: AeoQuestionMap;
  geoEntityAnalysis?: { entities: GeoEntity[]; relationships: string[]; keyFacts: string[]; attributionNeeds: string[]; originalInsights: string[]; machineReadableData: string[] };
  gapAnalysis?: GapOutput;
  slug?: string;
  recommendedUrl?: string;
  seoTitle?: string;
  metaDescription?: string;
  outline?: OutlineOutput;
  draft?: DraftOutput;
  languageEdited?: LanguageEditorOutput;
  internalLinks?: ContentInternalLink[];
  factClaims?: FactClaim[];
  schemaRecommendation?: ContentSchemaRecommendation;
  seoValidation?: ValidatorResultDto;
  aeoValidation?: ValidatorResultDto;
  geoValidation?: ValidatorResultDto;
  rankMathValidation?: ValidatorResultDto;
  factualValidation?: ValidatorResultDto;
  finalQa?: FinalQaResultDto;
  /** Snapshot of the pipeline input, persisted so an approved brief can resume. */
  _pipelineInput?: PipelineInput;
}

export interface StageOutputMeta {
  jobId: string | null;
  provider: string | null;
  model: string | null;
  promptVersion: number | null;
}

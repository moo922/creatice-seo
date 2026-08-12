import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContentPackage } from '@creative-seo/database';
import type {
  BriefGateResult,
  ContentBriefDto,
  ContentPackageDto,
  ContentPackagesQuery,
  InternalScoresDto,
  PipelineStageRecordDto,
  ValidatorResultDto,
} from '@creative-seo/types';
import { Repository } from 'typeorm';
import { stageDefinition } from './stages';
import type { PackageData, PipelineInput, StageOutputMeta } from './context';
import { PIPELINE_STAGE_DEFS } from './stages';

export interface StageRecord {
  id: PipelineStageRecordDto['id'];
  status: PipelineStageRecordDto['status'];
  workflow: string | null;
  promptName: string | null;
  promptVersion: number | null;
  jobId: string | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  durationMs: number | null;
  error: string | null;
  summary: string | null;
}

export function initialStageRecords(): StageRecord[] {
  return PIPELINE_STAGE_DEFS.map((def) => ({
    id: def.id,
    status: 'PENDING' as const,
    workflow: def.workflow,
    promptName: def.promptName,
    promptVersion: null,
    jobId: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
    summary: null,
  }));
}

/**
 * Persists content pipeline runs and their content packages. All heavy output
 * is stored as JSONB; only the package's status, language and identity are
 * indexed columns. Errors are sanitized before storage.
 */
@Injectable()
export class ContentPackagesService {
  constructor(
    @InjectRepository(ContentPackage)
    private readonly packages: Repository<ContentPackage>,
  ) {}

  create(input: PipelineInput): Promise<ContentPackage> {
    const row = this.packages.create({
      siteId: input.site.siteId,
      organizationId: input.site.organizationId,
      clusterId: input.cluster.clusterId,
      createdBy: input.createdBy,
      status: 'RUNNING',
      language: input.site.language,
      locale: input.site.locale,
      targetUrl: input.targetUrl,
      existingPageUrl: input.existingPage.url,
      stages: initialStageRecords() as unknown as Record<string, unknown>[],
      brief: {},
      briefGate: {},
      packageData: {},
      scores: {},
      error: null,
    });
    return this.packages.save(row);
  }

  async findById(id: string): Promise<ContentPackage> {
    const row = await this.packages.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Content package not found');
    }
    return row;
  }

  async list(siteId: string, query: ContentPackagesQuery): Promise<ContentPackageDto[]> {
    const builder = this.packages
      .createQueryBuilder('pkg')
      .where('pkg.site_id = :siteId', { siteId })
      .orderBy('pkg.created_at', 'DESC')
      .limit(Math.min(query.limit ?? 25, 100))
      .offset(query.offset ?? 0);
    if (query.status) {
      builder.andWhere('pkg.status = :status', { status: query.status });
    }
    const rows = await builder.getMany();
    return rows.map((row) => this.toDto(row));
  }

  async saveStages(row: ContentPackage, stages: StageRecord[]): Promise<void> {
    row.stages = stages as unknown as Record<string, unknown>[];
    await this.packages.save(row);
  }

  async saveBrief(row: ContentPackage, brief: ContentBriefDto, gate: BriefGateResult): Promise<void> {
    row.brief = brief as unknown as Record<string, unknown>;
    row.briefGate = gate as unknown as Record<string, unknown>;
    await this.packages.save(row);
  }

  async savePackageData(row: ContentPackage, data: PackageData): Promise<void> {
    row.packageData = data as unknown as Record<string, unknown>;
    await this.packages.save(row);
  }

  async saveScores(row: ContentPackage, scores: InternalScoresDto): Promise<void> {
    row.scores = scores as unknown as Record<string, unknown>;
    await this.packages.save(row);
  }

  async setStatus(row: ContentPackage, status: string, error: string | null = null): Promise<void> {
    row.status = status;
    row.error = error;
    if (status === 'COMPLETE') {
      row.completedAt = new Date();
    }
    await this.packages.save(row);
  }

  toDto(row: ContentPackage): ContentPackageDto {
    const brief = (row.brief ?? {}) as unknown as ContentBriefDto;
    const gate = (row.briefGate ?? {}) as unknown as BriefGateResult;
    const data = (row.packageData ?? {}) as unknown as PackageData;

    const html = data.languageEdited?.correctedHtml ?? data.draft?.htmlContent ?? '';
    const seoTitle = data.seoTitle ?? brief.seoTitle ?? '';
    const metaDescription = data.metaDescription ?? brief.metaDescription ?? '';

    const rankMath = {
      focusKeyword: brief.primaryKeyword ?? '',
      focusKeywords: [brief.primaryKeyword ?? '', ...(brief.secondaryKeywords ?? [])].filter(Boolean),
      seoTitle,
      metaDescription,
      slug: data.slug ?? '',
      scoreTarget: 80,
      scoreActual: data.rankMathValidation?.overallScore ?? null,
      note: 'Internal Rank Math-compatible checks; not an official Rank Math score.',
    };

    const empty = emptyValidator;
    const schema = data.schemaRecommendation ?? {
      type: 'Article',
      jsonLd: null,
      rationale: 'Not yet produced',
    };

    return {
      id: row.id,
      siteId: row.siteId,
      organizationId: row.organizationId,
      clusterId: row.clusterId,
      status: row.status as ContentPackageDto['status'],
      language: row.language as ContentPackageDto['language'],
      locale: row.locale,
      primaryKeyword: brief.primaryKeyword ?? '',
      secondaryKeywords: brief.secondaryKeywords ?? [],
      intent: brief.intent ?? 'INFORMATIONAL',
      pageType: brief.pageType ?? 'BLOG',
      recommendedUrl: data.recommendedUrl ?? brief.recommendedUrl ?? '',
      seoTitle,
      metaDescription,
      slug: data.slug ?? '',
      h1: data.outline?.h1 ?? brief.h1 ?? '',
      outline: data.outline?.sections ?? brief.outline ?? [],
      htmlContent: html,
      internalLinks: data.internalLinks ?? [],
      externalEvidence:
        data.research?.sources.map((source) => ({
          title: source.title,
          url: source.url,
          snippet: source.snippet,
          claim: null,
        })) ?? [],
      schemaRecommendation: schema,
      rankMath,
      brief,
      briefGate: gate.approved !== undefined ? gate : { approved: false, score: 0, reasons: [], blockers: [] },
      languageEditor: data.languageEdited
        ? {
            original: data.draft?.htmlContent ?? '',
            corrected: data.languageEdited.correctedHtml,
            changed: data.languageEdited.correctedHtml !== (data.draft?.htmlContent ?? ''),
            notes: data.languageEdited.notes,
            passed: data.languageEdited.passed,
          }
        : null,
      factClaims: data.factClaims ?? [],
      scores: {
        seo: data.seoValidation ?? empty('SEO'),
        aeo: data.aeoValidation ?? empty('AEO'),
        geo: data.geoValidation ?? empty('GEO'),
        rankMath: data.rankMathValidation ?? empty('RANKMATH'),
        factual: data.factualValidation ?? empty('FACTUAL'),
        finalQa: data.finalQa
          ? {
              validator: 'FINAL_QA',
              label: 'Final QA',
              overallScore: data.finalQa.overallScore,
              metrics: [],
              passed: data.finalQa.approvedForPublication,
              isInternalScore: true,
              recommendations: [...data.finalQa.mustFix, ...data.finalQa.shouldFix],
              note: 'Aggregated internal QA result.',
            }
          : empty('FINAL_QA'),
      },
      qa: data.finalQa ?? {
        overallScore: 0,
        passed: false,
        mustFix: [],
        shouldFix: [],
        approvedForPublication: false,
      },
      stages: (row.stages ?? []).map((record) => this.stageToDto(record as unknown as StageRecord)),
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }

  /** Records the outcome of a completed stage and persists progress. */
  async recordStage(row: ContentPackage, id: StageRecord['id'], outcome: {
    status: StageRecord['status'];
    meta?: StageOutputMeta;
    startedAt: Date;
    error?: string;
    summary?: string;
  }): Promise<void> {
    const records = (row.stages ?? []) as unknown as StageRecord[];
    const index = records.findIndex((record) => record.id === id);
    const target: StageRecord = index >= 0 ? records[index]! : { id, status: 'PENDING', workflow: null, promptName: null, promptVersion: null, jobId: null, startedAt: null, completedAt: null, durationMs: null, error: null, summary: null };
    target.status = outcome.status;
    target.startedAt = target.startedAt ?? outcome.startedAt;
    target.completedAt = outcome.status === 'RUNNING' ? null : new Date();
    if (outcome.status !== 'RUNNING' && target.startedAt) {
      const started = typeof target.startedAt === 'string' ? new Date(target.startedAt) : target.startedAt;
      target.durationMs = Math.max(0, Date.now() - started.getTime());
    }
    target.error = outcome.error ?? null;
    target.summary = outcome.summary ?? null;
    if (outcome.meta) {
      target.jobId = outcome.meta.jobId;
      target.promptName = stageDefinition(id).promptName;
      if (outcome.meta.promptVersion !== undefined && outcome.meta.promptVersion !== null) {
        target.promptVersion = outcome.meta.promptVersion;
      }
    }
    if (index >= 0) {
      records[index] = target;
    } else {
      records.push(target);
    }
    row.stages = records as unknown as Record<string, unknown>[];
    await this.packages.save(row);
  }

  private stageToDto(record: StageRecord): PipelineStageRecordDto {
    return {
      id: record.id,
      name: stageDefinition(record.id).name,
      status: record.status,
      workflow: record.workflow,
      promptName: record.promptName,
      promptVersion: record.promptVersion,
      jobId: record.jobId,
      startedAt: toIso(record.startedAt),
      completedAt: toIso(record.completedAt),
      durationMs: record.durationMs,
      error: record.error,
      summary: record.summary,
    };
  }
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.toISOString();
}

export function emptyValidator(validator: ValidatorResultDto['validator']): ValidatorResultDto {
  return {
    validator,
    label: `${validator} validator`,
    overallScore: 0,
    metrics: [],
    passed: false,
    isInternalScore: true,
    recommendations: [],
    note: 'Stage not completed yet.',
  };
}

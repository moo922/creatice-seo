import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Site, AiVisibilityCompetitor, AiVisibilityPromptSetV2, AiVisibilityPrompt, AiVisibilitySourceProvenance, AiVisibilityBudget, AiProviderCapability } from '@creative-seo/database';
import { Repository } from 'typeorm';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { ProviderCapabilityRegistryService } from '@creative-seo/ai';

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface CreateCompetitorDto {
  name: string;
  canonicalName?: string;
  domain?: string;
  aliases?: string[];
  type?: string;
  notes?: string;
}

export interface UpdateCompetitorDto {
  name?: string;
  canonicalName?: string;
  domain?: string;
  aliases?: string[];
  type?: string;
  status?: string;
  notes?: string;
}

export interface CreatePromptSetDto {
  name: string;
  description?: string;
  language?: string;
  country?: string;
  targetCity?: string;
}

export interface AddPromptDto {
  text: string;
  category: string;
  intent?: string;
  priority?: number;
  weight?: number;
  language?: string;
  source?: string;
}

export interface UpdateBudgetDto {
  monthlyObservationBudgetUsd?: number;
  maxTestsPerRun?: number;
  repeatCount?: number;
  enabledProviders?: string[];
  priorityPromptOnly?: boolean;
  hardBudget?: boolean;
}

// ---------------------------------------------------------------------------
// Competitor Controller
// ---------------------------------------------------------------------------

@Controller('sites/:siteId/visibility/competitors')
@UseGuards(SiteAccessGuard)
@RequirePermissions('visibility:read')
export class VisibilityCompetitorController {
  constructor(
    @InjectRepository(AiVisibilityCompetitor) private readonly competitors: Repository<AiVisibilityCompetitor>,
  ) {}

  @Get()
  list(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<AiVisibilityCompetitor[]> {
    return this.competitors.find({ where: { siteId, status: 'ACTIVE' }, order: { name: 'ASC' } });
  }

  @Post()
  @RequirePermissions('visibility:manage')
  create(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreateCompetitorDto,
  ): Promise<AiVisibilityCompetitor> {
    return this.competitors.save(this.competitors.create({
      siteId,
      name: dto.name,
      canonicalName: dto.canonicalName ?? dto.name,
      domain: dto.domain ?? null,
      aliases: dto.aliases ?? [],
      type: dto.type ?? 'DIRECT',
      source: 'MANUAL',
      notes: dto.notes ?? null,
    }));
  }

  @Put(':id')
  @RequirePermissions('visibility:manage')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompetitorDto,
  ): Promise<AiVisibilityCompetitor> {
    const row = await this.competitors.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Competitor not found');
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.canonicalName !== undefined) row.canonicalName = dto.canonicalName;
    if (dto.domain !== undefined) row.domain = dto.domain;
    if (dto.aliases !== undefined) row.aliases = dto.aliases;
    if (dto.type !== undefined) row.type = dto.type;
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.notes !== undefined) row.notes = dto.notes;
    return this.competitors.save(row);
  }

  @Delete(':id')
  @RequirePermissions('visibility:manage')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const row = await this.competitors.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Competitor not found');
    row.status = 'ARCHIVED';
    await this.competitors.save(row);
  }
}

// ---------------------------------------------------------------------------
// Prompt Set V2 Controller
// ---------------------------------------------------------------------------

@Controller('sites/:siteId/visibility/prompt-sets')
@UseGuards(SiteAccessGuard)
@RequirePermissions('visibility:read')
export class VisibilityPromptSetController {
  constructor(
    @InjectRepository(AiVisibilityPromptSetV2) private readonly promptSets: Repository<AiVisibilityPromptSetV2>,
    @InjectRepository(AiVisibilityPrompt) private readonly prompts: Repository<AiVisibilityPrompt>,
  ) {}

  @Get()
  async list(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<AiVisibilityPromptSetV2[]> {
    return this.promptSets.find({ where: { siteId }, order: { version: 'DESC' } });
  }

  @Post()
  @RequirePermissions('visibility:manage')
  create(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreatePromptSetDto,
  ): Promise<AiVisibilityPromptSetV2> {
    return this.promptSets.save(this.promptSets.create({
      siteId,
      name: dto.name,
      description: dto.description ?? null,
      language: dto.language ?? 'ar',
      country: dto.country ?? null,
      targetCity: dto.targetCity ?? null,
      status: 'DRAFT',
      version: 1,
      methodologyVersion: 'MV1',
    }));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<AiVisibilityPromptSetV2> {
    const row = await this.promptSets.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Prompt set not found');
    return row;
  }

  @Get(':id/prompts')
  async getPrompts(@Param('id', ParseUUIDPipe) id: string): Promise<AiVisibilityPrompt[]> {
    return this.prompts.find({ where: { promptSetId: id }, order: { priority: 'ASC', createdAt: 'ASC' } });
  }

  @Post(':id/prompts')
  @RequirePermissions('visibility:manage')
  async addPrompt(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: AddPromptDto,
  ): Promise<AiVisibilityPrompt> {
    const promptSet = await this.promptSets.findOne({ where: { id } });
    if (!promptSet) throw new NotFoundException('Prompt set not found');
    return this.prompts.save(this.prompts.create({
      promptSetId: id,
      siteId,
      text: dto.text,
      normalizedText: dto.text.toLowerCase().trim(),
      category: dto.category,
      intent: dto.intent ?? 'INFORMATIONAL',
      priority: dto.priority ?? 5,
      weight: dto.weight ?? 1.0,
      language: dto.language ?? promptSet.language,
      source: dto.source ?? 'MANUAL',
      status: 'APPROVED',
    }));
  }

  @Delete(':id/prompts/:promptId')
  @RequirePermissions('visibility:manage')
  async removePrompt(
    @Param('promptId', ParseUUIDPipe) promptId: string,
  ): Promise<void> {
    const row = await this.prompts.findOne({ where: { id: promptId } });
    if (!row) throw new NotFoundException('Prompt not found');
    row.status = 'ARCHIVED';
    await this.prompts.save(row);
  }
}

// ---------------------------------------------------------------------------
// Budget Controller
// ---------------------------------------------------------------------------

@Controller('sites/:siteId/visibility/budget')
@UseGuards(SiteAccessGuard)
@RequirePermissions('visibility:read')
export class VisibilityBudgetController {
  constructor(
    @InjectRepository(AiVisibilityBudget) private readonly budgets: Repository<AiVisibilityBudget>,
  ) {}

  @Get()
  async get(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<AiVisibilityBudget | null> {
    return this.budgets.findOne({ where: { siteId } });
  }

  @Put()
  @RequirePermissions('visibility:manage')
  async upsert(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: UpdateBudgetDto,
  ): Promise<AiVisibilityBudget> {
    let row = await this.budgets.findOne({ where: { siteId } });
    if (!row) {
      row = this.budgets.create({ siteId });
    }
    if (dto.monthlyObservationBudgetUsd !== undefined) row.monthlyObservationBudgetUsd = dto.monthlyObservationBudgetUsd;
    if (dto.maxTestsPerRun !== undefined) row.maxTestsPerRun = dto.maxTestsPerRun;
    if (dto.repeatCount !== undefined) row.repeatCount = dto.repeatCount;
    if (dto.enabledProviders !== undefined) row.enabledProviders = dto.enabledProviders;
    if (dto.priorityPromptOnly !== undefined) row.priorityPromptOnly = dto.priorityPromptOnly;
    if (dto.hardBudget !== undefined) row.hardBudget = dto.hardBudget;
    return this.budgets.save(row);
  }
}

// ---------------------------------------------------------------------------
// Source Provenance Controller
// ---------------------------------------------------------------------------

@Controller('sites/:siteId/visibility/sources')
@UseGuards(SiteAccessGuard)
@RequirePermissions('visibility:read')
export class VisibilitySourceController {
  constructor(
    @InjectRepository(AiVisibilitySourceProvenance) private readonly provenance: Repository<AiVisibilitySourceProvenance>,
  ) {}

  @Get()
  async listSources(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('limit') limit?: string,
  ): Promise<AiVisibilitySourceProvenance[]> {
    return this.provenance
      .createQueryBuilder('sp')
      .innerJoin('ai_visibility_observations_v2', 'obs', 'obs.id = sp.observation_id')
      .where('obs.site_id = :siteId', { siteId })
      .orderBy('sp.created_at', 'DESC')
      .limit(Math.min(parseInt(limit ?? '50', 10), 200))
      .getMany();
  }

  @Get('domain-summary')
  async domainSummary(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<Array<{
    domain: string;
    verifiedCitations: number;
    totalReferences: number;
    uniquePrompts: number;
  }>> {
    const results = await this.provenance
      .createQueryBuilder('sp')
      .innerJoin('ai_visibility_observations_v2', 'obs', 'obs.id = sp.observation_id')
      .where('obs.site_id = :siteId', { siteId })
      .andWhere('sp.domain IS NOT NULL')
      .select('sp.domain', 'domain')
      .addSelect('COUNT(CASE WHEN sp.provenance_status = :status THEN 1 END)', 'verifiedCitations')
      .addSelect('COUNT(*)', 'totalReferences')
      .addSelect('COUNT(DISTINCT obs.prompt_id)', 'uniquePrompts')
      .setParameter('status', 'VERIFIED_PROVIDER_SOURCE')
      .groupBy('sp.domain')
      .orderBy('verifiedCitations', 'DESC')
      .limit(50)
      .getRawMany();

    return results.map((r) => ({
      domain: r.domain,
      verifiedCitations: parseInt(r.verifiedCitations, 10),
      totalReferences: parseInt(r.totalReferences, 10),
      uniquePrompts: parseInt(r.uniquePrompts, 10),
    }));
  }
}

// ---------------------------------------------------------------------------
// Provider Capabilities Controller
// ---------------------------------------------------------------------------

@Controller('ai/providers')
@UseGuards(SiteAccessGuard)
@RequirePermissions('visibility:read')
export class ProviderCapabilitiesController {
  constructor(
    private readonly caps: ProviderCapabilityRegistryService,
  ) {}

  @Get()
  list() {
    return this.caps.getAllCapabilities();
  }
}

import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { VisibilityService, type VisibilityTarget } from '@creative-seo/visibility';
import type {
  VisibilityObservationDto,
  VisibilityPromptSetDto,
  VisibilityRunDto,
  VisibilityTrendsDto,
} from '@creative-seo/types';
import { Repository } from 'typeorm';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import {
  CreateVisibilityRunDto,
  UpdatePromptSetDto,
  VisibilityObservationQueryDto,
} from './visibility.dto';

/**
 * AI visibility observation endpoints. Every run executes the site's
 * standardized prompt set against the configured provider/model; all metrics
 * are labelled as controlled observations, never exact ChatGPT/Claude/
 * Perplexity user rankings.
 */
@Controller('sites/:siteId/visibility')
@UseGuards(SiteAccessGuard)
@RequirePermissions('visibility:read')
export class SiteVisibilityController {
  constructor(
    private readonly visibility: VisibilityService,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
  ) {}

  @Get('prompt-set')
  promptSet(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<VisibilityPromptSetDto> {
    return this.visibility.getPromptSet(siteId);
  }

  @Put('prompt-set')
  @RequirePermissions('visibility:manage')
  updatePromptSet(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: UpdatePromptSetDto,
  ): Promise<VisibilityPromptSetDto> {
    return this.visibility.savePromptSet(siteId, dto);
  }

  @Post('runs')
  @RequirePermissions('visibility:manage')
  async run(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreateVisibilityRunDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<VisibilityRunDto> {
    const target = await this.resolveTarget(siteId);
    return this.visibility.run(siteId, user?.organizationId ?? null, target, dto, user?.id ?? null);
  }

  @Get('runs')
  runs(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<VisibilityRunDto[]> {
    return this.visibility.listRuns(siteId);
  }

  @Get('runs/:id')
  getRun(@Param('id', ParseUUIDPipe) id: string): Promise<VisibilityRunDto> {
    return this.visibility.getRun(id);
  }

  @Get('runs/:id/observations')
  observationsForRun(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VisibilityObservationDto[]> {
    return this.visibility.listObservations(siteId, { runId: id, limit: 100 });
  }

  @Get('observations')
  observations(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: VisibilityObservationQueryDto,
  ): Promise<VisibilityObservationDto[]> {
    return this.visibility.listObservations(siteId, query);
  }

  @Get('trends')
  trends(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<VisibilityTrendsDto> {
    return this.visibility.trends(siteId);
  }

  private async resolveTarget(siteId: string): Promise<VisibilityTarget> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    const settings = (site.settings ?? {}) as {
      competitors?: string[];
      industry?: string;
      product?: string;
      problem?: string;
    };
    return {
      brand: site.name,
      domain: site.domain,
      competitors: settings.competitors ?? [],
      industry: settings.industry ?? '',
      product: settings.product ?? '',
      location: site.country ?? '',
      problem: settings.problem ?? '',
    };
  }
}

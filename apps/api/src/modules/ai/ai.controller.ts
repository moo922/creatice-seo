import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { AiService } from '@creative-seo/ai';
import { Repository } from 'typeorm';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import {
  AiGenerationRequestDto,
  AiJobsQueryDto,
  AiPromptActivateRequestDto,
  AiPromptCreateRequestDto,
  AiProviderConfigRequestDto,
  TestSiteProviderDto,
} from './ai.dto';

/**
 * Site-scoped AI endpoints. Generations run under the site's workflow routing
 * (global -> site override -> workflow override) and are recorded as AI jobs.
 */
@Controller('sites/:siteId/ai')
@UseGuards(SiteAccessGuard)
@RequirePermissions('ai:read')
export class SiteAiController {
  constructor(
    private readonly ai: AiService,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
  ) {}

  @Get('config')
  config(@Param('siteId', ParseUUIDPipe) siteId: string) {
    return this.ai.getSiteConfig(siteId);
  }

  @Put('config')
  @RequirePermissions('ai:manage')
  updateConfig(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: AiProviderConfigRequestDto,
  ) {
    return this.ai.updateSiteConfig(siteId, dto);
  }

  @Post('test')
  @RequirePermissions('ai:manage')
  async testProvider(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: TestSiteProviderDto,
  ) {
    return this.ai.testProviderForSite(siteId, dto.kind);
  }

  @Post('generate')
  @RequirePermissions('ai:manage')
  async generate(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: AiGenerationRequestDto,
  ) {
    const site = await this.requireSite(siteId);
    return this.ai.generateText(dto.promptName, dto.variables, {
      siteId,
      organizationId: site.organizationId,
      workflow: dto.workflow,
      provider: dto.provider,
      model: dto.model,
      temperature: dto.temperature,
      maxOutputTokens: dto.maxOutputTokens,
    });
  }

  @Get('jobs')
  jobs(@Param('siteId', ParseUUIDPipe) siteId: string, @Query() query: AiJobsQueryDto) {
    return this.ai.listJobs({ ...query, siteId });
  }

  private async requireSite(siteId: string): Promise<Site> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    return site;
  }
}

/** Global AI admin endpoints (provider health, prompt registry, job lookup). */
@Controller('ai')
@RequirePermissions('ai:read')
export class AiAdminController {
  constructor(private readonly ai: AiService) {}

  @Get('health')
  health() {
    return this.ai.health();
  }

  @Get('prompts')
  prompts() {
    return this.ai.listPrompts();
  }

  @Post('prompts')
  @RequirePermissions('ai:manage')
  register(@Body() dto: AiPromptCreateRequestDto) {
    return this.ai.registerPrompt(dto);
  }

  @Post('prompts/:name/activate')
  @RequirePermissions('ai:manage')
  activate(@Param('name') name: string, @Body() dto: AiPromptActivateRequestDto) {
    return this.ai.activatePrompt(name, dto.version);
  }

  @Get('jobs/:id')
  job(@Param('id', ParseUUIDPipe) id: string) {
    return this.ai.getJob(id);
  }
}

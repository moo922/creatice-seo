import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { GoogleAdsIntegrationDto, KeywordPlannerJobDto } from '@creative-seo/types';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import { GoogleAdsService } from './google-ads.service';

class ConfigureGoogleAdsDto {
  customerId!: string;
  developerToken!: string;
  refreshToken!: string;
  clientId?: string;
  clientSecret?: string;
  language?: string;
  locationTargets?: Array<{ id: string; name: string }>;
}

class RunPlannerJobDto {
  seeds!: string[];
  maxIdeas?: number;
  language?: string;
  locationIds?: string[];
}

/**
 * Google Ads integration endpoints (Sections 8-9). Credentials are stored
 * encrypted on the backend and never returned to the frontend.
 */
@Controller('sites/:siteId/google-ads')
@UseGuards(SiteAccessGuard)
@RequirePermissions('keywords:read')
export class GoogleAdsController {
  constructor(private readonly service: GoogleAdsService) {}

  @Get()
  get(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<GoogleAdsIntegrationDto> {
    return this.service.getIntegration(siteId);
  }

  @Post('configure')
  @RequirePermissions('keywords:manage')
  configure(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: ConfigureGoogleAdsDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<GoogleAdsIntegrationDto> {
    return this.service.configure(siteId, dto, user?.id ?? null);
  }

  @Post('test')
  @RequirePermissions('keywords:manage')
  test(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<{ ok: boolean; integration: GoogleAdsIntegrationDto }> {
    return this.service.testConnection(siteId);
  }

  @Post('planner')
  @RequirePermissions('keywords:manage')
  runPlanner(@Param('siteId', ParseUUIDPipe) siteId: string, @Body() dto: RunPlannerJobDto): Promise<KeywordPlannerJobDto> {
    return this.service.runKeywordPlannerJob(siteId, dto);
  }

  @Get('jobs')
  jobs(@Param('siteId', ParseUUIDPipe) siteId: string): Promise<KeywordPlannerJobDto[]> {
    return this.service.listJobs(siteId);
  }
}
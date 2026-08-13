import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import type { PortfolioDashboardDto, SiteDashboardDto } from '@creative-seo/types';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import { DashboardService } from './dashboard.service';

/** Portfolio dashboard: real aggregates across all authorized websites. */
@Controller('dashboard')
@RequirePermissions('sites:read')
export class PortfolioDashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  portfolio(@CurrentUser() user: AuthPrincipal): Promise<PortfolioDashboardDto> {
    return this.dashboard.portfolio(user);
  }
}

/** Individual site dashboard. */
@Controller('sites/:siteId/dashboard')
@UseGuards(SiteAccessGuard)
@RequirePermissions('sites:read')
export class SiteDashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  site(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal): Promise<SiteDashboardDto> {
    return this.dashboard.site(user, siteId);
  }
}

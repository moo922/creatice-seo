import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../common/auth.types';
import { ClientService } from './client.service';

/**
 * Restricted client portal. Only `client:access` holders (the CLIENT role and
 * admins) can reach these endpoints; SiteAccessGuard scopes every request to an
 * authorized website, so a client user never sees other sites. Every view is
 * audited. Sensitive data (credentials, AI settings/prompts, costs, internal
 * notes, n8n, system logs) is never exposed.
 */
@Controller('client')
@RequirePermissions('client:access')
export class ClientPortalController {
  constructor(private readonly client: ClientService) {}

  @Get('sites')
  sites(@CurrentUser() user: AuthPrincipal) {
    return this.client.memberSites(user.id);
  }
}

@Controller('sites/:siteId/client')
@UseGuards(SiteAccessGuard)
@RequirePermissions('client:access')
export class ClientSiteController {
  constructor(private readonly client: ClientService) {}

  @Get('overview')
  overview(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.client.overview(siteId, user.id);
  }

  @Get('progress')
  progress(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.client.progress(siteId, user.id);
  }

  @Get('performance')
  performance(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.client.performance(siteId, user.id);
  }

  @Get('work')
  work(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.client.work(siteId, user.id);
  }

  @Get('issues')
  issues(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.client.issues(siteId, user.id);
  }

  @Get('recommendations')
  recommendations(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.client.recommendations(siteId, user.id);
  }

  @Get('reports')
  reports(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.client.reports(siteId, user.id);
  }

  @Get('reports/:id')
  report(@Param('siteId', ParseUUIDPipe) siteId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.client.reportContent(id, user.id, siteId);
  }

  @Get('reports/:id/html')
  reportHtml(@Param('siteId', ParseUUIDPipe) siteId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.client.reportHtml(id, user.id, siteId);
  }
}

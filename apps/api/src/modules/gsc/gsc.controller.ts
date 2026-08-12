import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthPrincipal } from '../../common/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import {
  GscConnectRequestDto,
  GscOpportunitiesQueryDto,
  GscPerformanceQueryDto,
  GscRegisterTokensDto,
  GscSyncQueryDto,
  type OauthCallbackQuery,
} from './gsc.dto';
import { GscService } from './gsc.service';

@Controller('sites/:siteId/gsc')
@UseGuards(SiteAccessGuard)
@RequirePermissions('gsc:read')
export class GscController {
  constructor(private readonly gsc: GscService) {}

  @Get()
  status(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.gsc.status(siteId, user);
  }

  @Get('properties')
  listCandidateProperties(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.gsc.listCandidateProperties(siteId, user);
  }

  @Get('performance')
  performance(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: GscPerformanceQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.gsc.performance(siteId, query, user);
  }

  @Get('opportunities')
  opportunities(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: GscOpportunitiesQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.gsc.listOpportunities(siteId, query, user);
  }

  @Get('authorize-url')
  @RequirePermissions('gsc:manage')
  authorizeUrl(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.gsc.authorizeUrl(siteId, user);
  }

  @Post('tokens')
  @RequirePermissions('gsc:manage')
  registerTokens(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: GscRegisterTokensDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.gsc.registerTokens(siteId, dto, user);
  }

  @Put('selected-property')
  @RequirePermissions('gsc:manage')
  selectProperty(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: GscConnectRequestDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.gsc.selectProperty(siteId, dto, user);
  }

  @Post('sync')
  @RequirePermissions('gsc:manage')
  sync(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: GscSyncQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.gsc.sync(siteId, query, user);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('gsc:manage')
  async disconnect(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    await this.gsc.disconnect(siteId, user);
  }
}

/**
 * OAuth redirect target: Google calls this unauthenticated, so it must bypass
 * JWT + SiteAccess guards. The signed `state` proves which site initiated the
 * connection.
 */
@Controller('sites/:siteId/gsc')
@Public()
export class GscOauthController {
  constructor(private readonly gsc: GscService) {}

  @Get('callback')
  callback(@Param('siteId', ParseUUIDPipe) siteId: string, @Query() query: OauthCallbackQuery) {
    return this.gsc.handleCallback(siteId, query);
  }
}

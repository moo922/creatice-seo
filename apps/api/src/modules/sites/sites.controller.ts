import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from '../../common/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CreateMembershipDto, CreateSiteDto, SiteQueryDto, UpdateSiteDto } from './sites.dto';
import { SitesService } from './sites.service';

@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  @RequirePermissions('sites:read')
  list(@Query() query: SiteQueryDto, @CurrentUser() user: AuthPrincipal) {
    return this.sites.list(query, user);
  }

  @Post()
  @RequirePermissions('sites:create')
  create(@Body() dto: CreateSiteDto, @CurrentUser() user: AuthPrincipal) {
    return this.sites.create(dto, user, {});
  }

  @Get(':siteId')
  @UseGuards(SiteAccessGuard)
  @RequirePermissions('sites:read')
  findOne(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.sites.findByIdOrThrow(siteId, user);
  }

  @Patch(':siteId')
  @UseGuards(SiteAccessGuard)
  @RequirePermissions('sites:update')
  update(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: UpdateSiteDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.sites.update(siteId, dto, user, {});
  }

  @Delete(':siteId')
  @UseGuards(SiteAccessGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('sites:delete')
  async archive(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    await this.sites.archive(siteId, user, {});
  }

  @Post(':siteId/purge')
  @UseGuards(SiteAccessGuard)
  @RequirePermissions('sites:purge')
  purge(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body('confirmDomain') confirmDomain: string,
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
  ) {
    return this.sites.purge(siteId, confirmDomain, user, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Post(':siteId/purge/preview')
  @UseGuards(SiteAccessGuard)
  @RequirePermissions('sites:purge')
  async purgePreview(
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ) {
    return this.sites.purgePreview(siteId);
  }

  @Get(':siteId/members')
  @UseGuards(SiteAccessGuard)
  @RequirePermissions('sites:read')
  listMembers(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.sites.listMembers(siteId, user);
  }

  @Post(':siteId/members')
  @UseGuards(SiteAccessGuard)
  @RequirePermissions('sites:manage_members')
  addMember(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreateMembershipDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.sites.addMember(siteId, dto, user, {});
  }

  @Delete(':siteId/members/:userId')
  @UseGuards(SiteAccessGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('sites:manage_members')
  async removeMember(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.sites.removeMember(siteId, userId, user, {});
  }
}

import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthPrincipal } from '../../common/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { SyncQueryDto } from './wordpress.dto';
import { WordPressService } from './wordpress.service';

@Controller('wordpress')
@RequirePermissions('wordpress:read')
export class WordPressController {
  constructor(private readonly wordpress: WordPressService) {}

  @Get('integrations')
  listIntegrations(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.wordpress.listIntegrations(user, query.page, query.perPage);
  }
}

@Controller('sites/:siteId/wordpress')
@UseGuards(SiteAccessGuard)
export class SiteWordPressController {
  constructor(private readonly wordpress: WordPressService) {}

  @Get()
  @RequirePermissions('wordpress:read')
  getIntegration(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.wordpress.getIntegration(siteId, user);
  }

  @Post('check')
  @RequirePermissions('wordpress:manage')
  check(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.wordpress.checkConnection(siteId, user, {});
  }

  @Post('sync')
  @RequirePermissions('wordpress:manage')
  sync(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: SyncQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.wordpress.sync(siteId, query, user, {});
  }

  @Get('posts')
  @RequirePermissions('wordpress:read')
  listPosts(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.wordpress.listImportedPosts(siteId, user, {
      page: query.page,
      perPage: query.perPage,
      search: query.search,
    });
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('wordpress:manage')
  async remove(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.wordpress.remove(siteId, user, {});
  }
}

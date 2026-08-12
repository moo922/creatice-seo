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
  UseGuards,
} from '@nestjs/common';
import type { AuthPrincipal } from '../../common/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SiteAccessGuard } from '../../common/guards/site-access.guard';
import { CreateSecretDto } from './secrets.dto';
import { SecretsService } from './secrets.service';

@Controller('sites/:siteId/secrets')
@UseGuards(SiteAccessGuard)
@RequirePermissions('sites:manage_secrets')
export class SecretsController {
  constructor(private readonly secrets: SecretsService) {}

  @Post()
  create(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreateSecretDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.secrets.create(siteId, dto, user, {});
  }

  @Get()
  list(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthPrincipal) {
    return this.secrets.list(siteId, user);
  }

  @Delete(':secretId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('secretId', ParseUUIDPipe) secretId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.secrets.remove(siteId, secretId, user, {});
  }
}

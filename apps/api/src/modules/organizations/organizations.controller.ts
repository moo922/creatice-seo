import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthPrincipal } from '../../common/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateOrganizationDto, UpdateOrganizationDto } from './organizations.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @RequirePermissions('organizations:read')
  list(@CurrentUser() user: AuthPrincipal) {
    return this.organizations.list(user);
  }

  @Post()
  @RequirePermissions('organizations:manage')
  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: AuthPrincipal) {
    return this.organizations.create(dto, user);
  }

  @Get(':id')
  @RequirePermissions('organizations:read')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.organizations.findByIdOrThrow(id, user);
  }

  @Get(':id/sites')
  @RequirePermissions('organizations:read')
  listSites(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.organizations.listSites(id, user);
  }

  @Patch(':id')
  @RequirePermissions('organizations:manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.organizations.update(id, dto, user);
  }
}

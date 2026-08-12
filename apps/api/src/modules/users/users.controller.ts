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
} from '@nestjs/common';
import type { AuthPrincipal } from '../../common/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AssignRolesDto, CreateUserDto, UpdateUserDto, UserQueryDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users:read')
  list(@Query() query: UserQueryDto, @CurrentUser() user: AuthPrincipal) {
    return this.users.list(query, user);
  }

  @Post()
  @RequirePermissions('users:create')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthPrincipal) {
    return this.users.create(dto, user, {});
  }

  @Get(':id')
  @RequirePermissions('users:read')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.users.findByIdOrThrow(id, user);
  }

  @Patch(':id')
  @RequirePermissions('users:update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.users.update(id, dto, user, {});
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('users:deactivate')
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    await this.users.deactivate(id, user, {});
  }

  @Post(':id/roles')
  @RequirePermissions('users:assign_roles')
  assignRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRolesDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.users.assignRoles(id, dto, user, {});
  }
}

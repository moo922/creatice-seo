import { Controller, Get } from '@nestjs/common';
import { PERMISSIONS, ROLES } from '@creative-seo/types';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Controller('roles')
export class RolesController {
  @Get()
  @RequirePermissions('roles:read')
  list() {
    return ROLES.map((role) => ({
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
    }));
  }
}

@Controller('permissions')
export class PermissionsController {
  @Get()
  @RequirePermissions('roles:read')
  list() {
    return PERMISSIONS;
  }
}

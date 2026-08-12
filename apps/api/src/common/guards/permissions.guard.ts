import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth.types';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const required = Reflect.getMetadata(PERMISSIONS_KEY, context.getHandler()) as
      | string[]
      | undefined;
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    const missing = required.filter((permission) => !user.permissions.includes(permission as never));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permission(s): ${missing.join(', ')}`);
    }
    return true;
  }
}

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthPrincipal, AuthenticatedRequest } from '../auth.types';

export const CurrentUser = createParamDecorator(
  (field: keyof AuthPrincipal | undefined, context: ExecutionContext): AuthPrincipal | unknown => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user as AuthPrincipal | undefined;
    if (!user) {
      return undefined;
    }
    return field ? user[field] : user;
  },
);

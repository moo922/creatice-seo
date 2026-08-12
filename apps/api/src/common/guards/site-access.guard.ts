import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth.types';
import { SiteAccessService } from './site-access.service';

/**
 * Enforces cross-site isolation on routes with a `:siteId` route parameter
 * (also honoured when the id is passed via query/body). Uses SiteAccessService.
 */
@Injectable()
export class SiteAccessGuard implements CanActivate {
  constructor(private readonly siteAccess: SiteAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      return true;
    }

    const siteId = extractSiteId(request);
    if (!siteId) {
      return true;
    }

    await this.siteAccess.assertSiteAccess(user, siteId);
    return true;
  }
}

function extractSiteId(request: AuthenticatedRequest): string | undefined {
  const param = request.params?.['siteId'];
  if (param) {
    return param;
  }
  const query = request.query?.['siteId'];
  if (typeof query === 'string') {
    return query;
  }
  const body = request.body as { siteId?: unknown } | undefined;
  if (typeof body?.siteId === 'string') {
    return body.siteId;
  }
  return undefined;
}

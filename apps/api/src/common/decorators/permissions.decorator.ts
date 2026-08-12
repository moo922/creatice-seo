import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@creative-seo/types';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Requires the caller to hold all listed permissions. */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

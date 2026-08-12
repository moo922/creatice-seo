import type { PermissionKey, RoleKey, UserStatus, UserType } from '@creative-seo/types';

/** Authenticated principal attached to requests by the JWT guard. */
export interface AuthPrincipal {
  id: string;
  email: string;
  fullName: string;
  type: UserType;
  status: UserStatus;
  organizationId: string | null;
  roles: RoleKey[];
  permissions: PermissionKey[];
}

export interface AuthenticatedRequest {
  user?: AuthPrincipal;
  cookies?: Record<string, string>;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, unknown>;
  params?: Record<string, string>;
}

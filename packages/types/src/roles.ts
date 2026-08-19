import { ROLE_KEYS, type RoleKey } from './enums';
import { ALL_PERMISSIONS, type PermissionKey } from './permissions';

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  ADMIN: [...ALL_PERMISSIONS.filter((p) => p !== 'roles:manage' && p !== 'sites:purge')],
  SEO_MANAGER: [
    'users:read',
    'roles:read',
    'organizations:read',
    'sites:read',
    'sites:create',
    'sites:update',
    'sites:manage_members',
    'sites:manage_secrets',
    'wordpress:read',
    'wordpress:manage',
    'gsc:read',
    'gsc:manage',
    'keywords:read',
    'keywords:manage',
    'automation:read',
    'automation:manage',
    'workqueue:read',
    'workqueue:manage',
    'activities:read',
  ],
  CONTENT_MANAGER: [
    'users:read',
    'roles:read',
    'organizations:read',
    'sites:read',
    'sites:update',
    'wordpress:read',
    'gsc:read',
    'keywords:read',
    'activities:read',
  ],
  EDITOR: ['users:read', 'roles:read', 'organizations:read', 'sites:read', 'wordpress:read', 'gsc:read', 'keywords:read', 'activities:read'],
  VIEWER: ['users:read', 'roles:read', 'organizations:read', 'sites:read', 'wordpress:read', 'gsc:read', 'keywords:read', 'activities:read'],
  CLIENT: ['organizations:read', 'sites:read'],
};

export const ROLES: readonly RoleDefinition[] = ROLE_KEYS.map((key) => ({
  key,
  name: key.split('_').map(capitalize).join(' '),
  description: roleDescription(key),
  permissions: ROLE_PERMISSIONS[key],
}));

export function rolePermissions(key: RoleKey): PermissionKey[] {
  return ROLE_PERMISSIONS[key];
}

export function isGlobalRole(key: RoleKey): boolean {
  return key === 'SUPER_ADMIN' || key === 'ADMIN';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function roleDescription(key: RoleKey): string {
  switch (key) {
    case 'SUPER_ADMIN':
      return 'Full platform access, including role management and all organizations';
    case 'ADMIN':
      return 'Operational administrator for users, organizations and sites';
    case 'SEO_MANAGER':
      return 'Manages sites, memberships and site secrets for assigned sites';
    case 'CONTENT_MANAGER':
      return 'Manages content configuration for assigned sites';
    case 'EDITOR':
      return 'Reads sites and produces content within assigned sites';
    case 'VIEWER':
      return 'Read-only access to assigned sites';
    case 'CLIENT':
      return 'Restricted client-portal access to their own organization and sites';
  }
}

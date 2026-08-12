import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed the base permission catalog and system roles.
 *
 * The permission/role catalogs are the source of truth for RBAC and are also
 * declared in @creative-seo/types. A test asserts the seeded rows match the
 * catalog so drift is caught.
 */
export class SeedRbac00061720000000006 implements MigrationInterface {
  name = 'SeedRbac00061720000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('users:read', 'users', 'List and view users'),
        ('users:create', 'users', 'Create users'),
        ('users:update', 'users', 'Update user profile and status'),
        ('users:deactivate', 'users', 'Deactivate users'),
        ('users:assign_roles', 'users', 'Assign and revoke user roles'),
        ('roles:read', 'roles', 'List roles and the permission catalog'),
        ('roles:manage', 'roles', 'Modify roles and their permissions'),
        ('organizations:read', 'organizations', 'View organizations'),
        ('organizations:manage', 'organizations', 'Create and update organizations'),
        ('sites:read', 'sites', 'View sites (membership-scoped)'),
        ('sites:create', 'sites', 'Create sites'),
        ('sites:update', 'sites', 'Update sites'),
        ('sites:delete', 'sites', 'Delete sites'),
        ('sites:manage_members', 'sites', 'Manage site memberships'),
        ('sites:manage_secrets', 'sites', 'Manage site secrets (encrypted storage)'),
        ('activities:read', 'activities', 'View activity logs')
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "roles" ("key", "name", "description", "is_system") VALUES
        ('SUPER_ADMIN', 'Super Admin', 'Full platform access, including role management and all organizations', true),
        ('ADMIN', 'Admin', 'Operational administrator for users, organizations and sites', true),
        ('SEO_MANAGER', 'SEO Manager', 'Manages sites, memberships and site secrets for assigned sites', true),
        ('CONTENT_MANAGER', 'Content Manager', 'Manages content configuration for assigned sites', true),
        ('EDITOR', 'Editor', 'Reads sites and produces content within assigned sites', true),
        ('VIEWER', 'Viewer', 'Read-only access to assigned sites', true),
        ('CLIENT', 'Client', 'Restricted client-portal access to their own organization and sites', true)
      ON CONFLICT ("key") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_key", "permission_key") VALUES
        ('SUPER_ADMIN', 'users:read'),
        ('SUPER_ADMIN', 'users:create'),
        ('SUPER_ADMIN', 'users:update'),
        ('SUPER_ADMIN', 'users:deactivate'),
        ('SUPER_ADMIN', 'users:assign_roles'),
        ('SUPER_ADMIN', 'roles:read'),
        ('SUPER_ADMIN', 'roles:manage'),
        ('SUPER_ADMIN', 'organizations:read'),
        ('SUPER_ADMIN', 'organizations:manage'),
        ('SUPER_ADMIN', 'sites:read'),
        ('SUPER_ADMIN', 'sites:create'),
        ('SUPER_ADMIN', 'sites:update'),
        ('SUPER_ADMIN', 'sites:delete'),
        ('SUPER_ADMIN', 'sites:manage_members'),
        ('SUPER_ADMIN', 'sites:manage_secrets'),
        ('SUPER_ADMIN', 'activities:read'),
        ('ADMIN', 'users:read'),
        ('ADMIN', 'users:create'),
        ('ADMIN', 'users:update'),
        ('ADMIN', 'users:deactivate'),
        ('ADMIN', 'users:assign_roles'),
        ('ADMIN', 'roles:read'),
        ('ADMIN', 'organizations:read'),
        ('ADMIN', 'organizations:manage'),
        ('ADMIN', 'sites:read'),
        ('ADMIN', 'sites:create'),
        ('ADMIN', 'sites:update'),
        ('ADMIN', 'sites:delete'),
        ('ADMIN', 'sites:manage_members'),
        ('ADMIN', 'sites:manage_secrets'),
        ('ADMIN', 'activities:read'),
        ('SEO_MANAGER', 'users:read'),
        ('SEO_MANAGER', 'roles:read'),
        ('SEO_MANAGER', 'organizations:read'),
        ('SEO_MANAGER', 'sites:read'),
        ('SEO_MANAGER', 'sites:create'),
        ('SEO_MANAGER', 'sites:update'),
        ('SEO_MANAGER', 'sites:manage_members'),
        ('SEO_MANAGER', 'sites:manage_secrets'),
        ('SEO_MANAGER', 'activities:read'),
        ('CONTENT_MANAGER', 'users:read'),
        ('CONTENT_MANAGER', 'roles:read'),
        ('CONTENT_MANAGER', 'organizations:read'),
        ('CONTENT_MANAGER', 'sites:read'),
        ('CONTENT_MANAGER', 'sites:update'),
        ('CONTENT_MANAGER', 'activities:read'),
        ('EDITOR', 'users:read'),
        ('EDITOR', 'roles:read'),
        ('EDITOR', 'organizations:read'),
        ('EDITOR', 'sites:read'),
        ('EDITOR', 'activities:read'),
        ('VIEWER', 'users:read'),
        ('VIEWER', 'roles:read'),
        ('VIEWER', 'organizations:read'),
        ('VIEWER', 'sites:read'),
        ('VIEWER', 'activities:read'),
        ('CLIENT', 'organizations:read'),
        ('CLIENT', 'sites:read')
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" WHERE "role_key" IN
      ('SUPER_ADMIN','ADMIN','SEO_MANAGER','CONTENT_MANAGER','EDITOR','VIEWER','CLIENT')`);
    await queryRunner.query(`DELETE FROM "roles" WHERE "key" IN
      ('SUPER_ADMIN','ADMIN','SEO_MANAGER','CONTENT_MANAGER','EDITOR','VIEWER','CLIENT')`);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "module" IN
      ('users','roles','organizations','sites','activities')`);
  }
}

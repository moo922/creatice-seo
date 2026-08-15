import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Organization } from '../entities/organization';
import { User } from '../entities/user';
import { createDataSource } from '../data-source';
import { loadDbEnv } from './env';

const adminEnvSchema = z.object({
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_FULL_NAME: z.string().optional(),
  DEFAULT_ORG_NAME: z.string().min(2).optional(),
});

/**
 * Bootstraps the initial SUPER_ADMIN account from ADMIN_EMAIL / ADMIN_PASSWORD
 * / ADMIN_FULL_NAME environment variables. Idempotent: skips if a SUPER_ADMIN
 * already exists (unless ADMIN_FORCE=1). Roles/permissions come from migration 0006.
 *
 * Also ensures the default client organization exists (DEFAULT_ORG_NAME, default
 * "Default Client"). Sites created without an explicit organization and client
 * users without one are attached to this organization.
 */
async function main(): Promise<void> {
  const env = loadDbEnv();
  const parsed = adminEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Missing admin seed environment: ${parsed.error.message}`);
  }
  const admin = parsed.data;
  if (!admin.ADMIN_EMAIL || !admin.ADMIN_PASSWORD) {
    throw new Error(
      'Set ADMIN_EMAIL and ADMIN_PASSWORD to seed the initial SUPER_ADMIN. Example:\n' +
        'ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=change-me npm run db:seed',
    );
  }

  const dataSource = createDataSource({ url: env.DATABASE_URL });
  await dataSource.initialize();
  const userRepo = dataSource.getRepository(User);
  const orgRepo = dataSource.getRepository(Organization);

  const defaultOrgName = admin.DEFAULT_ORG_NAME ?? 'Default Client';
  let defaultOrg = await orgRepo.findOne({ where: { slug: 'default-client' } });
  if (!defaultOrg) {
    defaultOrg = await orgRepo.save(
      orgRepo.create({
        name: defaultOrgName,
        slug: 'default-client',
        status: 'ACTIVE',
        createdBy: null,
        meta: { default: true },
      }),
    );
    console.log(`Default client organization created: ${defaultOrg.name} (${defaultOrg.id})`);
  }

  const existing = await userRepo
    .createQueryBuilder('user')
    .innerJoin('user.roles', 'role')
    .where('role.key = :key', { key: 'SUPER_ADMIN' })
    .getOne();

  if (existing && process.env.ADMIN_FORCE !== '1') {
    console.log(`SUPER_ADMIN already exists (${existing.email}) — skipping. Set ADMIN_FORCE=1 to re-seed.`);
    await dataSource.destroy();
    return;
  }

  const passwordHash = await bcrypt.hash(admin.ADMIN_PASSWORD, 12);
  const user = new User();
  user.email = admin.ADMIN_EMAIL.toLowerCase().trim();
  user.passwordHash = passwordHash;
  user.fullName = admin.ADMIN_FULL_NAME ?? 'Platform Administrator';
  user.type = 'AGENCY';
  user.status = 'ACTIVE';

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.email = user.email;
    existing.fullName = user.fullName;
    existing.status = 'ACTIVE';
    await userRepo.save(existing);
    console.log(`SUPER_ADMIN updated: ${existing.email}`);
  } else {
    const saved = await userRepo.save(user);
    await dataSource
      .createQueryBuilder()
      .relation(User, 'roles')
      .of(saved.id)
      .add('SUPER_ADMIN');
    console.log(`SUPER_ADMIN created: ${saved.email}`);
  }

  await dataSource.destroy();
}

main().catch((error) => {
  console.error('Admin seed failed:', error);
  process.exit(1);
});

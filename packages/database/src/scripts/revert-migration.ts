import { createDataSource } from '../data-source';
import { loadDbEnv } from './env';

async function main(): Promise<void> {
  const env = loadDbEnv();
  const dataSource = createDataSource({ url: env.DATABASE_URL, logging: true });
  await dataSource.initialize();

  let lastExecutedName: string | null = null;
  try {
    const rows = (await dataSource.query(
      'SELECT name FROM migrations ORDER BY id DESC LIMIT 1',
    )) as { name?: string }[];
    lastExecutedName = rows[0]?.name ?? null;
  } catch {
    // Migrations table does not exist yet — nothing to revert.
  }

  if (!lastExecutedName) {
    console.log('No migration to revert');
  } else {
    await dataSource.undoLastMigration();
    console.log(`Reverted migration: ${lastExecutedName}`);
  }

  await dataSource.destroy();
}

main().catch((error) => {
  console.error('Migration revert failed:', error);
  process.exit(1);
});

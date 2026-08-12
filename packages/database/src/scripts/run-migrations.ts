import { createDataSource } from '../data-source';
import { loadDbEnv } from './env';

async function main(): Promise<void> {
  const env = loadDbEnv();
  const dataSource = createDataSource({ url: env.DATABASE_URL, logging: env.NODE_ENV !== 'production' });
  await dataSource.initialize();
  const applied = await dataSource.runMigrations();
  const names = applied.map((m) => m.name);
  console.log(names.length > 0 ? `Applied migrations: ${names.join(', ')}` : 'Database is up to date');
  await dataSource.destroy();
}

main().catch((error) => {
  console.error('Migration run failed:', error);
  process.exit(1);
});
